"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupportedAudio, MAX_AUDIO_BYTES } from "@/lib/audio";
import { clearDraft } from "@/lib/recorder-draft";
import { recoverRecorderDraft, useRecorder } from "@/lib/use-recorder";
import { ConfirmSheet } from "@/components/ui/sheet";
import { LiveWave } from "@/components/ui/live-wave";
import { failedPartIndexes, partRecordedAt } from "@/lib/recorder-parts";
import { formatDateTime } from "@/lib/format-date";
import { intlLocale } from "@/lib/locale";
import { displayTitle } from "@/lib/display-title";
import type { Lang } from "@/lib/i18n-types";

const MIN_RECORDING_SECONDS = 3;

function friendlyUploadError(code: string, t: Record<string, string>) {
  const map: Record<string, string> = {
    unauthorized: t.errSession,
    audio_required: t.errType,
    unsupported_audio_format: t.errUnsupported,
    file_too_large: t.errSize,
    upload_failed: t.errServer,
    too_many_processing: t.errTooMany,
    network_error: t.errNetwork,
    rate_limited: t.errRateLimited,
    upload_missing: t.errServer,
    invalid_upload: t.errGeneric,
  };
  return map[code] ?? t.errGeneric;
}

class UploadError extends Error {
  constructor(readonly code: string) { super(code); }
}
type PreparedPart = { path: string; uploadUrl: string };

/**
 * Sends the file straight to Supabase Storage through the one-time signed URL (same request shape as
 * supabase-js `uploadToSignedUrl`), so the audio never passes through the size-limited serverless function.
 */
function putToSignedUrl(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    if (anon) { x.setRequestHeader("apikey", anon); x.setRequestHeader("Authorization", `Bearer ${anon}`); }
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100)); };
    x.onerror = () => reject(new UploadError("network_error"));
    x.onabort = () => reject(new UploadError("network_error"));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new UploadError(x.status === 413 ? "file_too_large" : "upload_failed")));
    x.send(body);
  });
}

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new UploadError(String(json.error ?? ""));
  return json;
}

function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const finish = (duration: number | null) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      audio.load();
      resolve(duration);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

function LocalFilePlayer({ file }: { file: File }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = URL.createObjectURL(file);
    audio.src = url; audio.load();
    return () => { audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); };
  }, [file]);
  return <audio ref={audioRef} controls preload="metadata" className="w-full" />;
}

