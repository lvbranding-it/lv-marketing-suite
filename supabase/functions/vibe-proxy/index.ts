import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VIBE_BASE = "https://api.explorium.ai";
const VIBE_API_KEY = Deno.env.get("VIBE_API_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Validate Supabase auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json() as {
      action: "search" | "enrich" | "stats";
      filters?: Record<string, unknown>;
      entity_type?: "prospects" | "businesses";
      size?: number;
      page?: number;
      table_name?: string;
      session_id?: string;
      enrichments?: string[];
    };

    const { action, filters = {}, entity_type = "prospects", size = 25, page = 0 } = body;

    if (action === "search") {
      // POST /v2/{entity_type}/fetch
      const endpoint = `${VIBE_BASE}/v2/${entity_type}/fetch`;
      const vibeRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api_key": VIBE_API_KEY,
        },
        body: JSON.stringify({ filters, size, page }),
      });

      if (!vibeRes.ok) {
        const errText = await vibeRes.text();
        return json({ error: `Vibe API error: ${vibeRes.status}`, detail: errText }, 502);
      }

      const data = await vibeRes.json();
      return json(data);
    }

    if (action === "stats") {
      const endpoint = `${VIBE_BASE}/v2/${entity_type}/statistics`;
      const vibeRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api_key": VIBE_API_KEY,
        },
        body: JSON.stringify({ filters }),
      });
      if (!vibeRes.ok) {
        const errText = await vibeRes.text();
        return json({ error: `Vibe API error: ${vibeRes.status}`, detail: errText }, 502);
      }
      const data = await vibeRes.json();
      return json(data);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
