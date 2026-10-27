"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LiveWave } from "@/components/ui/live-wave";
import { clock } from "@/lib/transcript";

type Lang = "ru" | "en";
type Phase = "idle" | "listening" | "thinking" | "speaking";
type Source = { meetingId: string; title: string; date: string; displayDate?: string; start: number; end: number; quote: string };
type TaskItem = { id: string; title: string; owner: string | null; dueLabel: string | null; overdue: boolean };
type Turn = { id: number; q: string; a: string; sources: Source[]; tasks: TaskItem[]; error?: boolean };
type Props = { t: Record<string, string>; lang: Lang; hasMeetings: boolean; canAsk: boolean };

const MAX_RECORDING_MS = 45_000;
const SILENCE_MS = 1_600;
const MIN_CLIP_MS = 600;
const VOICE_LEVEL = 0.035; // RMS of the waveform (0..1) above which we count it as speech
const VOICE_KEY = "moleskill-ai-voice";

function pickMime() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

const MicIcon = () => <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5 10.5v.5a7 7 0 0 0 14 0v-.5M12 18v3.5" /></svg>;
const StopIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="3" /></svg>;
const SpeakerIcon = ({ off }: { off?: boolean }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />{off ? <path d="m16 9.5 4 5m0-5-4 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />}</svg>;

export function AssistantClient({ t, lang, hasMeetings, canAsk }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [heard, setHeard] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const nextId = useRef(0);
  const turnsRef = useRef<Turn[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const monitor = useRef<ReturnType<typeof setInterval> | null>(null);
  const discard = useRef(false);
  const voiceRef = useRef(true);

  useEffect(() => { turnsRef.current = turns; voiceRef.current = voiceOn; }, [turns, voiceOn]);

  useEffect(() => {
    try { if (localStorage.getItem(VOICE_KEY) === "off") setVoiceOn(false); } catch { /* storage can be blocked */ }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const releaseMic = useCallback(() => {
    if (monitor.current) clearInterval(monitor.current);
    monitor.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    setAnalyser(null);
  }, []);

  useEffect(() => () => { discard.current = true; if (recorder.current?.state === "recording") recorder.current.stop(); releaseMic(); stopSpeaking(); }, [releaseMic, stopSpeaking]);

  /** Safari only lets speech start from a tap, and our reply arrives later, so a silent utterance is spoken on the tap itself. */
  const unlockSpeech = useCallback(() => {
    if (!voiceRef.current || !("speechSynthesis" in window)) return;
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }, []);

  const speak = useCallback((message: string) => {
    if (!voiceRef.current || !message || !("speechSynthesis" in window)) { setPhase("idle"); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    const spoken: Lang = /[а-яё]/i.test(message) ? "ru" : "en"; // read the reply in the language it is written in
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = spoken === "ru" ? "ru-RU" : "en-US";
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(spoken));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setPhase("idle");
    utterance.onerror = () => setPhase("idle");
    setPhase("speaking");
    synth.speak(utterance);
  }, []);

  const failure = useCallback((code?: string) => {
    const known: Record<string, string> = {
      no_speech: t.aiNoSpeech, stt_not_configured: t.aiSttDown, stt_failed: t.aiSttFailed, ai_not_configured: t.aiDown, ai_failed: t.aiFailed,
      audio_too_large: t.aiTooLong, rate_limited: t.aiBusy, forbidden: t.aiNoAccess,
    };
    setNotice(known[code ?? ""] ?? t.aiFailed);
    setPhase("idle");
  }, [t]);

  const send = useCallback(async (input: { audio?: Blob; text?: string }) => {
    setPhase("thinking"); setNotice(""); setHeard("");
    const history = turnsRef.current.slice(0, 3).reverse().map((turn) => turn.q);
    try {
      let response: Response;
      if (input.audio) {
        const form = new FormData();
        form.set("audio", input.audio, "voice.webm");
        form.set("history", JSON.stringify(history));
        response = await fetch("/api/assistant", { method: "POST", body: form });
      } else {
        response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input.text, history }) });
      }
      const data = await response.json().catch(() => ({})) as { error?: string; transcript?: string; answer?: string; speech?: string; sources?: Source[]; tasks?: TaskItem[] };
      if (response.status === 429) return failure("rate_limited");
      if (!response.ok || typeof data.answer !== "string") return failure(response.status === 403 ? "forbidden" : data.error);
      const turn: Turn = { id: nextId.current++, q: data.transcript ?? input.text ?? "", a: data.answer, sources: data.sources ?? [], tasks: data.tasks ?? [] };
      setTurns((list) => [turn, ...list]);
      speak(data.speech ?? data.answer);
    } catch {
      failure();
    }
  }, [failure, speak]);

  const stopRecording = useCallback((cancel = false) => {
    discard.current = cancel;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else releaseMic();
  }, [releaseMic]);

  const startRecording = useCallback(async () => {
    stopSpeaking(); setNotice(""); setHeard("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice(t.aiNoMic); return; }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setNotice(t.aiMicDenied); return;
    }
    stream.current = media;
    const mime = pickMime();
    const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    discard.current = false;
    rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    rec.onstop = () => {
      const long = Date.now() - startedAt >= MIN_CLIP_MS;
      const skip = discard.current || !long;
      releaseMic();
      if (skip) { setPhase("idle"); return; }
      void send({ audio: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }) });
    };
    recorder.current = rec;

    // Stop by itself after a pause: a voice assistant should not need a second tap.
    try {
      const context = new AudioContext();
      audioContext.current = context;
      const source = context.createMediaStreamSource(media);
      const node = context.createAnalyser();
      node.fftSize = 1024;
      source.connect(node);
      setAnalyser(node);
      const samples = new Uint8Array(node.fftSize);
      let heardVoice = false, lastVoice = Date.now();
      monitor.current = setInterval(() => {
        node.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) { const centered = (value - 128) / 128; sum += centered * centered; }
        const now = Date.now();
        if (Math.sqrt(sum / samples.length) > VOICE_LEVEL) { heardVoice = true; lastVoice = now; }
        if ((heardVoice && now - lastVoice > SILENCE_MS) || now - startedAt > MAX_RECORDING_MS) stopRecording();
      }, 100);
    } catch { /* without the analyser the person taps to stop; the 45 s cap still applies below */
      monitor.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS) as unknown as ReturnType<typeof setInterval>;
    }
    rec.start();
    setPhase("listening");
  }, [releaseMic, send, stopRecording, stopSpeaking, t]);

  function onOrb() {
    if (!canAsk) return;
    unlockSpeech();
    if (phase === "listening") stopRecording();
    else if (phase === "speaking") { stopSpeaking(); setPhase("idle"); }
    else if (phase === "idle") void startRecording();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || phase !== "idle" || !canAsk) return;
    unlockSpeech();
    setText(""); setHeard(value);
    void send({ text: value });
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) { stopSpeaking(); if (phase === "speaking") setPhase("idle"); }
    try { localStorage.setItem(VOICE_KEY, next ? "on" : "off"); } catch { /* ignore */ }
  }

  const status = phase === "listening" ? t.aiListening : phase === "thinking" ? t.aiThinking : phase === "speaking" ? t.aiSpeaking : t.aiTap;
  const orbLabel = phase === "listening" ? t.aiStopRec : phase === "speaking" ? t.aiStopSpeak : t.aiTap;
  const examples = [t.aiEx1, t.aiEx2, t.aiEx3];

  return (
    <div>
      <section className="app-panel ai-stage" aria-label={t.aiName}>
        <button type="button" className="ai-orb" data-phase={phase} onClick={onOrb} disabled={!canAsk || phase === "thinking"} aria-label={orbLabel}>
          {phase === "listening" || phase === "speaking" ? <StopIcon /> : <MicIcon />}
        </button>
        <p className="ai-status" role="status" aria-live="polite">{canAsk ? status : t.aiNoAccess}</p>
        <div className="ai-wave" aria-hidden={phase !== "listening"}>{phase === "listening" && <LiveWave analyser={analyser} paused={false} label={t.aiListening} />}</div>
        {heard && phase === "thinking" && <p className="ai-heard">«{heard}»</p>}
        {notice && <p className="custom-auth-error ai-notice" role="alert">{notice}</p>}

        <form onSubmit={onSubmit} className="ai-form">
          <input className="input min-w-0 flex-1" value={text} onChange={(event) => setText(event.target.value)} placeholder={t.aiTypePh} aria-label={t.aiTypePh} maxLength={500} disabled={!canAsk || phase !== "idle"} />
          <button className="btn btn-primary shrink-0" disabled={!canAsk || phase !== "idle" || !text.trim()}>{t.aiSend}</button>
          <button type="button" className="btn btn-ghost ai-voice-toggle" onClick={toggleVoice} aria-pressed={voiceOn} aria-label={voiceOn ? t.aiVoiceOff : t.aiVoiceOn} title={voiceOn ? t.aiVoiceOff : t.aiVoiceOn}><SpeakerIcon off={!voiceOn} /></button>
        </form>
      </section>

      {!turns.length && (
        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button key={example} type="button" disabled={phase !== "idle" || !canAsk} onClick={() => { unlockSpeech(); setHeard(example); void send({ text: example }); }}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-fg/5 hover:text-fg disabled:opacity-60">{example}</button>
          ))}
        </div>
      )}
      {!hasMeetings && <p className="mt-4 text-sm text-muted">{t.aiNoMeetings}</p>}

      <div className="mt-6 space-y-4">
        {turns.map((turn) => (
          <article key={turn.id} className="answer-card card p-5 sm:p-6">
            <p className="text-sm font-medium text-muted">{turn.q}</p>
            <p className="mt-2 whitespace-pre-wrap leading-7">{turn.a}</p>
            {turn.tasks.length > 0 && (
              <ul className="mt-3 space-y-2">
                {turn.tasks.map((task) => (
                  <li key={task.id} className="rounded-xl border border-line bg-bg/45 p-3 text-sm">
                    <span className="block">{task.title}</span>
                    <span className={`mt-1 block text-xs ${task.overdue ? "text-danger" : "text-muted"}`}>{[task.owner, task.dueLabel ?? t.aiNoDue].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
            {turn.sources.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-sm font-semibold text-muted">{t.aiSources}</p>
                <div className="space-y-2">
                  {turn.sources.map((source, i) => (
                    <Link key={`${source.meetingId}-${source.start}-${i}`} href={`/dashboard/meetings/${source.meetingId}`} className="block rounded-xl border border-line bg-bg/45 p-3 transition-colors hover:border-accent/50 hover:bg-accent/[.04]">
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-accent">{clock(source.start)}</span>
                        <span className="text-muted">{source.title} · {source.displayDate ?? source.date}</span>
                      </span>
                      <span className="mt-1 block text-sm">{source.quote}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs leading-5 text-muted">{t.aiPrivacy}</p>
    </div>
  );
}
