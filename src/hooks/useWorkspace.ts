import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import type { Json, WorkspaceAsset, WorkspaceBlock, WorkspacePage } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { blocksToHtml } from "@/lib/workspace/document";

export type WorkspaceAssetCategory = WorkspaceAsset["category"];

/**
 * A page as the sidebar and the header need it: everything except the document.
 *
 * The page list is loaded once and kept for the session, and every title edit or
 * move writes back into it. Carrying each page's whole document along would put
 * every page's content into that list and resend it on each of those writes, so
 * the document is fetched separately, one page at a time.
 */
export type WorkspacePageSummary = Omit<WorkspacePage, "document_html" | "document_text">;

const PAGE_SUMMARY_COLUMNS =
  "id, org_id, parent_id, title, icon, cover_color, position, is_archived, metadata, created_by, created_at, updated_at";

interface CreateWorkspacePageValues {
  title?: string;
  parent_id?: string | null;
  icon?: string | null;
  cover_color?: string | null;
  metadata?: Json;
  /** Starting content, for a page created from a template. */
  documentHtml?: string;
}

interface UploadWorkspaceAssetValues {
  pageId: string;
  file: File;
  category: WorkspaceAssetCategory;
  /** Bytes of this file sent so far. */
  onProgress?: (sentBytes: number) => void;
}

const PAGE_GAP = 1000;
export const WORKSPACE_ASSET_BUCKET = "workspace-assets";

/** Everything that is not a video keeps the limit it always had. */
export const WORKSPACE_ASSET_MAX_BYTES = 50 * 1024 * 1024;
/** Video gets more room; the bucket itself is capped at the same figure. */
export const WORKSPACE_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

/**
 * Above this, uploads go through Supabase's resumable endpoint.
 *
 * A single request carrying a few hundred megabytes shows no progress until it
 * is done and loses everything if the connection blinks. The resumable endpoint
 * sends 6 MB pieces, retries a failed piece rather than the whole file, and
 * reports progress as it goes. Supabase requires exactly 6 MB pieces.
 */
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const RESUMABLE_CHUNK = 6 * 1024 * 1024;

const VIDEO_TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  ogv: "video/ogg",
};

