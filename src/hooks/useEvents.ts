import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LVEvent {
  id:                        string;
  org_id:                    string;
  name:                      string;
  slug:                      string;
  status:                    "draft" | "active" | "paused" | "completed";
  event_date:                string | null;
  venue_name:                string | null;
  city:                      string | null;
  state:                     string | null;
  logo_url:                  string | null;
  sponsor_logo_urls:         string[];
  primary_color:             string;
  secondary_color:           string;
  accent_color:              string;
  theme:                     string;
  upload_headline:           string;
  upload_subheadline:        string | null;
  confirmation_message:      string | null;
  screen_headline:           string | null;
  screen_subheadline:        string | null;
  lower_third_text:          string | null;
  sponsor_message:           string | null;
  require_caption:           boolean;
  require_name:              boolean;
  require_consent:           boolean;
  auto_approve:              boolean;
  allow_camera_capture:      boolean;
  allow_gallery_upload:      boolean;
  camera_mode:               "rear" | "front" | "both";
  selfie_button_label:       string;
  rear_camera_button_label:  string;
  gallery_button_label:      string;
  slideshow_interval_seconds: number;
  show_captions:             boolean;
  show_names:                boolean;
  show_sponsors:             boolean;
  show_logo:                 boolean;
  show_qr_code_on_screen:    boolean;
  created_at:                string;
  updated_at:                string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

// ── Queries ───────────────────────────────────────────────────────────────────

export function useEvents() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["events", org?.id],
    enabled:  !!org,
    queryFn:  async () => {
      const { data, error } = await db()
        .from("events")
        .select("*")
        .eq("org_id", org!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LVEvent[];
    },
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event", eventId],
    enabled:  !!eventId,
    queryFn:  async () => {
      const { data, error } = await db()
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data as LVEvent;
    },
  });
}

export function useEventBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["event_slug", slug],
    enabled:  !!slug,
    queryFn:  async () => {
      const { data, error } = await db()
        .from("events")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .single();
      if (error) throw error;
      return data as LVEvent;
    },
  });
}

export function useEventPhotoCounts(eventIds: string[]) {
  return useQuery({
    queryKey: ["event_photo_counts", eventIds.join(",")],
    enabled:  eventIds.length > 0,
    queryFn:  async () => {
      const { data, error } = await db()
        .from("event_photos")
        .select("event_id, status")
        .in("event_id", eventIds);
      if (error) throw error;
      const counts: Record<string, { total: number; pending: number; approved: number }> = {};
      for (const row of (data ?? []) as { event_id: string; status: string }[]) {
        if (!counts[row.event_id]) counts[row.event_id] = { total: 0, pending: 0, approved: 0 };
        counts[row.event_id].total++;
        if (row.status === "pending") counts[row.event_id].pending++;
        if (row.status === "approved" || row.status === "featured") counts[row.event_id].approved++;
      }
      return counts;
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateEvent() {
  const { org } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<LVEvent>): Promise<LVEvent> => {
      if (!org) throw new Error("No organisation");
      const { data, error } = await db()
        .from("events")
        .insert({ ...values, org_id: org.id })
        .select()
        .single();
      if (error) throw error;
      return data as LVEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", org?.id] }),
  });
}

export function useUpdateEvent() {
  const { org } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<LVEvent> & { id: string }): Promise<LVEvent> => {
      const { data, error } = await db()
        .from("events")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as LVEvent;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["events", org?.id] });
      qc.invalidateQueries({ queryKey: ["event", id] });
    },
  });
}

export function useDeleteEvent() {
  const { org } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", org?.id] }),
  });
}
