import { GroqError } from "@/lib/groq";
import { DeepgramError } from "@/lib/deepgram";

/** Stable codes stored in the meeting row and translated by the dashboard. */
export function classifyError(error: unknown) {
  if (error instanceof DeepgramError) {
    if (error.kind === "no_key") return "STT_API_KEY_MISSING";
    if (error.kind === "network" || error.kind === "timeout") return "NETWORK_ERROR";
    if (error.status === 429) return "RATE_LIMIT";
    if (error.status === 401 || error.status === 403) return "STT_API_AUTH";
    if ([400, 413, 415, 422].includes(error.status ?? 0)) return "INVALID_AUDIO";
    return "PROCESSING_FAILED";
  }
  if (error instanceof GroqError) {
    if (error.kind === "no_key") return "LLM_API_KEY_MISSING";
    if (error.kind === "network" || error.kind === "timeout") return "NETWORK_ERROR";
    if (error.status === 429) return "RATE_LIMIT";
    if (error.status === 401 || error.status === 403) return "LLM_API_AUTH";
    return "PROCESSING_FAILED";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NO_SPEECH_DETECTED")) return "NO_SPEECH";
  if (message.includes("AUDIO_EMPTY") || message.includes("AUDIO_DOWNLOAD_FAILED")) return "INVALID_AUDIO";
  return "PROCESSING_FAILED";
}
