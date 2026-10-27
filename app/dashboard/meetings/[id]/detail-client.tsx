"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { Chip } from "@/components/ui/primitives";
import { downloadText, seekAndPlay } from "@/lib/audio-client";
import { parseTranscript, toSrt, clock } from "@/lib/transcript";
import { speakerNumber } from "@/lib/speakers";
import { applySpeakerNames } from "@/lib/speaker-text";
import { formatDuration, offsetTranscript } from "@/lib/meeting-detail";
import { formatDate, formatDateTime, joinDateParts } from "@/lib/format-date";
import { TaskItem } from "@/app/dashboard/client";
import type { TaskLabels } from "@/lib/task-labels";
import type { TaskDto } from "@/lib/task-dto";

type DetailPart = {
  id: string; title: string; summary: string | null; decisions: string[]; openQuestions: string[]; transcript: string | null; transcriptRu: string | null;
  status: "PROCESSING" | "DONE" | "ERROR"; error: string | null; processingStage: string | null; recordedAt: string | null; durationSec: number | null;
  audioDeleted: boolean; speakerNames: Record<string, string> | null; tasks: TaskDto[];
};
type Props = {
  id: string; title: string; tags: string[]; favorite: boolean; status: DetailPart["status"]; error: string | null; processingStage: string | null;
  parts: DetailPart[]; tasks: TaskDto[]; labels: Record<string, string>; taskLabels: TaskLabels; locale: string; timeZone: string; uploaderName: string | null; canEdit: boolean; canDelete: boolean; canShare: boolean;
  speakerCodes: string[]; speakerSamples: Record<string, { text: string; time: number }>; speakerSuggestions: string[]; autoPromptNames: boolean;
  previousId: string | null; nextId: string | null; t: Record<string, string>;
};

function formatStamp(seconds: number) { return clock(seconds); }
const ERROR_KEYS: Record<string, string> = { INVALID_AUDIO: "errorInvalidAudio", NO_SPEECH: "errorNoSpeech", RATE_LIMIT: "errorRateLimit", STT_API_AUTH: "errorDeepgramAuth", LLM_API_AUTH: "errorGroqAuth", STT_API_KEY_MISSING: "errorDeepgramKey", LLM_API_KEY_MISSING: "errorGroqKey", NETWORK_ERROR: "errorNetwork" };

