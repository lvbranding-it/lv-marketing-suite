import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";

export interface DesignOutputRow {
  id: string;
  org_id: string;
  user_id: string;
  design_type_id: string;
  design_type_name: string;
  title: string | null;
  prompt: string;
  html_output: string;
  is_starred: boolean;
  created_at: string;
  updated_at: string;
}

export function useDesignOutputs(options: { designTypeId?: string; limit?: number } = {}) {
  const { org } = useOrg();
  const { designTypeId, limit } = options;

  return useQuery({
    queryKey: ["design_outputs", org?.id, designTypeId, limit],
    queryFn: async () => {
      if (!org) return [];
      let query = supabase
        .from("design_outputs")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });

      if (designTypeId) query = query.eq("design_type_id", designTypeId);
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DesignOutputRow[];
    },
    enabled: !!org,
  });
}

export function useDesignOutput(id: string | undefined) {
  return useQuery({
    queryKey: ["design_output", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("design_outputs")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as DesignOutputRow;
    },
    enabled: !!id,
  });
}

export function useSaveDesignOutput() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Omit<DesignOutputRow, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("design_outputs")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as DesignOutputRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design_outputs"] });
    },
  });
}

export function useToggleDesignStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_starred }: { id: string; is_starred: boolean }) => {
      const { error } = await supabase
        .from("design_outputs")
        .update({ is_starred })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design_outputs"] });
    },
  });
}

export function useDeleteDesignOutput() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("design_outputs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design_outputs"] });
    },
  });
}
