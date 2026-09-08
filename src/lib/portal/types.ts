export const stages = [
  "draft",
  "new",
  "contact_needed",
  "contacted",
  "discovery_scheduled",
  "qualified",
  "proposal_preparation",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "on_hold",
  "not_a_fit",
] as const;
export type Stage = (typeof stages)[number];
export type PortalRole =
  "admin" | "staff" | "ambassador" | "business_developer";
export interface PortalWorkspace {
  org_id: string;
  name: string;
  role: PortalRole;
}
export interface PortalLead {
  id: string;
  org_id: string;
  attributed_user_id: string;
  created_by: string;
  assigned_user_id: string | null;
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  source: string;
  service: string;
  summary: string;
  language: "en" | "es" | "unknown";
  priority: "low" | "normal" | "high";
  next_action: string;
  followup_at: string | null;
  shared_stage: Stage;
  submitted_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}
export type LeadFields = Pick<
  PortalLead,
  | "first_name"
  | "last_name"
  | "company"
  | "email"
  | "phone"
  | "website"
  | "source"
  | "service"
  | "summary"
  | "language"
  | "priority"
  | "next_action"
  | "followup_at"
>;
export interface PortalNote {
  id: string;
  lead_id: string;
  author_id: string;
  body: string;
  visibility: "personal" | "shared" | "internal";
  created_at: string;
  updated_at: string;
}
export interface PortalMember {
  user_id: string;
  role: PortalRole;
  display_name: string;
  active: boolean;
  last_access_sent_at: string | null;
  access_send_count: number;
}
export interface PortalActivity {
  id: string;
  action: string;
  created_at: string;
  detail: Record<string, unknown>;
}
export const emptyLead: LeadFields = {
  first_name: "",
  last_name: "",
  company: "",
  email: "",
  phone: "",
  website: "",
  source: "",
  service: "",
  summary: "",
  language: "unknown",
  priority: "normal",
  next_action: "",
  followup_at: null,
};
export function canSubmit(lead: LeadFields) {
  return !!(
    lead.first_name.trim() &&
    lead.last_name.trim() &&
    lead.company.trim() &&
    (lead.email.trim() || lead.phone.trim()) &&
    lead.source.trim() &&
    lead.service.trim() &&
    lead.summary.trim()
  );
}
export function searchTerm(value: string) {
  return value
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s@.+-]/gu, "")
    .trim();
}
