// Where a LegalSigns document stands, as the team reads it.

export type LegalStage = "waiting" | "countersign" | "completed" | "expired" | "voided";

export interface LegalStatusSource {
  status: "sent" | "viewed" | "client_signed" | "completed" | "voided";
  expires_at: string;
}

export function legalStage(doc: LegalStatusSource, now = Date.now()): LegalStage {
  if (doc.status === "voided") return "voided";
  if (doc.status === "completed") return "completed";
  if (doc.status === "client_signed") return "countersign";
  return new Date(doc.expires_at).getTime() < now ? "expired" : "waiting";
}

export const STAGE_LABELS: Record<LegalStage, string> = {
  countersign: "Ready to countersign",
  waiting: "Waiting for signature",
  completed: "Completed",
  expired: "Link expired",
  voided: "Voided",
};

/** The one line under a document: what happened last. */
export function stageDetail(
  doc: LegalStatusSource & { viewed_at: string | null; signers?: { signed_at: string | null }[] },
  stage = legalStage(doc),
) {
  const signers = doc.signers ?? [];
  if (stage === "waiting") {
    if (signers.length > 1) return `${signers.filter((signer) => signer.signed_at).length} of ${signers.length} signed`;
    return doc.viewed_at ? "Opened, not signed yet" : "Not opened yet";
  }
  if (stage === "countersign") {
    return signers.length > 1 ? "Every party signed. Your signature completes it." : "Signed by the recipient. Your signature completes it.";
  }
  if (stage === "expired") return "Send it again for a new link";
  return "";
}

export const LEGAL_FILTERS = [
  { value: "all", label: "All" },
  { value: "countersign", label: "To countersign" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Expired or voided" },
] as const;
export type LegalFilter = (typeof LEGAL_FILTERS)[number]["value"];

export function matchesFilter(stage: LegalStage, filter: LegalFilter) {
  if (filter === "all") return true;
  if (filter === "closed") return stage === "expired" || stage === "voided";
  return stage === filter;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every word of the search in the title, or any party's name, company or email, accents ignored. */
export function matchesSearch(
  doc: { title: string; recipient_name: string; recipient_email: string; company_name: string; signers?: { name: string; email: string; company_name: string }[] },
  query: string,
) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const parties = (doc.signers ?? []).flatMap((signer) => [signer.name, signer.email, signer.company_name]);
  const text = fold([doc.title, doc.recipient_name, doc.recipient_email, doc.company_name, ...parties].join(" "));
  return words.every((word) => text.includes(word));
}

const EVENT_LABELS: Record<string, string> = {
  sent: "Sent for signature",
  resent: "Sent again with a new link",
  revised: "Document revised; previous link invalidated",
  revision_sent: "Revised document emailed with a new link",
  delivery_failed: "Email delivery failed; send again to retry",
  viewed: "Opened by the recipient",
  client_signed: "Signed by the recipient",
  countersigned: "Countersigned",
  completed: "Completed. Signed PDF emailed to both sides",
  voided: "Voided",
  email_mismatch: "Wrong email typed on the signing page",
};

export const eventLabel = (event: string) => EVENT_LABELS[event] ?? event;

/** "iPhone · Safari" from a browser's user agent, for the activity list. */
export function deviceName(userAgent: string | null) {
  if (!userAgent) return "";
  const ua = userAgent;
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /CriOS\/|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [device, browser].filter(Boolean).join(" · ");
}

/** "Ana", "Ana and Leo", "Ana, Leo and Mia"; each name once. */
export function listNames(names: string[]) {
  const named = [...new Set(names.filter(Boolean))];
  if (named.length < 2) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}
