import { retryDelayMs, sleep } from "@/lib/retry";

const ENDPOINT = "https://api.deepgram.com/v1/listen";
const DEFAULT_TIMEOUT_MS = 600_000;
const RETRIES = 2;

export type TranscriptSegment = { start: number; end: number; text: string; speaker: string | null };
export type Transcription = { text: string; segments: TranscriptSegment[] };

export class DeepgramError extends Error {
  constructor(readonly kind: "no_key" | "network" | "timeout" | "http", readonly status?: number, detail = "") {
    super(`DEEPGRAM_${kind.toUpperCase()}${status ? `_${status}` : ""} ${detail}`.trim());
    this.name = "DeepgramError";
  }
}

type RawWord = { start?: unknown; end?: unknown; word?: unknown; punctuated_word?: unknown; speaker?: unknown };
type RawUtterance = { start?: unknown; end?: unknown; transcript?: unknown; speaker?: unknown; words?: RawWord[] };
type DeepgramPayload = {
  results?: {
    utterances?: RawUtterance[];
    channels?: { alternatives?: { transcript?: unknown; words?: RawWord[] }[] }[];
  };
};

const finite = (n: unknown, fallback = 0) => typeof n === "number" && Number.isFinite(n) ? n : fallback;
const wordText = (word: RawWord) => String(word.punctuated_word ?? word.word ?? "").trim();

/** Pure response adapter. One speaker remains unlabelled to match existing exports. */
export function parseDeepgramResponse(payload: DeepgramPayload): Transcription {
  const alternative = payload.results?.channels?.[0]?.alternatives?.[0];
  const utterances = payload.results?.utterances ?? [];
  let segments: TranscriptSegment[] = utterances.map((utterance) => ({
    start: finite(utterance.start), end: finite(utterance.end, finite(utterance.start)),
    text: String(utterance.transcript ?? "").trim(),
    speaker: typeof utterance.speaker === "number" ? `speaker_${utterance.speaker}` : typeof utterance.speaker === "string" ? utterance.speaker : null,
  })).filter((segment) => segment.text);

  if (!segments.length) {
    const words = alternative?.words ?? [];
    const grouped: TranscriptSegment[] = [];
    for (const word of words) {
      const text = wordText(word);
      if (!text) continue;
      const speaker = typeof word.speaker === "number" ? `speaker_${word.speaker}` : typeof word.speaker === "string" ? word.speaker : null;
      const previous = grouped[grouped.length - 1];
      if (previous && previous.speaker === speaker && finite(word.start) - previous.end < 1.25) {
        previous.end = finite(word.end, previous.end);
        previous.text += `${/^[,.;:!?]/.test(text) ? "" : " "}${text}`;
      } else grouped.push({ start: finite(word.start), end: finite(word.end, finite(word.start)), text, speaker });
    }
    segments = grouped;
  }

  const labels = new Map<string, string>();
  for (const segment of segments) {
    if (segment.speaker && !labels.has(segment.speaker)) labels.set(segment.speaker, `s${labels.size + 1}`);
  }
  const normalize = labels.size < 2
    ? segments.map((segment) => ({ ...segment, speaker: null }))
    : segments.map((segment) => ({ ...segment, speaker: segment.speaker ? labels.get(segment.speaker) ?? null : null }));
  return { text: String(alternative?.transcript ?? "").trim() || normalize.map((segment) => segment.text).join(" ").trim(), segments: normalize };
}

type ErrorResponse = { ok: true; payload: DeepgramPayload } | { ok: false; error: DeepgramError; retryAfter: string | null };

type RequestOptions = { diarize: boolean; timeoutMs?: number; language?: string };

async function request(blob: Blob, mime: string, apiKey: string, options: RequestOptions = { diarize: true }): Promise<ErrorResponse> {
  const query = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || "nova-3",
    language: options.language || process.env.DEEPGRAM_LANGUAGE || "multi",
    smart_format: "true",
    ...(options.diarize ? { diarize_model: "latest", utterances: "true" } : {}),
  });
  try {
    const response = await fetch(`${ENDPOINT}?${query}`, {
      method: "POST", headers: { Authorization: `Token ${apiKey}`, "Content-Type": mime || blob.type || "application/octet-stream" },
      body: blob, signal: AbortSignal.timeout(options.timeoutMs ?? (Number(process.env.DEEPGRAM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)),
    });
    if (response.ok) return { ok: true, payload: await response.json() as DeepgramPayload };
    return { ok: false, error: new DeepgramError("http", response.status, (await response.text()).slice(0, 500)), retryAfter: response.headers.get("retry-after") };
  } catch (error) {
    const kind = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "network";
    return { ok: false, error: new DeepgramError(kind), retryAfter: null };
  }
}

async function run(blob: Blob, mime: string, options: RequestOptions): Promise<Transcription> {
  if (!blob.size) throw new Error("AUDIO_EMPTY");
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new DeepgramError("no_key");
  for (let attempt = 0; ; attempt++) {
    const result = await request(blob, mime, apiKey, options);
    if (result.ok) {
      const parsed = parseDeepgramResponse(result.payload);
      if (!parsed.text) throw new Error("NO_SPEECH_DETECTED");
      return parsed;
    }
    const status = result.error.status;
    const retryable = result.error.kind === "network" || (result.error.kind === "http" && (status === 429 || (status !== undefined && status >= 500 && status <= 599)));
    const delay = retryable && attempt < RETRIES ? retryDelayMs(attempt, result.retryAfter) : null;
    if (delay === null) throw result.error;
    await sleep(delay);
  }
}

/** Deepgram is the only speech recognition provider; transient failures retry with backoff. */
export const transcribe = (blob: Blob, _name: string, mime: string) => run(blob, mime, { diarize: true });

/** A short spoken command for the voice assistant: no speaker separation, and a tight timeout so the person is not left waiting. */
export const transcribeShort = (blob: Blob, mime: string, language?: string) =>
  run(blob, mime, { diarize: false, timeoutMs: 25_000, language });
