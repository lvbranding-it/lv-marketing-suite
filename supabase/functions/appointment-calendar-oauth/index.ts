import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken, requireProviderCredentials, sha256, type CalendarProvider } from "../_shared/appointment-calendar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://marketing.lvbranding.com";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/appointment-calendar-oauth`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const redirect = (query: string) => Response.redirect(`${APP_URL}/appointments?${query}`, 302);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const rawState = url.searchParams.get("state");
    if (!code || !rawState) return redirect("calendar=error");
    const stateHash = await sha256(rawState);
    const { data: state } = await db.from("appointment_oauth_states").select("*").eq("state_hash", stateHash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!state) return redirect("calendar=expired");
    await db.from("appointment_oauth_states").delete().eq("state_hash", stateHash);
    try {
      const provider = state.provider as CalendarProvider;
      const credentials = requireProviderCredentials(provider);
      const body = new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, code, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" });
      const tokenResponse = await fetch(credentials.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!tokenResponse.ok) throw new Error(`Token exchange failed (${tokenResponse.status})`);
      const tokens = await tokenResponse.json();
      let accountEmail = "";
      if (provider === "google") {
        const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        accountEmail = (await profile.json()).email || "";
      } else {
        const profile = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        const value = await profile.json();
        accountEmail = value.mail || value.userPrincipalName || "";
      }
      const encryptedRefresh = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null;
      const existing = await db.from("appointment_calendar_connections").select("encrypted_refresh_token").eq("host_id", state.host_id).maybeSingle();
      const { error: saveError } = await db.from("appointment_calendar_connections").upsert({
        host_id: state.host_id, org_id: state.org_id, provider, account_email: accountEmail,
        encrypted_access_token: await encryptToken(tokens.access_token),
        encrypted_refresh_token: encryptedRefresh || existing.data?.encrypted_refresh_token,
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        scopes: tokens.scope || null, connected_by: state.user_id,
      }, { onConflict: "host_id" });
      if (saveError) throw saveError;
      return redirect("calendar=connected");
    } catch (error) {
      console.error("Calendar OAuth callback failed", error);
      return redirect("calendar=error");
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);
  const input = await req.json().catch(() => ({}));
  const provider = input.provider as CalendarProvider;
  if (!(["google", "microsoft"] as string[]).includes(provider) || !input.host_id) return json({ error: "Invalid calendar connection" }, 400);
  const { data: host } = await db.from("appointment_hosts").select("id,org_id,email").eq("id", input.host_id).maybeSingle();
  if (!host) return json({ error: "Team member not found" }, 404);
  const { data: member } = await db.from("team_members").select("role").eq("org_id", host.org_id).eq("user_id", user.id).maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "Administrator access required" }, 403);
  let credentials;
  try { credentials = requireProviderCredentials(provider); } catch (error) { return json({ error: (error as Error).message }, 503); }
  const rawState = crypto.randomUUID() + crypto.randomUUID();
  await db.from("appointment_oauth_states").insert({ state_hash: await sha256(rawState), host_id: host.id, org_id: host.org_id, user_id: user.id, provider, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  const auth = provider === "google" ? new URL("https://accounts.google.com/o/oauth2/v2/auth") : new URL(`https://login.microsoftonline.com/${Deno.env.get("MICROSOFT_CALENDAR_TENANT") || "common"}/oauth2/v2.0/authorize`);
  auth.searchParams.set("client_id", credentials.clientId);
  auth.searchParams.set("redirect_uri", REDIRECT_URI);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("state", rawState);
  auth.searchParams.set("scope", provider === "google" ? "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy" : "openid email offline_access User.Read Calendars.ReadWrite");
  if (provider === "google") { auth.searchParams.set("access_type", "offline"); auth.searchParams.set("prompt", "consent"); auth.searchParams.set("include_granted_scopes", "true"); auth.searchParams.set("login_hint", host.email); }
  return json({ url: auth.toString() });
});
