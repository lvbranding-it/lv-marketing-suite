import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import type { BranchUsageEvent, OrgBranch } from "@/integrations/supabase/types";

export type BranchFilterValue = "all" | "unassigned" | string;

export function useOrgBranches() {
  const { org } = useOrg();

  return useQuery<OrgBranch[]>({
    queryKey: ["org_branches", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("org_branches")
        .select("*")
        .eq("org_id", org.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrgBranch[];
    },
    enabled: !!org,
  });
}

export function useBranchUsageEvents(days = 30) {
  const { org } = useOrg();

  return useQuery<BranchUsageEvent[]>({
    queryKey: ["branch_usage_events", org?.id, days],
    queryFn: async () => {
      if (!org) return [];
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from("branch_usage_events")
        .select("*")
        .eq("org_id", org.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BranchUsageEvent[];
    },
    enabled: !!org,
  });
}

export function useBranchUsageSummary(days = 30) {
  const { data: branches = [] } = useOrgBranches();
  const { data: events = [], isLoading } = useBranchUsageEvents(days);

  const summary = useMemo(() => {
    const usageByBranch = events.reduce<Record<string, { events: number; units: number; costCents: number }>>(
      (acc, event) => {
        const key = event.branch_id ?? "unassigned";
        const current = acc[key] ?? { events: 0, units: 0, costCents: 0 };
        acc[key] = {
          events: current.events + 1,
          units: current.units + event.units,
          costCents: current.costCents + event.estimated_cost_cents,
        };
        return acc;
      },
      {}
    );

    return branches.map((branch) => ({
      branch,
      events: usageByBranch[branch.id]?.events ?? 0,
      units: usageByBranch[branch.id]?.units ?? 0,
      costCents: usageByBranch[branch.id]?.costCents ?? 0,
    }));
  }, [branches, events]);

  return { summary, events, isLoading };
}

export function branchMatchesFilter(
  branchId: string | null | undefined,
  filter: BranchFilterValue
) {
  if (filter === "all") return true;
  if (filter === "unassigned") return !branchId;
  return branchId === filter;
}
