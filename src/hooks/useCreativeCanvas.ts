import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import type { BrandContext, CreativeAsset, CreativeCanvasRecord, CreativeDecision, CreativeGeneration, CreativeOperation, CreativeProvider, ProviderStatus } from "@/lib/creative-canvas/types";
import { sanitizeCreativeFilename, validateCreativeUpload } from "@/lib/creative-canvas/types";

const db = supabase as any;
export const CREATIVE_ASSET_BUCKET = "creative-canvas-assets";

/**
 * Every client project in the workspace, each with the canvases opened on it.
 *
 * Projects without a canvas are included deliberately: a canvas can be started
 * on any client already in the pipeline, so the picker needs to see them.
 */
export function useCreativeProjects() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["creative-projects", org?.id], enabled: !!org,
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("*, creative_canvases(*)").eq("org_id", org!.id).order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Opens a canvas on a client project that already exists.
 *
 * The brand context is seeded server-side from that client's brand snapshot, so
 * the Brand tab arrives filled in rather than blank.
 */
export function useOpenCanvasForProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { projectId: string; canvasName?: string }) => {
      const { data, error } = await db.rpc("create_canvas_for_project", {
        target_project_id: values.projectId,
        canvas_name: values.canvasName?.trim() || "Main canvas",
      });
      if (error) throw error;
      const created = data?.[0];
      if (!created?.canvas_id) throw new Error("Canvas was not created");
      return { projectId: created.project_id as string, canvasId: created.canvas_id as string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["creative-projects"] }),
  });
}

export function useCreativeCanvas(canvasId?: string) {
  return useQuery({
    queryKey: ["creative-canvas", canvasId], enabled: !!canvasId,
    queryFn: async () => {
      const { data, error } = await db.from("creative_canvases").select("*, projects(id,name,client_name,description,marketing_context)").eq("id", canvasId).single();
      if (error) throw error;
      return data as CreativeCanvasRecord & { projects: { id: string; name: string; client_name: string | null; description: string | null; marketing_context: Record<string, unknown> } };
    },
  });
}

export function useCreateCreativeProject() {
  const { org } = useOrg(); const { user } = useAuth(); const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; clientName?: string; description?: string }) => {
      if (!org || !user) throw new Error("Not authenticated");
      const { data, error } = await db.rpc("create_creative_canvas_project", { target_org_id: org.id, project_name: values.name, client_name: values.clientName || null, project_description: values.description || null });
      if (error) throw error;
      const created = data?.[0];
      if (!created?.project_id || !created?.canvas_id) throw new Error("Project was not created");
      return { project: { id: created.project_id }, canvas: { id: created.canvas_id } as CreativeCanvasRecord };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["creative-projects"] }),
  });
}

export function useSaveCreativeCanvas(canvas?: CreativeCanvasRecord) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sceneDocument: Record<string, unknown>) => {
      if (!canvas) throw new Error("Canvas is unavailable");
      const { data, error } = await db.from("creative_canvases").update({ scene_document: sceneDocument, scene_version: canvas.scene_version + 1 }).eq("id", canvas.id).eq("scene_version", canvas.scene_version).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This canvas changed elsewhere. Refresh before saving again.");
      return data as CreativeCanvasRecord;
    },
    onSuccess: (saved) => queryClient.setQueryData(["creative-canvas", saved.id], (previous: any) => previous ? { ...previous, ...saved } : saved),
  });
}

export function useBrandContext(projectId?: string) {
  return useQuery({ queryKey: ["creative-brand-context", projectId], enabled: !!projectId, queryFn: async () => {
    const { data, error } = await db.from("brand_contexts").select("*").eq("project_id", projectId).maybeSingle(); if (error) throw error; return data as { id: string; content: BrandContext; version: number } | null;
  }});
}

export function useSaveBrandContext(projectId?: string, orgId?: string) {
  const { user } = useAuth(); const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (content: BrandContext) => {
    if (!projectId || !orgId || !user) throw new Error("Project is unavailable");
    const { data, error } = await db.from("brand_contexts").upsert({ project_id: projectId, org_id: orgId, content, created_by: user.id }, { onConflict: "project_id" }).select().single(); if (error) throw error; return data;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["creative-brand-context", projectId] }) });
}

export function useCreativeAssets(projectId?: string) {
  return useQuery({ queryKey: ["creative-assets", projectId], enabled: !!projectId, queryFn: async () => {
    const { data, error } = await db.from("creative_assets").select("*").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }); if (error) throw error;
    const assets = (data ?? []) as CreativeAsset[];
    return Promise.all(assets.map(async (asset) => { const { data: signed } = await supabase.storage.from(CREATIVE_ASSET_BUCKET).createSignedUrl(asset.storage_path, 3600); return { ...asset, signedUrl: signed?.signedUrl }; }));
  }});
}

