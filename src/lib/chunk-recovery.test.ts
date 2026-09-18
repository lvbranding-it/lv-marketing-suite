import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChunkRecovery } from "./chunk-recovery";

let storage: Map<string, string>;
let target: EventTarget;
let reload: ReturnType<typeof vi.fn>;
let browser: ReturnType<typeof createBrowser>;

function createBrowser() {
  target = new EventTarget();
  reload = vi.fn();
  const browser = {
    addEventListener: target.addEventListener.bind(target),
    navigator: { onLine: true },
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
  };
  vi.stubGlobal("window", browser);
  return browser;
}

function failImport() {
  const event = new Event("vite:preloadError", { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  storage = new Map();
  browser = createBrowser();
});
afterEach(() => vi.unstubAllGlobals());

describe("deployment chunk recovery", () => {
  it("reloads once and suppresses concurrent import failures during navigation", () => {
    registerChunkRecovery("/assets/index-old.js");
    expect(failImport().defaultPrevented).toBe(true);
    expect(failImport().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not loop if a reload serves the same broken bundle", () => {
    registerChunkRecovery("/assets/index-old.js");
    failImport();
    createBrowser(); // New document, same tab storage.
    registerChunkRecovery("/assets/index-old.js");
    expect(failImport().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("allows recovery after a later deployment", () => {
    registerChunkRecovery("/assets/index-old.js");
    failImport();
    createBrowser();
    registerChunkRecovery("/assets/index-new.js");
    expect(failImport().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload or consume the retry while offline", () => {
    browser.navigator.onLine = false;
    registerChunkRecovery("/assets/index-old.js");
    expect(failImport().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    browser.navigator.onLine = true;
    expect(failImport().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves the error visible when session storage is blocked", () => {
    Object.defineProperty(browser, "sessionStorage", {
      get() { throw new Error("Storage blocked"); },
    });
    registerChunkRecovery("/assets/index-old.js");
    expect(failImport().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