export const WORKSPACE_ASSET_ACCEPT = [
  "image/*",
  "video/*",
  "application/pdf",
  "application/json",
  "text/plain",
  "text/csv",
  "text/calendar",
  "text/css",
  ".ics",
  ".csv",
  ".json",
  ".css",
  ".ase",
  ".fig",
  ".pdf",
  ".svg",
  ".sketchpalette",
  ".zip",
  ".docx",
  ".pptx",
  ".xlsx",
  ...Object.keys(VIDEO_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
].join(",");

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isVideoFile(file: Pick<File, "name" | "type">) {
  return file.type.startsWith("video/") || extensionOf(file.name) in VIDEO_TYPES_BY_EXTENSION;
}

export function maxBytesFor(file: Pick<File, "name" | "type">) {
  return isVideoFile(file) ? WORKSPACE_VIDEO_MAX_BYTES : WORKSPACE_ASSET_MAX_BYTES;
}

/**
 * The type a file is stored under.
 *
 * Some browsers report no type at all for a .mov. Stored as a generic binary it
 * would still upload, but the preview would be handed a file it cannot tell is
 * a video, and Safari will not play it.
 */
function contentTypeFor(file: File) {
  if (file.type) return file.type;
  return VIDEO_TYPES_BY_EXTENSION[extensionOf(file.name)] ?? "application/octet-stream";
}

function nextPosition<T extends { parent_id?: string | null; position: number }>(
  items: T[] | undefined,
  predicate: (item: T) => boolean
) {
  const siblings = (items ?? []).filter(predicate);
  return siblings.length ? Math.max(...siblings.map((item) => item.position)) + PAGE_GAP : 0;
}

function pageAndDescendantIds(pages: WorkspacePageSummary[] | undefined, pageId: string) {
  const childrenByParent = new Map<string, WorkspacePageSummary[]>();
  (pages ?? []).forEach((page) => {
    if (!page.parent_id) return;
    childrenByParent.set(page.parent_id, [...(childrenByParent.get(page.parent_id) ?? []), page]);
  });

  const ids = new Set([pageId]);
  const visit = (id: string) => {
    (childrenByParent.get(id) ?? []).forEach((child) => {
      ids.add(child.id);
      visit(child.id);
    });
  };
  visit(pageId);
  return ids;
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "workspace-asset";
}

function workspaceAssetPath(orgId: string, pageId: string, fileName: string) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${orgId}/${pageId}/${unique}-${sanitizeFileName(fileName)}`;
}

export function useWorkspacePages() {
  const { org } = useOrg();

  return useQuery({
    queryKey: ["workspace_pages", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await supabase
        .from("workspace_pages")
        .select(PAGE_SUMMARY_COLUMNS)
        .eq("org_id", org.id)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspacePageSummary[];
    },
    enabled: !!org,
  });
}

export interface WorkspaceDocument {
  html: string;
  /**
   * True when the page had never been opened in the document editor and this
   * content was just converted from its blocks. The editor saves it straight
   * away, so the conversion happens once and the page becomes searchable.
   */
  converted: boolean;
}

/**
 * One page's document.
 *
 * A page that predates documents is converted from its blocks here, from
 * whatever they hold at the moment it is opened. The blocks themselves are
 * never changed.
 *
 * Never refetched on its own: once the editor holds this content it owns it, and
 * a background refetch would replace what someone is typing with the last
 * saved version.
 */
export function useWorkspaceDocument(pageId: string | null) {
  return useQuery({
    queryKey: ["workspace_document", pageId],
    queryFn: async (): Promise<WorkspaceDocument> => {
      if (!pageId) return { html: "", converted: false };
      const { data, error } = await supabase
        .from("workspace_pages")
        .select("document_html")
        .eq("id", pageId)
        .single();
      if (error) throw error;
      if (data.document_html !== null) return { html: data.document_html, converted: false };

      const { data: blocks, error: blockError } = await supabase
        .from("workspace_blocks")
        .select("type, content, position")
        .eq("page_id", pageId)
        .order("position", { ascending: true });
      if (blockError) throw blockError;
      return { html: await blocksToHtml((blocks ?? []) as Pick<WorkspaceBlock, "type" | "content" | "position">[]), converted: true };
    },
    enabled: !!pageId,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useSaveWorkspaceDocument() {
  const { org } = useOrg();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId, html, text }: { pageId: string; html: string; text: string }) => {
      const { data, error } = await supabase
        .from("workspace_pages")
        .update({ document_html: html, document_text: text })
        .eq("id", pageId)
        .select("id, updated_at")
        .single();
      if (error) throw error;
      return { pageId, html, updatedAt: data.updated_at as string };
    },
    onSuccess: ({ pageId, html, updatedAt }) => {
      // Reopening the page must show what was just saved, not what was loaded.
      queryClient.setQueryData<WorkspaceDocument>(["workspace_document", pageId], { html, converted: false });
      if (org) {
        queryClient.setQueryData<WorkspacePageSummary[]>(["workspace_pages", org.id], (current) =>
          (current ?? []).map((page) => (page.id === pageId ? { ...page, updated_at: updatedAt } : page))
        );
      }
    },
  });
}

export interface WorkspaceSearchHit {
  pageId: string;
  snippet: string;
}

/** A short excerpt around the first match, so a result shows why it matched. */
function excerpt(text: string, query: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return flat.slice(0, 120);
  const start = Math.max(0, at - 40);
  const end = Math.min(flat.length, at + query.length + 80);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/**
 * Search across page content.
 *
 * Converted pages are searched by their document. A page nobody has opened
 * since documents arrived still lives only in its blocks, so those are searched
 * too — but only for pages without a document, whose blocks are otherwise out
 * of date and would match text that has since been edited away.
 */
export function useWorkspaceSearch(query: string) {
  const { org } = useOrg();
  const normalized = query.trim();

  return useQuery({
    queryKey: ["workspace_search", org?.id, normalized],
    queryFn: async (): Promise<WorkspaceSearchHit[]> => {
      if (!org || normalized.length < 2) return [];
      const pattern = `%${normalized}%`;
      const [documents, converted, blocks] = await Promise.all([
        supabase
          .from("workspace_pages")
          .select("id, document_text")
          .eq("org_id", org.id)
          .eq("is_archived", false)
          .ilike("document_text", pattern)
          .limit(25),
        supabase.from("workspace_pages").select("id").eq("org_id", org.id).not("document_html", "is", null),
        supabase
          .from("workspace_blocks")
          .select("page_id, content")
          .eq("org_id", org.id)
          .filter("content->>text", "ilike", pattern)
          .order("updated_at", { ascending: false })
          .limit(40),
      ]);
      const failed = documents.error || converted.error || blocks.error;
      if (failed) throw failed;

      const hits: WorkspaceSearchHit[] = (documents.data ?? []).map((page) => ({
        pageId: page.id,
        snippet: excerpt(page.document_text ?? "", normalized),
      }));
      const convertedIds = new Set((converted.data ?? []).map((page) => page.id));
      (blocks.data ?? []).forEach((block) => {
        if (convertedIds.has(block.page_id)) return;
        const text = (block.content as { text?: string } | null)?.text ?? "";
        hits.push({ pageId: block.page_id, snippet: excerpt(text, normalized) });
      });
      return hits;
    },
    enabled: !!org && normalized.length >= 2,
  });
}

export function useWorkspaceAssets(pageId: string | null) {
  return useQuery({
    queryKey: ["workspace_assets", pageId],
    queryFn: async () => {
      if (!pageId) return [];
      const { data, error } = await supabase
        .from("workspace_assets")
        .select("*")
        .eq("page_id", pageId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspaceAsset[];
    },
    enabled: !!pageId,
  });
}

/**
 * A short-lived link to a stored file.
 *
 * With `downloadAs`, the link makes the browser save the file under that name
 * instead of displaying it — which is the only way to download a file whose
 * type the browser would otherwise open, such as a PDF or a video.
 */
export function useWorkspaceAssetSignedUrl(
  storagePath: string | null | undefined,
  options: { downloadAs?: string; enabled?: boolean } = {}
) {
  const { downloadAs, enabled = true } = options;
  return useQuery({
    queryKey: ["workspace_asset_url", storagePath, downloadAs ?? null],
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from(WORKSPACE_ASSET_BUCKET)
        .createSignedUrl(storagePath, 3600, downloadAs ? { download: downloadAs } : undefined);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!storagePath && enabled,
    staleTime: 1000 * 60 * 45,
  });
}

async function uploadResumable(storagePath: string, file: File, contentType: string, onProgress?: (sent: number) => void) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again to upload.");

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_CHUNK,
      metadata: {
        bucketName: WORKSPACE_ASSET_BUCKET,
        objectName: storagePath,
        contentType,
        cacheControl: "3600",
      },
      onProgress: (sent) => onProgress?.(sent),
      onSuccess: () => resolve(),
      onError: (error) => {
        // The storage server explains a refusal in the response body; tus
        // wraps it in a long technical message the person cannot act on.
        const body = (error as tus.DetailedError).originalResponse?.getBody?.();
        const status = (error as tus.DetailedError).originalResponse?.getStatus?.();
        if (status === 413 || /maximum allowed size|too large/i.test(body ?? "")) {
          reject(new Error(`${file.name} is larger than the upload limit allows.`));
        } else {
          reject(new Error(body ? `Upload failed: ${body}` : error.message));
        }
      },
    });
    upload.start();
  });
}

export function useUploadWorkspaceAsset() {
  const { org } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId, file, category, onProgress }: UploadWorkspaceAssetValues) => {
      if (!org || !user) throw new Error("Not authenticated");
      const limit = maxBytesFor(file);
      if (file.size > limit) {
        throw new Error(`${file.name} is over the ${Math.round(limit / 1024 / 1024)} MB limit.`);
      }

      const storagePath = workspaceAssetPath(org.id, pageId, file.name);
      const contentType = contentTypeFor(file);

      if (file.size > RESUMABLE_THRESHOLD) {
        await uploadResumable(storagePath, file, contentType, onProgress);
      } else {
        const { error: uploadError } = await supabase.storage
          .from(WORKSPACE_ASSET_BUCKET)
          .upload(storagePath, file, { cacheControl: "3600", contentType, upsert: false });
        if (uploadError) throw uploadError;
        onProgress?.(file.size);
      }

      const { data, error } = await supabase
        .from("workspace_assets")
        .insert({
          org_id: org.id,
          page_id: pageId,
          category,
          file_name: file.name,
          file_size: file.size,
          mime_type: contentType,
          storage_path: storagePath,
          metadata: {},
          created_by: user.id,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from(WORKSPACE_ASSET_BUCKET).remove([storagePath]);
        throw error;
      }
      return data as WorkspaceAsset;
    },
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ["workspace_assets", asset.page_id] });
    },
  });
}

export function useDeleteWorkspaceAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (asset: WorkspaceAsset) => {
      await supabase.storage.from(WORKSPACE_ASSET_BUCKET).remove([asset.storage_path]);
      const { error } = await supabase.from("workspace_assets").delete().eq("id", asset.id);
      if (error) throw error;
      return asset;
    },
    onSuccess: (asset) => {
      // The card leaves the list at once. Its cached link is left to expire on
      // its own: removing it while the card was still on screen made the card
      // ask straight away for a new link to a file that no longer existed,
      // which failed on every delete.
      queryClient.setQueryData<WorkspaceAsset[]>(["workspace_assets", asset.page_id], (current) =>
        (current ?? []).filter((item) => item.id !== asset.id)
      );
      queryClient.invalidateQueries({ queryKey: ["workspace_assets", asset.page_id] });
    },
  });
}

export function useCreateWorkspacePage() {
  const { org } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CreateWorkspacePageValues) => {
      if (!org || !user) throw new Error("Not authenticated");
      const cached = queryClient.getQueryData<WorkspacePageSummary[]>(["workspace_pages", org.id]);
      const parentId = values.parent_id ?? null;
      const position = nextPosition(cached, (page) => (page.parent_id ?? null) === parentId);
      const html = values.documentHtml ?? "";

      // A new page starts as a document, so it never goes through the
      // conversion meant for pages that predate documents.
      const { data, error } = await supabase
        .from("workspace_pages")
        .insert({
          org_id: org.id,
          parent_id: parentId,
          title: values.title?.trim() || "Untitled",
          icon: values.icon ?? null,
          cover_color: values.cover_color ?? null,
          metadata: values.metadata ?? {},
          position,
          created_by: user.id,
          document_html: html,
          document_text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        })
        .select(PAGE_SUMMARY_COLUMNS)
        .single();
      if (error) throw error;
      const page = data as WorkspacePageSummary;
      queryClient.setQueryData<WorkspaceDocument>(["workspace_document", page.id], { html, converted: false });
      return page;
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ["workspace_pages", page.org_id] });
    },
  });
}

export function useUpdateWorkspacePage() {
  const { org } = useOrg();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WorkspacePageSummary> & { id: string }) => {
      const { data, error } = await supabase
        .from("workspace_pages")
        .update(updates)
        .eq("id", id)
        .select(PAGE_SUMMARY_COLUMNS)
        .single();
      if (error) throw error;
      return data as WorkspacePageSummary;
    },
    onMutate: async (updates) => {
      if (!org) return;
      await queryClient.cancelQueries({ queryKey: ["workspace_pages", org.id] });
      const previous = queryClient.getQueryData<WorkspacePageSummary[]>(["workspace_pages", org.id]);
      queryClient.setQueryData<WorkspacePageSummary[]>(["workspace_pages", org.id], (current) =>
        (current ?? []).map((item) => (item.id === updates.id ? { ...item, ...updates } : item))
      );
      return { previous, orgId: org.id };
    },
    onError: (_error, _updates, context) => {
      if (context?.orgId) {
        queryClient.setQueryData(["workspace_pages", context.orgId], context.previous);
      }
    },
    onSuccess: (page) => {
      queryClient.setQueryData<WorkspacePageSummary[]>(["workspace_pages", page.org_id], (current) =>
        (current ?? []).map((item) => (item.id === page.id ? page : item))
      );
    },
    onSettled: (page) => {
      if (page?.org_id) queryClient.invalidateQueries({ queryKey: ["workspace_pages", page.org_id] });
    },
  });
}

export function useDeleteWorkspacePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (page: WorkspacePageSummary) => {
      const { error } = await supabase.from("workspace_pages").delete().eq("id", page.id);
      if (error) throw error;
      return page;
    },
    onMutate: async (page) => {
      await queryClient.cancelQueries({ queryKey: ["workspace_pages", page.org_id] });
      const previous = queryClient.getQueryData<WorkspacePageSummary[]>(["workspace_pages", page.org_id]);
      const removing = pageAndDescendantIds(previous, page.id);
      queryClient.setQueryData<WorkspacePageSummary[]>(["workspace_pages", page.org_id], (current) =>
        (current ?? []).filter((item) => !removing.has(item.id))
      );
      return { previous };
    },
    onError: (_error, page, context) => {
      queryClient.setQueryData(["workspace_pages", page.org_id], context?.previous);
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ["workspace_pages", page.org_id] });
      queryClient.removeQueries({ queryKey: ["workspace_document", page.id] });
    },
  });
}
