import { NextResponse } from "next/server";
import { apiContext, forbidden } from "@/lib/context";
import { can } from "@/lib/permissions";
import { ASSISTANT_RULES, checkRateLimit } from "@/lib/rate-limit";
import { tooManyRequests } from "@/lib/http";
import { getT } from "@/lib/i18n";
import { getToday, getUserTz } from "@/lib/today";
import { transcribeShort, DeepgramError } from "@/lib/deepgram";
import { GroqError } from "@/lib/groq";
import { answerQuestion } from "@/lib/ask";
import { answerTasks, assistantText, parseHistory, routeRequest, speechText } from "@/lib/assistant";

export const maxDuration = 60;
const MAX_AUDIO_BYTES = 4_000_000; // about 4 minutes of voice; the browser stops at 45 seconds

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * The MoleSkill AI voice assistant.
 * Body: multipart with `audio` (a recorded clip) or JSON { text }, plus optional `history` (earlier questions).
 * It is read-only: it answers from recorded meetings and lists tasks, and changes nothing.
 */
export async function POST(req: Request) {
  const c = await apiContext();
  if ("res" in c) return c.res;
  const { ctx } = c;
  if (!can(ctx.role, "ask")) return forbidden();

  const limit = await checkRateLimit(ctx.user.id, "assistant", ASSISTANT_RULES);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let text = "";
  let history: string[] = [];
  const { lang } = await getT();
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      history = parseHistory(form.get("history"));
      const audio = form.get("audio");
      if (!(audio instanceof Blob) || !audio.size) return fail("no_audio", 400);
      if (audio.size > MAX_AUDIO_BYTES) return fail("audio_too_large", 413);
      const mime = audio.type.split(";")[0] || "audio/webm";
      if (!/^(audio|video)\//.test(mime)) return fail("bad_audio_type", 415);
      text = (await transcribeShort(audio, mime, process.env.ASSISTANT_STT_LANGUAGE || lang)).text;
    } else {
      const body = await req.json().catch(() => null);
      history = parseHistory(body?.history);
      text = typeof body?.text === "string" ? body.text : "";
    }
  } catch (error) {
    if (error instanceof Error && error.message === "NO_SPEECH_DETECTED") return fail("no_speech", 422);
    if (error instanceof DeepgramError && error.kind === "no_key") return fail("stt_not_configured", 503);
    console.error("[assistant] transcription failed", error);
    return fail("stt_failed", 502);
  }
  text = text.trim().slice(0, 500);
  if (!text) return fail("no_speech", 422);

  try {
    const [timeZone, today] = await Promise.all([getUserTz(), getToday()]);
    const words = assistantText(lang);
    const route = await routeRequest(text, history, lang, today);

    if (route.kind === "chat") return NextResponse.json({ kind: "chat", transcript: text, answer: route.reply, speech: speechText(route.reply) });
    if (route.kind === "tasks") {
      const result = await answerTasks(ctx.workspace.id, route.scope, route.owner, today, lang);
      return NextResponse.json({ kind: "tasks", transcript: text, answer: result.answer, speech: result.speech, tasks: result.tasks });
    }
    const result = await answerQuestion(ctx.workspace.id, route.question, undefined, lang, timeZone);
    if (!result) return NextResponse.json({ kind: "meetings", transcript: text, answer: words.noMeetings, speech: words.noMeetings, sources: [] });
    const answer = result.answer || words.noAnswer;
    return NextResponse.json({ kind: "meetings", transcript: text, answer, speech: speechText(answer), sources: result.sources });
  } catch (error) {
    console.error("[assistant]", error);
    return fail(error instanceof GroqError && error.kind === "no_key" ? "ai_not_configured" : "ai_failed", error instanceof GroqError && error.kind === "no_key" ? 503 : 502);
  }
}
