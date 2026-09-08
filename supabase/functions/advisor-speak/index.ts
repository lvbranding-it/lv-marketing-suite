// Speaks an Advisor reply in the LV Branding voice.
//
// The browser's own speech engine remains the fallback and is never removed:
// this service is billed per use and depends on a third party, so the Advisor
// has to keep talking when it is unavailable, unconfigured, or when a
// representative has run through their allowance.
//
// The voice is a stock narrator directed by the written persona below rather
// than a clone, which is what keeps this to cents a month instead of a monthly
// plan. The key never reaches the browser, so nobody can spend the account
// against OpenAI directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
/**
 * `gpt-4o-mini-tts` accepts the persona instruction below and performs to it.
 * `tts-1` is cheaper per character but ignores instructions entirely, so
 * switching to it trades the brand direction for a flat read.
 */
const OPENAI_TTS_MODEL = Deno.env.get("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts";
/** Warm, grounded, male — the closest stock match to the brand's own voice. */
const OPENAI_TTS_VOICE = Deno.env.get("OPENAI_TTS_VOICE") ?? "ash";

/**
 * How LV Branding sounds. This is the whole brand voice: with a stock narrator
 * the direction is the only thing distinguishing the Advisor from every other
 * product using the same voice, so it is worth writing carefully and worth
 * revising by ear.
 */
function personaFor(language: string): string {
  const base =
    "Speak as a senior brand strategist at LV Branding talking one to one with a colleague. " +
    "Warm, composed and unhurried, with the easy confidence of someone who has had this " +
    "conversation many times. Land on the word that carries the meaning instead of rushing " +
    "to the end of the sentence, and let short pauses do their work. Never sound like an " +
    "announcer, a salesperson or a customer service line: this is trusted advice, quietly given.";
  return language === "es"
    ? `${base} Speak Latin American Spanish, natural and unaccented, as spoken in Mexico.`
    : base;
}

/**
 * A spoken advisor reply is a paragraph or two. The cap is a spend guard rather
 * than a limit anyone should meet: past it the text is cut at a sentence end so
 * the audio finishes on a full thought instead of mid-word.
 */
const MAX_CHARACTERS = 2_000;
/** Per representative, per hour. */
const REQUEST_LIMIT = 30;
const RATE_WINDOW_SECONDS = 3_600;
/**
 * Per workspace, per day. Nothing here is metered by a monthly plan that would
 * stop on its own, so this is the ceiling that turns a runaway loop or a bored
 * afternoon into a small bill rather than a surprising one.
 */
const DAILY_ORG_LIMIT = Number(Deno.env.get("ADVISOR_SPEAK_DAILY_LIMIT") ?? "100");
const DAY_SECONDS = 86_400;

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
  if (!OPENAI_API_KEY) {
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

  const withinLimit = async (scope: string, key: string, limit: number, seconds: number) => {
    const { data, error } = await admin.rpc("consume_edge_rate_limit", {
      p_scope: scope,
      p_key_hash: await sha256Hex(`${scope}:${key}`),
      p_limit: limit,
      p_window_seconds: seconds,
    });
    if (error) console.error(`advisor-speak ${scope} limit check failed`, error.message);
    return data !== false;
  };
  if (!await withinLimit("advisor-speak", auth.user.id, REQUEST_LIMIT, RATE_WINDOW_SECONDS)) {
    return json({ error: "Too many requests", code: "voice_rate_limited" }, 429);
  }
  if (!await withinLimit("advisor-speak-day", orgId, DAILY_ORG_LIMIT, DAY_SECONDS)) {
    return json({ error: "Daily voice budget reached", code: "voice_quota" }, 429);
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        input: text,
        instructions: personaFor(language),
        response_format: "mp3",
      }),
    });
  } catch (error) {
    console.error("advisor-speak upstream request failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Voice service is unavailable", code: "voice_unavailable" }, 502);
  }

  if (!upstream.ok) {
    console.error("advisor-speak upstream error", upstream.status, (await upstream.text()).slice(0, 300));
    // A billing stop is worth naming separately: it is the account, not the
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
    headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});
