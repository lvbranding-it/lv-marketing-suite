import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  searchTerm,
  type PortalWorkspace,
  type PortalLead,
  type PortalNote,
  type PortalMember,
  type PortalActivity,
} from "@/lib/portal/types";
// Portal tables are introduced by a separately reviewed migration; legacy generated types remain intact.
const db = supabase as any;
export function usePortalWorkspaces(preview = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, "workspaces"],
    enabled: !!user && !preview,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("portal_workspaces");
      if (error) throw error;
      return data as PortalWorkspace[];
    },
  });
}
export function usePortalLeads(
  org: string | undefined,
  options: {
    search: string;
    stage: string;
    priority: string;
    sort: string;
    page: number;
    due: boolean;
  },
  preview = false,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, org, "leads", options],
    enabled: !!user && !!org && !preview,
    queryFn: async () => {
      let query = db
        .from("portal_leads")
        .select("*", { count: "exact" })
        .eq("org_id", org)
        .is("archived_at", null);
      const term = searchTerm(options.search);
      if (term)
        query = query.or(
          ["first_name", "last_name", "company", "email", "phone"]
            .map((k) => `${k}.ilike.%${term}%`)
            .join(","),
        );
      if (options.stage) query = query.eq("shared_stage", options.stage);
      if (options.priority) query = query.eq("priority", options.priority);
      if (options.due) query = query.not("followup_at", "is", null);
      const sort = ["created_at", "updated_at", "followup_at"].includes(
        options.sort,
      )
        ? options.sort
        : "created_at";
      const { data, count, error } = await query
        .order(sort, { ascending: sort === "followup_at", nullsFirst: false })
        .order("id")
        .range(options.page * 20, options.page * 20 + 19);
      if (error) throw error;
      return { rows: data as PortalLead[], count: count as number };
    },
  });
}
export function usePortalStats(org: string | undefined, preview = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, org, "stats"],
    enabled: !!user && !!org && !preview,
    queryFn: async () => {
      const base = () =>
        db
          .from("portal_leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org)
          .is("archived_at", null);
      const results = await Promise.all([
        base().not("shared_stage", "in", "(won,lost,not_a_fit)"),
        base().not("submitted_at", "is", null),
        base().lte("followup_at", new Date().toISOString()),
      ]);
      for (const r of results) if (r.error) throw r.error;
      return results.map((r) => r.count as number);
    },
  });
}
export function usePortalDetail(
  org: string | undefined,
  id: string | undefined,
  preview = false,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, org, "detail", id],
    enabled: !!user && !!org && !!id && !preview,
    queryFn: async () => {
      const results = await Promise.all([
        db
          .from("portal_leads")
          .select("*")
          .eq("org_id", org)
          .eq("id", id)
          .single(),
        db
          .from("portal_notes")
          .select("*")
          .eq("lead_id", id)
          .order("created_at"),
        db
          .from("portal_activities")
          .select("id,action,created_at,detail")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        db.from("portal_sales").select("stage").eq("lead_id", id).maybeSingle(),
      ]);
      for (const r of results) if (r.error) throw r.error;
      return {
        lead: results[0].data as PortalLead,
        notes: results[1].data as PortalNote[],
        activity: results[2].data as PortalActivity[],
        internalStage: results[3].data?.stage as string | undefined,
      };
    },
  });
}
export function usePortalMembers(org: string | undefined, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, org, "members"],
    enabled: !!user && !!org && enabled,
    queryFn: async () => {
      const { data, error } = await db
        .from("portal_memberships")
        .select("user_id,role,display_name,active")
        .eq("org_id", org)
        .order("display_name");
      if (error) throw error;
      return data as PortalMember[];
    },
  });
}
export function usePortalCommand() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["portal", user?.id] });
    return data;
  };
}

export function usePortalNotifications(
  org: string | undefined,
  preview = false,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, org, "notifications"],
    enabled: !!user && !!org && !preview,
    queryFn: async () => {
      const { data, error } = await db
        .from("portal_notifications")
        .select("id,lead_id,kind,created_at,read_at")
        .eq("org_id", org)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as {
        id: string;
        lead_id: string;
        kind: string;
        created_at: string;
        read_at: string | null;
      }[];
    },
  });
}

export interface PortalInvitation {
  id: string;
  invited_email: string;
  display_name: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
}
export function usePortalInvitations(org: string, preview = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal", user?.id, org, "invitations"],
    enabled: !!user && !preview,
    queryFn: async () => {
      const { data, error } = await db
        .from("portal_invitations")
        .select(
          "id,invited_email,display_name,role,created_at,expires_at,accepted_at,cancelled_at",
        )
        .eq("org_id", org)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PortalInvitation[];
    },
  });
}