export function MeetingDetailClient(props: Props) {
  const { id, t } = props;
  const router = useRouter();
  const toast = useToast();
  const [activeId, setActiveId] = useState(id);
  const active = props.parts.find((part) => part.id === activeId) ?? props.parts[0]!;
  const offsets = useMemo(() => props.parts.map((_, index) => props.parts.slice(0, index).reduce((total, part) => total + (part.durationSec ?? 0), 0)), [props.parts]);
  const activeIndex = Math.max(0, props.parts.findIndex((part) => part.id === active.id));
  const offset = offsets[activeIndex] ?? 0;
  const [title, setTitle] = useState(props.title);
  const [titleDraft, setTitleDraft] = useState(props.title);
  const [titleEditing, setTitleEditing] = useState(false);
  const [favorite, setFavorite] = useState(props.favorite);
  const [tab, setTab] = useState<"overview" | "transcript" | "ask">("overview");
  const [audioUrl, setAudioUrl] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const [playTime, setPlayTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState(active.transcript ?? "");
  const [translated, setTranslated] = useState("");
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(active.speakerNames ?? {});
  const [speakerNameDraft, setSpeakerNameDraft] = useState<Record<string, string>>(active.speakerNames ?? {});
  const [nameSheetOpen, setNameSheetOpen] = useState(props.autoPromptNames);
  const [shareOpen, setShareOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askSources, setAskSources] = useState<{ start: number; end: number; quote: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setAudioUrl(""); setPlayTime(0); setTranslated(""); setEditingTranscript(false);
      setTranscriptDraft(active.transcript ?? ""); setSpeakerNames(active.speakerNames ?? {}); setSpeakerNameDraft(active.speakerNames ?? {});
    }, 0);
    if (active.audioDeleted) return () => window.clearTimeout(resetTimer);
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/meetings/${active.id}/audio-url`, { cache: "no-store" });
        const data = await response.json() as { url?: string };
        if (response.ok && data.url && !stopped) setAudioUrl(data.url);
      } catch { /* The signed URL can be requested again when the tab becomes visible. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 8 * 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; window.clearTimeout(resetTimer); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [active.id, active.audioDeleted, active.transcript, active.speakerNames]);

  useEffect(() => {
    if (active.status !== "PROCESSING") return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/meetings/status", { cache: "no-store" });
          if (response.ok) {
            const data = await response.json() as { meetings?: { id: string; status: string; processingStage: string | null }[] };
            const current = data.meetings?.find((meeting) => meeting.id === active.id);
            if (!current || current.status !== "PROCESSING") { router.refresh(); return; }
          }
        } catch { /* Keep polling while visible. */ }
      }
      if (!stop) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [active.id, active.status, router]);

  const lines = useMemo(() => parseTranscript(translated || active.transcript || ""), [active.transcript, translated]);
  const searchMatches = useMemo(() => query.trim() ? lines.filter((line) => line.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [], [lines, query]);
  const totalDuration = props.parts.reduce((sum, part) => sum + (part.durationSec ?? 0), 0);

  async function saveTitle(event: React.FormEvent) {
    event.preventDefault();
    const next = titleDraft.trim();
    if (!next) return;
    setTitle(next); setTitleEditing(false);
    const response = await fetch(`/api/meetings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: next }) });
    if (!response.ok) { setTitle(props.title); setTitleDraft(props.title); toast({ message: t.mdSaveFailed }); }
  }

  async function saveNames(names: Record<string, string>) {
    const clean = Object.fromEntries(Object.entries(names).map(([key, value]) => [key, value.trim().slice(0, 40)]).filter(([, value]) => value));
    const response = await fetch(`/api/meetings/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speakerNames: clean }) });
    if (!response.ok) { toast({ message: t.mdSaveFailed }); return false; }
    setSpeakerNames(clean); setSpeakerNameDraft(clean); setNameSheetOpen(false);
    toast({ message: t.mdNamesSaved, actionLabel: t.mdShare, action: () => setShareOpen(true) });
    router.refresh();
    return true;
  }

  async function toggleFavorite() {
    const next = !favorite; setFavorite(next);
    const response = await fetch(`/api/meetings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorite: next }) });
    if (!response.ok) setFavorite(!next);
  }

  async function translateTranscript() {
    const response = await fetch(`/api/meetings/${active.id}/translate`, { method: "POST" });
    const data = await response.json() as { transcript?: string };
    if (response.ok && data.transcript) setTranslated(data.transcript);
    else toast({ message: t.mdTranslateFailed });
  }

  async function saveTranscript() {
    const response = await fetch(`/api/meetings/${active.id}/transcript`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: transcriptDraft }) });
    if (!response.ok) { toast({ message: t.mdSaveFailed }); return; }
    setEditingTranscript(false); setTranslated(""); router.refresh();
  }

  function seek(seconds: number) {
    const player = audio.current;
    if (!player) return;
    seekAndPlay(player, Math.max(0, seconds)); setPlayTime(Math.max(0, seconds));
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const player = audio.current;
      if (!player) return;
      if (event.code === "Space") { event.preventDefault(); if (player.paused) void player.play(); else player.pause(); }
      else if (event.key === "j" || event.key === "ArrowLeft") { event.preventDefault(); seek(player.currentTime - 10); }
      else if (event.key === "l" || event.key === "ArrowRight") { event.preventDefault(); seek(player.currentTime + 10); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  function exportNotes(format: "md" | "txt") {
    const text = [
      `# ${title}`,
      active.recordedAt ? formatDateTime(new Date(active.recordedAt), props.locale, props.timeZone, true) : "",
      ...props.parts.map((part, index) => {
        const notes = [
          part.summary ? applySpeakerNames(part.summary, part.speakerNames, props.locale) : "",
          part.decisions.length ? `\n\n${t.mdDecisions}\n${part.decisions.map((item) => `- ${applySpeakerNames(item, part.speakerNames, props.locale)}`).join("\n")}` : "",
          part.openQuestions.length ? `\n\n${t.mdOpenQuestions}\n${part.openQuestions.map((item) => `- ${applySpeakerNames(item, part.speakerNames, props.locale)}`).join("\n")}` : "",
          part.tasks.length ? `\n\n${t.mdTasks}\n${part.tasks.map((task) => `- ${applySpeakerNames(task.title, part.speakerNames, props.locale)}${task.owner ? ` — ${applySpeakerNames(task.owner, part.speakerNames, props.locale)}` : ""}`).join("\n")}` : "",
        ].filter(Boolean).join("");
        return `${props.parts.length > 1 ? `## ${t.mdPart} ${index + 1}\n` : ""}${notes}`;
      }),
      `\n${t.mdTranscript}\n${props.parts.map((part) => parseTranscript(part.transcript ?? "").map((line) => `${line.speaker ? `${applySpeakerNames(line.speaker, part.speakerNames, props.locale)}: ` : ""}${applySpeakerNames(line.text, part.speakerNames, props.locale)}`).join("\n")).join("\n\n")}`,
    ].filter(Boolean).join("\n\n");
    downloadText(`${title}.${format}`, format === "md" ? text : text.replace(/^#+ /gm, ""), format === "md" ? "text/markdown" : "text/plain");
  }

  function exportSubtitles() {
    const combined = props.parts.flatMap((part, index) => offsetTranscript(part.transcript ?? "", offsets[index] ?? 0).map((line) => { const name = part.speakerNames?.[line.speaker ?? ""]; return { ...line, speaker: null, text: `${name ? `${name}: ` : line.speaker ? `${t.speaker} ${speakerNumber(line.speaker)}: ` : ""}${applySpeakerNames(line.text, part.speakerNames, props.locale)}` }; }));
    downloadText(`${title}.srt`, toSrt(combined), "application/x-subrip");
  }

  async function ask(question = askText) {
    const clean = question.trim(); if (!clean || asking) return;
    setAsking(true); setAskText(""); setAskAnswer(""); setAskSources([]);
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: clean, meetingId: active.id }) });
      const data = await response.json() as { result?: { answer?: string; sources?: { start: number; end: number; quote: string }[] } };
      if (!response.ok || !data.result) throw new Error("ask_failed");
      setAskAnswer(data.result.answer ?? t.mdAskNoAnswer); setAskSources(data.result.sources ?? []);
    } catch { setAskAnswer(t.mdAskError); }
    finally { setAsking(false); }
  }

  function scheduleDelete() {
    if (!props.canDelete || deleting) return;
    setDeleting(true);
    let undone = false;
    const timer = window.setTimeout(async () => {
      if (undone) return;
      await fetch(`/api/meetings/${id}`, { method: "DELETE", keepalive: true });
      router.push("/dashboard"); router.refresh();
    }, 8000);
    const undo = () => { undone = true; clearTimeout(timer); setDeleting(false); };
    window.addEventListener("pagehide", () => { if (!undone) void fetch(`/api/meetings/${id}`, { method: "DELETE", keepalive: true }); }, { once: true });
    toast({ message: `${title} · ${t.mdDeletedToast}`, actionLabel: t.mdUndo, action: undo });
  }

  async function retry() {
    const response = await fetch(`/api/meetings/${active.id}/retry`, { method: "POST" });
    if (response.ok) router.refresh();
  }

  const statusLabel = active.status === "DONE" ? t.mdStatusDone : active.status === "ERROR" ? t.mdStatusError : t.mdStatusProcessing;
  const stage = active.processingStage ?? "uploaded";
  const stageIndex = stage === "uploaded" ? 0 : stage === "transcribing" ? 1 : stage === "analyzing" ? 2 : 0;

  return <div className="mt-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><form className="min-w-0 flex-1" onSubmit={(event) => void saveTitle(event)}>{titleEditing ? <div className="flex gap-2"><input autoFocus className="input min-w-0 flex-1 text-2xl font-semibold" value={titleDraft} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setTitleDraft(title); setTitleEditing(false); } }} /><button className="btn btn-primary min-h-11">{t.mdSave}</button><button type="button" className="btn btn-ghost min-h-11" onClick={() => { setTitleDraft(title); setTitleEditing(false); }}>{t.mdCancel}</button></div> : <button type="button" className="text-left font-serif text-2xl font-semibold hover:text-accent" onClick={() => setTitleEditing(true)}>{title || t.mdTitlePlaceholder}</button>}</form>{props.canEdit && <div className="flex gap-2"><button className="btn btn-ghost min-h-11" onClick={() => setTitleEditing(true)}>{t.mdEdit}</button><button className="btn btn-ghost min-h-11" onClick={() => void toggleFavorite()} aria-pressed={favorite}>★</button></div>}</div>
    <div className="flex flex-wrap items-center gap-2"><Chip>{statusLabel}</Chip>{props.uploaderName && <Chip>{t.wsUploadedBy.replace("{who}", props.uploaderName)}</Chip>}{props.parts.length > 1 && <Chip>{props.parts.length} {t.recPartsLabel} · {formatDuration(totalDuration)}</Chip>}{active.durationSec != null && props.parts.length === 1 && <Chip>{formatDuration(active.durationSec)}</Chip>}{props.speakerCodes.length > 0 && <Chip>{props.speakerCodes.length} {t.mdSpeakers}</Chip>}{active.transcript && <Chip>{active.transcript.trim().split(/\s+/).length} {t.mdWords}</Chip>}{props.tags.map((tag) => <Chip key={tag}>{tag}</Chip>)}<button type="button" aria-pressed={favorite} aria-label={favorite ? "★" : "☆"} className="min-h-11 rounded-full border border-line px-3 text-lg" onClick={() => void toggleFavorite()}>{favorite ? "★" : "☆"}</button></div>
    {props.parts.length > 1 && <section className="mt-6"><h2 className="text-sm font-semibold text-muted">{t.mdChapter}</h2><div className="mt-2 flex flex-wrap gap-2">{props.parts.map((part, index) => <button key={part.id} type="button" aria-current={part.id === active.id ? "page" : undefined} className={`btn min-h-11 ${part.id === active.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveId(part.id)}>{t.mdPart} {index + 1} · {formatDuration(part.durationSec) ?? "—"}</button>)}</div></section>}
    <section className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      {active.audioDeleted ? <p role="status" className="text-sm text-muted">{t.mdNoAudio}</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button type="button" className="btn btn-ghost min-h-11" onClick={() => seek((audio.current?.currentTime ?? 0) - 15)}>−15</button><button type="button" className="btn btn-ghost min-h-11" onClick={() => seek((audio.current?.currentTime ?? 0) + 15)}>+15</button><label className="text-xs text-muted">× <select className="input ml-1 h-9 w-20" value={speed} onChange={(event) => { const value = Number(event.target.value); setSpeed(value); if (audio.current) audio.current.playbackRate = value; }} aria-label="Playback speed">{[.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></div><label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />{t.mdFollow}</label></div>
        <div className="mt-4"><div className="mb-1 flex justify-between font-mono text-xs tabular-nums text-muted"><span>{formatStamp(playTime + offset)}</span><span>{formatDuration(active.durationSec)}</span></div><input type="range" min={0} max={active.durationSec ?? 0} step={.1} value={Math.min(playTime, active.durationSec ?? 0)} onChange={(event) => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setPlayTime(value); }} className="w-full accent-(--accent)" aria-label={t.audioPlayback} /></div>
        <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full" aria-hidden>{(active.transcript ? parseTranscript(active.transcript).filter((line) => line.time !== null) : []).map((line) => <span key={line.key} className="h-full flex-1 border-r border-bg" style={{ background: `var(--speaker-${Math.min(speakerNumber(line.speaker ?? "s1"), 6)})` }} />)}</div>
        {audioUrl ? <audio ref={audio} controls preload="none" src={audioUrl} className="mt-3 w-full" onTimeUpdate={(event) => setPlayTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { event.currentTarget.playbackRate = speed; }} /> : <p role="status" className="mt-3 text-sm text-muted">{t.audioPlayback}</p>}
      </>}</section>

    {active.status === "PROCESSING" && <section className="mt-6 rounded-2xl border border-line bg-surface p-5" aria-busy="true"><ol className="grid grid-cols-4 gap-2 text-center text-xs sm:text-sm">{[t.mdStageUploaded, t.mdStageTranscribing, t.mdStageAnalyzing, t.mdStageDone].map((label, index) => <li key={label} className={`rounded-lg px-2 py-3 ${index <= stageIndex ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>{label}</li>)}</ol><div className="mt-5 space-y-3"><span className="block h-4 w-2/3 animate-pulse rounded bg-fg/10"/><span className="block h-4 w-full animate-pulse rounded bg-fg/10"/><span className="block h-4 w-4/5 animate-pulse rounded bg-fg/10"/></div></section>}
    {active.status === "ERROR" && <section className="mt-6 rounded-xl border border-danger/25 bg-danger/[.04] p-4"><p role="alert" className="text-sm text-danger">{t[ERROR_KEYS[props.error ?? ""] ?? "errorProcessing"]}</p>{props.canEdit && <button className="btn btn-primary mt-3 min-h-11" onClick={() => void retry()}>{t.mdRetry}</button>}</section>}

    <nav className="mt-7 flex flex-wrap gap-2 border-b border-line" aria-label={t.mdOverview}>{(["overview", "transcript", "ask"] as const).map((key) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-medium ${tab === key ? "border-accent text-accent" : "border-transparent text-muted"}`} onClick={() => setTab(key)}>{key === "overview" ? t.mdOverview : key === "transcript" ? t.mdTranscript : t.mdAsk}</button>)}</nav>

    {tab === "overview" && <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-8">
        <section><h2 className="text-sm font-semibold text-muted">{t.mdSummary}</h2><p className="mt-2 whitespace-pre-wrap font-serif text-xl leading-9">{active.summary ? applySpeakerNames(active.summary, speakerNames, props.locale) : t.mdNoSummary}</p></section>
        {active.decisions.length > 0 && <section><h2 className="text-lg font-semibold">{t.mdDecisions}</h2><ul className="mt-3 space-y-2">{active.decisions.map((item, index) => <li key={index} className="rounded-xl border-b-2 border-(--hl) bg-surface p-4">✓ {applySpeakerNames(item, speakerNames, props.locale)}</li>)}</ul></section>}
        {active.openQuestions.length > 0 && <section><h2 className="text-lg font-semibold">{t.mdOpenQuestions}</h2><ul className="mt-2 list-disc space-y-2 pl-5 text-muted">{active.openQuestions.map((item, index) => <li key={index}>{applySpeakerNames(item, speakerNames, props.locale)}</li>)}</ul></section>}
        {active.tasks.length > 0 && <section><h2 className="text-lg font-semibold">{t.mdTasks}</h2><ul className="mt-2 divide-y divide-line">{active.tasks.map((task) => <TaskItem key={task.id} id={`task-${task.id}`} task={task} locale={props.locale} labels={props.taskLabels} displayTitle={applySpeakerNames(task.title, speakerNames, props.locale)} displayOwner={task.owner ? applySpeakerNames(task.owner, speakerNames, props.locale) : null} readOnly={!props.canEdit} />)}</ul></section>}
      </div>
      <aside className="h-fit rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-6"><h2 className="text-sm font-semibold">{t.mdChapter} · {t.mdTasks}</h2><ul className="mt-3 space-y-2 text-sm">{active.tasks.map((task) => <li key={task.id}><a href={`#task-${task.id}`} className="text-accent hover:underline">{applySpeakerNames(task.title, speakerNames, props.locale)}</a></li>)}</ul></aside>
    </div>}

    {tab === "transcript" && <section className="mt-6">
      <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="transcript-search">{t.mdSearch}</label><input id="transcript-search" className="input min-w-48 flex-1" value={query} onChange={(event) => { setQuery(event.target.value); setMatchIndex(0); }} placeholder={t.mdSearch} /><span className="text-xs tabular-nums text-muted">{query ? searchMatches.length ? t.mdSearchCount.replace("{current}", String(Math.min(matchIndex + 1, searchMatches.length))).replace("{total}", String(searchMatches.length)) : t.mdSearchNone : ""}</span><button className="btn btn-ghost min-h-11" onClick={() => setTranslated("")}>{t.showOriginal}</button><button className="btn btn-ghost min-h-11" onClick={() => void translateTranscript()}>{t.mdTranslate}</button>
        {props.canEdit && <button className="btn btn-ghost min-h-11" onClick={() => { setTranscriptDraft(active.transcript ?? ""); setEditingTranscript((value) => !value); }}>{editingTranscript ? t.mdCancel : t.mdEdit}</button>}
        {!editingTranscript && <><button className="btn btn-ghost min-h-11" onClick={() => exportNotes("txt")}>{t.mdExportTxt}</button><button className="btn btn-ghost min-h-11" onClick={exportSubtitles}>{t.mdExportSrt}</button></>}
      </div>
      {editingTranscript ? <div className="mt-4"><textarea className="input min-h-80 w-full font-mono text-sm leading-6" value={transcriptDraft} onChange={(event) => setTranscriptDraft(event.target.value)} /><button className="btn btn-primary mt-3 min-h-11" onClick={() => void saveTranscript()}>{t.mdSave}</button></div> : <>
        {props.canEdit && props.speakerCodes.length > 0 && <div className="my-4 flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">{props.speakerCodes.map((code) => <label key={code} className="text-xs text-muted">{speakerNames[code] || `${t.speaker} ${speakerNumber(code)}`}<input className="input mt-1 h-10 w-36" value={speakerNameDraft[code] ?? speakerNames[code] ?? ""} list="speaker-name-suggestions" maxLength={40} onChange={(event) => setSpeakerNameDraft({ ...speakerNameDraft, [code]: event.target.value })} /></label>)}<datalist id="speaker-name-suggestions">{props.speakerSuggestions.map((name) => <option key={name} value={name} />)}</datalist><button className="btn btn-ghost min-h-11" onClick={() => void saveNames(speakerNameDraft)}>{t.mdSaveNames}</button></div>}
        <div className="mt-4 space-y-1">{lines.map((line) => {
          const activeLine = line.time !== null && playTime >= line.time && playTime < line.time + 15;
          const matched = query && line.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
          return <button key={line.key} type="button" data-transcript-line={line.key} disabled={line.time === null || !audioUrl} onClick={() => { if (line.time !== null) seek(line.time); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${activeLine ? "bg-hl/50" : "hover:bg-surface-2"}`}>
            <span className="shrink-0 font-mono text-xs text-accent">{line.time === null ? "" : formatStamp(line.time + offset)}</span><span className="leading-7">{line.speaker && <strong className="mr-2 text-accent">{speakerNames[line.speaker] ?? `${t.speaker} ${speakerNumber(line.speaker)}`}</strong>}{matched ? line.text.split(new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig")).map((piece, index) => piece.toLocaleLowerCase() === query.trim().toLocaleLowerCase() ? <mark key={index} className="rounded bg-hl px-0.5">{piece}</mark> : piece) : applySpeakerNames(line.text, speakerNames, props.locale)}</span>
          </button>;
        })}</div>
      </>}
    </section>}

    {tab === "ask" && <section className="mt-6"><div className="flex flex-wrap gap-2">{[t.mdHintDecision, t.mdHintOwner, t.mdHintRisk].map((hint) => <button key={hint} className="btn btn-ghost min-h-11" onClick={() => void ask(hint)}>{hint}</button>)}</div><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void ask(); }}><input className="input min-w-0 flex-1" value={askText} onChange={(event) => setAskText(event.target.value)} placeholder={t.mdAskPlaceholder} maxLength={500} /><button className="btn btn-primary min-h-11" disabled={asking || !askText.trim()}>{asking ? t.mdAskSearching : t.mdAskButton}</button></form>{askAnswer && <article className="mt-5 rounded-xl border border-line p-4"><p className="whitespace-pre-wrap leading-7">{askAnswer}</p>{askSources.map((source, index) => <button key={`${source.start}-${index}`} className="mt-3 block w-full rounded-lg border border-line p-3 text-left hover:bg-surface-2" onClick={() => seek(source.start)}><span className="font-mono text-xs text-accent">{clock(source.start + offset)}–{clock(source.end + offset)}</span><span className="mt-1 block">“{source.quote}”</span><span className="mt-1 block text-xs text-accent">{t.mdAskSources}</span></button>)}</article>}</section>}

    <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
      <button className="btn btn-ghost min-h-11" onClick={() => void navigator.clipboard.writeText([title, active.recordedAt ? formatDateTime(new Date(active.recordedAt), props.locale, props.timeZone, true) : "", active.summary ? applySpeakerNames(active.summary, speakerNames, props.locale) : "", ...active.decisions.map((item) => applySpeakerNames(item, speakerNames, props.locale))].join("\n\n")).then(() => toast({ message: t.mdCopied }))}>{t.mdCopyNotes}</button><button className="btn btn-ghost min-h-11" onClick={() => exportNotes("md")}>{t.mdExportMd}</button><button className="btn btn-ghost min-h-11" onClick={() => exportNotes("txt")}>{t.mdExportTxt}</button><button className="btn btn-ghost min-h-11" onClick={exportSubtitles}>{t.mdExportSrt}</button>{props.canShare && <button className="btn btn-ghost min-h-11" onClick={() => setShareOpen(true)}>{t.mdShare}</button>}{props.canDelete && <button className="btn btn-ghost min-h-11 text-danger" onClick={scheduleDelete}>{t.mdDelete}</button>}
    </div>
    <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} meetingId={id} title={title} t={t} locale={props.locale} timeZone={props.timeZone} />
    {props.canEdit && <SpeakerNamesSheet open={nameSheetOpen && props.speakerCodes.length >= 2 && props.speakerCodes.length <= 3} onClose={() => setNameSheetOpen(false)} codes={props.speakerCodes} samples={props.speakerSamples} names={speakerNameDraft} setNames={setSpeakerNameDraft} suggestions={[...props.speakerSuggestions, ...(activeIndex > 0 ? Object.values(props.parts[0]?.speakerNames ?? {}) : [])]} onSave={saveNames} onPlay={seek} t={t} />}
    {deleting && <p className="sr-only" role="status">{t.mdDeletedToast}</p>}
  </div>;
}

function SpeakerNamesSheet({ open, onClose, codes, samples, names, setNames, suggestions, onSave, onPlay, t }: { open: boolean; onClose: () => void; codes: string[]; samples: Record<string, { text: string; time: number }>; names: Record<string, string>; setNames: (value: Record<string, string>) => void; suggestions: string[]; onSave: (value: Record<string, string>) => Promise<boolean>; onPlay: (time: number) => void; t: Record<string, string> }) {
  return <Sheet open={open} onClose={onClose} closeLabel={t.mdCancel} title={t.mdWhoIsWho}><p className="mb-4 text-sm text-muted">{t.mdNameSuggestions}</p><datalist id="speaker-sheet-suggestions">{suggestions.map((name) => <option key={name} value={name} />)}</datalist><div className="space-y-3">{codes.map((code) => <label key={code} className="block text-sm">{t.speaker} {speakerNumber(code)}<span className="mt-1 flex items-center gap-2"><input className="input min-w-0 flex-1" list="speaker-sheet-suggestions" value={names[code] ?? ""} maxLength={40} onChange={(event) => setNames({ ...names, [code]: event.target.value })} placeholder={t.mdSpeakerNameInput} /><button type="button" className="btn btn-ghost min-h-11" aria-label={t.mdSpeakerExample} onClick={() => onPlay(samples[code]?.time ?? 0)}>▶</button></span><span className="mt-1 block text-xs text-muted">{samples[code]?.text}</span></label>)}</div><div className="mt-5 flex justify-end gap-2"><button className="btn btn-ghost min-h-11" onClick={() => void onSave({})}>{t.mdSkipNames}</button><button className="btn btn-primary min-h-11" onClick={() => void onSave(names)}>{t.mdSaveNames}</button></div></Sheet>;
}

type ShareRow = { id: string; expiresAt: string; showTranscript: boolean; showAudio: boolean };
function ShareSheet({ open, onClose, meetingId, title, t, locale, timeZone }: { open: boolean; onClose: () => void; meetingId: string; title: string; t: Record<string, string>; locale: string; timeZone: string }) {
  const [days, setDays] = useState(7);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showAudio, setShowAudio] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void fetch(`/api/meetings/${meetingId}/shares`, { cache: "no-store" }).then((response) => response.json()).then((data: { shares?: ShareRow[] }) => { if (current) setShares(data.shares ?? []); }).catch(() => {});
    return () => { current = false; };
  }, [open, meetingId]);
  async function create() {
    setBusy(true); setError(""); setUrl("");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresInDays: days, showTranscript, showAudio }) });
      const data = await response.json() as { url?: string; share?: ShareRow };
      if (!response.ok || !data.url) throw new Error("share_failed");
      setUrl(data.url); setShares((current) => [data.share!, ...current]);
    } catch { setError(t.shareError); }
    finally { setBusy(false); }
  }
  async function revoke(shareId: string) {
    const response = await fetch(`/api/meetings/${meetingId}/shares/${shareId}`, { method: "DELETE" });
    if (response.ok) setShares((current) => current.filter((share) => share.id !== shareId));
  }
  return <Sheet open={open} onClose={onClose} closeLabel={t.mdCancel} title={t.shareTitle.replace("{title}", title)}><label className="block text-sm text-muted">{t.shareExpires}<select className="input mt-1" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>{t.share24h}</option><option value={7}>{t.share7d}</option><option value={30}>{t.share30d}</option></select></label><label className="mt-4 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showTranscript} onChange={(event) => setShowTranscript(event.target.checked)} />{t.shareTranscript}</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showAudio} onChange={(event) => setShowAudio(event.target.checked)} />{t.shareAudio}</label><button className="btn btn-primary mt-3 min-h-11" disabled={busy} onClick={() => void create()}>{t.shareCreate}</button>{error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}{url && <div className="mt-4 rounded-xl border border-line p-3"><p className="text-xs text-muted">{t.shareCreated}</p><div className="mt-2 flex gap-2"><input className="input min-w-0 flex-1" readOnly value={url} /><button className="btn btn-ghost min-h-11" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? t.shareCopied : t.shareCopy}</button></div></div>}<h3 className="mt-6 text-sm font-semibold">{t.shareActive}</h3><ul className="mt-2 space-y-2">{shares.map((share) => <li key={share.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-xs"><span>{joinDateParts([formatDate(new Date(share.expiresAt), locale, timeZone, { day: "numeric", month: "short", year: "numeric" }), share.showTranscript ? t.shareTranscript : null, share.showAudio ? t.shareAudio : null])}</span><button className="btn btn-ghost min-h-11" onClick={() => void revoke(share.id)}>{t.shareRevoke}</button></li>)}</ul></Sheet>;
}
