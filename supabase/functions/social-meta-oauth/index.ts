import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decryptSocialToken,
  encryptSocialToken,
  graphRequest,
  META_GRAPH_URL,
  socialSha256,
} from "../_shared/social-meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://marketing.lvbranding.com";
const META_APP_ID = Deno.env.get("META_APP_ID") || "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/social-meta-oauth`;
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const redirect = (result: string) => Response.redirect(`${APP_URL}/social-publisher?meta=${result}`, 302);

function requireMetaConfiguration() {
  if (!META_APP_ID || !META_APP_SECRET) throw new Error("Meta application credentials are not configured");
}

async function syncAccounts(db: any, connection: any, clearToken: string) {
  const { data } = await graphRequest(
    "/me/accounts?fields=id,name,access_token,tasks,picture{url},instagram_business_account{id,username,name,profile_picture_url}&limit=100",
    clearToken,
  );
  const { data: existingRows } = await db.from("social_accounts").select("platform,provider_account_id,is_selected").eq("connection_id", connection.id);
  const existingSelection = new Map((existingRows || []).map((account: any) => [`${account.platform}:${account.provider_account_id}`, account.is_selected]));
  await db.from("social_accounts").update({ status: "inactive" }).eq("connection_id", connection.id);
  const discovered: string[] = [];
  for (const page of data.data || []) {
    const pageRow = {
      org_id: connection.org_id,
      connection_id: connection.id,
      platform: "facebook",
      provider_account_id: page.id,
      page_id: page.id,
      display_name: page.name || "Facebook Page",
      profile_image_url: page.picture?.data?.url || null,
      capabilities: { tasks: page.tasks || [], formats: ["text", "link", "image", "video"] },
      is_selected: existingSelection.get(`facebook:${page.id}`) ?? true,
      status: "active",
      last_synced_at: new Date().toISOString(),
    };
    const { data: facebook, error: facebookError } = await db.from("social_accounts")
      .upsert(pageRow, { onConflict: "org_id,platform,provider_account_id" }).select("id").single();
    if (facebookError) throw facebookError;
    await db.from("social_account_credentials").upsert({
      social_account_id: facebook.id,
      encrypted_access_token: await encryptSocialToken(page.access_token),
      updated_at: new Date().toISOString(),
    });
    discovered.push(facebook.id);

    const instagram = page.instagram_business_account;
    if (instagram?.id) {
      const instagramRow = {
        org_id: connection.org_id,
        connection_id: connection.id,
        platform: "instagram",
        provider_account_id: instagram.id,
        page_id: page.id,
        instagram_business_account_id: instagram.id,
        display_name: instagram.name || instagram.username || page.name,
        username: instagram.username || null,
        profile_image_url: instagram.profile_picture_url || null,
        capabilities: { formats: ["image", "carousel", "reel"], linked_page_id: page.id },
        is_selected: existingSelection.get(`instagram:${instagram.id}`) ?? true,
        status: "active",
        last_synced_at: new Date().toISOString(),
      };
      const { data: instagramAccount, error: instagramError } = await db.from("social_accounts")
        .upsert(instagramRow, { onConflict: "org_id,platform,provider_account_id" }).select("id").single();
      if (instagramError) throw instagramError;
      await db.from("social_account_credentials").upsert({
        social_account_id: instagramAccount.id,
        encrypted_access_token: await encryptSocialToken(page.access_token),
        updated_at: new Date().toISOString(),
      });
      discovered.push(instagramAccount.id);
    }
  }
  await db.from("social_connections").update({ status: "active", last_verified_at: new Date().toISOString() }).eq("id", connection.id);
  return discovered.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const rawState = url.searchParams.get("state");
    if (!code || !rawState || url.searchParams.has("error")) return redirect("error");
    const stateHash = await socialSha256(rawState);
    const { data: state } = await db.from("social_oauth_states").select("*")
      .eq("state_hash", stateHash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!state) return redirect("expired");
    await db.from("social_oauth_states").delete().eq("state_hash", stateHash);
    try {
      requireMetaConfiguration();
      const tokenUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", META_APP_ID);
      tokenUrl.searchParams.set("client_secret", META_APP_SECRET);
      tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      tokenUrl.searchParams.set("code", code);
      const shortResponse = await fetch(tokenUrl);
      const short = await shortResponse.json();
      if (!shortResponse.ok || !short.access_token) throw new Error("Meta authorization exchange failed");

      const longUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", META_APP_ID);
      longUrl.searchParams.set("client_secret", META_APP_SECRET);
      longUrl.searchParams.set("fb_exchange_token", short.access_token);
      const longResponse = await fetch(longUrl);
      const long = await longResponse.json();
      const accessToken = long.access_token || short.access_token;
      const expiresIn = Number(long.expires_in || short.expires_in || 0);
      const permissions = await graphRequest("/me/permissions", accessToken);
      const grantedScopes = (permissions.data.data || [])
        .filter((permission: any) => permission.status === "granted")
        .map((permission: any) => permission.permission);
      const { data: connection, error } = await db.from("social_connections").upsert({
        org_id: state.org_id,
        provider: "meta",
        authorized_by_user_id: state.user_id,
        encrypted_access_token: await encryptSocialToken(accessToken),
        token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
        granted_scopes: grantedScopes,
        status: "active",
        last_verified_at: new Date().toISOString(),
      }, { onConflict: "org_id,provider" }).select("*").single();
      if (error) throw error;
      await syncAccounts(db, connection, accessToken);
      await db.from("social_activity_log").insert({
        org_id: state.org_id, actor_user_id: state.user_id, entity_type: "social_connection",
        entity_id: connection.id, action: "connected", metadata: { provider: "meta" },
      });
      return redirect("connected");
    } catch (error) {
      console.error("Meta OAuth callback failed", error instanceof Error ? error.message : "unknown");
      return redirect("error");
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);
  const input = await req.json().catch(() => ({}));
  const orgId = String(input.org_id || "");
  const { data: member } = await db.from("team_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "Administrator access required" }, 403);

  try {
    requireMetaConfiguration();
    if (input.action === "disconnect") {
      const { data: connection } = await db.from("social_connections").select("id").eq("org_id", orgId).eq("provider", "meta").maybeSingle();
      if (connection) {
        await db.from("social_activity_log").insert({ org_id: orgId, actor_user_id: user.id, entity_type: "social_connection", entity_id: connection.id, action: "disconnected" });
        const { data: accountRows } = await db.from("social_accounts").select("id").eq("connection_id", connection.id);
        const accountIds = (accountRows || []).map((account: any) => account.id);
        if (accountIds.length) await db.from("social_account_credentials").delete().in("social_account_id", accountIds);
        await db.from("social_accounts").update({ status: "action_required" }).eq("connection_id", connection.id);
        await db.from("social_connections").update({
          status: "disconnected", encrypted_access_token: await encryptSocialToken(`revoked:${crypto.randomUUID()}`),
          token_expires_at: null, granted_scopes: [], last_verified_at: new Date().toISOString(),
        }).eq("id", connection.id);
      }
      return json({ success: true });
    }
    if (input.action === "sync") {
      const { data: connection } = await db.from("social_connections").select("*").eq("org_id", orgId).eq("provider", "meta").maybeSingle();
      if (!connection || connection.status !== "active") return json({ error: "Meta is not connected" }, 404);
      const count = await syncAccounts(db, connection, await decryptSocialToken(connection.encrypted_access_token));
      return json({ success: true, count });
    }

    const rawState = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await db.from("social_oauth_states").insert({
      state_hash: await socialSha256(rawState), org_id: orgId, user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    const authUrl = new URL("https://www.facebook.com/dialog/oauth");
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("state", rawState);
    authUrl.searchParams.set("scope", SCOPES.join(","));
    authUrl.searchParams.set("response_type", "code");
    return json({ url: authUrl.toString(), permissions: SCOPES });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Meta connection failed" }, 503);
  }
});
