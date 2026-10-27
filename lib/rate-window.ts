export type Rule = { limit: number; windowSec: number };

/** Every request calls the LLM, so a runaway script could burn the whole provider quota. */
export const ASK_RULES: Rule[] = [{ limit: 8, windowSec: 60 }, { limit: 150, windowSec: 86_400 }];
/** A voice request costs one speech-to-text call plus one or two LLM calls. */
export const ASSISTANT_RULES: Rule[] = [{ limit: 8, windowSec: 60 }, { limit: 120, windowSec: 86_400 }];
/** Every upload costs transcription quota and storage. */
export const UPLOAD_RULES: Rule[] = [{ limit: 15, windowSec: 3_600 }, { limit: 60, windowSec: 86_400 }];
/** Translation is user-triggered and cached per meeting; cap repeated generation requests. */
export const TRANSLATION_RULES: Rule[] = [{ limit: 5, windowSec: 3_600 }, { limit: 20, windowSec: 86_400 }];

/** Start of the fixed window that contains `nowMs`. */
export const windowStart = (nowMs: number, windowSec: number) => new Date(Math.floor(nowMs / 1000 / windowSec) * windowSec * 1000);

/** Seconds until the window that started at `start` ends (at least 1). */
export const secondsLeft = (start: Date, windowSec: number, nowMs: number) =>
  Math.max(1, Math.ceil((start.getTime() + windowSec * 1000 - nowMs) / 1000));

/** Auth endpoints: per address (codes cost an email each) and per IP. */
export const SEND_CODE_RULES: Rule[] = [{ limit: 5, windowSec: 3_600 }, { limit: 15, windowSec: 86_400 }];
export const LOGIN_RULES: Rule[] = [{ limit: 10, windowSec: 900 }, { limit: 50, windowSec: 86_400 }];
export const CODE_ENTRY_RULES: Rule[] = [{ limit: 15, windowSec: 900 }, { limit: 60, windowSec: 86_400 }];
export const AUTH_IP_RULES: Rule[] = [{ limit: 40, windowSec: 900 }, { limit: 300, windowSec: 86_400 }];
