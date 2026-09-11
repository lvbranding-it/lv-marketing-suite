import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCreativeContext } from "../_shared/creative-canvas/context.ts";
import { estimateCost, readCreativeCanvasConfig, requiredCapability, routeProvider } from "../_shared/creative-canvas/config.ts";
import { createProvider } from "../_shared/creative-canvas/providers.ts";
import type { CreativeRequest } from "../_shared/creative-canvas/types.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOperations = new Set(["generate_image", "edit_image", "variations", "campaign_concept", "write_copy", "rewrite", "shorten", "expand", "adapt_en_es", "adapt_es_en", "visual_critique", "compare_concepts", "recommend_direction", "creative_rationale", "production_prompt"]);

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: CORS }); }
function validate(body: any): CreativeRequest {
  if (JSON.stringify(body ?? {}).length > 200_000) throw Object.assign(new Error("Creative request is too large"), { status: 413 });
  if (!body || !UUID.test(body.projectId) || !UUID.test(body.canvasId) || !UUID.test(body.orgId)) throw Object.assign(new Error("Invalid project scope"), { status: 400 });
  if (!allowedOperations.has(body.operation) || typeof body.instruction !== "string" || !body.instruction.trim() || body.instruction.length > 8000) throw Object.assign(new Error("Invalid creative request"), { status: 400 });
  if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 160) throw Object.assign(new Error("Invalid idempotency key"), { status: 400 });
  if (!Array.isArray(body.selectedNodes) || body.selectedNodes.length > 50) throw Object.assign(new Error("Invalid canvas selection"), { status: 400 });
  if (body.provider && !["auto", "openai", "google", "anthropic"].includes(body.provider)) throw Object.assign(new Error("Invalid provider"), { status: 400 });
  for (const node of body.selectedNodes) {
    if (!node || typeof node.id !== "string" || node.id.length > 160 || typeof node.type !== "string" || node.type.length > 80 || (node.text != null && (typeof node.text !== "string" || node.text.length > 20_000))) throw Object.assign(new Error("Invalid selected canvas object"), { status: 400 });
    if (node.sequence != null && (typeof node.sequence !== "object" || !Number.isInteger(node.sequence.step) || !Number.isInteger(node.sequence.total) || node.sequence.step < 1 || node.sequence.total < 1 || node.sequence.step > node.sequence.total || node.sequence.total > 200 || (node.sequence.follows != null && (typeof node.sequence.follows !== "string" || node.sequence.follows.length > 300)))) throw Object.assign(new Error("Invalid canvas sequence position"), { status: 400 });
  }
  // Checked here with the other caps rather than after the generation row is
  // opened: a rejection further down returned without throwing, so the row was
  // left in `processing` forever and permanently consumed a concurrency slot.
  if (body.referenceAssetIds && (!Array.isArray(body.referenceAssetIds) || body.referenceAssetIds.length > 4 || body.referenceAssetIds.some((id: unknown) => typeof id !== "string" || !UUID.test(id)))) throw Object.assign(new Error("Provide up to four valid reference assets"), { status: 400 });
  if (body.placement && (!Number.isFinite(body.placement.x) || !Number.isFinite(body.placement.y))) throw Object.assign(new Error("Invalid canvas placement"), { status: 400 });
  if (body.aspect && !["square", "portrait", "landscape"].includes(body.aspect)) throw Object.assign(new Error("Invalid aspect"), { status: 400 });
  if (body.series && (typeof body.series !== "object" || typeof body.series.id !== "string" || body.series.id.length > 80 || (body.series.label != null && (typeof body.series.label !== "string" || body.series.label.length > 300)))) throw Object.assign(new Error("Invalid series"), { status: 400 });
  return body as CreativeRequest;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let generationId: string | undefined;
  const started = Date.now();
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Canvas AI service unavailable");
    const db = createClient(supabaseUrl, serviceKey);
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
    const rawBody = await req.json();
    const config = readCreativeCanvasConfig((key) => Deno.env.get(key));
    if (rawBody?.action === "provider_status") {
      return json({ providers: Object.values(config.providers).map(({ id, enabled, capabilities, textModel, imageModel }) => ({ id, enabled, capabilities, textModel, imageModel })) });
    }
    const body = validate(rawBody);
    const { data: canvas } = await db.from("creative_canvases").select("id, project_id, org_id").eq("id", body.canvasId).eq("project_id", body.projectId).eq("org_id", body.orgId).maybeSingle();
    if (!canvas) return json({ error: "Canvas not found" }, 404);
    // Read the client record here rather than trusting the browser for it. It is
    // the same brief and brand snapshot `agent-run` uses, so Canvas reasons from
    // the same facts the agents do, and it is always current.
    const { data: projectRecord } = await db.from("projects")
      .select("name, client_name, description, marketing_context, brand_snapshot")
      .eq("id", body.projectId).maybeSingle();
    // Evaluated as the caller. `creative_project_role` reads auth.uid(), which is
    // null on a service-role client, so asking `db` returned null rather than
    // false and the guard could never actually deny anyone. Carrying the user's
    // token makes this the single authoritative check: it already resolves the
    // project override, the Canvas feature grant, and viewer being read-only.
    const asUser = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: canEdit } = await asUser.rpc("can_edit_creative_project", { target_project_id: body.projectId });
    if (canEdit !== true) return json({ error: "Forbidden" }, 403);

    const { data: existing } = await db.from("ai_generations").select("*").eq("user_id", auth.user.id).eq("idempotency_key", body.idempotencyKey).maybeSingle();
    if (existing) return json({ generation: existing, replayed: true });
    // A run killed mid-flight — platform timeout, deploy, out of memory — never
    // reaches the failure handler, so its row stays `processing`. Without this
    // window those abandoned rows would occupy the concurrency allowance for
    // good and lock the user out of their own tool.
    const abandonedBefore = new Date(Date.now() - config.timeoutMs - 30_000).toISOString();
    const { count: activeCount } = await db.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).in("status", ["queued", "processing"]).gte("updated_at", abandonedBefore);
    if ((activeCount ?? 0) >= config.maxConcurrent) return json({ error: "Maximum simultaneous generations reached", code: "RATE_LIMITED" }, 429);
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await db.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).gte("created_at", minuteAgo);
    if ((recentCount ?? 0) >= config.maxRequestsPerMinute) return json({ error: "Creative Canvas request limit reached. Try again in a minute.", code: "RATE_LIMITED" }, 429);
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { data: usage } = await db.from("ai_usage_ledger").select("estimated_cost_usd").eq("organization_id", body.orgId).gte("created_at", monthStart.toISOString());
    const monthTotal = (usage ?? []).reduce((sum: number, row: any) => sum + Number(row.estimated_cost_usd ?? 0), 0);
    if (monthTotal >= config.monthlyBudgetUsd) return json({ error: "Monthly Canvas AI soft budget reached", code: "BUDGET_REACHED" }, 402);
    const providerConfig = routeProvider(config, body.operation, body.provider);
    const prepared = buildCreativeContext(body, projectRecord ? {
      name: projectRecord.name ?? undefined,
      clientName: projectRecord.client_name ?? undefined,
      description: projectRecord.description ?? undefined,
      marketingContext: (projectRecord.marketing_context ?? undefined) as Record<string, unknown> | undefined,
      brandSnapshot: (projectRecord.brand_snapshot ?? undefined) as Record<string, unknown> | undefined,
    } : undefined);
    const { data: generation, error: insertError } = await db.from("ai_generations").insert({
      project_id: body.projectId, canvas_id: body.canvasId, org_id: body.orgId, user_id: auth.user.id,
      provider: providerConfig.id, model: requiredCapability(body.operation).startsWith("image_") ? providerConfig.imageModel : providerConfig.textModel,
      operation: body.operation, status: "queued", original_instruction: body.instruction,
      system_instructions: prepared.systemInstructions, structured_context: prepared.structuredContext,
      context_manifest: prepared.manifest, normalized_request: { operation: body.operation, language: body.language, placement: body.placement, aspect: body.aspect ?? null, series: body.series ?? null },
      enhanced_prompt: prepared.enhancedPrompt, reference_asset_ids: body.referenceAssetIds ?? [], idempotency_key: body.idempotencyKey,
    }).select().single();
    if (insertError?.code === "23505") {
      const { data: replay } = await db.from("ai_generations").select("*").eq("user_id", auth.user.id).eq("idempotency_key", body.idempotencyKey).single();
      return json({ generation: replay, replayed: true });
    }
    if (insertError) throw insertError;
    generationId = generation.id;
    await db.from("ai_generations").update({ status: "processing" }).eq("id", generation.id);
    const provider = createProvider(providerConfig.id, providerConfig, (key) => Deno.env.get(key));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const referenceDataUrls: string[] = [];
    if (body.referenceAssetIds?.length) {
      const { data: referenceAssets } = await db.from("creative_assets").select("id, storage_path, mime_type").eq("project_id", body.projectId).is("deleted_at", null).in("id", body.referenceAssetIds);
      if ((referenceAssets?.length ?? 0) !== body.referenceAssetIds.length) throw Object.assign(new Error("One or more reference assets are unavailable"), { code: "INVALID_REFERENCE", status: 400 });
      for (const asset of referenceAssets ?? []) {
        const { data: file, error: downloadError } = await db.storage.from("creative-canvas-assets").download(asset.storage_path);
        if (downloadError || !file) throw Object.assign(new Error("Reference asset could not be loaded"), { code: "REFERENCE_LOAD_FAILED", status: 502 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        referenceDataUrls.push(`data:${asset.mime_type};base64,${btoa(binary)}`);
      }
    }
    let result;
    try {
      const capability = requiredCapability(body.operation);
      if (capability === "image_edit" && !referenceDataUrls.length) throw Object.assign(new Error("Image editing requires a selected reference asset"), { code: "REFERENCE_REQUIRED", status: 400 });
      result = capability === "image_generation"
        ? await provider.generateImage!({ prompt: prepared.enhancedPrompt, referenceDataUrls, aspect: body.aspect, signal: controller.signal })
        : capability === "image_edit"
          ? await provider.editImage!({ prompt: prepared.enhancedPrompt, referenceDataUrls, aspect: body.aspect, signal: controller.signal })
        : await provider.generateText({ system: prepared.systemInstructions, prompt: prepared.enhancedPrompt, signal: controller.signal });
    } finally { clearTimeout(timeout); }
    const cost = estimateCost(result.provider, body.operation, result.inputTokens, result.outputTokens);
    let outputAsset: any = null;
    let outputSignedUrl: string | null = null;
    if (result.imageBase64) {
      const extension = result.imageMimeType === "image/jpeg" ? "jpg" : result.imageMimeType === "image/webp" ? "webp" : "png";
      const storagePath = `${body.orgId}/${body.projectId}/generated/${crypto.randomUUID()}.${extension}`;
      const binary = atob(result.imageBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const { error: uploadError } = await db.storage.from("creative-canvas-assets").upload(storagePath, bytes, { contentType: result.imageMimeType ?? "image/png", upsert: false });
      if (uploadError) throw Object.assign(new Error("Generated image could not be stored"), { code: "ASSET_STORAGE_FAILED", status: 502 });
      const parentAssetId = body.referenceAssetIds?.[0] ?? null;
      const sourceType = body.operation === "edit_image" ? "edited" : body.operation === "variations" ? "variation" : "generated";
      const { data: insertedAsset, error: assetError } = await db.from("creative_assets").insert({ project_id: body.projectId, org_id: body.orgId, storage_path: storagePath, original_filename: `creative-canvas-${sourceType}.${extension}`, mime_type: result.imageMimeType ?? "image/png", file_size: bytes.byteLength, source_type: sourceType, parent_asset_id: parentAssetId, generation_id: generation.id, metadata: { provider: result.provider, model: result.model }, created_by: auth.user.id }).select().single();
      if (assetError) { await db.storage.from("creative-canvas-assets").remove([storagePath]); throw assetError; }
      outputAsset = insertedAsset;
      await db.from("asset_versions").insert({ asset_id: insertedAsset.id, storage_path: storagePath, version_number: 1, edit_instruction: body.operation === "edit_image" ? body.instruction : null, provider: result.provider, model: result.model, created_by: auth.user.id });
      const { data: signed } = await db.storage.from("creative-canvas-assets").createSignedUrl(storagePath, 3600);
      outputSignedUrl = signed?.signedUrl ?? null;
    }
    const { data: completed } = await db.from("ai_generations").update({ status: "completed", output_asset_id: outputAsset?.id ?? null, output_text: result.outputText ?? null, input_tokens: result.inputTokens ?? null, output_tokens: result.outputTokens ?? null, estimated_cost_usd: cost, duration_ms: result.durationMs, provider_request_id: result.providerRequestId ?? null }).eq("id", generation.id).select().single();
    await db.from("ai_usage_ledger").insert({ organization_id: body.orgId, project_id: body.projectId, user_id: auth.user.id, generation_id: generation.id, provider: result.provider, model: result.model, usage_type: requiredCapability(body.operation), quantity: 1, estimated_cost_usd: cost });
    return json({ generation: completed, asset: outputAsset ? { ...outputAsset, signedUrl: outputSignedUrl } : null, budget: { monthTotalUsd: monthTotal + cost, softLimitUsd: config.monthlyBudgetUsd, warning: (monthTotal + cost) / config.monthlyBudgetUsd * 100 >= config.warningPercent } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    console.error("Creative Canvas generation failed", { generationId, code: (error as any)?.code, durationMs: Date.now() - started });
    try {
      if (generationId) {
        const url = Deno.env.get("SUPABASE_URL")!; const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await createClient(url, key).from("ai_generations").update({ status: "failed", error_code: (error as any)?.code ?? "GENERATION_FAILED", error_message: message.slice(0, 500), duration_ms: Date.now() - started }).eq("id", generationId);
      }
    } catch { /* preserve original error */ }
    return json({ error: message, code: (error as any)?.code ?? "GENERATION_FAILED" }, (error as any)?.status ?? 500);
  }
});