async function imageDimensions(file: File) {
  const bitmap = await createImageBitmap(file); const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return dimensions;
}

export function useUploadCreativeAsset(projectId?: string, orgId?: string) {
  const { user } = useAuth(); const queryClient = useQueryClient();
  return useMutation({ mutationFn: async ({ file, sourceType = "upload" }: { file: File; sourceType?: "upload" | "reference" }) => {
    if (!projectId || !orgId || !user) throw new Error("Project is unavailable");
    const validation = validateCreativeUpload(file); if (validation) throw new Error(validation);
    const dimensions = await imageDimensions(file);
    const path = `${orgId}/${projectId}/uploads/${crypto.randomUUID()}-${sanitizeCreativeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(CREATIVE_ASSET_BUCKET).upload(path, file, { contentType: file.type, upsert: false }); if (uploadError) throw uploadError;
    const { data, error } = await db.from("creative_assets").insert({ project_id: projectId, org_id: orgId, storage_path: path, original_filename: file.name, mime_type: file.type, file_size: file.size, width: dimensions.width, height: dimensions.height, source_type: sourceType, created_by: user.id }).select().single();
    if (error) { await supabase.storage.from(CREATIVE_ASSET_BUCKET).remove([path]); throw error; }
    await db.from("asset_versions").insert({ asset_id: data.id, storage_path: path, version_number: 1, created_by: user.id });
    const { data: signed } = await supabase.storage.from(CREATIVE_ASSET_BUCKET).createSignedUrl(path, 3600); return { ...data, signedUrl: signed?.signedUrl } as CreativeAsset;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["creative-assets", projectId] }) });
}

export function useCreativeGenerations(canvasId?: string) {
  return useQuery({ queryKey: ["creative-generations", canvasId], enabled: !!canvasId, refetchInterval: (query) => (query.state.data as CreativeGeneration[] | undefined)?.some((item) => ["queued", "processing"].includes(item.status)) ? 2000 : false, queryFn: async () => {
    const { data, error } = await db.from("ai_generations").select("id,provider,model,operation,status,original_instruction,output_text,output_asset_id,estimated_cost_usd,duration_ms,error_message,created_at").eq("canvas_id", canvasId).order("created_at", { ascending: false }).limit(100); if (error) throw error; return data as CreativeGeneration[];
  }});
}

export function useCreativeProviderStatus() {
  return useQuery({ queryKey: ["creative-provider-status"], staleTime: 60_000, retry: false, queryFn: async () => {
    const { data, error } = await supabase.functions.invoke("creative-canvas-generate", { body: { action: "provider_status" } });
    if (error) throw error; return (data?.providers ?? []) as ProviderStatus[];
  }});
}

export function useGenerateCreative() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (request: { projectId: string; canvasId: string; orgId: string; operation: CreativeOperation; instruction: string; provider: CreativeProvider; idempotencyKey: string; selectedNodes: unknown[]; brandContext?: BrandContext; referenceAssetIds?: string[]; language?: "en" | "es"; placement?: { x: number; y: number } }) => {
    const { data, error } = await supabase.functions.invoke("creative-canvas-generate", { body: request }); if (error) throw error; if (data?.error) throw new Error(data.error); return data as { generation: CreativeGeneration; asset?: CreativeAsset; budget?: { monthTotalUsd: number; softLimitUsd: number; warning: boolean } };
  }, onSettled: (_data, _error, variables) => { queryClient.invalidateQueries({ queryKey: ["creative-generations", variables.canvasId] }); queryClient.invalidateQueries({ queryKey: ["creative-assets", variables.projectId] }); } });
}

export function useCreateDecision() {
  const { user } = useAuth(); const queryClient = useQueryClient();
  return useMutation({ mutationFn: async (values: { projectId: string; canvasId: string; orgId: string; targetType: "asset" | "shape" | "direction" | "generation"; targetId: string; decision: CreativeDecision; note?: string }) => {
    if (!user) throw new Error("Not authenticated"); const { data, error } = await db.from("creative_decisions").insert({ project_id: values.projectId, canvas_id: values.canvasId, org_id: values.orgId, target_type: values.targetType, target_id: values.targetId, decision: values.decision, note: values.note || null, created_by: user.id }).select().single(); if (error) throw error; return data;
  }, onSuccess: (_data, values) => queryClient.invalidateQueries({ queryKey: ["creative-decisions", values.projectId] }) });
}

export function useCreativeUsage(projectId?: string) {
  return useQuery({ queryKey: ["creative-usage", projectId], enabled: !!projectId, queryFn: async () => { const { data, error } = await db.from("ai_usage_ledger").select("estimated_cost_usd,provider,created_at").eq("project_id", projectId); if (error) throw error; return { total: (data ?? []).reduce((sum: number, row: any) => sum + Number(row.estimated_cost_usd ?? 0), 0), rows: data ?? [] }; } });
}
