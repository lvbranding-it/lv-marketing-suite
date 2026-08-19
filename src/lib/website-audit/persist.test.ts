import { beforeEach, describe, expect, it } from "vitest";
import { loadAuditDraft, loadAuditObservation, saveAuditDraft, saveAuditObservation } from "./persist";
import { SAMPLE_ANSWERS, SAMPLE_OBSERVATION } from "./sample";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}

let local: MemoryStorage;
let session: MemoryStorage;
beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  Object.assign(globalThis, { localStorage: local, sessionStorage: session });
});

describe("website audit persistence", () => {
  it("round-trips a versioned draft", () => {
    saveAuditDraft({ phase: "context", url: SAMPLE_OBSERVATION.requestedUrl, answers: SAMPLE_ANSWERS });
    expect(loadAuditDraft()).toEqual({ phase: "context", url: SAMPLE_OBSERVATION.requestedUrl, answers: SAMPLE_ANSWERS });
  });

  it("falls back safely when a draft is corrupt", () => {
    session.setItem("lv-website-opportunity-audit:draft:v1", "{not-json");
    expect(loadAuditDraft().phase).toBe("landing");
    expect(loadAuditDraft().url).toBe("");
  });

  it("expires a draft containing audit credentials after 30 days", () => {
    saveAuditDraft({
      phase: "results",
      url: SAMPLE_OBSERVATION.requestedUrl,
      answers: SAMPLE_ANSWERS,
      auditId: SAMPLE_OBSERVATION.auditId,
      observation: SAMPLE_OBSERVATION,
    });
    const key = "lv-website-opportunity-audit:draft:v1";
    const stored = JSON.parse(session.getItem(key)!);
    stored.savedAt = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    session.setItem(key, JSON.stringify(stored));
    expect(loadAuditDraft().phase).toBe("landing");
    expect(session.getItem(key)).toBeNull();
  });

  it("round-trips an audit observation", () => {
    saveAuditObservation(SAMPLE_OBSERVATION);
    expect(loadAuditObservation(SAMPLE_OBSERVATION.auditId)).toEqual(SAMPLE_OBSERVATION);
  });

  it("rejects and removes results older than the published retention window", () => {
    saveAuditObservation(SAMPLE_OBSERVATION);
    const key = `lv-website-opportunity-audit:result:v1:${SAMPLE_OBSERVATION.auditId}`;
    const stored = JSON.parse(local.getItem(key)!);
    stored.savedAt = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    local.setItem(key, JSON.stringify(stored));
    expect(loadAuditObservation(SAMPLE_OBSERVATION.auditId)).toBeNull();
    expect(local.getItem(key)).toBeNull();
  });

  it("does not extend retention when an older server result is opened later", () => {
    const old = structuredClone(SAMPLE_OBSERVATION);
    old.createdAt = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    saveAuditObservation(old);
    expect(loadAuditObservation(old.auditId)).toBeNull();
  });

  it("sweeps expired result records even when their route is never reopened", () => {
    const old = structuredClone(SAMPLE_OBSERVATION);
    old.auditId = "audit-expired-unvisited";
    old.createdAt = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    const key = `lv-website-opportunity-audit:result:v1:${old.auditId}`;
    local.setItem(key, JSON.stringify({ version: "lv-website-opportunity-v1", observation: old, savedAt: new Date().toISOString() }));
    loadAuditDraft();
    expect(local.getItem(key)).toBeNull();
  });
});
