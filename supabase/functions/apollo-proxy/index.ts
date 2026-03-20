import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const APOLLO_KEY = Deno.env.get("APOLLO_API_KEY") ?? "";

const apolloHeaders = {
  "Content-Type": "application/json",
  "x-api-key": APOLLO_KEY,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
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
      action: "people_search" | "contacts_search" | "companies_search"
            | "campaigns_search" | "add_to_campaign" | "create_contact";
      params?: Record<string, unknown>;
      campaign_id?: string;
      contact_ids?: string[];
      email_account_id?: string;
    };

    const { action, params = {} } = body;

    // ── People search (Apollo database) ──────────────────────────────────
    if (action === "people_search") {
      const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
        method: "POST",
        headers: apolloHeaders,
        body: JSON.stringify({ ...params, per_page: params.per_page ?? 25, page: params.page ?? 1 }),
      });
      return proxyResponse(res);
    }

    // ── CRM contacts search ───────────────────────────────────────────────
    if (action === "contacts_search") {
      const res = await fetch(`${APOLLO_BASE}/contacts/search`, {
        method: "POST",
        headers: apolloHeaders,
        body: JSON.stringify({ ...params, per_page: params.per_page ?? 25, page: params.page ?? 1 }),
      });
      return proxyResponse(res);
    }

    // ── Company search ────────────────────────────────────────────────────
    if (action === "companies_search") {
      const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
        method: "POST",
        headers: apolloHeaders,
        body: JSON.stringify({ ...params, per_page: params.per_page ?? 25, page: params.page ?? 1 }),
      });
      return proxyResponse(res);
    }

    // ── Sequences (campaigns) search ──────────────────────────────────────
    if (action === "campaigns_search") {
      const res = await fetch(`${APOLLO_BASE}/emailer_campaigns/search`, {
        method: "POST",
        headers: apolloHeaders,
        body: JSON.stringify(params),
      });
      return proxyResponse(res);
    }

    // ── Add contact IDs to a sequence ────────────────────────────────────
    if (action === "add_to_campaign") {
      const { campaign_id, contact_ids, email_account_id } = body;
      if (!campaign_id || !contact_ids?.length || !email_account_id) {
        return json({ error: "campaign_id, contact_ids, and email_account_id are required" }, 400);
      }
      const res = await fetch(`${APOLLO_BASE}/emailer_campaigns/${campaign_id}/add_contact_ids`, {
        method: "POST",
        headers: apolloHeaders,
        body: JSON.stringify({
          emailer_campaign_id: campaign_id,
          contact_ids,
          send_email_from_email_account_id: email_account_id,
        }),
      });
      return proxyResponse(res);
    }

    // ── Create a contact in Apollo CRM ────────────────────────────────────
    if (action === "create_contact") {
      const res = await fetch(`${APOLLO_BASE}/contacts`, {
        method: "POST",
        headers: apolloHeaders,
        body: JSON.stringify(params),
      });
      return proxyResponse(res);
    }

    // ── List email accounts ───────────────────────────────────────────────
    if (action === "email_accounts") {
      const res = await fetch(`${APOLLO_BASE}/email_accounts`, {
        method: "GET",
        headers: apolloHeaders,
      });
      return proxyResponse(res);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function proxyResponse(res: Response) {
  const data = await res.json();
  if (!res.ok) {
    return json({ error: `Apollo API error: ${res.status}`, detail: data }, 502);
  }
  return json(data);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
