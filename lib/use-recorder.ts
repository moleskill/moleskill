"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { addDraftPart, clearDraft, finalizeDraft, readDraft, saveChunk, startDraft } from "@/lib/recorder-draft";
import { useToast } from "@/components/ui/toast";
import { MAX_RECORDING_SECONDS, shouldRotatePart } from "@/lib/recorder-parts";

export type RecorderPhase = "idle" | "requesting" | "recording" | "paused" | "review" | "uploading" | "processing" | "error" | "permission_denied";
export type RecorderState = { phase: RecorderPhase; seconds: number; bytes: number; parts: number; error: string };
export type RecorderAction =
  | { type: "REQUEST" } | { type: "START" } | { type: "PAUSE" } | { type: "RESUME" }
  | { type: "TICK"; seconds: number } | { type: "BYTES"; bytes: number } | { type: "PARTS"; parts: number }
  | { type: "REVIEW" } | { type: "RESTORE" } | { type: "UPLOAD" } | { type: "PROCESSING" } | { type: "DONE" }
  | { type: "FAIL"; message: string } | { type: "DENIED"; message: string } | { type: "CANCEL" };

export const initialRecorderState: RecorderState = { phase: "idle", seconds: 0, bytes: 0, parts: 1, error: "" };

export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case "REQUEST": return state.phase === "idle" || state.phase === "error" || state.phase === "permission_denied" ? { ...initialRecorderState, phase: "requesting" } : state;
    case "START": return state.phase === "requesting" ? { ...state, phase: "recording", error: "" } : state;
    case "PAUSE": return state.phase === "recording" ? { ...state, phase: "paused" } : state;
    case "RESUME": return state.phase === "paused" ? { ...state, phase: "recording" } : state;
    case "TICK": return state.phase === "recording" || state.phase === "paused" ? { ...state, seconds: action.seconds } : state;
    case "BYTES": return state.phase === "recording" || state.phase === "paused" ? { ...state, bytes: action.bytes } : state;
    case "PARTS": return state.phase === "recording" || state.phase === "paused" ? { ...state, parts: action.parts, bytes: 0 } : state;
    case "REVIEW": return state.phase === "recording" || state.phase === "paused" || state.phase === "requesting" ? { ...state, phase: "review" } : state;
    case "RESTORE": return { ...initialRecorderState, phase: "review" };
    case "UPLOAD": return state.phase === "review" || state.phase === "error" ? { ...state, phase: "uploading", error: "" } : state;
    case "PROCESSING": return state.phase === "uploading" ? { ...state, phase: "processing" } : state;
    case "DONE": return { ...initialRecorderState };
    case "FAIL": return { ...state, phase: "error", error: action.message };
    case "DENIED": return { ...state, phase: "permission_denied", error: action.message };
    case "CANCEL": return { ...initialRecorderState };
  }
}

function recordingFile(chunks: Blob[], mime: string, part = 1) {
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
  return new File([new Blob(chunks, { type: mime })], `recording-part-${part}-${Date.now()}.${ext}`, { type: mime });
}

