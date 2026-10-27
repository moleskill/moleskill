"use client";
import { useRef, useState } from "react";
import { seekAndPlay } from "@/lib/audio-client";
import { clock } from "@/lib/transcript";

type Meeting = { id: string; title: string; date: string; audioUrl: string | null };
type Source = { meetingId: string; title: string; date: string; displayDate?: string; start: number; end: number; quote: string };
type QA = { id: number; q: string; a: string; sources: Source[]; error?: boolean };

export function AskForm({ t, meetings }: { t: Record<string, string>; meetings: Meeting[] }) {
  const [q, setQ] = useState("");
  const [meetingId, setMeetingId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<QA[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const nextId = useRef(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [activeEnd, setActiveEnd] = useState<number | null>(null);

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    setBusy(true); setQ("");
    const id = nextId.current++;
    let item: QA;
    try {
      const res = await fetch("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, meetingId: meetingId === "all" ? undefined : meetingId }),
      });
      const j = await res.json();
      item = res.ok && j.result
        ? { id, q: question, a: j.result.answer || t.askNoAnswer, sources: j.result.sources ?? [] }
        : { id, q: question, a: res.ok ? t.askEmpty : t.askError, sources: [], error: !res.ok };
    } catch {
      item = { id, q: question, a: t.askError, sources: [], error: true };
    }
    setLog((l) => [item, ...l]);
    setBusy(false);
  }

  function playSource(source: Source) {
    const meeting = meetings.find((x) => x.id === source.meetingId);
    const el = audio.current;
    if (!meeting?.audioUrl || !el) return;
    if (el.getAttribute("src") !== meeting.audioUrl) el.src = meeting.audioUrl;
    setHasAudio(true);
    setActiveEnd(source.end);
    seekAndPlay(el, source.start);
  }

  const examples = [t.ex1, t.ex2, t.ex3];
  return (
    <div>
      <div className="ask-composer app-panel flex flex-col gap-3 p-3 sm:flex-row">
        <select className="input sm:max-w-xs" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} aria-label={t.askChoose}>
          <option value="all">{t.askAll}</option>
          {meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {m.date}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex min-w-0 flex-1 gap-2">
          <input className="input min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.askPlaceholder} aria-label={t.askPh} maxLength={500} disabled={!meetings.length} />
          <button className="btn btn-primary shrink-0" disabled={busy || !q.trim() || !meetings.length}>{t.askBtn}</button>
        </form>
      </div>

      {meetings.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button key={e} type="button" disabled={busy} onClick={() => void ask(e)}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-fg/5 hover:text-fg disabled:opacity-60">{e}</button>
          ))}
        </div>
      ) : <p className="mt-10 text-center text-muted">{t.askEmpty}</p>}

      {busy && <p role="status" className="mt-6 text-sm text-muted motion-safe:animate-pulse">{t.askSearching}</p>}

      <audio ref={audio} controls preload="none" className={`mt-4 w-full ${hasAudio ? "" : "hidden"}`}
        onTimeUpdate={(e) => { if (activeEnd !== null && e.currentTarget.currentTime >= activeEnd) { e.currentTarget.pause(); setActiveEnd(null); } }} />

      <div className="mt-6 space-y-4">
        {log.map((x) => (
          <article key={x.id} className="answer-card card p-5 sm:p-6">
            <p className="text-sm font-medium text-muted">{x.q}</p>
            <p className={`mt-2 whitespace-pre-wrap leading-7 ${x.error ? "text-danger" : ""}`}>{x.a}</p>
            {x.sources.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-sm font-semibold text-muted">{t.askSources}</p>
                <div className="space-y-2">
                  {x.sources.map((s, j) => (
                    <button key={`${s.meetingId}-${s.start}-${j}`} type="button" onClick={() => playSource(s)}
                      className="block w-full rounded-xl border border-line bg-bg/45 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/[.04]">
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-accent">{clock(s.start)}–{clock(s.end)}</span>
                        <span className="text-muted">{s.title} · {s.displayDate ?? s.date}</span>
                      </span>
                      <span className="mt-1 block text-sm">“{s.quote}”</span>
                      <span className="mt-1 block text-xs text-accent">{t.askJump}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
