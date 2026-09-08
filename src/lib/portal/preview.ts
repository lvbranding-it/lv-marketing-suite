import { emptyLead, type PortalLead } from "./types";
// Fictional, dev-only UI review data. Never sent to Supabase.
export function previewLeads(): PortalLead[] {
  const now = Date.now();
  return [
    {
      id: "sample-1",
      first_name: "Maya",
      last_name: "Chen",
      company: "Northline Coffee",
      service: "Brand strategy",
      summary:
        "A growing neighborhood coffee business preparing to open its second location. Interested in a consistent brand experience across both spaces.",
      shared_stage: "qualified",
      priority: "high",
      next_action: "Prepare discovery questions",
      followup_at: new Date(now - 86400000).toISOString(),
      submitted_at: new Date(now - 172800000).toISOString(),
    },
    {
      id: "sample-2",
      first_name: "Daniel",
      last_name: "Rivera",
      company: "Forma Studio",
      service: "Website & digital experience",
      summary:
        "An independent design studio looking for a website that better communicates its services and portfolio.",
      shared_stage: "new",
      priority: "normal",
      next_action: "Share approved service overview",
      followup_at: new Date(now + 86400000).toISOString(),
      submitted_at: new Date(now - 86400000).toISOString(),
    },
    {
      id: "sample-3",
      first_name: "Sofia",
      last_name: "Martinez",
      company: "Vista Community",
      service: "Creative content",
      summary:
        "Met at a community event. Follow up to learn more about their communication goals.",
      shared_stage: "draft",
      priority: "normal",
      next_action: "Confirm the best contact method",
      followup_at: null,
      submitted_at: null,
    },
  ].map(
    (row, i) =>
      ({
        ...emptyLead,
        org_id: "preview",
        attributed_user_id: "preview-user",
        created_by: "preview-user",
        assigned_user_id: null,
        archived_at: null,
        created_at: new Date(now - (i + 1) * 86400000).toISOString(),
        updated_at: new Date(now - i * 3600000).toISOString(),
        version: 1,
        email: `contact${i + 1}@example.test`,
        source: "Community event",
        ...row,
      }) as PortalLead,
  );
}
