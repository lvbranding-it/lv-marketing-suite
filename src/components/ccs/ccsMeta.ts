import type { CcsRequestStatus, CcsProjectPhase } from "@/hooks/useCcs";

export const REQUEST_STATUS_META: Record<CcsRequestStatus, { label: string; className: string }> = {
  draft:         { label: "Draft",          className: "bg-muted text-muted-foreground" },
  ready_to_send: { label: "Ready to send",  className: "bg-sky-100 text-sky-700" },
  sent:          { label: "Sent",           className: "bg-blue-100 text-blue-700" },
  opened:        { label: "Opened",         className: "bg-indigo-100 text-indigo-700" },
  in_progress:   { label: "In progress",    className: "bg-amber-100 text-amber-700" },
  submitted:     { label: "Submitted",      className: "bg-violet-100 text-violet-700" },
  signed:        { label: "Signed",         className: "bg-emerald-100 text-emerald-700" },
  accepted:      { label: "Accepted",       className: "bg-green-100 text-green-700" },
  expired:       { label: "Expired",        className: "bg-zinc-200 text-zinc-600" },
  revoked:       { label: "Revoked",        className: "bg-red-100 text-red-700" },
  archived:      { label: "Archived",       className: "bg-zinc-200 text-zinc-500" },
};

export const PROJECT_TYPES = [
  "Branding", "Graphic design", "Website design", "Website development", "UX/UI",
  "Photography", "Video production", "Advertising campaign", "Social media content",
  "AV production", "Consulting", "Marketing strategy", "Content development", "Other",
];

export function servicesSummary(services: string[] | null | undefined, fallback?: string | null): string {
  if (services && services.length) return services.join(" → ");
  return fallback || "—";
}

export const PROJECT_PHASE_LABEL: Record<CcsProjectPhase, string> = {
  brief_approval: "Brief Approval",
  strategic_direction: "Strategic Direction",
  concept_approval: "Concept Approval",
  refinement: "Refinement",
  final_production: "Final Production",
};

export function feeLabel(type: string | null | undefined, value: number | null | undefined): string {
  if (value == null) return "—";
  if (type === "percentage") return `${value}%`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
