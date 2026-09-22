import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyMetaFailure,
  decryptSocialToken,
  graphRequest,
  MetaApiError,
  safeMetaMessage,
} from "../_shared/social-meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WORKER_SECRET = Deno.env.get("SOCIAL_PUBLISHER_WORKER_SECRET") || "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-social-publisher-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

type Asset = { public_url: string; media_type: "image" | "video"; position: number };
type Variant = {
  id: string;
  org_id: string;
  social_post_id: string;
  platform: "facebook" | "instagram";
  format: "text" | "link" | "image" | "video" | "carousel" | "reel";
  caption: string;
  link_url: string | null;
  provider_container_id: string | null;
  provider_post_id: string | null;
  social_account_id: string;
};

async function publishFacebook(account: any, variant: Variant, assets: Asset[], token: string) {
  let path = `/${account.page_id}/feed`;
  const body = new URLSearchParams({ message: variant.caption || "", published: "true" });
  if (variant.format === "link" && variant.link_url) body.set("link", variant.link_url);
  if (variant.format === "image") {
    path = `/${account.page_id}/photos`;
    body.set("url", assets[0].public_url);
    body.set("caption", variant.caption || "");
    body.delete("message");
  }
  if (variant.format === "video") {
    path = `/${account.page_id}/videos`;
    body.set("file_url", assets[0].public_url);
    body.set("description", variant.caption || "");
    body.delete("message");
  }
  const { data, requestId } = await graphRequest(path, token, { method: "POST", body });
  const postId = data.post_id || data.id;
  let permalink: string | null = null;
  if (postId) {
    try {
      const lookup = await graphRequest(`/${postId}?fields=permalink_url`, token);
      permalink = lookup.data.permalink_url || null;
    } catch { /* The provider id is still authoritative. */ }
  }
  return { postId, permalink, requestId, containerId: null };
}

async function waitForContainer(containerId: string, token: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data } = await graphRequest(`/${containerId}?fields=status_code,status`, token);
    if (!data.status_code || data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new MetaApiError(`Instagram media processing ${String(data.status_code).toLowerCase()}`, { status: 400 });
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 + attempt * 750, 5000)));
  }
  throw new MetaApiError("Instagram media is still processing", { status: 503, isTransient: true });
}

async function createInstagramItem(accountId: string, asset: Asset, token: string, isCarouselItem = false) {
  const body = new URLSearchParams();
  if (asset.media_type === "video") {
    body.set("video_url", asset.public_url);
    body.set("media_type", isCarouselItem ? "VIDEO" : "REELS");
  } else {
    body.set("image_url", asset.public_url);
  }
  if (isCarouselItem) body.set("is_carousel_item", "true");
  const { data } = await graphRequest(`/${accountId}/media`, token, { method: "POST", body });
  if (!data.id) throw new MetaApiError("Instagram did not return a media container", { status: 502, isTransient: true });
  if (asset.media_type === "video") await waitForContainer(data.id, token);
  return data.id as string;
}

async function publishInstagram(db: any, account: any, variant: Variant, assets: Asset[], token: string) {
  const accountId = account.instagram_business_account_id || account.provider_account_id;
  let containerId = variant.provider_container_id;
  if (!containerId) {
    if (variant.format === "carousel") {
      const children: string[] = [];
      for (const asset of assets) children.push(await createInstagramItem(accountId, asset, token, true));
      const body = new URLSearchParams({
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: variant.caption || "",
      });
      const result = await graphRequest(`/${accountId}/media`, token, { method: "POST", body });
      containerId = result.data.id;
    } else {
      const asset = assets[0];
      const body = new URLSearchParams({ caption: variant.caption || "" });
      if (variant.format === "reel" || asset.media_type === "video") {
        body.set("video_url", asset.public_url);
        body.set("media_type", "REELS");
        body.set("share_to_feed", "true");
      } else {
        body.set("image_url", asset.public_url);
      }
      const result = await graphRequest(`/${accountId}/media`, token, { method: "POST", body });
      containerId = result.data.id;
    }
    if (!containerId) throw new MetaApiError("Instagram did not return a media container", { status: 502, isTransient: true });
    // Persist before media_publish. If the provider response is lost later, a
    // retry can inspect/reuse this container rather than creating a duplicate.
    await db.from("social_post_variants").update({ provider_container_id: containerId }).eq("id", variant.id);
  }
  await waitForContainer(containerId, token);
  const body = new URLSearchParams({ creation_id: containerId });
  const { data, requestId } = await graphRequest(`/${accountId}/media_publish`, token, { method: "POST", body });
  const postId = data.id;
  let permalink: string | null = null;
  if (postId) {
    try {
      const lookup = await graphRequest(`/${postId}?fields=permalink`, token);
      permalink = lookup.data.permalink || null;
    } catch { /* The provider id is still authoritative. */ }
  }
  return { postId, permalink, requestId, containerId };
}

