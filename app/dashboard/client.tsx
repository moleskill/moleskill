"use client";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { retryMeeting, saveTask, toggleTask } from "@/app/actions/meetings";
import { downloadText, seekAndPlay } from "@/lib/audio-client";
import { parseTranscript, toSrt } from "@/lib/transcript";
import { formatDate } from "@/lib/format-date";
import { speakerNumber } from "@/lib/speakers";
import { suggestMonthYear, YEAR_MAX, YEAR_MIN } from "@/lib/task-dates";
import type { TaskDto } from "@/lib/task-dto";
import type { TaskLabels } from "@/lib/task-labels";
import type { UpdateTaskResult } from "@/lib/task-update";

type T = Record<string, string>;

/** Checks only the processing count; reloads the full page once work has finished. */
export function Poll({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/meetings/status", { cache: "no-store" });
          if (response.ok) {
            const data = await response.json() as { processing?: number };
            if (typeof data.processing === "number" && data.processing === 0) {
              router.refresh();
              if (!stopped) timer = setTimeout(check, 15000);
              return;
            }
          }
        } catch { /* A temporary polling failure should not disrupt the meeting page. */ }
      }
      if (!stopped) timer = setTimeout(check, 8000);
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [active, router]);
  return null;
}

type Patch = Record<string, string | number | null>;
type SaveFn = (patch: Patch) => Promise<string | null>;

