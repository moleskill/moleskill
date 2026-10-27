"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmSheet } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format-date";
import { displayTitle } from "@/lib/display-title";
import type { TaskDto } from "@/lib/task-dto";
import type { TaskLabels } from "@/lib/task-labels";
import { CopyButton, ExportMinutes, RetryButton, TaskItem, TranscriptPlayer, TranslateMinutes } from "./client";

type MeetingCardData = {
  id: string; seriesId: string | null; title: string; createdAt: string; recordedAt: string | null; updatedAt: string;
  status: "DONE" | "PROCESSING" | "ERROR"; errorCode: string | null; errorMessage: string;
  summary: string | null; decisions: string[]; openQuestions: string[]; tasks: TaskDto[];
  tags: string[]; favorite: boolean; transcript: string | null; transcriptRu: string | null;
  audioUrl: string | null; audioDeleted: boolean; durationSec: number | null;
  canEdit: boolean; canDelete: boolean; uploader: string | null;
};

type Texts = Record<string, string>;

function MeetingActions({ meeting, t, onPatch, onDeleted }: {
  meeting: MeetingCardData; t: Texts; onPatch: (patch: Partial<MeetingCardData>) => void; onDeleted: () => void;
}) {
  const router = useRouter();
  const menu = useRef<HTMLDetailsElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meeting.title);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(patch: { title?: string; favorite?: boolean; tags?: string[] }) {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/meetings/${meeting.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("save_failed");
      onPatch(patch);
      router.refresh();
      return true;
    } catch {
      setError(t.saveFailed);
      return false;
    } finally { setPending(false); }
  }

  async function remove() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      setConfirmOpen(false);
      onDeleted();
      router.refresh();
    } catch {
      setError(t.deleteFailed);
    } finally { setPending(false); }
  }

  async function addTag() {
    const tag = tagDraft.replace(/[\n,]/g, " ").trim().replace(/\s+/g, " ").slice(0, 32);
    if (!tag || meeting.tags.includes(tag)) { setTagDraft(""); return; }
    if (await save({ tags: [...meeting.tags, tag].slice(0, 12) })) setTagDraft("");
  }

  return <>
    <details ref={menu} className="meeting-actions">
      <summary aria-label={t.meetingActions} title={t.meetingActions} className="meeting-actions-trigger">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </summary>
      <div className="meeting-actions-menu">
        {meeting.canEdit && <>
          <button type="button" className="meeting-action-item" disabled={pending} onClick={() => void save({ favorite: !meeting.favorite })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={meeting.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
            {meeting.favorite ? t.removeFavorite : t.addFavorite}
          </button>
          <button type="button" className="meeting-action-item" onClick={() => { setRenameOpen((value) => !value); setTitleDraft(meeting.title); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/></svg>
            {t.renameMeeting}
          </button>
          {renameOpen && <form className="meeting-action-form" onSubmit={(event) => { event.preventDefault(); void save({ title: titleDraft.trim() }).then((ok) => { if (ok) setRenameOpen(false); }); }}>
            <input className="input h-9 w-full text-sm" value={titleDraft} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} aria-label={t.title} />
            <button className="btn btn-primary h-9 w-full text-sm" disabled={pending || !titleDraft.trim()}>{pending ? t.saving : t.mdSave}</button>
          </form>}
          <button type="button" className="meeting-action-item" onClick={() => setTagOpen((value) => !value)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8" cy="8" r="1"/></svg>
            {t.tagAdd}
          </button>
          {tagOpen && meeting.tags.length < 12 && <form className="meeting-action-form" onSubmit={(event) => { event.preventDefault(); void addTag(); }}>
            <input className="input h-9 w-full text-sm" value={tagDraft} maxLength={32} onChange={(event) => setTagDraft(event.target.value)} aria-label={t.tagAdd} placeholder={t.tagAdd} />
            <button className="btn btn-primary h-9 w-full text-sm" disabled={pending || !tagDraft.trim()}>{pending ? t.saving : t.mdSave}</button>
          </form>}
          {meeting.tags.length > 0 && <div className="meeting-action-tags">{meeting.tags.map((tag) => <button key={tag} type="button" className="meeting-action-tag" title={`${t.tagRemove}: ${tag}`} onClick={() => void save({ tags: meeting.tags.filter((value) => value !== tag) })}>{tag}<span aria-hidden> ×</span></button>)}</div>}
        </>}
        {meeting.canDelete && <>
          {(meeting.canEdit) && <div className="meeting-action-divider" />}
          <button type="button" className="meeting-action-item meeting-action-danger" onClick={() => { if (menu.current) menu.current.open = false; setConfirmOpen(true); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>
            {t.deleteRecord}
          </button>
        </>}
        {error && <p className="meeting-action-error" role="alert">{error}</p>}
      </div>
    </details>
    <ConfirmSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t.deleteRecord} closeLabel={t.mdCancel} cancelLabel={t.mdCancel} confirmLabel={pending ? t.deleting : t.deleteRecord} onConfirm={() => void remove()}>
      {meeting.seriesId ? t.deleteSeriesConfirm : t.deleteConfirm}
    </ConfirmSheet>
  </>;
}

export function MeetingList({ initialMeetings, t, locale, timeZone, taskLabels, canEditTasks, hasFilters = false }: {
  initialMeetings: MeetingCardData[]; t: Texts; locale: string; timeZone: string; taskLabels: TaskLabels; canEditTasks: boolean; hasFilters?: boolean;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const patchMeeting = (id: string, patch: Partial<MeetingCardData>) => setMeetings((current) => current.map((meeting) => meeting.id === id ? { ...meeting, ...patch } : meeting));
  const removeMeeting = (id: string) => setMeetings((current) => {
    const target = current.find((meeting) => meeting.id === id);
    return current.filter((meeting) => meeting.id !== id && (!target?.seriesId || meeting.seriesId !== target.seriesId));
  });
  if (!meetings.length) return <div className="recordings-empty"><p className="font-medium">{hasFilters ? t.dashListNoMatches : t.dashListEmpty}</p><p className="mt-1 text-sm text-muted">{hasFilters ? t.dashListNoMatchesHint : t.dashListEmptyHint}</p></div>;

  return <div className="recordings-list">
    {meetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} t={t} locale={locale} timeZone={timeZone} taskLabels={taskLabels} canEditTasks={canEditTasks} onPatch={(patch) => patchMeeting(meeting.id, patch)} onDeleted={() => removeMeeting(meeting.id)}/>)
    }
  </div>;
}

function MeetingCard({ meeting, t, locale, timeZone, taskLabels, canEditTasks, onPatch, onDeleted }: {
  meeting: MeetingCardData; t: Texts; locale: string; timeZone: string; taskLabels: TaskLabels; canEditTasks: boolean;
  onPatch: (patch: Partial<MeetingCardData>) => void; onDeleted: () => void;
}) {
      const display = displayTitle(meeting.title, new Date(meeting.recordedAt ?? meeting.createdAt), locale.toLowerCase().startsWith("ru") ? "ru" : "en", timeZone);
      const noteText = [meeting.summary ?? "", ...meeting.decisions, ...meeting.openQuestions].filter(Boolean).join("\n\n");
      const markdown = [`# ${display}`, noteText, meeting.tasks.length ? `## ${t.tasks}\n${meeting.tasks.map((task) => {
        const due = task.dueDate ? formatDate(new Date(task.dueDate), locale, "UTC", { day: "numeric", month: "long" }) : task.dueText ?? t.noDue;
        return `- [${task.done ? "x" : " "}] ${task.title} — ${task.owner ?? t.noOwner}, ${due}`;
      }).join("\n")}` : ""].filter(Boolean).join("\n\n");
      const createdLabel = formatDate(new Date(meeting.createdAt), locale, timeZone, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
      const statusLabel = meeting.status === "DONE" ? t.statusDone : meeting.status === "PROCESSING" ? t.statusProcessing : meeting.errorCode === "NO_SPEECH" ? t.statusNoSpeech : t.statusError;
      const audioRef = useRef<HTMLAudioElement | null>(null);
      return <article className="meeting-card dashboard-meeting-card card">
        <header className="meeting-card-header">
          <div className="min-w-0">
            <Link href={`/dashboard/meetings/${meeting.id}`} className="meeting-card-title">{display}</Link>
            <p className="meeting-card-date">{t.meetingCreatedAt} {createdLabel}{meeting.uploader ? ` · ${t.wsUploadedBy.replace("{who}", meeting.uploader)}` : ""}</p>
            {meeting.favorite && <span className="meeting-favorite-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>{t.dashListFavorite}</span>}
          </div>
          <div className="meeting-card-tools">
            <span className={`meeting-status ${meeting.status === "DONE" ? "is-done" : meeting.status === "ERROR" ? "is-error" : "is-processing"}`}>
              {meeting.status === "PROCESSING" && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden/>}{statusLabel}
            </span>
            {(meeting.canEdit || meeting.canDelete) && <MeetingActions meeting={meeting} t={t} onPatch={onPatch} onDeleted={onDeleted} />}
          </div>
        </header>

        {meeting.status === "PROCESSING" && <div className="meeting-processing" role="status" aria-busy="true"><span className="meeting-spinner" aria-hidden/><span>{t.analyzing}</span></div>}
        {meeting.status === "ERROR" && <div className="meeting-error" role="alert"><span>{meeting.errorMessage}</span><RetryButton id={meeting.id} label={t.mdRetry}/></div>}

        {meeting.tags.length > 0 && <div className="meeting-card-tags">{meeting.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        {(meeting.summary || meeting.decisions.length > 0 || meeting.openQuestions.length > 0) && <div className="meeting-notes">
          {meeting.summary && <section><h4>{t.summary}</h4><p>{meeting.summary}</p></section>}
          {meeting.decisions.length > 0 && <section><h4>{t.decisions}</h4><ul>{meeting.decisions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
          {meeting.openQuestions.length > 0 && <section><h4>{t.mdOpenQuestions}</h4><ul>{meeting.openQuestions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
        </div>}
        {meeting.status === "DONE" && !meeting.summary && !meeting.transcript && <p className="meeting-no-notes">{meeting.errorCode === "NO_SPEECH" ? t.errorNoSpeech : t.mdNoSummary}</p>}

        {meeting.audioUrl ? <div className="meeting-audio"><span>{t.audioPlayback}</span><audio ref={audioRef} controls preload="none" src={meeting.audioUrl}/></div> : <p className="meeting-audio-missing">{meeting.audioDeleted ? t.audioRemoved : t.audioUnavailable}</p>}

        {meeting.tasks.length > 0 && <section className="meeting-card-tasks"><h4>{t.tasks}</h4><ul>{meeting.tasks.map((task) => <TaskItem key={task.id} task={task} locale={locale} labels={taskLabels} readOnly={!canEditTasks}/>)}</ul></section>}

        {meeting.transcript ? <details className="meeting-transcript">
          <summary>{t.mdTranscript}<span>{meeting.transcript.trim().split(/\s+/).length} {t.mdWords}</span></summary>
          <TranscriptPlayer id={meeting.id} transcript={meeting.transcript} translatedTranscript={meeting.transcriptRu} audioUrl={meeting.audioUrl} audioRef={audioRef} showAudio={false} t={t}/>
        </details> : meeting.status === "DONE" && meeting.errorCode !== "NO_SPEECH" && <p className="meeting-transcript-missing">{t.transcriptUnavailable}</p>}

        {meeting.status === "DONE" && <footer className="meeting-card-footer"><CopyButton text={markdown} label={t.copy} done={t.mdCopied}/><ExportMinutes id={meeting.id} content={markdown} label={t.mdExportMd}/>{noteText.trim() && <TranslateMinutes content={noteText} t={t}/>}</footer>}
      </article>;
}
