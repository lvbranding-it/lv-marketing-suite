import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Organization } from "@/integrations/supabase/types";

interface OrgContextType {
  org: Organization | null;
  role: "owner" | "admin" | "manager" | "member" | null;
  loading: boolean;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  role: null,
  loading: true,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<"owner" | "admin" | "manager" | "member" | null>(null);
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
        const { data: membership } = await supabase
          .from("team_members")
          .select("org_id, role")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: true })
          .limit(1)
          .single();

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
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [user]);

  return (
    <OrgContext.Provider value={{ org, role, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
