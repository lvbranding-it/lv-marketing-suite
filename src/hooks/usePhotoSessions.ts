import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";
import { useAuth } from "./useAuth";
import type {
  PhotoSession,
  SessionPhoto,
  PhotoComment,
  PhotoStatus,
  SessionDeliverable,
  DeliverableQuality,
} from "@/integrations/supabase/types";

// ── Queries ───────────────────────────────────────────────────────────────────

export function usePhotoSessions() {
  const { org } = useOrg();

  return useQuery({
    queryKey: ["photo-sessions", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("photo_sessions")
        .select("*")
        .eq("org_id", org.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PhotoSession[];
    },
    enabled: !!org,
  });
}

export function usePhotoSession(id: string | undefined) {
  return useQuery({
    queryKey: ["photo-session", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("photo_sessions")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as PhotoSession;
    },
    enabled: !!id,
  });
}

export function useSessionPhotos(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-photos", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("session_photos")
        .select("*")
        .eq("session_id", sessionId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SessionPhoto[];
    },
    enabled: !!sessionId,
  });
}

// Public query — no org context needed; used by the client share view
export function useSessionByShareToken(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["session-share", shareToken],
    queryFn: async () => {
      if (!shareToken) return null;
      const { data, error } = await supabase
        .from("photo_sessions")
        .select("*")
        .eq("share_token", shareToken)
        .single();
      if (error) throw error;
      return data as PhotoSession;
    },
    enabled: !!shareToken,
  });
}

// All comments for a session — used to compute per-photo comment counts in one query
export function useSessionComments(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-comments", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("photo_comments")
        .select("id, photo_id")
        .eq("session_id", sessionId);
      if (error) throw error;
      return (data ?? []) as { id: string; photo_id: string }[];
    },
    enabled: !!sessionId,
  });
}

// Public photos query — depends on session resolved via share token
export function usePhotosForSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-photos-public", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("session_photos")
        .select("*")
        .eq("session_id", sessionId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SessionPhoto[];
    },
    enabled: !!sessionId,
  });
}

export function usePhotoComments(photoId: string | undefined) {
  return useQuery({
    queryKey: ["photo-comments", photoId],
    queryFn: async () => {
      if (!photoId) return [];
      const { data, error } = await supabase
        .from("photo_comments")
        .select("*")
        .eq("photo_id", photoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhotoComment[];
    },
    enabled: !!photoId,
  });
}

// Signed URL query — staleTime 50 min so URLs refresh before they expire (1 hr)
export function useSignedUrl(storagePath: string | undefined) {
  return useQuery({
    queryKey: ["signed-url", storagePath],
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from("session-photos")
        .createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 50,
  });
}

// Signed URL for deliverables (private bucket — never use getPublicUrl)
export function useDeliverableSignedUrl(storagePath: string | undefined) {
  return useQuery({
    queryKey: ["deliverable-signed-url", storagePath],
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from("session-deliverables")
        .createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 50,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

type CreateSessionInput = {
  name: string;
  client_name: string;
  client_email?: string;
  cc_emails?: string[];
  photo_limit?: number;
  extra_photo_price?: number;
  allow_zip_download?: boolean;
  invoice_type?: "none" | "session" | "manual";
  session_fee?: number;
};

export function useCreateSession() {
  const queryClient = useQueryClient();
  const { org } = useOrg();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: CreateSessionInput) => {
      if (!org || !user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("photo_sessions")
        .insert({
          org_id: org.id,
          created_by: user.id,
          name: values.name,
          client_name: values.client_name,
          client_email: values.client_email ?? null,
          cc_emails: values.cc_emails ?? [],
          photo_limit: values.photo_limit ?? 0,
          extra_photo_price: values.extra_photo_price ?? 0,
          allow_zip_download: values.allow_zip_download ?? false,
          invoice_type: values.invoice_type ?? "none",
          session_fee: values.session_fee ?? 0,
        })
        .select()
        .single();
      if (error) throw error;

      // ── Auto-create contact for the primary client email ───────────────────
      if (values.client_email) {
        try {
          const { data: existing } = await supabase
            .from("contacts")
            .select("id")
            .eq("org_id", org.id)
            .eq("email", values.client_email)
            .maybeSingle();

          if (!existing) {
            const nameParts = values.client_name.trim().split(/\s+/);
            const firstName = nameParts[0] ?? values.client_name;
            const lastName = nameParts.slice(1).join(" ") || null;
            await supabase.from("contacts").insert({
              org_id: org.id,
              created_by: user.id,
              first_name: firstName,
              last_name: lastName,
              email: values.client_email,
              source: "manual",
              pipeline_stage: "lead",
              signals: [],
              raw_data: { from_photo_session: true },
            });
          }
        } catch {
          // Non-fatal — session was created successfully
        }
      }

      return data as PhotoSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<PhotoSession> & { id: string }) => {
      const { data, error } = await supabase
        .from("photo_sessions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PhotoSession;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", data.id] });
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
    },
  });
}

export function useArchiveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("photo_sessions")
        .update({ status: "archived" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("photo_sessions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
    },
  });
}

