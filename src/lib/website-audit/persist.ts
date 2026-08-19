import { AUDIT_VERSION, emptyAuditAnswers, type AuditObservation, type PersistedAuditState } from "./types";

const DRAFT_KEY = "lv-website-opportunity-audit:draft:v1";
const resultKey = (id: string) => `lv-website-opportunity-audit:result:v1:${id}`;
const RESULT_TTL_MS = 30 * 24 * 60 * 60_000;

interface StoredDraft { version: typeof AUDIT_VERSION; state: PersistedAuditState; savedAt: string }
interface StoredResult { version: typeof AUDIT_VERSION; observation: AuditObservation; savedAt: string }

function observationExpired(observation: AuditObservation | undefined, now = Date.now()): boolean {
  if (!observation) return false;
  const createdAt = new Date(observation.createdAt).getTime();
  return !Number.isFinite(createdAt) || now - createdAt >= RESULT_TTL_MS;
}

function resultRecordExpired(record: StoredResult, now = Date.now()): boolean {
  const savedAt = new Date(record.savedAt).getTime();
  return record.version !== AUDIT_VERSION || !Number.isFinite(savedAt) || now - savedAt >= RESULT_TTL_MS ||
    observationExpired(record.observation, now);
}

function sweepStoredResults(): void {
  try {
    const prefix = "lv-website-opportunity-audit:result:v1:";
    let inspected = 0;
    for (let index = localStorage.length - 1; index >= 0 && inspected < 200; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      inspected += 1;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null") as StoredResult | null;
        if (!parsed || resultRecordExpired(parsed)) localStorage.removeItem(key);
      } catch { localStorage.removeItem(key); }
    }
  } catch { /* storage access may be blocked */ }
}

export function loadAuditDraft(): PersistedAuditState {
  sweepStoredResults();
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw) as StoredDraft;
    const savedAt = new Date(parsed.savedAt).getTime();
    if (parsed.version !== AUDIT_VERSION || !parsed.state || typeof parsed.state.url !== "string" ||
        !Number.isFinite(savedAt) || Date.now() - savedAt >= RESULT_TTL_MS || observationExpired(parsed.state.observation)) {
      sessionStorage.removeItem(DRAFT_KEY);
      throw new Error("invalid");
    }
    return parsed.state;
  } catch {
    return { phase: "landing", url: "", answers: emptyAuditAnswers() };
  }
}

export function saveAuditDraft(state: PersistedAuditState): void {
  try {
    const payload: StoredDraft = { version: AUDIT_VERSION, state, savedAt: new Date().toISOString() };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch { /* private mode or storage disabled */ }
}

export function clearAuditDraft(): void {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
}

export function saveAuditObservation(observation: AuditObservation): void {
  try {
    sweepStoredResults();
    const payload: StoredResult = { version: AUDIT_VERSION, observation, savedAt: new Date().toISOString() };
    localStorage.setItem(resultKey(observation.auditId), JSON.stringify(payload));
  } catch { /* the result remains available in memory */ }
}

export function loadAuditObservation(id: string): AuditObservation | null {
  try {
    const raw = localStorage.getItem(resultKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredResult;
    if (parsed.version !== AUDIT_VERSION || parsed.observation?.auditId !== id || !Array.isArray(parsed.observation.pages) ||
        resultRecordExpired(parsed)) {
      localStorage.removeItem(resultKey(id));
      return null;
    }
    return parsed.observation;
  } catch {
    return null;
  }
}
