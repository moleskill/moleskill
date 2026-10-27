// Transcript lines look like "[MM:SS.mmm] text". Pure helpers, safe to use on the server and in the browser.
// An optional speaker code follows the timestamp: "[MM:SS.mmm] {s2} text" (see lib/speakers.ts).
const LINE = /^\[(\d{2,}):(\d{2})(?:\.(\d{1,3}))?\]\s*(?:\{(s\d{1,2})\}\s*)?(.*)$/;

export type TranscriptLine = { key: number; time: number | null; stamp: string; text: string; speaker: string | null };

/** Lines without a timestamp (e.g. added while editing) are kept with `time: null`. Empty lines are dropped. */
export function parseTranscript(raw: string): TranscriptLine[] {
  return raw
    .split(/\r?\n/)
    .map((line, key): TranscriptLine => {
      const m = line.match(LINE);
      if (!m) return { key, time: null, stamp: "", text: line, speaker: null };
      return { key, time: Number(m[1]) * 60 + Number(m[2]) + Number(`0.${m[3] ?? "0"}`), stamp: `${m[1]}:${m[2]}`, text: m[5], speaker: m[4] ?? null };
    })
    .filter((line) => line.text.trim());
}

export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/** Each cue ends when the next one starts (capped), so subtitles never overlap. */
export function toSrt(lines: TranscriptLine[], speakerLabel?: (code: string) => string) {
  const timed = lines.filter((l): l is TranscriptLine & { time: number } => l.time !== null);
  return timed
    .map((l, i) => {
      const next = timed[i + 1]?.time;
      const end = next !== undefined && next > l.time ? Math.min(next, l.time + 10) : l.time + 4;
      return `${i + 1}\n${srtTime(l.time)} --> ${srtTime(end)}\n${l.speaker && speakerLabel ? `${speakerLabel(l.speaker)}: ` : ""}${l.text}`;
    })
    .join("\n\n");
}
