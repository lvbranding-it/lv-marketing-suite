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

// ── Single file_request by token (public — no org filter) ─────────────────────
export function useFileRequest(token: string | null) {
  return useQuery<FileRequest | null>({
    queryKey: ["file-request-token", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await db
        .from("file_requests")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (error) throw error;
      return data as FileRequest | null;
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
