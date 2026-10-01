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
import { splitName, type SessionClient } from "@/lib/photo-sessions/clients";

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

// ── The client's view, through the share link ────────────────────────────────
//
// The client page has no login. It used to read the photo tables directly,
// under rules that let anyone with the public key list every session, photo and
// comment. It now goes through database functions that answer for one share
// link only (migration 20261001160000).

/** What the client page knows about its session. */
export type ClientSession = Pick<
  PhotoSession,
  | "id" | "name" | "client_name" | "photo_limit" | "extra_photo_price" | "allow_zip_download"
  | "multi_round_enabled" | "max_rounds" | "current_round" | "finalized_at" | "wave_invoice_url"
  | "deliverables_ready_at"
>;

/** A photo as the client sees it: no storage path, links come from get-photo-urls. */
export type ClientPhoto = Pick<
  SessionPhoto,
  "id" | "session_id" | "file_name" | "status" | "selection_round" | "display_order" | "created_at"
>;

export type ClientComment = Pick<PhotoComment, "id" | "photo_id" | "body" | "author_label" | "created_at">;

// The share-link functions are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (supabase as any).rpc(fn, args);

export function useSessionByShareToken(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["session-share", shareToken],
    queryFn: async () => {
      if (!shareToken) return null;
      const { data, error } = await rpc("get_photo_session_by_token", { p_token: shareToken }).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClientSession | null;
    },
    enabled: !!shareToken,
  });
}

export function useClientSessionPhotos(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["client-session-photos", shareToken],
    queryFn: async () => {
      if (!shareToken) return [];
      const { data, error } = await rpc("get_session_photos_by_token", { p_token: shareToken });
      if (error) throw error;
      return (data ?? []) as ClientPhoto[];
    },
    enabled: !!shareToken,
  });
}

export function useClientSessionComments(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["client-session-comments", shareToken],
    queryFn: async () => {
      if (!shareToken) return [];
      const { data, error } = await rpc("get_session_comments_by_token", { p_token: shareToken });
      if (error) throw error;
      return (data ?? []) as ClientComment[];
    },
    enabled: !!shareToken,
  });
}

/**
 * Select or unselect a photo as the client.
 *
 * The tick changes on screen at once and rolls back if the save is refused. With
 * 172 photos, waiting on a full reload of the list after every tap made picking
 * feel stuck.
 */
export function useSetClientPhotoSelection(shareToken: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["client-session-photos", shareToken];

  return useMutation({
    mutationFn: async ({ photoId, selected }: { photoId: string; selected: boolean }) => {
      const { error } = await rpc("set_client_photo_selection", { p_token: shareToken, p_photo_id: photoId, p_selected: selected });
      if (error) throw error;
    },
    onMutate: async ({ photoId, selected }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ClientPhoto[]>(key);
      queryClient.setQueryData<ClientPhoto[]>(key, (photos) =>
        photos?.map((photo) => photo.id === photoId ? { ...photo, status: selected ? "selected" : "not_selected" } : photo),
      );
      return { previous };
    },
    onError: (_error, _values, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useAddClientComment(shareToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ photoId, body }: { photoId: string; body: string }) => {
      const { data, error } = await rpc("add_client_photo_comment", { p_token: shareToken, p_photo_id: photoId, p_body: body });
      if (error) throw error;
      return data as ClientComment[];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-session-comments", shareToken] }),
  });
}

// All comments for a session — used to show inline comment previews and counts in the grid
export function useSessionComments(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-comments", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("photo_comments")
        .select("id, photo_id, body, author_label")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; photo_id: string; body: string; author_label: string }[];
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

/**
 * Signed URL query — staleTime 50 min so URLs refresh before they expire (1 hr).
 *
 * With a width, the link is to a resized copy. The session grid used the
 * originals, so opening a 172-photo session downloaded every full-size file
 * (about 500 MB) to show squares a couple of hundred pixels wide. `enabled`
 * lets a caller wait until the picture is actually on screen.
 */
export function useSignedUrl(storagePath: string | undefined, options: { width?: number; enabled?: boolean } = {}) {
  const { width, enabled = true } = options;
  return useQuery({
    queryKey: ["signed-url", storagePath, width ?? "original"],
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from("session-photos")
        .createSignedUrl(
          storagePath,
          3600,
          width ? { transform: { width, height: width, resize: "contain", quality: 75 } } : undefined,
        );
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
    enabled: !!storagePath && enabled,
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

/**
 * The contact a session's client is, adding them to the contacts when they
 * are new. A contact chosen without an email gets the one typed for the
 * session. Returns null when the contact could not be added: the session is
 * still saved, just not linked.
 */
async function linkClientContact({
  client,
  orgId,
  userId,
  branchId,
}: {
  client: SessionClient;
  orgId: string;
  userId: string;
  branchId: string | null;
}): Promise<string | null> {
  const email = client.email.trim();
  try {
    if (client.contactId) {
      if (email) {
        await supabase.from("contacts").update({ email }).eq("id", client.contactId).is("email", null);
      }
      return client.contactId;
    }

    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (existing) return existing.id as string;
    }

    const { data: added, error } = await supabase
      .from("contacts")
      .insert({
        org_id: orgId,
        branch_id: branchId,
        created_by: userId,
        ...splitName(client.name),
        email: email || null,
        source: "manual",
        pipeline_stage: "won",
        signals: [],
        raw_data: { from_photo_session: true },
      })
      .select("id")
      .single();
    if (error) throw error;
    return added.id as string;
  } catch {
    return null;
  }
}

type CreateSessionInput = {
  name: string;
  branch_id?: string | null;
  client: SessionClient;
  cc_emails?: string[];
  photo_limit?: number;
  extra_photo_price?: number;
  allow_zip_download?: boolean;
  invoice_type?: "none" | "session" | "manual";
  session_fee?: number;
  multi_round_enabled?: boolean;
  max_rounds?: number;
};

export function useCreateSession() {
  const queryClient = useQueryClient();
  const { org } = useOrg();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: CreateSessionInput) => {
      if (!org || !user) throw new Error("Not authenticated");
      const contactId = await linkClientContact({
        client: values.client,
        orgId: org.id,
        userId: user.id,
        branchId: values.branch_id ?? null,
      });
      const { data, error } = await supabase
        .from("photo_sessions")
        .insert({
          org_id: org.id,
          branch_id: values.branch_id ?? null,
          created_by: user.id,
          name: values.name,
          contact_id: contactId,
          client_name: values.client.name.trim(),
          client_email: values.client.email.trim() || null,
          cc_emails: values.cc_emails ?? [],
          photo_limit: values.photo_limit ?? 0,
          extra_photo_price: values.extra_photo_price ?? 0,
          allow_zip_download: values.allow_zip_download ?? false,
          invoice_type: values.invoice_type ?? "none",
          session_fee: values.session_fee ?? 0,
          multi_round_enabled: values.multi_round_enabled ?? false,
          max_rounds: values.max_rounds ?? 1,
        })
        .select()
        .single();
      if (error) throw error;
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
  const { org } = useOrg();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      client,
      ...updates
    }: Partial<PhotoSession> & { id: string; client?: SessionClient }) => {
      if (client) {
        if (!org || !user) throw new Error("Not authenticated");
        updates.contact_id = await linkClientContact({
          client,
          orgId: org.id,
          userId: user.id,
          branchId: updates.branch_id ?? null,
        });
        updates.client_name = client.name.trim();
        updates.client_email = client.email.trim() || null;
      }
      const { data, error } = await supabase
        .from("photo_sessions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PhotoSession;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", data.id] });
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
      if (variables.client) queryClient.invalidateQueries({ queryKey: ["contacts"] });
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
          // The public key as a bearer token as well: finalize-session was
          // once redeployed with login checks on, and every client's
          // confirmation came back 401.
          Authorization: `Bearer ${supabaseKey}`,
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
      queryClient.invalidateQueries({ queryKey: ["client-session-photos", shareToken] });
    },
  });
}