export function useUpdatePhotoStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      photoId,
      sessionId,
      status,
    }: {
      photoId: string;
      sessionId: string;
      status: PhotoStatus;
    }) => {
      const { error } = await supabase
        .from("session_photos")
        .update({ status })
        .eq("id", photoId);
      if (error) throw error;
      return { photoId, sessionId };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["session-photos", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["session-photos-public", sessionId] });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      photoId,
      sessionId,
      storagePath,
    }: {
      photoId: string;
      sessionId: string;
      storagePath: string;
    }) => {
      // Remove from storage first
      await supabase.storage.from("session-photos").remove([storagePath]);
      // Then delete the DB row (cascade removes comments too)
      const { error } = await supabase
        .from("session_photos")
        .delete()
        .eq("id", photoId);
      if (error) throw error;
      return { sessionId };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["session-photos", sessionId] });
    },
  });
}

export function useFinalizeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareToken: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/finalize-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
        },
        body: JSON.stringify({ share_token: shareToken }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to finalize session");
      }

      return (await res.json()) as {
        ok: boolean;
        wave_invoice_url: string | null;
        extra_count: number;
        extra_total: number;
      };
    },
    onSuccess: (_data, shareToken) => {
      queryClient.invalidateQueries({ queryKey: ["session-share", shareToken] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      photoId,
      sessionId,
      orgId,
      body,
      authorLabel,
      authorUserId,
    }: {
      photoId: string;
      sessionId: string;
      orgId: string;
      body: string;
      authorLabel: string;
      authorUserId: string | null;
    }) => {
      const { data, error } = await supabase
        .from("photo_comments")
        .insert({
          photo_id: photoId,
          session_id: sessionId,
          org_id: orgId,
          body,
          author_label: authorLabel,
          author_user_id: authorUserId,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PhotoComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["photo-comments", data.photo_id] });
    },
  });
}

// ── Upload helper (not a React Query mutation — used directly in PhotoUploadZone) ──

export type UploadProgressCallback = (filename: string, progress: number) => void;

export async function uploadPhoto(
  file: File,
  sessionId: string,
  orgId: string,
  onProgress?: UploadProgressCallback
): Promise<SessionPhoto> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${sessionId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("session-photos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  onProgress?.(file.name, 100);

  const { data, error: insertError } = await supabase
    .from("session_photos")
    .insert({
      session_id: sessionId,
      org_id: orgId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || `image/${ext}`,
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return data as SessionPhoto;
}

// ── Deliverables ──────────────────────────────────────────────────────────────

export function useSessionDeliverables(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-deliverables", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("session_deliverables")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SessionDeliverable[];
    },
    enabled: !!sessionId,
  });
}

export function useDeleteDeliverable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sessionId, storagePath }: { id: string; sessionId: string; storagePath: string }) => {
      await supabase.storage.from("session-deliverables").remove([storagePath]);
      const { error } = await supabase.from("session_deliverables").delete().eq("id", id);
      if (error) throw error;
      return { sessionId };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["session-deliverables", sessionId] });
    },
  });
}

export type DeliverableUploadProgressCallback = (filename: string, progress: number) => void;

export async function uploadDeliverable(
  file: File,
  sessionId: string,
  orgId: string,
  quality: DeliverableQuality,
  onProgress?: DeliverableUploadProgressCallback
): Promise<SessionDeliverable> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${sessionId}/${quality}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("session-deliverables")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) throw uploadError;
  onProgress?.(file.name, 100);

  const { data, error: insertError } = await supabase
    .from("session_deliverables")
    .insert({
      session_id: sessionId,
      org_id: orgId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      quality,
      mime_type: file.type || "application/octet-stream",
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return data as SessionDeliverable;
}

// ── Invoice mutations ─────────────────────────────────────────────────────────

export function useCreateSessionInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`${supabaseUrl}/functions/v1/create-session-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create invoice");
      }
      return (await res.json()) as { ok: boolean; invoice_url: string | null };
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
    },
  });
}

export function useSendSessionInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`${supabaseUrl}/functions/v1/send-session-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to send invoice");
      }
      return (await res.json()) as { ok: boolean };
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
    },
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("photo_sessions")
        .update({ session_invoice_paid_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
    },
  });
}

// ── Top-up (extras) invoice mutations ────────────────────────────────────────

export function useCreateTopupInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`${supabaseUrl}/functions/v1/create-topup-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create top-up invoice");
      }
      return (await res.json()) as { ok: boolean; invoice_url: string | null };
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
    },
  });
}

export function useSendTopupInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`${supabaseUrl}/functions/v1/send-topup-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to send top-up invoice");
      }
      return (await res.json()) as { ok: boolean };
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
    },
  });
}

export function useMarkTopupPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("photo_sessions")
        .update({ topup_invoice_paid_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
    },
  });
}

// ── Publish deliverables (mark ready + notify client) ────────────────────────

export function usePublishDeliverables() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`${supabaseUrl}/functions/v1/publish-deliverables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to publish deliverables");
      }
      return (await res.json()) as { ok: boolean; notified: boolean };
    },
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["session-deliverables", sessionId] });
    },
  });
}
