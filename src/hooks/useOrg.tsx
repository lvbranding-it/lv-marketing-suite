import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Organization } from "@/integrations/supabase/types";

const DEFAULT_FEATURES = { campaigns: true, contacts: true, projects: true, skills: true, intake: true };

interface OrgContextType {
  org: Organization | null;
  role: "owner" | "admin" | "manager" | "member" | null;
  featureAccess: Record<string, boolean>;
  loading: boolean;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  role: null,
  featureAccess: DEFAULT_FEATURES,
  loading: true,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<"owner" | "admin" | "manager" | "member" | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrg(null);
      setRole(null);
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

        if (!membership) {
          setOrg(null);
          setRole(null);
          return;
        }

        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", membership.org_id)
          .single();

        setOrg((orgData as Organization) ?? null);
        setRole(membership.role as "owner" | "admin" | "manager" | "member");
        const fa = (membership.feature_access as Record<string, boolean>) ?? DEFAULT_FEATURES;
        setFeatureAccess(fa);
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [user]);

  return (
    <OrgContext.Provider value={{ org, role, featureAccess, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
