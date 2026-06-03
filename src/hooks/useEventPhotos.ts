import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EventPhoto {
  id:               string;
  event_id:         string;
  org_id:           string;
  image_path:       string;
  attendee_name:    string | null;
  caption:          string | null;
  status:           "pending" | "approved" | "rejected" | "featured";
  is_featured:      boolean;
  upload_source:    "camera" | "gallery";
  consent_accepted: boolean;
  uploaded_at:      string;
  approved_at:      string | null;
  rejected_at:      string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export function getPhotoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/event-photos/${path}`;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useEventPhotos(eventId: string | undefined, statusFilter: string = "all") {
  return useQuery({
    queryKey: ["event_photos", eventId, statusFilter],
    enabled:  !!eventId,
    queryFn:  async () => {
      let q = db().from("event_photos").select("*").eq("event_id", eventId);
      if (statusFilter !== "all") {
        if (statusFilter === "approved") q = q.in("status", ["approved", "featured"]);
        else q = q.eq("status", statusFilter);
      }
      const { data, error } = await q.order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventPhoto[];
    },
  });
}

export function useApprovedEventPhotos(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event_photos_approved", eventId],
    enabled:  !!eventId,
    queryFn:  async () => {
      const { data, error } = await db()
        .from("event_photos")
        .select("*")
        .eq("event_id", eventId)
        .in("status", ["featured", "approved"])
        .order("is_featured", { ascending: false })
        .order("approved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventPhoto[];
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpdatePhotoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, status, eventId,
    }: { id: string; status: EventPhoto["status"]; eventId: string }) => {
      const updates: Record<string, unknown> = {
        status,
        is_featured: status === "featured",
      };
      if (status === "approved" || status === "featured") updates.approved_at = new Date().toISOString();
      if (status === "rejected") updates.rejected_at = new Date().toISOString();
      const { error } = await db().from("event_photos").update(updates).eq("id", id);
      if (error) throw error;
      return { eventId };
    },
    onSuccess: ({ eventId }) => {
      qc.invalidateQueries({ queryKey: ["event_photos", eventId] });
      qc.invalidateQueries({ queryKey: ["event_photos_approved", eventId] });
      qc.invalidateQueries({ queryKey: ["event_photo_counts"] });
    },
  });
}

export function useDeleteEventPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, imagePath, eventId,
    }: { id: string; imagePath: string; eventId: string }) => {
      await supabase.storage.from("event-photos").remove([imagePath]);
      const { error } = await db().from("event_photos").delete().eq("id", id);
      if (error) throw error;
      return { eventId };
    },
    onSuccess: ({ eventId }) => {
      qc.invalidateQueries({ queryKey: ["event_photos", eventId] });
      qc.invalidateQueries({ queryKey: ["event_photos_approved", eventId] });
      qc.invalidateQueries({ queryKey: ["event_photo_counts"] });
    },
  });
}

// ── Upload (public — no auth) ─────────────────────────────────────────────────

/** Compress an image using canvas — max 1920px, JPEG 0.85 */
export async function compressImage(file: File): Promise<Blob> {
  const MAX = 1920;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio  = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}

interface UploadPhotoParams {
  eventId:      string;
  orgId:        string;
  file:         File;
  source:       "camera" | "gallery";
  name?:        string;
  caption?:     string;
  consent:      boolean;
  autoApprove:  boolean;
}

export async function uploadEventPhoto({
  eventId, orgId, file, source, name, caption, consent, autoApprove,
}: UploadPhotoParams): Promise<void> {
  // Compress
  const blob     = await compressImage(file);
  const filePath = `${eventId}/${crypto.randomUUID()}.jpg`;

  // Upload to storage
  const { error: storageErr } = await supabase.storage
    .from("event-photos")
    .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });
  if (storageErr) throw new Error(storageErr.message);

  // Insert DB record
  const status = autoApprove ? "approved" : "pending";
  const { error: dbErr } = await db().from("event_photos").insert({
    event_id:        eventId,
    org_id:          orgId,
    image_path:      filePath,
    attendee_name:   name?.trim() || null,
    caption:         caption?.trim() || null,
    status,
    is_featured:     false,
    upload_source:   source,
    consent_accepted: consent,
    ...(autoApprove ? { approved_at: new Date().toISOString() } : {}),
  });
  if (dbErr) {
    await supabase.storage.from("event-photos").remove([filePath]);
    throw new Error(dbErr.message);
  }
}
