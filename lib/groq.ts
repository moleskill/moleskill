import { isRetryableStatus, retryDelayMs, sleep } from "./retry";

const BASE = "https://api.groq.com/openai/v1";
/** Hard ceiling for one LLM request. Long transcripts are split by summarize.ts; input is never silently cut. */
export const MAX_LLM_INPUT_CHARS = 120_000;
const LLM_TIMEOUT_MS = 90_000;

export type Stage = "llm";

/** Typed failure so callers can tell a bad audio file from a bad key, a timeout or a rate limit. */
export class GroqError extends Error {
  constructor(readonly kind: "no_key" | "network" | "timeout" | "http", readonly stage: Stage, readonly status?: number, detail = "") {
    super(`GROQ_${kind.toUpperCase()}${status ? `_${status}` : ""} (${stage}) ${detail}`.trim());
    this.name = "GroqError";
  }
}

type RetryPolicy = { retries: number; retryTimeouts: boolean };
// A timed-out transcription already burned most of the function's time budget, so it is not retried in-process.
const LLM_RETRY: RetryPolicy = { retries: 2, retryTimeouts: true };

type Outcome = { ok: true; res: Response } | { ok: false; error: GroqError; retryAfter: string | null };

async function send(stage: Stage, path: string, init: RequestInit, timeoutMs: number, apiKey: string): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const kind = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
    return { ok: false, error: new GroqError(kind, stage), retryAfter: null };
  }
  if (res.ok) return { ok: true, res };
  return { ok: false, error: new GroqError("http", stage, res.status, (await res.text()).slice(0, 800)), retryAfter: res.headers.get("retry-after") };
}

/** Calls Groq, retrying rate limits, 5xx and network blips with backoff (honouring Retry-After). */
async function groq(stage: Stage, path: string, init: RequestInit, timeoutMs: number, policy: RetryPolicy) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqError("no_key", stage);
  for (let attempt = 0; ; attempt++) {
    const out = await send(stage, path, init, timeoutMs, apiKey);
    if (out.ok) return out.res.json();
    const { error } = out;
    const retryable =
      error.kind === "network" ||
      (error.kind === "timeout" && policy.retryTimeouts) ||
      (error.kind === "http" && isRetryableStatus(error.status));
    const delay = retryable && attempt < policy.retries ? retryDelayMs(attempt, out.retryAfter) : null;
    if (delay === null) throw error;
    console.warn(`[groq:${stage}] ${error.message.slice(0, 120)} - retry ${attempt + 1}/${policy.retries} in ${delay}ms`);
    await sleep(delay);
  }
}

export async function chat(
  messages: { role: "system" | "user"; content: string }[],
  opts: { json?: boolean; maxTokens?: number } = {},
) {
  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_LLM_INPUT_CHARS) throw new Error("LLM_INPUT_TOO_LARGE");
  const model = process.env.GROQ_LLM_MODEL || "openai/gpt-oss-120b";
  const j = await groq("llm", "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // Reasoning tokens count against max_tokens; without headroom the JSON answer can come back empty.
      max_tokens: opts.maxTokens ?? 4000,
      ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  }, LLM_TIMEOUT_MS, LLM_RETRY);
  return String(j.choices?.[0]?.message?.content ?? "");
}

/** Parses a JSON object from model output, tolerating ```json fences and stray text around it. */
export function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(raw.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