export function Upload({ t, lang = "ru", timeZone = "UTC" }: { t: Record<string, string>; lang?: Lang; timeZone?: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRecorder(t);
  const cancelCapture = recorder.cancel;
  const { state: recorderState } = recorder;
  const files = recorder.files;
  const file = files[0] ?? null;
  const setFiles = recorder.setFiles;
  const rec = recorderState.phase === "recording" || recorderState.phase === "paused";
  const captureBusy = rec || recorderState.phase === "requesting";
  const paused = recorderState.phase === "paused";
  const secs = recorderState.seconds;
  const [title, setTitle] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [warning, setWarning] = useState("");
  const [over, setOver] = useState(false);
  const [confirmShort, setConfirmShort] = useState(false);
  const [recovery, setRecovery] = useState<File[] | null>(null);
  const [deleteAudio, setDeleteAudio] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [partIndex, setPartIndex] = useState(0);
  const [preparedParts, setPreparedParts] = useState<(PreparedPart | undefined)[]>([]);
  const [uploadedParts, setUploadedParts] = useState<boolean[]>([]);
  const [partProgress, setPartProgress] = useState<number[]>([]);
  const [reviewSeconds, setReviewSeconds] = useState<number | null>(null);
  useEffect(() => { void recoverRecorderDraft().then((draft) => { if (draft) setRecovery(draft); }); }, []);
  useEffect(() => {
    if (!files.length) return;
    let active = true;
    void Promise.all(files.map(getAudioDuration)).then((durations) => {
      if (active) setReviewSeconds(durations.reduce<number>((total, duration, index) => total + (duration ?? (files[index]?.size ?? 0) * 8 / 64000), 0));
    });
    return () => { active = false; };
  }, [files]);

  function pickParts(parts: File[], autoTitle?: string) {
    setErr(""); setWarning(""); setConfirmShort(false);
    const f = parts[0];
    if (!f) return;
    if (parts.some((part) => !part.size)) return setErr(t.errInvalidMedia);
    if (parts.some((part) => !isSupportedAudio(part.name, part.type))) return setErr(t.errUnsupported);
    if (parts.some((part) => part.size > MAX_AUDIO_BYTES)) return setErr(t.errSize);
    setFiles(parts);
    setPreparedParts([]); setUploadedParts(parts.map(() => false)); setPartProgress(parts.map(() => 0));
    setPartIndex(0);
    recorder.reviewFile();
    void clearDraft();
    const fileDate = f.lastModified > 0 ? new Date(f.lastModified) : new Date();
    const dateTitle = displayTitle("", fileDate, lang, timeZone);
    setTitle((current) => current || autoTitle || dateTitle);
  }
  function pick(f?: File | null, autoTitle?: string) { if (f) pickParts([f], autoTitle); }

  const cancelRecording = useCallback(() => {
    if (secs >= 5) { setCancelOpen(true); return; }
    cancelCapture(true);
    setFiles([]); setTitle("");
  }, [secs, cancelCapture, setFiles]);
  function discardRecording() { setCancelOpen(false); recorder.cancel(false); setFiles([]); setTitle(""); }
  function resetFile() { recorder.resetReview(); setTitle(""); setWarning(""); setErr(""); setConfirmShort(false); void clearDraft(); }

  useEffect(() => {
    if (!rec) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rec]);

  useEffect(() => {
    if (!rec) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !cancelOpen) { event.preventDefault(); cancelRecording(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rec, cancelOpen, cancelRecording]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || pct !== null) return;
    setErr("");
    if (!confirmShort) {
      const duration = await getAudioDuration(file);
      if (duration !== null && duration > 0 && duration < MIN_RECORDING_SECONDS) {
        setWarning(t.shortHint); setConfirmShort(true); return;
      }
    }
    recorder.beginUpload();
    setPct(0);
    try {
      const initialized: (PreparedPart | undefined)[] = [...preparedParts];
      const done = [...uploadedParts];
      const progress = [...partProgress];
      const retryIndexes = new Set(failedPartIndexes(done.map((complete) => complete ? "done" : "pending")));
      for (let i = 0; i < files.length; i += 1) {
        if (!retryIndexes.has(i)) continue;
        const partFile = files[i];
        if (!partFile) continue;
        if (!initialized[i]) {
          const init = await postJson("/api/uploads", { filename: partFile.name, contentType: partFile.type, size: partFile.size });
          initialized[i] = { path: String(init.path), uploadUrl: String(init.uploadUrl) };
          setPreparedParts([...initialized]);
        }
        if (done[i]) continue;
        const target = initialized[i];
        if (!target) throw new UploadError("upload_failed");
        try {
          await putToSignedUrl(target.uploadUrl, partFile, (value) => { progress[i] = value; setPartProgress([...progress]); setPct(value); });
        } catch (error) {
          // A failed signed PUT may have completed server-side without a response. Renew this part's path on retry;
          // already uploaded parts keep their paths and are never sent again.
          delete initialized[i];
          setPreparedParts([...initialized]);
          throw error;
        }
        done[i] = true; progress[i] = 100;
        setUploadedParts([...done]); setPartProgress([...progress]);
      }
      const durations = await Promise.all(files.map(getAudioDuration));
      const firstTime = recorder.recordedAt ?? new Date(file.lastModified);
      const seriesId = files.length > 1 ? crypto.randomUUID() : undefined;
      const effectiveDurations = files.map((part, index) => durations[index] ?? part.size * 8 / 64000);
      const partMetadata = files.map((_, index) => {
        const durationSec = Math.min(86400, Math.max(0, Math.round(effectiveDurations[index] ?? 0)));
        const recordedAt = partRecordedAt(firstTime, effectiveDurations.slice(0, index).map((duration) => Math.round(duration)))?.toISOString();
        const target = initialized[index];
        return { path: target?.path, recordedAt, durationSec, partNo: index + 1, partCount: files.length };
      });
      await postJson("/api/uploads/complete", files.length > 1
        ? { title, deleteAudio, seriesId, parts: partMetadata }
        : { path: partMetadata[0]?.path, title, deleteAudio, recordedAt: partMetadata[0]?.recordedAt, durationSec: partMetadata[0]?.durationSec });
      void clearDraft();
      recorder.processing();
      setRecovery(null); setFiles([]); setTitle(""); setWarning(""); setConfirmShort(false);
      setPreparedParts([]); setUploadedParts([]); setPartProgress([]);
      router.refresh();
    } catch (error) {
      const message = error instanceof UploadError ? friendlyUploadError(error.code, t) : t.errNetwork;
      recorder.uploadFailed(message);
      setErr(message);
    } finally {
      setPct(null);
    }
  }

  const busy = pct !== null;
  const shownSeconds = rec || recorderState.phase === "review" && secs > 0 ? secs : reviewSeconds ?? secs;
  const mmss = `${String(Math.floor(shownSeconds / 60)).padStart(2, "0")}:${String(Math.floor(shownSeconds % 60)).padStart(2, "0")}`;

  return (
    <form onSubmit={submit} className="recorder-card dashboard-recorder card relative overflow-hidden p-5 sm:p-7">
      <div className="relative">
        {recovery && !file && !rec && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-3 text-sm">
            <span>{t.recRecovery}</span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary h-8" onClick={() => pickParts(recovery, `${t.recGeneratedTitle}, ${formatDateTime(new Date(), intlLocale(lang), timeZone)}`)}>{t.recRecover}</button>
              <button type="button" className="btn btn-ghost h-8" onClick={() => { setRecovery(null); void clearDraft(); }}>{t.recDiscard}</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t.newMeeting}</h2>
              <p className="mt-1 max-w-lg text-sm leading-6 text-muted">{t.recorderSub}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rec && <button type="button" onClick={recorder.pauseResume} className="btn btn-ghost h-10">{paused ? t.recResume : t.recPause}</button>}
            {rec && <button type="button" onClick={cancelRecording} className="btn btn-ghost min-h-11">{t.recCancel}</button>}
            {rec && recorderState.parts > 1 && <span className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs text-muted">{t.recPartLabel} {recorderState.parts}</span>}
            <button type="button" disabled={busy || recorderState.phase === "requesting"} onClick={() => { if (rec) recorder.stop(); else { if (!title) setTitle(displayTitle("", new Date(), lang, timeZone)); void recorder.start(); } }} className="btn btn-primary min-h-11">
              {rec && <span className={`size-2 rounded-full bg-current ${paused ? "" : "motion-safe:animate-pulse"}`} aria-hidden />}
              {rec ? `${t.recStop} · ${mmss}` : recorderState.phase === "requesting" ? t.sending : t.dashRecordMeeting}
            </button>
            {!file && !captureBusy && <button type="button" className="btn btn-ghost min-h-11" onClick={() => fileInput.current?.click()}>{t.dashUploadFile}</button>}
          </div>
        </div>

        {rec && (
          <div className="mt-5 rounded-xl border border-line/80 bg-bg/55 p-4" role="group" aria-label={t.recordingLevel} aria-live="polite" aria-atomic="false">
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>{t.recordingLevel}</span>
              <span>{paused ? t.recPaused : t.levelGood}</span>
            </div>
            <LiveWave analyser={recorder.analyser} paused={paused} label={t.recordingLevel} />
          </div>
        )}
        {recorderState.phase === "permission_denied" && <div role="alert" className="mt-4 rounded-xl border border-danger/20 bg-danger/[.06] p-4 text-sm"><p className="font-semibold text-danger">{t.recPermissionDenied}</p><p className="mt-1 text-muted">{t.recPermissionHelp}</p><button type="button" className="btn btn-ghost mt-2 min-h-11" onClick={recorder.start}>{t.recRetryMic}</button></div>}
        {recorderState.phase === "error" && recorderState.error && <p role="alert" className="mt-3 text-sm text-danger">{recorderState.error}</p>}
        {recorderState.phase === "processing" && <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">{t.analyzing}</p>}

        <label
          onDragOver={(e) => { e.preventDefault(); if (!busy && !rec) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy && !captureBusy) pick(e.dataTransfer.files[0]); }}
          className={`dashboard-dropzone dropzone mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-accent sm:py-9 ${busy || captureBusy ? "pointer-events-none opacity-60" : ""} ${over ? "border-accent bg-accent/10" : "border-line/90 bg-bg/40 hover:border-accent/40 hover:bg-accent/[.035]"}`}>
          <input ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.mp4,.wav,.webm,.ogg,.flac,.aac,.opus" className="sr-only" disabled={busy || captureBusy}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          <span className="font-medium">{file ? title || displayTitle(file.name.replace(/\.[^.]+$/, ""), file.lastModified > 0 ? new Date(file.lastModified) : new Date(), lang, timeZone) : t.dropTitle}</span>
          <span className="text-sm text-muted">{file ? files.length > 1 ? `${files.length} ${t.recPartsLabel} · ${mmss}` : `${(file.size / 1048576).toFixed(2)} MB` : t.dropHint}</span>
        </label>

        {file && (
          <div className="mt-5 space-y-4 rounded-xl border border-line/70 bg-bg/35 p-4">
            <div><p className="mb-2 text-sm font-medium">{t.recReview}{files.length > 1 ? ` · ${files.length} ${t.recPartsLabel} · ${mmss}` : ""}</p>{files.length > 1 && <div className="mb-2 flex flex-wrap gap-2">{files.map((part, index) => <button key={`${part.name}-${index}`} type="button" className={`btn min-h-11 ${index === partIndex ? "btn-primary" : "btn-ghost"}`} onClick={() => setPartIndex(index)}>{t.recPartLabel} {index + 1}</button>)}</div>}<LocalFilePlayer file={files[partIndex] ?? file} /></div>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.titlePh} aria-label={t.title} maxLength={120} disabled={busy} />
            {busy && (
              <div role="status">
                <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} /></div>
                <p className="mt-2 text-sm text-muted">{pct === 100 ? t.analyzing : `${t.sending} ${pct}%`}</p>
                {files.length > 1 && <ul className="mt-2 space-y-1 text-xs text-muted">{files.map((part, index) => <li key={`${part.name}-${index}`}>{t.recPartLabel} {index + 1}: {uploadedParts[index] ? partProgress[index] ?? 100 : partProgress[index] ?? 0}%</li>)}</ul>}
              </div>
            )}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
              <input type="checkbox" className="mt-1" checked={deleteAudio} onChange={(e) => setDeleteAudio(e.target.checked)} disabled={busy} />
              <span>{t.deleteAudio}<span className="block text-xs">{t.deleteAudioHint}</span></span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary min-h-11 w-full sm:w-auto" disabled={busy || rec}>{confirmShort ? t.uploadAnyway : t.upload}</button>
              {!busy && <button type="button" className="btn btn-ghost min-h-11" onClick={resetFile}>{t.recRerecord}</button>}
              {!busy && <button type="button" className="btn btn-ghost min-h-11" onClick={resetFile}>{t.recRemoveFile}</button>}
            </div>
          </div>
        )}
        {warning && <p role="status" className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[.06] px-3.5 py-3 text-sm text-muted">{warning}</p>}
        {err && <p role="alert" className="mt-3 rounded-xl border border-danger/20 bg-danger/[.06] px-3.5 py-3 text-sm text-danger">{err}</p>}
        <ConfirmSheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={t.recCancelTitle.replace("{duration}", mmss)} closeLabel={t.recCancel} cancelLabel={t.recContinue} confirmLabel={t.recDelete} onConfirm={discardRecording}>{t.recCancelBody}</ConfirmSheet>
      </div>
    </form>
  );
}
