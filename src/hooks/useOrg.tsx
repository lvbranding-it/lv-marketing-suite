import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { BranchTeamMember, Organization } from "@/integrations/supabase/types";

const DEFAULT_FEATURES = { campaigns: true, contacts: true, projects: true, skills: true, intake: true };
type OrgRole = "owner" | "admin" | "manager" | "member";
type BranchRole = "regional_ceo" | "manager" | "crew";

interface OrgContextType {
  org: Organization | null;
  role: OrgRole | null;
  branchRole: BranchRole | null;
  branchMemberships: BranchTeamMember[];
  isBranchOnly: boolean;
  featureAccess: Record<string, boolean>;
  loading: boolean;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  role: null,
  branchRole: null,
  branchMemberships: [],
  isBranchOnly: false,
  featureAccess: DEFAULT_FEATURES,
  loading: true,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [branchRole, setBranchRole] = useState<BranchRole | null>(null);
  const [branchMemberships, setBranchMemberships] = useState<BranchTeamMember[]>([]);
  const [isBranchOnly, setIsBranchOnly] = useState(false);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrg(null);
      setRole(null);
      setBranchRole(null);
      setBranchMemberships([]);
      setIsBranchOnly(false);
      setFeatureAccess(DEFAULT_FEATURES);
      setLoading(false);
      return;
    }

    const fetchOrg = async () => {
      setLoading(true);
      try {
        // Get the first org this user belongs to
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: membership } = await (supabase as any)
          .from("team_members")
          .select("org_id, role, feature_access")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: true })
          .limit(1)
          .single() as { data: { org_id: string; role: string; feature_access: Record<string, boolean> | null } | null };

        const { data: branchRows } = await (supabase as any)
          .from("branch_team_members")
          .select("*")
          .eq("user_id", user.id)
          .order("assigned_at", { ascending: true }) as { data: BranchTeamMember[] | null };

        const memberships = branchRows ?? [];
        const firstBranchMembership = memberships[0];
        const hasHqMembershipForBranchOrg = memberships.some((branchMembership) =>
          branchMembership.org_id === membership?.org_id
        );

        if (membership && (!firstBranchMembership || hasHqMembershipForBranchOrg)) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("*")
            .eq("id", membership.org_id)
            .single();

          setOrg((orgData as Organization) ?? null);
          setRole(membership.role as OrgRole);
          setBranchRole(null);
          setBranchMemberships([]);
          setIsBranchOnly(false);
          const fa = (membership.feature_access as Record<string, boolean>) ?? DEFAULT_FEATURES;
          setFeatureAccess(fa);
          return;
        }

        if (!firstBranchMembership) {
          setOrg(null);
          setRole(null);
          setBranchRole(null);
          setBranchMemberships([]);
          setIsBranchOnly(false);
          setFeatureAccess(DEFAULT_FEATURES);
          return;
        }

        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", firstBranchMembership.org_id)
          .single();

        setOrg((orgData as Organization) ?? null);
        setRole(null);
        setBranchRole(firstBranchMembership.role as BranchRole);
        setBranchMemberships(memberships);
        setIsBranchOnly(true);
        setFeatureAccess(DEFAULT_FEATURES);
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [user]);

  return (
    <OrgContext.Provider value={{ org, role, branchRole, branchMemberships, isBranchOnly, featureAccess, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
