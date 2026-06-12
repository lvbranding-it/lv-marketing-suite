import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./useOrg";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileShareItem {
  name:      string;
  size:      number;
  mime_type: string;
  path:      string;
}

export interface FileShare {
  id:             string;
  org_id:         string;
  label:          string;
  file_name:      string;
  file_size:      number;
  mime_type:      string;
  file_path:      string;
  files:          FileShareItem[];
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
  files:     File[];
  expiresAt: string | null;
}

/** Sanitize a filename for use as a storage path segment */
function safePath(name: string, index: number): string {
  return `${index}_${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export function useCreateFileShare() {
  const { org } = useOrg();
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async ({ label, files, expiresAt }: CreateFileShareParams): Promise<FileShare> => {
      if (!org) throw new Error("No organisation");
      if (!files.length) throw new Error("No files selected");

      // One folder per share so all files are grouped together
      const folderPath = `${org.id}/${crypto.randomUUID()}`;
      const uploaded: FileShareItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file     = files[i];
        const filePath = `${folderPath}/${safePath(file.name, i)}`;

        const { error: uploadErr } = await supabase.storage
          .from("file-shares")
          .upload(filePath, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          // Clean up any already-uploaded files before throwing
          if (uploaded.length) {
            await supabase.storage.from("file-shares").remove(uploaded.map(u => u.path));
          }
          throw new Error(uploadErr.message || JSON.stringify(uploadErr));
        }

        uploaded.push({ name: file.name, size: file.size, mime_type: file.type || "application/octet-stream", path: filePath });
      }

      const totalSize  = files.reduce((sum, f) => sum + f.size, 0);
      const isMultiple = files.length > 1;

      const { data, error: insertErr } = await db
        .from("file_shares")
        .insert({
          org_id:    org.id,
          label:     label.trim(),
          file_name: isMultiple ? `${files.length} files` : files[0].name,
          file_size: totalSize,
          mime_type: isMultiple ? "application/octet-stream" : (files[0].type || "application/octet-stream"),
          file_path: uploaded[0]?.path ?? "",
          files:     uploaded,
          expires_at: expiresAt || null,
        })
        .select()
        .single();

      if (insertErr) {
        await supabase.storage.from("file-shares").remove(uploaded.map(u => u.path));
        throw insertErr;
      }

      return data as FileShare;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file_shares", org?.id] });
    },
  });
}

export function useUpdateFileShareExpiry() {
  const { org } = useOrg();
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async ({ id, expiresAt }: { id: string; expiresAt: string | null }) => {
      const { error } = await db
        .from("file_shares")
        .update({ expires_at: expiresAt })
        .eq("id", id);
      if (error) throw error;
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
      // Delete all storage objects for this share
      const paths = share.files.length > 0
        ? share.files.map(f => f.path)
        : share.file_path ? [share.file_path] : [];

      if (paths.length) {
        await supabase.storage.from("file-shares").remove(paths);
      }

      const { error } = await db.from("file_shares").delete().eq("id", share.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["file_shares", org?.id] });
    },
  });
}
