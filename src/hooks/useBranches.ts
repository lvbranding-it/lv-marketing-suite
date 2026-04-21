import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";
import type { BranchTeamMember, BranchUsageEvent, OrgBranch } from "@/integrations/supabase/types";

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

export function useMyBranchMemberships() {
  const { org, role } = useOrg();
  const { user } = useAuth();

  return useQuery<BranchTeamMember[]>({
    queryKey: ["my_branch_team_members", org?.id, user?.id],
    queryFn: async () => {
      if (!org || !user) return [];
      if (role === "owner" || role === "admin") return [];

      const { data, error } = await supabase
        .from("branch_team_members")
        .select("*")
        .eq("org_id", org.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []) as BranchTeamMember[];
    },
    enabled: !!org && !!user,
  });
}

export function useAccessibleBranches() {
  const { role } = useOrg();
  const branchesQuery = useOrgBranches();
  const membershipsQuery = useMyBranchMemberships();

  const canViewAllBranches = role === "owner" || role === "admin";
  const assignedBranchIds = useMemo(
    () => new Set((membershipsQuery.data ?? []).map((membership) => membership.branch_id)),
    [membershipsQuery.data]
  );

  const branches = useMemo(() => {
    const allBranches = branchesQuery.data ?? [];
    if (canViewAllBranches || assignedBranchIds.size === 0) return allBranches;
    return allBranches.filter((branch) => assignedBranchIds.has(branch.id));
  }, [assignedBranchIds, branchesQuery.data, canViewAllBranches]);

  return {
    ...branchesQuery,
    data: branches,
    allBranches: branchesQuery.data ?? [],
    assignedBranchIds,
    canViewAllBranches,
    isBranchRestricted: !canViewAllBranches && assignedBranchIds.size > 0,
    isLoading: branchesQuery.isLoading || membershipsQuery.isLoading,
  };
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

const COUNTRY_CODE_BY_NAME: Record<string, string> = {
  argentina: "AR",
  brazil: "BR",
  canada: "CA",
  chile: "CL",
  colombia: "CO",
  "costa rica": "CR",
  dominican: "DO",
  "dominican republic": "DO",
  ecuador: "EC",
  guatemala: "GT",
  mexico: "MX",
  panama: "PA",
  peru: "PE",
  spain: "ES",
  "united states": "US",
  usa: "US",
  us: "US",
  venezuela: "VE",
};

function flagFromCountryCode(countryCode: string) {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(
    ...normalized.split("").map((letter) => 127397 + letter.charCodeAt(0))
  );
}

export function getBranchFlag(branch: Pick<OrgBranch, "country" | "country_flag">) {
  const customFlag = branch.country_flag?.trim();
  if (customFlag) return customFlag;

  const code = COUNTRY_CODE_BY_NAME[branch.country.trim().toLowerCase()];
  return code ? flagFromCountryCode(code) : "";
}

export function formatBranchLocalTime(timezone: string, locale = "en-US") {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return timezone;
  }
}
