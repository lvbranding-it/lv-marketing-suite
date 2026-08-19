import type { AuditAnswers, AuditLanguage, AuditObservation, OpportunityRoute } from "./types";

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/website-audit`;
const publicKey = () => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export class AuditApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuditApiError";
  }
}

export function asAuditApiError(error: unknown): AuditApiError {
  return error instanceof AuditApiError
    ? error
    : new AuditApiError("network_error", 0, error instanceof Error ? error.message : "Network request failed");
}

async function callAuditFunction(body: unknown, timeoutMs = 55_000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const key = publicKey();
    let response: Response;
    try {
      response = await fetch(endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AuditApiError("request_timeout", 408, "Audit request timed out");
      }
      throw new AuditApiError("network_error", 0, error instanceof Error ? error.message : "Network request failed");
    }
    const data = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    if (!response.ok) {
      throw new AuditApiError(data?.code || `http_${response.status}`, response.status, data?.error || `Audit request failed (${response.status})`);
    }
    if (!data) throw new AuditApiError("invalid_response", 502, "The audit service returned an invalid response");
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

function isObservation(value: unknown): value is AuditObservation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuditObservation>;
  return typeof candidate.auditId === "string" && typeof candidate.finalUrl === "string" &&
    typeof candidate.normalizedDomain === "string" && Array.isArray(candidate.pages) && candidate.pages.length > 0;
}

export async function runLiveAudit(
  url: string,
  answers: AuditAnswers,
  interfaceLanguage: AuditLanguage,
): Promise<AuditObservation> {
  const data = await callAuditFunction({ action: "run", url, answers, interfaceLanguage, termsAccepted: true });
  const observation = (data as { observation?: unknown }).observation;
  if (!isObservation(observation)) throw new AuditApiError("invalid_response", 502, "The audit service returned an invalid result");
  return observation;
}

export async function loadRemoteAudit(auditId: string, accessToken: string): Promise<AuditObservation> {
  const data = await callAuditFunction({ action: "get", auditId, accessToken }, 15_000);
  const observation = (data as { observation?: unknown }).observation;
  if (!isObservation(observation)) throw new AuditApiError("invalid_response", 502, "The audit service returned an invalid result");
  return observation;
}

export function recordAuditEvent(auditId: string, accessToken: string | undefined, event: string, detail: Record<string, unknown> = {}): void {
  if (!accessToken) return;
  callAuditFunction({ action: "event", auditId, accessToken, event, detail }, 8_000).catch(() => {});
}

export function recordAuditLandingView(language: AuditLanguage): void {
  try {
    const key = "lv-website-opportunity-audit:landing-viewed";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const params = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
      .flatMap((name) => params.get(name) ? [[name, params.get(name)!.slice(0, 160)]] : []));
    callAuditFunction({ action: "landing", language, utm }, 8_000).catch(() => {});
  } catch { /* analytics must never block the public experience */ }
}

export interface AuditLeadInput {
  auditId: string;
  accessToken: string;
  language: AuditLanguage;
  name: string;
  workEmail: string;
  company: string;
  pathway: OpportunityRoute;
  timeline: "now" | "one-three" | "three-six" | "exploring";
  projectContext: string;
  consent: true;
  hp: string;
  utm: Record<string, string>;
}

export async function submitAuditLead(input: AuditLeadInput): Promise<void> {
  await callAuditFunction({ action: "lead", ...input }, 45_000);
}
