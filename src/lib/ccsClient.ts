// Client-side wrapper for the public `ccs-client` edge function. The review wizard
// is unauthenticated; every call carries the secure token, which the function
// validates by hashing to match the stored SHA-256 (see supabase/functions/ccs-client).
const BASE = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const ENDPOINT = `${BASE}/functions/v1/ccs-client`;

export class CcsError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function call<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, apikey: KEY },
    body: JSON.stringify(payload),
  });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new CcsError(String(data.error ?? "error"), res.status);
  return data as T;
}

// ── Response shapes ──────────────────────────────────────────────────────────────
export interface CcsWizardData {
  expired: boolean;
  request: {
    id: string; status: string; completion_percentage: number;
    recipient_name: string | null; recipient_email: string | null;
    require_email_verification: boolean; require_all_acknowledgments: boolean; capture_ip: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config_json: any; template_version: string | null; project_terms_version: string | null;
    intro_message: string | null; expires_at: string | null;
  };
  client: { company_name: string; primary_contact_name: string | null; primary_contact_email: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: { content_json: any; legal_disclaimer: string | null; version: string; name: string } | null;
  responses: Record<string, Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intended: any; priorUse: any; signature: any; snapshot: { confirmation_number: string } | null;
}

export interface SignaturePayload {
  signer_name: string; signer_company?: string; signer_title?: string; signer_email?: string;
  signature_type?: "typed" | "drawn" | "both"; signature_data?: string; consent_text: string;
}

export interface CcsDocumentData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: { confirmation_number: string; full_snapshot_json: any; template_version: string | null; project_terms_version: string | null; created_at: string };
  client: { company_name: string } | null;
}

export const ccsClient = {
  load: (token: string) => call<CcsWizardData>({ action: "load", token }),
  document: (token: string) => call<CcsDocumentData>({ action: "document", token }),
  save: (token: string, step_key: string, question_key: string, response_json: unknown, completion_percentage?: number) =>
    call({ action: "save", token, step_key, question_key, response_json, completion_percentage }),
  saveIntended: (token: string, payload: Record<string, unknown>) => call({ action: "save_intended", token, payload }),
  savePriorUse: (token: string, payload: Record<string, unknown>) => call({ action: "save_prior_use", token, payload }),
  correction: (token: string, corrections: Array<Record<string, unknown>>) => call({ action: "correction", token, corrections }),
  submit: (token: string) => call({ action: "submit", token }),
  sign: (token: string, signature: SignaturePayload) => call<{ ok: boolean; confirmation_number: string }>({
    action: "sign", token, signature,
    origin: typeof window !== "undefined" ? window.location.origin : undefined,
  }),
};
