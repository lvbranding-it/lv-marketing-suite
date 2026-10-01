import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_QUERY_RETRY, isShareToken, withRetries } from "./retry";

describe("withRetries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns as soon as a try works", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce("photos");
    const result = withRetries(task, [1000, 2000]);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe("photos");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("gives up with the last error once every delay is spent", async () => {
    const task = vi.fn().mockRejectedValue(new Error("down"));
    const result = withRetries(task, [1000, 2000]);
    const settled = expect(result).rejects.toThrow("down");
    await vi.advanceTimersByTimeAsync(3000);
    await settled;
    expect(task).toHaveBeenCalledTimes(3);
  });
});

describe("CLIENT_QUERY_RETRY", () => {
  it("waits longer each time, up to the last delay", () => {
    expect([0, 1, 2, 3, 9].map(CLIENT_QUERY_RETRY.retryDelay)).toEqual([1000, 2000, 4000, 8000, 8000]);
  });
});

describe("isShareToken", () => {
  it("accepts a session token and nothing else", () => {
    expect(isShareToken("cdcd4594-4560-4959-aa83-b08c6c6927fb")).toBe(true);
    expect(isShareToken("CDCD4594-4560-4959-AA83-B08C6C6927FB")).toBe(true);
    expect(isShareToken("cdcd4594-4560-4959-aa83")).toBe(false);
    expect(isShareToken("not-a-link")).toBe(false);
    expect(isShareToken(undefined)).toBe(false);
  });
});