export function useRecorder(t: Record<string, string>) {
  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState);
  const [files, setFiles] = useState<File[]>([]);
  const [recordedAt, setRecordedAt] = useState<Date | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const toast = useToast();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const completedFiles = useRef<File[]>([]);
  const partNo = useRef(1);
  const rotationInProgress = useRef(false);
  const session = useRef("");
  const chunkIndex = useRef(0);
  const bytes = useRef(0);
  const seconds = useRef(0);
  const discardMode = useRef<"undo" | "delete" | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setAnalyser(null);
    if (audioContext.current && audioContext.current.state !== "closed") void audioContext.current.close().catch(() => {});
    audioContext.current = null;
  }, []);

  const stop = useCallback(() => {
    const current = recorder.current;
    if (current && current.state !== "inactive") current.stop();
  }, []);

  const start = useCallback(async () => {
    dispatch({ type: "REQUEST" });
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      dispatch({ type: "FAIL", message: t.errRecorderUnsupported }); return;
    }
    let activeStream: MediaStream | null = null;
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = activeStream;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((item) => MediaRecorder.isTypeSupported(item));
      chunks.current = []; completedFiles.current = []; partNo.current = 1; rotationInProgress.current = false;
      setFiles([]);
      const selectedMime = mime || "audio/webm";
      const mediaRecorder = new MediaRecorder(activeStream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 });
      recorder.current = mediaRecorder;
      bytes.current = 0; seconds.current = 0; chunkIndex.current = 0;
      session.current = crypto.randomUUID();
      await startDraft(session.current, mediaRecorder.mimeType || mime || "audio/webm");
      try {
        const context = new AudioContext();
        const node = context.createAnalyser(); node.fftSize = 1024;
        context.createMediaStreamSource(activeStream).connect(node);
        audioContext.current = context; setAnalyser(node);
      } catch { /* Audio recording remains usable when the analyser is unavailable. */ }
      const attachPartHandlers = (partRecorder: MediaRecorder) => {
        partRecorder.ondataavailable = (event) => {
          if (!event.data.size) return;
          chunks.current.push(event.data); bytes.current += event.data.size;
          dispatch({ type: "BYTES", bytes: bytes.current });
          void saveChunk(session.current, partNo.current, chunkIndex.current++, event.data);
          if (shouldRotatePart(bytes.current) && partRecorder.state === "recording") {
            rotationInProgress.current = true;
            partRecorder.stop();
          }
        };
        partRecorder.onstop = async () => {
        const mode = discardMode.current; discardMode.current = null;
        if (mode) {
          const currentFile = recordingFile(chunks.current, partRecorder.mimeType || selectedMime, partNo.current);
          const capturedFiles = [...completedFiles.current, ...(currentFile.size ? [currentFile] : [])];
          cleanup(); recorder.current = null;
          await clearDraft();
          if (mode === "undo" && capturedFiles.length) {
            if (undoTimer.current) clearTimeout(undoTimer.current);
            undoTimer.current = setTimeout(() => { undoTimer.current = null; }, 8000);
            dispatch({ type: "CANCEL" });
            toast({ message: t.recUndoMessage, actionLabel: t.recUndo, action: () => { if (undoTimer.current) clearTimeout(undoTimer.current); undoTimer.current = null; setFiles(capturedFiles); dispatch({ type: "RESTORE" }); } });
          } else dispatch({ type: "CANCEL" });
          return;
        }
        if (rotationInProgress.current) {
          const finishedFile = recordingFile(chunks.current, partRecorder.mimeType || selectedMime, partNo.current);
          if (finishedFile.size) completedFiles.current = [...completedFiles.current, finishedFile];
          chunks.current = []; chunkIndex.current = 0; bytes.current = 0;
          partNo.current += 1;
          await addDraftPart(session.current, partNo.current);
          dispatch({ type: "PARTS", parts: partNo.current });
          rotationInProgress.current = false;
          if (discardMode.current) {
            const discard = discardMode.current; discardMode.current = null;
            cleanup(); recorder.current = null; await clearDraft();
            if (discard === "undo" && completedFiles.current.length) {
              const capturedFiles = [...completedFiles.current];
              dispatch({ type: "CANCEL" });
              toast({ message: t.recUndoMessage, actionLabel: t.recUndo, action: () => { setFiles(capturedFiles); dispatch({ type: "RESTORE" }); } });
            } else dispatch({ type: "CANCEL" });
            return;
          }
          try {
            const next = new MediaRecorder(activeStream!, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 });
            recorder.current = next;
            attachPartHandlers(next);
            next.start(1000);
          } catch (error) { cleanup(); dispatch({ type: "FAIL", message: error instanceof Error ? error.message : t.errRecorderUnsupported }); }
          return;
        }
        cleanup(); recorder.current = null;
        const result = recordingFile(chunks.current, partRecorder.mimeType || selectedMime, partNo.current);
        await finalizeDraft();
        if (!result.size) { await clearDraft(); dispatch({ type: "FAIL", message: t.errInvalidMedia }); return; }
        const allFiles = [...completedFiles.current, result];
        setFiles(allFiles);
        dispatch({ type: "PARTS", parts: allFiles.length });
        dispatch({ type: "REVIEW" });
      };
      };
      attachPartHandlers(mediaRecorder);
      mediaRecorder.start(1000);
      setRecordedAt(new Date());
      dispatch({ type: "START" });
      timer.current = setInterval(() => {
        if (recorder.current?.state !== "recording") return;
        seconds.current += 1;
        dispatch({ type: "TICK", seconds: seconds.current });
        if (seconds.current >= MAX_RECORDING_SECONDS) { stop(); toast({ message: t.recMaxDuration, duration: 8000 }); }
      }, 1000);
    } catch (error) {
      activeStream?.getTracks().forEach((track) => track.stop());
      stream.current = null; cleanup();
      if (error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name)) dispatch({ type: "DENIED", message: t.recPermissionDenied });
      else dispatch({ type: "FAIL", message: error instanceof Error ? error.message : t.errMic });
    }
  }, [cleanup, stop, t, toast]);

  const pauseResume = useCallback(() => {
    const current = recorder.current;
    if (current?.state === "recording") { current.pause(); dispatch({ type: "PAUSE" }); }
    else if (current?.state === "paused") { current.resume(); dispatch({ type: "RESUME" }); }
  }, []);

  const cancel = useCallback((undoable: boolean) => {
    discardMode.current = undoable ? "undo" : "delete";
    void finalizeDraft();
    if (rotationInProgress.current) return;
    const current = recorder.current;
    if (current && current.state !== "inactive") current.stop();
    else { cleanup(); void clearDraft(); dispatch({ type: "CANCEL" }); }
  }, [cleanup]);

  const beginUpload = useCallback(() => dispatch({ type: "UPLOAD" }), []);
  const processing = useCallback(() => dispatch({ type: "PROCESSING" }), []);
  const uploadDone = useCallback(() => { dispatch({ type: "DONE" }); setFiles([]); void clearDraft(); }, []);
  const uploadFailed = useCallback((message: string) => dispatch({ type: "FAIL", message }), []);
  const resetReview = useCallback(() => { setFiles([]); dispatch({ type: "DONE" }); void clearDraft(); }, []);
  const reviewFile = useCallback(() => dispatch({ type: "RESTORE" }), []);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); cleanup(); }, [cleanup]);

  return { state, files, setFiles, recordedAt, analyser, start, stop, pauseResume, cancel, beginUpload, processing, uploadDone, uploadFailed, resetReview, reviewFile };
}

export async function recoverRecorderDraft() { return readDraft(); }
