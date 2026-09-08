// Speaks an Advisor reply in the LV Branding voice.
//
// The browser's own speech engine remains the fallback and is never removed:
// this service is metered per character and depends on a third party, so the
// Advisor has to keep talking when it is unavailable, unconfigured, or when a
// representative has run through their hourly allowance.
//
// The cloned voice id and key live only here. Neither reaches the browser, so
// nobody can spend the account's characters by calling ElevenLabs directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "";
/** Multilingual so one cloned voice carries both English and Spanish. */
const ELEVENLABS_MODEL = Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2";

/**
 * A spoken advisor reply is a paragraph or two. The cap is a spend guard rather
 * than a limit anyone should meet: past it the text is cut at a sentence end so
 * the audio finishes on a full thought instead of mid-word.
 */
const MAX_CHARACTERS = 2_000;
/** Per representative, per hour. */
const REQUEST_LIMIT = 30;
const RATE_WINDOW_SECONDS = 3_600;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Trims to the cap on a sentence boundary where one is close enough to use. */
function boundedText(raw: string): string {
  const text = raw.trim();
  if (text.length <= MAX_CHARACTERS) return text;
  const cut = text.slice(0, MAX_CHARACTERS);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return lastStop > MAX_CHARACTERS * 0.6 ? cut.slice(0, lastStop + 1) : cut;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Reported as a normal, expected state: the client falls back to the browser
  // voice rather than showing anyone an error.
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return json({ error: "Voice service is not configured", code: "voice_unconfigured" }, 503);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Voice service is unavailable", code: "voice_unavailable" }, 503);
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const language = body.language === "es" ? "es" : "en";
  const text = boundedText(typeof body.text === "string" ? body.text : "");
  if (!uuid.test(orgId) || !text) return json({ error: "Invalid request" }, 400);

  // Membership is checked as the caller, so this speaks only for a workspace the
  // representative actually belongs to.
  const scoped = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: role, error: roleError } = await scoped.rpc("portal_role", { p_org: orgId });
  if (roleError || !role) return json({ error: "Not authorized" }, 403);

  const { data: allowed, error: limitError } = await admin.rpc("consume_edge_rate_limit", {
    p_scope: "advisor-speak",
    p_key_hash: await sha256Hex(`advisor-speak:${auth.user.id}`),
    p_limit: REQUEST_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (limitError) console.error("advisor-speak rate limit check failed", limitError.message);
  if (allowed === false) {
    return json({ error: "Too many requests", code: "voice_rate_limited" }, 429);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          // Tuned for a brand narrator rather than a performance: stable enough
          // to sound like the same person every time, close enough to the clone
          // to be recognisably it, and no added style so it never over-acts a
          // straight piece of advice.
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.85,
            style: 0,
            use_speaker_boost: true,
          },
        }),
      },
    );
  } catch (error) {
    console.error("advisor-speak upstream request failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Voice service is unavailable", code: "voice_unavailable" }, 502);
  }

  if (!upstream.ok) {
    console.error("advisor-speak upstream error", upstream.status, (await upstream.text()).slice(0, 300));
    // Quota exhaustion is the one worth naming: it is the account, not the
    // request, and it will keep failing until somebody tops it up.
    const code = upstream.status === 401 ? "voice_unconfigured"
      : upstream.status === 429 ? "voice_quota"
      : "voice_unavailable";
    return json({ error: "Voice service is unavailable", code }, 502);
  }

  // Characters are the billed unit, so every request records what it spent.
  console.log(`advisor-speak spoke ${text.length} characters (${language}) for ${auth.user.id}`);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
});
