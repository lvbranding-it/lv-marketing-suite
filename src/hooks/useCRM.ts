import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";

export type PipelineStage = "lead" | "contacted" | "qualified" | "proposal" | "won" | "lost";

export interface ContactActivity {
  id: string;
  org_id: string;
  contact_id: string;
  created_by: string | null;
  created_at: string;
  type: "note" | "call" | "email" | "meeting";
  body: string;
  meta: Record<string, unknown>;
}

export const PIPELINE_STAGES = [
  { key: "lead" as PipelineStage,      label: "Lead",      emoji: "🎯", color: "text-slate-600",   bg: "bg-slate-100",    border: "border-slate-200",  headerBg: "bg-slate-50" },
  { key: "contacted" as PipelineStage, label: "Contacted", emoji: "📬", color: "text-blue-600",    bg: "bg-blue-50",      border: "border-blue-200",   headerBg: "bg-blue-50/60" },
  { key: "qualified" as PipelineStage, label: "Qualified", emoji: "✅", color: "text-violet-600",  bg: "bg-violet-50",    border: "border-violet-200", headerBg: "bg-violet-50/60" },
  { key: "proposal" as PipelineStage,  label: "Proposal",  emoji: "📄", color: "text-amber-600",   bg: "bg-amber-50",     border: "border-amber-200",  headerBg: "bg-amber-50/60" },
  { key: "won" as PipelineStage,       label: "Won",       emoji: "🏆", color: "text-emerald-600", bg: "bg-emerald-50",   border: "border-emerald-200",headerBg: "bg-emerald-50/60" },
  { key: "lost" as PipelineStage,      label: "Lost",      emoji: "❌", color: "text-red-500",     bg: "bg-red-50",       border: "border-red-200",    headerBg: "bg-red-50/60" },
];

export const ACTIVITY_META = [
  { type: "note",    label: "Note",    icon: "📝", color: "text-slate-600",   bg: "bg-slate-100" },
  { type: "call",    label: "Call",    icon: "📞", color: "text-blue-600",    bg: "bg-blue-100" },
  { type: "email",   label: "Email",   icon: "✉️",  color: "text-violet-600",  bg: "bg-violet-100" },
  { type: "meeting", label: "Meeting", icon: "🤝", color: "text-emerald-600", bg: "bg-emerald-100" },
] as const;

export function useUpdatePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pipeline_stage }: { id: string; pipeline_stage: PipelineStage }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ pipeline_stage })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUpdateContactCRM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      deal_value,
      deal_probability,
      next_followup_at,
      tags,
      crm_notes,
      pipeline_stage,
    }: {
      id: string;
      deal_value?: number | null;
      deal_probability?: number | null;
      next_followup_at?: string | null;
      tags?: string[];
      crm_notes?: string | null;
      pipeline_stage?: PipelineStage;
    }) => {
      const update: Record<string, unknown> = {};
      if (deal_value !== undefined) update.deal_value = deal_value;
      if (deal_probability !== undefined) update.deal_probability = deal_probability;
      if (next_followup_at !== undefined) update.next_followup_at = next_followup_at;
      if (tags !== undefined) update.tags = tags;
      if (crm_notes !== undefined) update.crm_notes = crm_notes;
      if (pipeline_stage !== undefined) update.pipeline_stage = pipeline_stage;

      const { error } = await supabase.from("contacts").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useContactActivities(contactId: string | null) {
  return useQuery<ContactActivity[]>({
    queryKey: ["contact_activities", contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from("contact_activities")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactActivity[];
    },
    enabled: !!contactId,
  });
}

export function useAddActivity() {
  const { org } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contact_id,
      type,
      body,
      meta = {},
    }: {
      contact_id: string;
      type: "note" | "call" | "email" | "meeting";
      body: string;
      meta?: Record<string, unknown>;
    }) => {
      if (!org || !user) throw new Error("Not authenticated");
      const { error: actError } = await supabase.from("contact_activities").insert({
        org_id: org.id,
        contact_id,
        created_by: user.id,
        type,
        body,
        meta: meta as Json,
      });
      if (actError) throw actError;

      // Update last_contacted_at on the contact
      const { error: contactError } = await supabase
        .from("contacts")
        .update({ last_contacted_at: new Date().toISOString() })
        .eq("id", contact_id);
      if (contactError) throw contactError;

      return contact_id;
    },
    onSuccess: (contact_id) => {
      qc.invalidateQueries({ queryKey: ["contact_activities", contact_id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contact_id }: { id: string; contact_id: string }) => {
      const { error } = await supabase.from("contact_activities").delete().eq("id", id);
      if (error) throw error;
      return contact_id;
    },
    onSuccess: (contact_id) => {
      qc.invalidateQueries({ queryKey: ["contact_activities", contact_id] });
    },
  });
}
