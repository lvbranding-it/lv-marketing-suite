import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import type { EmailCampaign, EmailCampaignRecipient } from "@/integrations/supabase/types";

export type { EmailCampaign, EmailCampaignRecipient };

export type CampaignStatus = "draft" | "pending_approval" | "sending" | "sent" | "failed";

export interface SelectedRecipient {
  id: string;
  email: string;
  first_name: string | null;
  last_name:  string | null;
  company:    string | null;
  title:      string | null;
  contact_id: string | null;
  pipeline_stage?: string;
  tags?: string[];
  suppressed?: boolean;
}

// ── List all campaigns for current org ───────────────────────────────────────
export function useCampaigns() {
  const { org } = useOrg();
  return useQuery<EmailCampaign[]>({
    queryKey: ["campaigns", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailCampaign[];
    },
    enabled: !!org,
    refetchInterval: 30_000,
  });
}

// ── Single campaign ───────────────────────────────────────────────────────────
export function useCampaign(id: string | null) {
  return useQuery<EmailCampaign | null>({
    queryKey: ["campaigns", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as EmailCampaign | null;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll while sending
      const data = query.state.data as EmailCampaign | null;
      return data?.status === "sending" ? 3000 : data?.status === "sent" ? 30_000 : false;
    },
  });
}

// ── Campaign recipients ───────────────────────────────────────────────────────
export function useCampaignRecipients(campaignId: string | null) {
  return useQuery<EmailCampaignRecipient[]>({
    queryKey: ["campaign-recipients", campaignId],
    queryFn: async () => {
      if (!campaignId) return [];
      const recipients: EmailCampaignRecipient[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("email_campaign_recipients")
          .select("*").eq("campaign_id", campaignId)
          .order("created_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + 999);
        if (error) throw error;
        recipients.push(...(data ?? []) as EmailCampaignRecipient[]);
        if (!data || data.length < 1000) return recipients;
      }
    },
    enabled: !!campaignId,
    refetchInterval: 30_000,
  });
}

// ── Suppressions list ─────────────────────────────────────────────────────────
export function useSuppressions() {
  const { org } = useOrg();
  return useQuery<string[]>({
    queryKey: ["suppressions", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data } = await supabase
        .from("email_suppressions")
        .select("email")
        .eq("org_id", org.id);
      return (data ?? []).map((s: { email: string }) => s.email.toLowerCase());
    },
    enabled: !!org,
  });
}

// ── Create draft campaign + insert recipients ─────────────────────────────────
export function useCreateCampaign() {
  const { org } = useOrg();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      name: string;
      subject: string;
      preview_text: string;
      body_html: string;
      recipients: SelectedRecipient[];
      branch_id?: string | null;
      status?: CampaignStatus;
    }) => {
      if (!org) throw new Error("No org");

      // 1. Insert campaign
      const { data: campaign, error: cErr } = await supabase
        .from("email_campaigns")
        .insert({
          org_id:          org.id,
          branch_id:       payload.branch_id ?? null,
          name:            payload.name,
          subject:         payload.subject,
          preview_text:    payload.preview_text,
          body_html:       payload.body_html,
          recipient_count: payload.recipients.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(payload.status && payload.status !== "draft" ? { status: payload.status as any } : {}),
        })
        .select()
        .single();
      if (cErr || !campaign) throw cErr ?? new Error("Failed to create campaign");
      const newCampaign = campaign as EmailCampaign;

      // 2. Insert recipients (batch) — only when there are any
      if (payload.recipients.length > 0) {
        const rows = payload.recipients.map((r) => ({
          campaign_id: newCampaign.id,
          org_id:      org.id,
          contact_id:  r.contact_id,
          email:       r.email,
          first_name:  r.first_name,
          last_name:   r.last_name,
          company:     r.company,
          title:       r.title,
          status:      "pending" as const,
        }));
        const { error: rErr } = await supabase
          .from("email_campaign_recipients")
          .insert(rows);
        if (rErr) throw rErr;
      }

      return newCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

// ── Update existing campaign fields ──────────────────────────────────────────
export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      subject?: string;
      preview_text?: string;
      body_html?: string;
      recipient_count?: number;
      branch_id?: string | null;
    }) => {
      const { id, ...fields } = payload;
      const { data, error } = await supabase
        .from("email_campaigns")
        .update(fields)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as EmailCampaign;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaigns", data.id] });
    },
  });
}

// ── Upsert campaign recipients (delete + re-insert) ───────────────────────────
export function useUpsertCampaignRecipients() {
  const { org } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, recipients }: { campaignId: string; recipients: SelectedRecipient[] }) => {
      if (!org) throw new Error("No org");
      // Delete existing recipients then re-insert
      await supabase.from("email_campaign_recipients").delete().eq("campaign_id", campaignId);
      if (recipients.length === 0) return;
      const rows = recipients.map((r) => ({
        campaign_id: campaignId,
        org_id: org.id,
        contact_id: r.contact_id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        company: r.company,
        title: r.title,
        status: "pending" as const,
      }));
      const { error } = await supabase.from("email_campaign_recipients").insert(rows);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["campaign-recipients", campaignId] });
    },
  });
}

// ── Send a campaign (calls edge function) ─────────────────────────────────────
export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      return data as { success: boolean; sent: number; failed: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-recipients"] });
    },
  });
}

// ── Delete draft campaign ─────────────────────────────────────────────────────
export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

// Public links are explicitly enabled per sent campaign and can be revoked.
export function useCampaignSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({id, enabled}: {id: string; enabled: boolean}) => {
      const {data, error} = await supabase.from("email_campaigns")
        .update({share_token: enabled ? crypto.randomUUID() : null})
        .eq("id", id).eq("status", "sent").select().single();
      if (error) throw error;
      return data as EmailCampaign;
    },
    onSuccess: () => qc.invalidateQueries({queryKey:["campaigns"]}),
  });
}
