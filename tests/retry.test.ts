import { describe, expect, it } from "vitest";
import { isRetryableStatus, retryDelayMs } from "@/lib/retry";

describe("retry policy", () => {
  it("retries rate limits and server errors, not client errors", () => {
    expect([429, 503].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 413].some(isRetryableStatus)).toBe(false);
  });
  it("honours Retry-After, but gives up when the wait is too long", () => {
    expect(retryDelayMs(0, "2")).toBe(2000);
    expect(retryDelayMs(0, "120")).toBeNull();
  });
});
