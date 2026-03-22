import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";

export interface ImportedContact {
  id: string;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  employees_range: string | null;
  fit_score: number | null;
  signals: string[];
  source: "manual" | "vibe" | "apollo";
  source_id: string | null;
  apollo_id: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  pipeline_stage?: "lead" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  deal_value?: number | null;
  deal_probability?: number | null;
  last_contacted_at?: string | null;
  next_followup_at?: string | null;
  tags?: string[];
  crm_notes?: string | null;
}

export type NewContact = Omit<ImportedContact, "id" | "org_id" | "created_at" | "updated_at">;

export function useImportedContacts() {
  const { org } = useOrg();
  return useQuery<ImportedContact[]>({
    queryKey: ["contacts", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportedContact[];
    },
    enabled: !!org,
  });
}

export function useImportContact() {
  const { org } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Omit<NewContact, "created_by">) => {
      if (!org || !user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...contact, org_id: org.id, created_by: user.id, raw_data: contact.raw_data as import("@/integrations/supabase/types").Json })
        .select()
        .single();
      if (error) throw error;
      return data as ImportedContact;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: Partial<ImportedContact> & { id: string }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ ...fields, raw_data: (fields.raw_data ?? {}) as import("@/integrations/supabase/types").Json })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUpdateContactApolloId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, apollo_id }: { id: string; apollo_id: string }) => {
      const { error } = await supabase.from("contacts").update({ apollo_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}
