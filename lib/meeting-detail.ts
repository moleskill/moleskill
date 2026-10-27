import { parseTranscript, clock, type TranscriptLine } from "@/lib/transcript";
import { dateKeyInTimeZone } from "@/lib/timezone";

export type TimedMeeting = { id: string; createdAt: Date; recordedAt: Date | null };

export function meetingNeighbors<T extends TimedMeeting>(meetings: T[], id: string) {
  const ordered = [...meetings].sort((a, b) => (a.recordedAt ?? a.createdAt).getTime() - (b.recordedAt ?? b.createdAt).getTime());
  const index = ordered.findIndex((meeting) => meeting.id === id);
  return { previous: index > 0 ? ordered[index - 1] ?? null : null, next: index >= 0 ? ordered[index + 1] ?? null : null };
}

export function weekAround(instant: Date, timeZone: string) {
  const key = dateKeyInTimeZone(instant, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const center = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return Array.from({ length: 7 }, (_, index) => new Date(center + (index - 3) * 86_400_000).toISOString().slice(0, 10));
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  return `${Math.floor(total / 3600) ? `${Math.floor(total / 3600)}:` : ""}${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function offsetTranscript(transcript: string, offsetSec: number): TranscriptLine[] {
  return parseTranscript(transcript).map((line) => {
    if (line.time === null) return line;
    const time = line.time + offsetSec;
    return { ...line, time, stamp: clock(time) };
  });
}

export function transcriptSpeakerCodes(transcript: string) {
  return [...new Set(parseTranscript(transcript).flatMap((line) => line.speaker ? [line.speaker] : []))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