/** A task row: tick it off, edit it, and confirm a deadline that the recording left ambiguous. */
export function TaskItem({ task, locale, labels, context, contextHref, overdue, readOnly = false, id, displayTitle, displayOwner, relativeDue }: { task: TaskDto; locale: string; labels: TaskLabels; context?: string; contextHref?: string; overdue?: boolean; readOnly?: boolean; id?: string; displayTitle?: string; displayOwner?: string | null; relativeDue?: string }) {
  const [current, setCurrent] = useState(task);
  const [seen, setSeen] = useState(task.updatedAt);
  const [mode, setMode] = useState<"view" | "edit" | "review">("view");
  const [note, setNote] = useState("");
  const [, start] = useTransition();
  const inputId = useId();
  // Follow the server version when it changes (after a refresh), without an effect.
  if (task.updatedAt !== seen) { setSeen(task.updatedAt); setCurrent(task); }

  const fmt = (iso: string) => formatDate(new Date(iso), locale, "UTC", { day: "numeric", month: "short" });

  function apply(result: UpdateTaskResult): string | null {
    if (result.ok) { setCurrent(result.task); setNote(""); return null; }
    if (result.task) setCurrent(result.task); // someone changed it elsewhere: show their version, never overwrite it
    if (result.error === "conflict") { setNote(labels.conflict); setMode("view"); return labels.conflict; }
    return result.error === "invalid_date" || result.error === "incomplete_date" ? labels.invalidDate : labels.saveError;
  }

  function toggle() {
    const next = !current.done;
    setCurrent({ ...current, done: next });
    start(async () => {
      try { apply(await toggleTask(current.id, next)); } catch { setCurrent((c) => ({ ...c, done: !next })); }
    });
  }

  const save: SaveFn = async (patch) => {
    try {
      const error = apply(await saveTask(current.id, patch, current.updatedAt));
      if (!error) setMode("view");
      return error;
    } catch {
      return labels.saveError;
    }
  };

  const due = current.dueDate
    ? <span>{fmt(current.dueDate)}</span>
    : current.dueNeedsReview && !current.done
      ? readOnly ? <span className="text-warn">{labels.unclear}</span> : <button type="button" onClick={() => setMode("review")} className="font-medium text-warn underline decoration-dotted underline-offset-2 hover:text-fg">{labels.unclear}. {labels.clarify}</button>
      : <span>{labels.noDue}</span>;

  return (
    <li id={id} className="py-2.5">
      <div className="flex items-start gap-3">
        <input id={inputId} type="checkbox" checked={current.done} onChange={toggle} disabled={readOnly} className="mt-1 size-4 shrink-0 cursor-pointer accent-(--accent) disabled:cursor-default disabled:opacity-60" />
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className={`${readOnly ? "" : "cursor-pointer"} ${current.done ? "text-muted line-through" : ""}`}>{displayTitle ?? current.title}</label>
          <div className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm ${overdue && !current.done ? "text-danger" : "text-muted"}`}>
            {context && <>{contextHref ? <Link className="truncate hover:text-accent hover:underline" href={contextHref}>{context}</Link> : <span className="truncate">{context}</span>}<span aria-hidden>·</span></>}
            <span>{(displayOwner === undefined ? current.owner : displayOwner) ?? labels.noOwner}</span><span aria-hidden>·</span>{due}{relativeDue && <><span aria-hidden>·</span><span className="font-medium text-fg">{relativeDue}</span></>}
          </div>
          {note && mode === "view" && <p className="mt-1 text-xs text-warn" role="status">{note}</p>}
        </div>
        {mode === "view" && !readOnly && <button type="button" onClick={() => { setNote(""); setMode("edit"); }} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">{labels.edit}</button>}
      </div>
      {mode === "edit" && <TaskEditForm task={current} labels={labels} onSave={save} onCancel={() => setMode("view")} />}
      {mode === "review" && <ReviewDue task={current} labels={labels} locale={locale} onSave={save} onCancel={() => setMode("view")} />}
    </li>
  );
}

function FormShell({ children, onSubmit, pending, labels, onCancel, error, canSave = true }: {
  children: ReactNode; onSubmit: () => void; pending: boolean; labels: TaskLabels; onCancel: () => void; error: string; canSave?: boolean;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-3 ml-7 space-y-3 rounded-xl border border-line bg-surface-2/60 p-3 sm:p-4">
      {children}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !canSave} className="btn btn-primary h-9 px-4 text-sm">{pending ? labels.saving : labels.save}</button>
        <button type="button" onClick={onCancel} disabled={pending} className="btn btn-ghost h-9 px-4 text-sm">{labels.cancel}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-muted">{label}<span className="mt-1 block">{children}</span></label>;
}

function TaskEditForm({ task, labels, onSave, onCancel }: { task: TaskDto; labels: TaskLabels; onSave: SaveFn; onCancel: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [owner, setOwner] = useState(task.owner ?? "");
  const [date, setDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const patch: Patch = {};
    if (title.trim() !== task.title) patch.title = title.trim();
    if (owner.trim() !== (task.owner ?? "")) patch.owner = owner.trim() || null;
    if (date !== (task.dueDate ? task.dueDate.slice(0, 10) : "")) patch.dueDate = date || null;
    if (!Object.keys(patch).length) return onCancel();
    start(async () => setError((await onSave(patch)) ?? ""));
  }

  return (
    <FormShell onSubmit={submit} pending={pending} labels={labels} onCancel={onCancel} error={error} canSave={!!title.trim()}>
      <Field label={labels.titleLabel}><input className="input h-9 text-sm" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.ownerLabel}><input className="input h-9 text-sm" value={owner} maxLength={120} onChange={(e) => setOwner(e.target.value)} /></Field>
        <Field label={labels.dueLabel}><input type="date" className="input h-9 text-sm" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
    </FormShell>
  );
}

/** Asks only for what the recording did not say: usually the month and year of "by the 29th". */
function ReviewDue({ task, labels, locale, onSave, onCancel }: { task: TaskDto; labels: TaskLabels; locale: string; onSave: SaveFn; onCancel: () => void }) {
  const day = task.dueDay;
  const guess = useMemo(() => (day ? suggestMonthYear(day) : null), [day]);
  const [month, setMonth] = useState(task.dueMonth ?? guess?.month ?? new Date().getMonth() + 1);
  const [year, setYear] = useState(String(task.dueYear ?? guess?.year ?? new Date().getFullYear()));
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => formatDate(new Date(Date.UTC(2000, i, 1)), locale, "UTC", { month: "long" })), [locale]);

  const heard = task.dueText ? labels.heardText.replace("{text}", task.dueText) : day ? labels.heardDay.replace("{day}", String(day)) : "";
  const yearNum = Number(year);
  const yearOk = Number.isInteger(yearNum) && yearNum >= YEAR_MIN && yearNum <= YEAR_MAX;

  function submit() {
    // With a known day only month and year are needed; otherwise the person picks the whole date.
    const patch: Patch = day ? { dueMonth: month, dueYear: yearNum } : { dueDate: date };
    start(async () => setError((await onSave(patch)) ?? ""));
  }

  return (
    <FormShell onSubmit={submit} pending={pending} labels={labels} onCancel={onCancel} error={error} canSave={day ? yearOk : !!date}>
      <p className="text-sm">{heard} <span className="font-medium">{day ? labels.askMonthYear : labels.askDate}</span></p>
      {day ? (
        <div className="grid grid-cols-[1fr_6.5rem] gap-3 sm:max-w-sm">
          <Field label={labels.monthLabel}>
            <select className="input h-9 text-sm capitalize" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </Field>
          <Field label={labels.yearLabel}><input className="input h-9 text-sm" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></Field>
        </div>
      ) : (
        <div className="sm:max-w-xs"><Field label={labels.dueLabel}><input type="date" className="input h-9 text-sm" value={date} onChange={(e) => setDate(e.target.value)} autoFocus /></Field></div>
      )}
    </FormShell>
  );
}

export function RetryButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="btn btn-ghost mt-3 h-9" onClick={() => start(async () => { await retryMeeting(id); })}>
      {label}
    </button>
  );
}

export function MeetingMetaEditor({ id, tags: initialTags, favorite: initialFavorite, t }: { id: string; tags: string[]; favorite: boolean; t: T }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"" | "saved" | "failed">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function save(payload: { favorite?: boolean; tags?: string[] }) {
    let ok = false;
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      ok = res.ok;
    } catch { /* reported below */ }
    setStatus(ok ? "saved" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 2000);
    if (ok) router.refresh(); // keeps the tag filter in sync
    return ok;
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    if (!(await save({ favorite: next }))) setFavorite(!next);
  }

  async function addTag() {
    const tag = draft.replace(/[,\n]/g, " ").trim().replace(/\s+/g, " ").slice(0, 32);
    setDraft("");
    if (!tag || tags.includes(tag) || tags.length >= 12) return;
    const previous = tags;
    const next = [...tags, tag];
    setTags(next);
    if (!(await save({ tags: next }))) setTags(previous);
  }

  async function removeTag(tag: string) {
    const previous = tags;
    const next = tags.filter((x) => x !== tag);
    setTags(next);
    if (!(await save({ tags: next }))) setTags(previous);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={favorite} onClick={() => void toggleFavorite()}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${favorite ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-line text-muted hover:text-fg"}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
        {t.favorite}
      </button>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-accent">
          {tag}
          <button type="button" onClick={() => void removeTag(tag)} aria-label={`${t.tagRemove}: ${tag}`}
            className="flex size-4 items-center justify-center rounded-full hover:bg-accent/20">
            <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="m2 2 6 6M8 2 2 8" /></svg>
          </button>
        </span>
      ))}
      {tags.length < 12 && (
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={32}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); void addTag(); } }}
          onBlur={() => void addTag()}
          placeholder={`+ ${t.tagAdd}`} aria-label={t.tagAdd}
          className="h-7 w-32 rounded-full border border-transparent bg-transparent px-2.5 text-xs placeholder:text-muted hover:border-line focus:border-accent/60 focus:outline-none" />
      )}
      <span role="status" className={`text-xs ${status === "failed" ? "text-danger" : "text-muted"}`}>
        {status === "saved" ? t.saved : status === "failed" ? t.saveFailed : ""}
      </span>
    </div>
  );
}

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="text-sm text-muted transition-colors hover:text-fg"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* clipboard blocked */ }
      }}>
      {ok ? done : label}
    </button>
  );
}

export function ExportMinutes({ id, content, label }: { id: string; content: string; label: string }) {
  return (
    <button type="button" className="text-sm text-muted transition-colors hover:text-fg"
      onClick={() => downloadText(`moleskill-minutes-${id}.md`, content, "text/markdown")}>
      {label}
    </button>
  );
}

export function TranslateMinutes({ content, t }: { content: string; t: T }) {
  const [translation, setTranslation] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function translate() {
    if (translation) { setShow(true); return; }
    setPending(true); setError("");
    try {
      const res = await fetch("/api/meetings/translate-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      if (!res.ok) throw new Error("translation failed");
      const result = await res.json() as { translation?: string };
      if (!result.translation) throw new Error("empty translation");
      setTranslation(result.translation); setShow(true);
    } catch { setError(t.translationFailed); }
    finally { setPending(false); }
  }
  return <div className="basis-full space-y-2">
    <button type="button" disabled={pending} onClick={() => show ? setShow(false) : void translate()} className="text-xs text-accent hover:underline disabled:opacity-60">
      {pending ? t.translating : show ? t.showOriginal : translation ? t.showRu : t.translateMinutes}
    </button>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    {show && <><p className="text-xs text-muted">{t.translationNotice}</p><pre className="whitespace-pre-wrap rounded-xl border border-line p-4 font-sans text-sm leading-6">{translation}</pre></>}
  </div>;
}

export function TranscriptPlayer({ id, transcript, translatedTranscript: initialTranslation, audioUrl, audioRef: externalAudioRef, showAudio = true, t }: { id: string; transcript: string; translatedTranscript?: string | null; audioUrl?: string | null; audioRef?: RefObject<HTMLAudioElement | null>; showAudio?: boolean; t: T }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(transcript);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [translationOverride, setTranslationOverride] = useState<{ source: string; value: string } | null>(null);
  const translatedTranscript = translationOverride?.source === transcript ? translationOverride.value : initialTranslation ?? "";
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const audio = externalAudioRef ?? internalAudioRef;
  const displayedTranscript = showTranslation && translatedTranscript ? translatedTranscript : transcript;
  const lines = useMemo(() => parseTranscript(displayedTranscript), [displayedTranscript]);
  const hasTimes = lines.some((line) => line.time !== null);

  async function translate() {
    if (translatedTranscript) { setShowTranslation(true); return; }
    setTranslating(true); setTranslationError("");
    try {
      const res = await fetch(`/api/meetings/${id}/translate`, { method: "POST" });
      if (!res.ok) throw new Error("translation failed");
      const result = await res.json() as { transcript?: string };
      if (!result.transcript) throw new Error("empty translation");
      setTranslationOverride({ source: transcript, value: result.transcript });
      setShowTranslation(true);
    } catch {
      setTranslationError(t.translationFailed);
    } finally {
      setTranslating(false);
    }
  }

  async function saveTranscript() {
    setSaving(true); setSaveError("");
    try {
      const res = await fetch(`/api/meetings/${id}/transcript`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: draft }) });
      if (!res.ok) throw new Error("save failed");
      setEditing(false);
      setTranslationOverride({ source: draft, value: "" }); setShowTranslation(false);
      router.refresh();
    } catch { setSaveError(t.transcriptSaveFailed); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => { setDraft(transcript); setShowTranslation(false); setEditing((v) => !v); }}>
          {editing ? t.cancelEdit : t.editTranscript}
        </button>
        {!editing && (showTranslation
          ? <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setShowTranslation(false)}>{t.showOriginal}</button>
          : <button type="button" disabled={translating} className="text-xs text-accent hover:underline disabled:opacity-60" onClick={() => void translate()}>{translating ? t.translating : translatedTranscript ? t.showRu : t.translateRu}</button>)}
        <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => downloadText(`transcript-${id}${showTranslation ? "-ru" : ""}.txt`, displayedTranscript)}>{t.exportTxt}</button>
        {hasTimes && <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => downloadText(`transcript-${id}${showTranslation ? "-ru" : ""}.srt`, toSrt(lines, (code) => `${t.speaker} ${speakerNumber(code)}`), "application/x-subrip")}>{t.exportSrt}</button>}
      </div>
      {showTranslation && <p className="text-xs text-muted" role="note">{t.translationNotice}</p>}
      {translationError && <p className="text-xs text-danger" role="alert">{translationError}</p>}
      {editing && (
        <div className="space-y-2">
          <textarea className="input min-h-44 w-full py-2.5 font-mono text-sm leading-6" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t.transcriptEditLabel} />
          <button type="button" className="btn btn-primary h-9" disabled={saving || !draft.trim()} onClick={() => void saveTranscript()}>{saving ? t.saving : t.saveTranscript}</button>
          {saveError && <p role="alert" className="text-xs text-danger">{saveError}</p>}
        </div>
      )}
      {audioUrl && showAudio && (
        <div className="rounded-xl border border-line p-3">
          <p className="mb-2 text-xs font-medium text-muted">{t.audioPlayback}</p>
          <audio ref={audio} controls preload="none" src={audioUrl} className="w-full" />
        </div>
      )}
      {hasTimes ? (
        <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
          {lines.map((line) => line.time === null ? (
            <p key={line.key} className="note px-2 py-1 text-muted">{line.text}</p>
          ) : (
            <button key={line.key} type="button" disabled={!audioUrl}
              onClick={() => { if (audio.current && line.time !== null) seekAndPlay(audio.current, line.time); }}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-fg/5 disabled:cursor-default disabled:hover:bg-transparent">
              <span className="shrink-0 pt-0.5 font-mono text-xs text-accent">{line.stamp}</span>
              <span className="note">{line.speaker && <span className="spk" data-n={Math.min(speakerNumber(line.speaker), 6)}>{t.speaker} {speakerNumber(line.speaker)}</span>}{line.text}</span>
            </button>
          ))}
        </div>
      ) : <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-muted">{displayedTranscript}</p>}
    </div>
  );
}
