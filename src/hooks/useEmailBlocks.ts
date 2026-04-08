import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

export interface EmailBlock {
  id: string;
  org_id: string;
  name: string;
  html: string;
  category: string;
  created_by: string | null;
  created_at: string;
}

export function useEmailBlocks() {
  const { org } = useOrg();
  return useQuery<EmailBlock[]>({
    queryKey: ["email-blocks", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("email_blocks")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailBlock[];
    },
    enabled: !!org,
  });
}

export function useSaveEmailBlock() {
  const { org } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; html: string; category?: string }) => {
      if (!org) throw new Error("No org");
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("email_blocks")
        .insert({
          org_id: org.id,
          name: payload.name,
          html: payload.html,
          category: payload.category ?? "custom",
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as EmailBlock;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-blocks"] }),
  });
}

export function useDeleteEmailBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-blocks"] }),
  });
}
