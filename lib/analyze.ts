import { prisma } from "@/lib/prisma";
import { admin } from "@/lib/supabase/admin";
import { chat } from "@/lib/groq";
import { transcribe } from "@/lib/deepgram";
import { speakerNumber } from "@/lib/speakers";
import { fileExtension, mimeForExtension } from "@/lib/audio";
import { analyzeTranscript } from "@/lib/summarize";
import { classifyError } from "@/lib/analysis-errors";
import { mergeTasks } from "@/lib/tasks";
import { rebuildSegments, removeAudio, touchMeeting } from "@/lib/meeting-store";

function stamp(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(ms / 60_000);
  const secondsPart = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `[${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${String(millis).padStart(3, "0")}]`;
}

const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, " ").trim();

type LabelledSegment = { start: number; end: number; text: string; speaker: string | null };

function withTimestamps(segments: LabelledSegment[], fallback: string) {
  if (!segments.length) return `${stamp(0)} ${oneLine(fallback)}`;
  return segments.map((s) => `${stamp(s.start)} ${s.speaker ? `{${s.speaker}} ` : ""}${oneLine(s.text)}`).join("\n");
}

export async function analyzeMeeting(id: string, userId: string, path: string) {
  try {
    await prisma.meeting.updateMany({ where: { id, userId, status: "PROCESSING" }, data: { processingStage: "transcribing" } });
    const meta = await prisma.meeting.findFirst({ where: { id, userId }, select: { deleteAudioAfter: true, workspaceId: true } });
    if (!meta) return; // deleted before processing started

    const name = path.split("/").pop() ?? "meeting.mp3";
    const mime = mimeForExtension(fileExtension(name));
    const { data: blob, error } = await admin().storage.from("meetings").download(path);
    if (error || !blob) throw new Error("AUDIO_DOWNLOAD_FAILED");
    if (!blob.size) throw new Error("AUDIO_EMPTY");

    // Deepgram returns the transcript, utterance timestamps and diarization in one request.
    const result = await transcribe(blob, name, mime);
    await prisma.meeting.updateMany({ where: { id, userId, status: "PROCESSING" }, data: { processingStage: "analyzing", updatedAt: new Date() } });
    const segments = result.segments;
    const timestampedTranscript = withTimestamps(segments, result.text);

    // Long meetings are split into chunks and merged, so no part of the transcript is ever dropped.
    const analysis = await analyzeTranscript(segments.length ? segments.map((s) => (s.speaker ? `Speaker ${speakerNumber(s.speaker)}: ${s.text}` : s.text)) : [result.text], {
      chat,
      today: new Date().toISOString().slice(0, 10),
      onProgress: () => touchMeeting(id),
    });

    const saved = await prisma.$transaction(
      async (tx) => {
        // Only a meeting that is still PROCESSING may be finished: a late duplicate run must not overwrite a newer result.
        const updated = await tx.meeting.updateMany({
          where: { id, userId, status: "PROCESSING" },
          data: {
            status: "DONE", transcript: timestampedTranscript, transcriptRu: null, error: null, segmentsBuiltAt: null, processingStage: null,
            summary: analysis.summary, decisions: analysis.decisions, openQuestions: analysis.openQuestions,
          },
        });
        if (!updated.count) return false; // deleted, or finished by another run

        // Reconcile instead of delete-and-recreate so tasks the person already ticked off survive a re-analysis.
        const existing = await tx.task.findMany({ where: { meetingId: id }, select: { id: true, title: true, done: true, userEdited: true } });
        const plan = mergeTasks(existing, analysis.tasks);
        if (plan.remove.length) await tx.task.deleteMany({ where: { id: { in: plan.remove } } });
        if (plan.create.length) await tx.task.createMany({ data: plan.create.map((t) => ({ ...t, meetingId: id, userId, workspaceId: meta.workspaceId })) });
        return true;
      },
      { timeout: 20_000 },
    );
    if (!saved) return;

    // Derived data and clean-up are best effort: the notes are already saved, and the maintenance job backfills segments.
    try { await rebuildSegments(id, userId, timestampedTranscript); }
    catch (e) { console.error(`[analyzeMeeting:${id}] Could not store segments`, e); }
    if (meta.deleteAudioAfter) await removeAudio(id, path);
  } catch (e) {
    console.error(`[analyzeMeeting:${id}]`, e);
    try {
      await prisma.meeting.updateMany({ where: { id, userId, status: "PROCESSING" }, data: { status: "ERROR", error: classifyError(e), processingStage: null } });
    } catch (dbError) {
      console.error(`[analyzeMeeting:${id}] Failed to persist error status`, dbError);
    }
  }
}
