import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

export interface FileRequest {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  token: string;
  expires_at: string | null;
  status: string;
  created_at: string;
  /** Shows the client the logo file guidelines on the upload page. */
  is_logo_request: boolean;
}

export interface FileSubmission {
  id: string;
  request_id: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  file_path: string;
  uploader_name: string;
  uploader_email: string;
  message: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── List all file_requests for current org ────────────────────────────────────
export function useFileRequests() {
  const { org } = useOrg();
  return useQuery<FileRequest[]>({
    queryKey: ["file-requests", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await db
        .from("file_requests")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRequest[];
    },
    enabled: !!org,
  });
}

/** What the public upload page is shown about a request: never its token, org, or id. */
export type PublicFileRequest = Pick<FileRequest, "title" | "description" | "status" | "expires_at" | "is_logo_request">;

// ── Single file_request by token (public — no org filter) ─────────────────────
/**
 * The upload page looks its link up through get_file_request_by_token, which
 * answers for one exact token. It used to read the table directly, and the
 * policy that allowed that let anyone with the public key list every active
 * request's token.
 */
export function useFileRequest(token: string | null) {
  return useQuery<PublicFileRequest | null>({
    queryKey: ["file-request-token", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await db
        .rpc("get_file_request_by_token", { p_token: token })
        .maybeSingle();
      if (error) throw error;
      return data as PublicFileRequest | null;
    },
    enabled: !!token,
  });
}

// ── Submissions for a request ─────────────────────────────────────────────────
export function useFileSubmissions(requestId: string | null) {
  return useQuery<FileSubmission[]>({
    queryKey: ["file-submissions", requestId],
    queryFn: async () => {
      if (!requestId) return [];
      const { data, error } = await db
        .from("file_submissions")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileSubmission[];
    },
    enabled: !!requestId,
  });
}

// ── Storage used by each request ──────────────────────────────────────────────
export interface FileRequestUsage {
  files: number;
  bytes: number;
}

/** How many files each request has received and how much room they take, by request id. */
export function useFileRequestUsage() {
  const { org } = useOrg();
  return useQuery<Record<string, FileRequestUsage>>({
    queryKey: ["file-request-usage", org?.id],
    queryFn: async () => {
      const usage: Record<string, FileRequestUsage> = {};
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("file_submissions")
          .select("request_id, file_size")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const row of (data ?? []) as Pick<FileSubmission, "request_id" | "file_size">[]) {
          const entry = (usage[row.request_id] ??= { files: 0, bytes: 0 });
          entry.files += 1;
          entry.bytes += Number(row.file_size) || 0;
        }
        if (!data || data.length < PAGE) return usage;
      }
    },
    enabled: !!org,
  });
}

// ── Create file request ───────────────────────────────────────────────────────
function generateToken(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function useCreateFileRequest() {
  const { org } = useOrg();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string | null;
      expires_at?: string | null;
      is_logo_request?: boolean;
    }) => {
      if (!org) throw new Error("No org");
      const token = generateToken(12);
      const { data, error } = await db
        .from("file_requests")
        .insert({
          org_id: org.id,
          title: payload.title,
          description: payload.description || null,
          token,
          expires_at: payload.expires_at || null,
          status: "active",
          is_logo_request: !!payload.is_logo_request,
        })
        .select()
        .single();
      if (error) throw error;
      return data as FileRequest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["file-requests"] }),
  });
}

// ── Close file request ────────────────────────────────────────────────────────
export function useCloseFileRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("file_requests")
        .update({ status: "closed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["file-requests"] }),
  });
}

// ── Mark a request as a logo request ──────────────────────────────────────────
export function useSetLogoRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await db
        .from("file_requests")
        .update({ is_logo_request: value })
        .eq("id", id);
      if (error) throw error;
    },
    // The switch moves as soon as it is pressed; a failed save is undone by the refetch.
    onMutate: ({ id, value }) => {
      qc.setQueriesData<FileRequest[]>({ queryKey: ["file-requests"] }, (old) =>
        old?.map((request) => (request.id === id ? { ...request, is_logo_request: value } : request)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["file-requests"] }),
  });
}

// ── Delete a request with everything clients sent through it ─────────────────
const CLIENT_UPLOAD_BUCKET = "client-uploads";
const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

/**
 * Removes the link, the files clients sent through it, and their records.
 *
 * The files go first: everything recorded against the request, plus anything
 * in its storage folder that was never recorded (an upload whose last step
 * failed). If storage still holds any of them afterwards, the request is kept,
 * so the team can see it and try again rather than being left with files that
 * nothing points to. Deleting the request removes its submissions by cascade.
 */
export function useDeleteFileRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (request: FileRequest) => {
      const bucket = supabase.storage.from(CLIENT_UPLOAD_BUCKET);
      const folder = `${request.org_id}/${request.id}`;

      const filesInFolder = async () => {
        const paths: string[] = [];
        for (let offset = 0; ; offset += LIST_PAGE) {
          const { data, error } = await bucket.list(folder, { limit: LIST_PAGE, offset });
          if (error) throw error;
          // Entries without an id are folders, not files.
          paths.push(...(data ?? []).filter((entry) => entry.id).map((entry) => `${folder}/${entry.name}`));
          if (!data || data.length < LIST_PAGE) return paths;
        }
      };

      const { data: submissions, error: submissionsError } = await db
        .from("file_submissions")
        .select("file_path")
        .eq("request_id", request.id);
      if (submissionsError) throw submissionsError;

      const paths = [
        ...new Set([
          ...((submissions ?? []) as Pick<FileSubmission, "file_path">[]).map((s) => s.file_path),
          ...(await filesInFolder()),
        ]),
      ];
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) throw error;
      }

      // Storage skips files it will not let this person delete without saying so.
      if ((await filesInFolder()).length > 0) {
        throw new Error("Some files could not be deleted, so the link was kept. Try again, or ask an admin.");
      }

      const { error } = await db.from("file_requests").delete().eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file-requests"] });
      qc.invalidateQueries({ queryKey: ["file-request-usage"] });
    },
  });
}