export function useAdvanceRound() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareToken: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/advance-round`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          // The public key as a bearer token as well: finalize-session was
          // once redeployed with login checks on, and every client's
          // confirmation came back 401.
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ share_token: shareToken }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to advance round");
      }

      return (await res.json()) as {
        ok: boolean;
        current_round: number;
        max_rounds: number;
        selected_count: number;
      };
    },
    onSuccess: (_data, shareToken) => {
      queryClient.invalidateQueries({ queryKey: ["session-share", shareToken] });
      queryClient.invalidateQueries({ queryKey: ["client-session-photos", shareToken] });
    },
  });
}

// Photographer-side: re-open a session for another round of client selection.
// Carries the currently-selected photos forward into the next round's pool,
// bumps current_round/max_rounds, enables multi-round mode, and clears
// finalized_at so the client can pick up where they left off on the same
// share link.
export function useStartNextRound() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      currentRound,
      maxRounds,
    }: {
      sessionId: string;
      currentRound: number;
      maxRounds: number;
    }) => {
      const nextRound = currentRound + 1;

      const { error: photosErr } = await supabase
        .from("session_photos")
        .update({ selection_round: nextRound })
        .eq("session_id", sessionId)
        .eq("selection_round", currentRound)
        .eq("status", "selected");
      if (photosErr) throw photosErr;

      const { error: sessionErr } = await supabase
        .from("photo_sessions")
        .update({
          multi_round_enabled: true,
          current_round: nextRound,
          max_rounds: Math.max(maxRounds, nextRound),
          finalized_at: null,
        })
        .eq("id", sessionId);
      if (sessionErr) throw sessionErr;

      return { sessionId, nextRound };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["photo-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["photo-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["session-photos", sessionId] });
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

/**
 * One photo into a session: the file to storage, then its record.
 *
 * `displayOrder` is the photo's place in the shoot, decided before the batch
 * starts; every photo used to be saved as 0 and shown in the order its upload
 * happened to finish. If the record cannot be written the file is removed
 * again, so storage never holds a photo the session does not know about.
 */
export async function uploadPhoto(
  file: File,
  sessionId: string,
  orgId: string,
  { displayOrder, contentType }: { displayOrder: number; contentType: string },
): Promise<SessionPhoto> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${sessionId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("session-photos")
    .upload(path, file, {
      cacheControl: "3600",
      contentType,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from("session_photos")
    .insert({
      session_id: sessionId,
      org_id: orgId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: contentType,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (insertError) {
    await supabase.storage.from("session-photos").remove([path]);
    throw insertError;
  }
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

/** One edited file into a session's deliverables; the file is removed again if its record cannot be written. */
export async function uploadDeliverable(
  file: File,
  sessionId: string,
  orgId: string,
  quality: DeliverableQuality,
): Promise<SessionDeliverable> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${sessionId}/${quality}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("session-deliverables")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) throw uploadError;

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

  if (insertError) {
    await supabase.storage.from("session-deliverables").remove([path]);
    throw insertError;
  }
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
