import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";
import type { SkillOutputRow } from "@/integrations/supabase/types";

interface UseSkillOutputsOptions {
  projectId?: string;
  skillId?: string;
  limit?: number;
}

export function useSkillOutputs(options: UseSkillOutputsOptions = {}) {
  const { org } = useOrg();
  const { projectId, skillId, limit } = options;

  return useQuery({
    queryKey: ["skill_outputs", org?.id, projectId, skillId, limit],
    queryFn: async () => {
      if (!org) return [];
      let query = supabase
        .from("skill_outputs")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });

      if (projectId) query = query.eq("project_id", projectId);
      if (skillId) query = query.eq("skill_id", skillId);
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SkillOutputRow[];
    },
    enabled: !!org,
  });
}

export function useSkillOutput(id: string | undefined) {
  return useQuery({
    queryKey: ["skill_output", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("skill_outputs")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as SkillOutputRow;
    },
    enabled: !!id,
  });
}

export function useSaveSkillOutput() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      values: Omit<SkillOutputRow, "id" | "created_at" | "updated_at">
    ) => {
      const { data, error } = await supabase
        .from("skill_outputs")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as SkillOutputRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill_outputs"] });
    },
  });
}

export function useUpdateSkillOutput() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<SkillOutputRow> & { id: string }) => {
      const { data, error } = await supabase
        .from("skill_outputs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as SkillOutputRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill_outputs"] });
    },
  });
}

export function useDeleteSkillOutput() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("skill_outputs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill_outputs"] });
    },
  });
}