async function refreshPostAggregate(db: any, postId: string) {
  const { data: variants } = await db.from("social_post_variants").select("publication_status").eq("social_post_id", postId);
  const states = (variants || []).map((variant: any) => variant.publication_status);
  let workflow = "publishing";
  if (states.length && states.every((state: string) => state === "published")) workflow = "published";
  else if (states.includes("published") && states.some((state: string) => ["failed", "connection_required"].includes(state))) workflow = "partially_published";
  else if (states.length && states.every((state: string) => ["failed", "connection_required"].includes(state))) {
    workflow = states.includes("connection_required") ? "connection_required" : "failed";
  }
  await db.from("social_posts").update({ workflow_status: workflow }).eq("id", postId);
}

async function processJob(db: any, job: any) {
  const startedAt = new Date().toISOString();
  await db.from("social_publish_attempts").insert({
    org_id: job.org_id, publish_job_id: job.id, attempt_number: job.attempt_count, started_at: startedAt,
  });
  const { data: variant } = await db.from("social_post_variants").select("*").eq("id", job.post_variant_id).single();
  if (!variant) throw new Error("Variant not found");
  if (variant.provider_post_id) {
    await db.from("social_publish_jobs").update({ status: "published", locked_at: null, locked_by: null }).eq("id", job.id);
    return { job: job.id, status: "published", duplicatePrevented: true };
  }
  await db.from("social_post_variants").update({ publication_status: "publishing" }).eq("id", variant.id);
  await db.from("social_posts").update({ workflow_status: "publishing" }).eq("id", variant.social_post_id);

  try {
    const [{ data: account }, { data: credential }, { data: assets }] = await Promise.all([
      db.from("social_accounts").select("*").eq("id", variant.social_account_id).single(),
      db.from("social_account_credentials").select("encrypted_access_token").eq("social_account_id", variant.social_account_id).single(),
      db.from("social_post_assets").select("public_url,media_type,position").eq("post_variant_id", variant.id).order("position"),
    ]);
    if (!account || account.status !== "active" || !credential) {
      throw new MetaApiError("The destination account must be reconnected", { status: 401, code: 190 });
    }
    const token = await decryptSocialToken(credential.encrypted_access_token);
    const result = variant.platform === "facebook"
      ? await publishFacebook(account, variant, assets || [], token)
      : await publishInstagram(db, account, variant, assets || [], token);
    if (!result.postId) throw new MetaApiError("Meta did not return a published post id", { status: 502, isTransient: true });

    const completedAt = new Date().toISOString();
    await db.from("social_post_variants").update({
      publication_status: "published", provider_container_id: result.containerId,
      provider_post_id: result.postId, provider_permalink: result.permalink, published_at: completedAt,
    }).eq("id", variant.id);
    await db.from("social_publish_jobs").update({ status: "published", locked_at: null, locked_by: null, last_error_category: null, last_error_message_safe: null }).eq("id", job.id);
    await db.from("social_publish_attempts").update({
      completed_at: completedAt, result: "published", provider_request_id: result.requestId,
      safe_diagnostics: { provider_post_id: result.postId },
    }).eq("publish_job_id", job.id).eq("attempt_number", job.attempt_count);
    await db.from("social_activity_log").insert({
      org_id: job.org_id, entity_type: "social_post_variant", entity_id: variant.id,
      action: "published", metadata: { platform: variant.platform, provider_post_id: result.postId },
    });
    await refreshPostAggregate(db, variant.social_post_id);
    return { job: job.id, status: "published" };
  } catch (error) {
    const category = classifyMetaFailure(error);
    const retry = category === "temporary" && job.attempt_count < job.max_attempts;
    const retryDelayMinutes = Math.min(2 ** Math.max(job.attempt_count - 1, 0), 30);
    const jobStatus = retry ? "retrying" : "failed";
    const variantStatus = category === "authentication" ? "connection_required" : "failed";
    const message = safeMetaMessage(error);
    await db.from("social_publish_jobs").update({
      status: jobStatus,
      next_attempt_at: retry ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString() : null,
      locked_at: null, locked_by: null, last_error_category: category, last_error_message_safe: message,
    }).eq("id", job.id);
    await db.from("social_post_variants").update({ publication_status: retry ? "scheduled" : variantStatus }).eq("id", variant.id);
    if (category === "authentication") {
      await db.from("social_accounts").update({ status: "action_required" }).eq("id", variant.social_account_id);
      await db.from("social_connections").update({ status: "action_required" }).eq("id", (await db.from("social_accounts").select("connection_id").eq("id", variant.social_account_id).single()).data?.connection_id);
    }
    await db.from("social_publish_attempts").update({
      completed_at: new Date().toISOString(),
      result: category === "temporary" ? "temporary_failure" : category === "authentication" ? "authentication_failure" : category === "ambiguous" ? "ambiguous_failure" : "permanent_failure",
      provider_request_id: error instanceof MetaApiError ? error.requestId : null,
      provider_response_code: error instanceof MetaApiError ? error.status : null,
      safe_diagnostics: { category, message },
    }).eq("publish_job_id", job.id).eq("attempt_number", job.attempt_count);
    await db.from("social_activity_log").insert({
      org_id: job.org_id, entity_type: "social_post_variant", entity_id: variant.id,
      action: retry ? "publish_retry_scheduled" : "publish_failed", metadata: { category, attempt: job.attempt_count },
    });
    await refreshPostAggregate(db, variant.social_post_id);
    return { job: job.id, status: jobStatus, category };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const authorization = req.headers.get("Authorization") || "";
  const schedulerAuthorized = Boolean(WORKER_SECRET) && req.headers.get("x-social-publisher-secret") === WORKER_SECRET;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let user: any = null;
  if (!schedulerAuthorized) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
    user = (await userClient.auth.getUser()).data.user;
    if (!user) return json({ error: "Authentication required" }, 401);
    if (!body.job_id) return json({ error: "A job id is required for manual processing" }, 400);
    const { data: job } = await db.from("social_publish_jobs").select("org_id").eq("id", body.job_id).maybeSingle();
    const { data: member } = job ? await db.from("team_members").select("role").eq("org_id", job.org_id).eq("user_id", user.id).maybeSingle() : { data: null };
    if (!member || !["owner", "admin", "manager"].includes(member.role)) return json({ error: "Publishing access required" }, 403);
  }

  const worker = `social-publish-${crypto.randomUUID()}`;
  const { data: jobs, error } = await db.rpc("claim_social_publish_jobs", {
    p_worker: worker, p_limit: schedulerAuthorized ? Math.min(Number(body.limit) || 10, 50) : 1,
    p_job_id: body.job_id || null,
  });
  if (error) return json({ error: "Unable to claim publishing jobs" }, 500);
  const results = [];
  for (const job of jobs || []) results.push(await processJob(db, job));
  return json({ success: true, claimed: results.length, results });
});
