import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";
import { useAuth } from "./useAuth";

export function useActivityLog() {
  const { org } = useOrg();
  const { user } = useAuth();

  const log = async (
    action: string,
    entityType?: string,
    entityId?: string,
    entityLabel?: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!org || !user) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("activity_log").insert({
        org_id:       org.id,
        user_id:      user.id,
        user_email:   user.email ?? "",
        action,
        entity_type:  entityType  ?? null,
        entity_id:    entityId    ?? null,
        entity_label: entityLabel ?? null,
        metadata:     metadata    ?? {},
      });
    } catch {
      // Silent — logging must never break the UI
    }
  };

  return { log };
}
