import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentRun {
  id:               string;
  org_id:           string;
  project_id:       string;
  agent_id:         string;
  agent_pack_version: string;
  input:            { text?: string };
  output_full_text: string;
  output_sections:  { key: string; title: string; content: string }[];
  brand_snapshot:   Record<string, unknown>;
  snapshot_delta:   Record<string, unknown>;
  language_control: { language?: string };
  mode:             string;
  model:            string;
  parent_run_id:    string | null;
  status:           string;
  usage:            { input_tokens?: number; output_tokens?: number };
  error:            string | null;
  completed_at:     string | null;
  created_at:       string;
}

export interface RunResult {
  runId:          string;
  agentId:        string;
  outputFullText: string;
  outputSections: { key: string; title: string; content: string }[];
  brandSnapshot:  Record<string, unknown>;
  snapshotDelta:  Record<string, unknown>;
  usage:          Record<string, unknown>;
  status:         string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useAgentRuns(projectId: string | undefined) {
  return useQuery({
    queryKey:  ["agent_runs", projectId],
    enabled:   !!projectId,
    queryFn:   async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("agent_runs")
        .select("id, agent_id, mode, status, created_at, input, parent_run_id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<AgentRun, "id" | "agent_id" | "mode" | "status" | "created_at" | "input" | "parent_run_id">[];
    },
  });
}

export function useAgentRun(runId: string | undefined) {
  return useQuery({
    queryKey: ["agent_run", runId],
    enabled:  !!runId,
    queryFn:  async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("agent_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (error) throw error;
      return data as AgentRun;
    },
  });
}

/** Returns a map of project_id → agent run count for the current org */
export function useAgentRunCounts() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["agent_run_counts", org?.id],
    enabled: !!org,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("agent_runs")
        .select("project_id")
        .eq("org_id", org!.id);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { project_id: string }[]) {
        if (row.project_id) counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

// ── Mutation: run an agent ────────────────────────────────────────────────────

interface RunAgentParams {
  orgId:               string;
  projectId:           string;
  agentId:             string;
  input:               string;
  languageControl?:    { language: string };
  mode?:               "create" | "revise";
  parentRunId?:        string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
}

export function useRunAgent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: RunAgentParams): Promise<RunResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/agent-run`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${session.access_token}`,
          apikey:          supabaseKey,
        },
        body: JSON.stringify(params),
      });

      if (res.status === 429) throw new Error("Rate limit exceeded. Please wait and try again.");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error?: string }).error ?? "Failed to run agent");
      }

      return res.json() as Promise<RunResult>;
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["agent_runs", projectId] });
    },
  });
}
