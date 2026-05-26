import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileShare {
  id:             string;
  org_id:         string;
  label:          string;
  file_name:      string;
  file_size:      number;
  mime_type:      string;
  file_path:      string;
  token:          string;
  expires_at:     string | null;
  download_count: number;
  created_at:     string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useFileShares() {
  const { org } = useOrg();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useQuery({
    queryKey:  ["file_shares", org?.id],
    enabled:   !!org,
    queryFn:   async () => {
      const { data, error } = await db
        .from("file_shares")
        .select("*")
        .eq("org_id", org!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileShare[];
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

interface CreateFileShareParams {
  label:     string;
  file:      File;
  expiresAt: string | null;
}

export function useCreateFileShare() {
  const { org } = useOrg();
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async ({ label, file, expiresAt }: CreateFileShareParams): Promise<FileShare> => {
      if (!org) throw new Error("No organisation");

      // 1. Upload the file to storage
      const ext = file.name.split(".").pop() ?? "bin";
      const filePath = `${org.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("file-shares")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) {
        // Surface the actual storage error message (e.g. "The object exceeded the maximum allowed size")
        throw new Error(uploadErr.message || JSON.stringify(uploadErr));
      }

      // 2. Insert the DB record
      const { data, error: insertErr } = await db
        .from("file_shares")
        .insert({
          org_id:    org.id,
          label:     label.trim(),
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || "application/octet-stream",
          file_path: filePath,
          expires_at: expiresAt || null,
        })
        .select()
        .single();
      if (insertErr) {
        // Clean up orphaned storage file on DB failure
        await supabase.storage.from("file-shares").remove([filePath]);
        throw insertErr;
      }

      return data as FileShare;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file_shares", org?.id] });
    },
  });
}

export function useDeleteFileShare() {
  const { org } = useOrg();
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async (share: FileShare) => {
      // 1. Remove storage object
      await supabase.storage.from("file-shares").remove([share.file_path]);

      // 2. Delete DB row
      const { error } = await db.from("file_shares").delete().eq("id", share.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file_shares", org?.id] });
    },
  });
}
