import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

export interface ContactTagDefinition {
  id: string;
  org_id: string;
  name: string;
  color: string;
  created_at: string;
}

// Preset palette used when auto-assigning a color to a new tag
const COLOR_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#6366f1", "#a855f7",
  "#ec4899", "#64748b",
];

export function pickTagColor(existingColors: string[]): string {
  const used = new Set(existingColors);
  return COLOR_PALETTE.find((c) => !used.has(c)) ?? COLOR_PALETTE[existingColors.length % COLOR_PALETTE.length];
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useContactTagDefinitions() {
  const { org } = useOrg();
  return useQuery<ContactTagDefinition[]>({
    queryKey: ["contact_tag_definitions", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("contact_tag_definitions")
        .select("*")
        .eq("org_id", org.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ContactTagDefinition[];
    },
    enabled: !!org,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateTagDefinition() {
  const { org } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!org) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contact_tag_definitions")
        .insert({ org_id: org.id, name: name.trim(), color })
        .select()
        .single();
      if (error) throw error;
      return data as ContactTagDefinition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact_tag_definitions"] }),
  });
}

export function useUpdateTagDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const updates: Partial<ContactTagDefinition> = {};
      if (name !== undefined) updates.name = name.trim();
      if (color !== undefined) updates.color = color;
      const { error } = await supabase
        .from("contact_tag_definitions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact_tag_definitions"] }),
  });
}

export function useDeleteTagDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contact_tag_definitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact_tag_definitions"] }),
  });
}
