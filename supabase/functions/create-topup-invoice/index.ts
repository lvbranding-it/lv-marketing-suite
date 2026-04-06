// supabase/functions/create-topup-invoice/index.ts
// Creates a Wave invoice for extra photos on an already-finalized session.
// Used when finalize-session ran before Wave was configured, or when it failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function waveGQL(apiKey: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://gql.waveapps.com/graphql/public", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  console.log("[create-topup-invoice] Wave response:", text.slice(0, 500));
  try { return JSON.parse(text); } catch { return { _rawText: text }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[create-topup-invoice] Request received");

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Body ─────────────────────────────────────────────────────────────────
    const { session_id } = (await req.json().catch(() => ({}))) as { session_id?: string };
    if (!session_id) return json({ error: "session_id required" }, 400);

    // ── Load session ─────────────────────────────────────────────────────────
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, name, client_name, client_email, photo_limit, extra_photo_price, finalized_at, wave_invoice_id, wave_invoice_url")
      .eq("id", session_id)
      .single();

    if (sessErr || !session) return json({ error: "Session not found" }, 404);

    if (!session.finalized_at) {
      return json({ error: "Session is not yet finalized. The client must confirm their selection first." }, 400);
    }

    // Already has a Wave invoice — return it
    if (session.wave_invoice_id) {
      return json({ ok: true, invoice_url: session.wave_invoice_url });
    }

    if (!session.client_email) {
      return json({ error: "No client email on this session." }, 400);
    }

    // ── Count selected/processed photos ──────────────────────────────────────
    const { data: chosenPhotos } = await supabaseAdmin
      .from("session_photos")
      .select("id")
      .eq("session_id", session_id)
      .in("status", ["selected", "editing", "ready", "ready_for_download"]);

    const chosenCount = chosenPhotos?.length ?? 0;
    const photoLimit = session.photo_limit ?? 0;
    const extraPrice = Number(session.extra_photo_price ?? 0);
    const extraCount = photoLimit > 0 ? Math.max(0, chosenCount - photoLimit) : 0;
    const extraTotal = extraCount * extraPrice;

    console.log(`[create-topup-invoice] chosen=${chosenCount} limit=${photoLimit} extras=${extraCount} total=${extraTotal}`);

    if (extraCount === 0 || extraTotal === 0) {
      return json({ error: "No extra photos to invoice (client stayed within the included limit)." }, 400);
    }

    // ── Wave config ───────────────────────────────────────────────────────────
    const waveApiKey     = Deno.env.get("WAVE_API_KEY");
    const waveBusinessId = Deno.env.get("WAVE_BUSINESS_ID");
    if (!waveApiKey || !waveBusinessId) return json({ error: "Wave is not configured." }, 500);

    // ── Step 1: Fetch income account ──────────────────────────────────────────
    const accountsResult = await waveGQL(waveApiKey, `
      query GetAccounts($businessId: ID!) {
        business(id: $businessId) {
          accounts(types: [INCOME], page: 1, pageSize: 10) {
            edges { node { id name } }
          }
        }
      }
    `, { businessId: waveBusinessId });

    const incomeAccountId = accountsResult?.data?.business?.accounts?.edges?.[0]?.node?.id;
    if (!incomeAccountId) {
      return json({ error: "No Wave income account found.", detail: accountsResult }, 500);
    }

    // ── Step 2: Create product ────────────────────────────────────────────────
    const productResult = await waveGQL(waveApiKey, `
      mutation ProductCreate($input: ProductCreateInput!) {
        productCreate(input: $input) {
          didSucceed
          inputErrors { code message path }
          product { id }
        }
      }
    `, {
      input: {
        businessId: waveBusinessId,
        name: "Extra Photos",
        unitPrice: extraPrice,
        incomeAccountId,
      },
    });

    const productId = productResult?.data?.productCreate?.product?.id;
    if (!productId) return json({ error: "Failed to create Wave product", detail: productResult }, 500);

    // ── Step 3: Create customer ───────────────────────────────────────────────
    const customerResult = await waveGQL(waveApiKey, `
      mutation CustomerCreate($input: CustomerCreateInput!) {
        customerCreate(input: $input) {
          didSucceed
          inputErrors { code message path }
          customer { id }
        }
      }
    `, {
      input: {
        businessId: waveBusinessId,
        name: session.client_name,
        email: session.client_email,
      },
    });

    const customerId = customerResult?.data?.customerCreate?.customer?.id;
    if (!customerId) return json({ error: "Failed to create Wave customer", detail: customerResult }, 500);

    // ── Step 4: Create invoice ────────────────────────────────────────────────
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    const invoiceResult = await waveGQL(waveApiKey, `
      mutation InvoiceCreate($input: InvoiceCreateInput!) {
        invoiceCreate(input: $input) {
          didSucceed
          inputErrors { code message path }
          invoice { id viewUrl }
        }
      }
    `, {
      input: {
        businessId: waveBusinessId,
        customerId,
        status: "SAVED",
        dueDate: dueDate.toISOString().split("T")[0],
        memo: `Extra photos from session: ${session.name}`,
        items: [
          {
            productId,
            description: `Extra photo selection — ${extraCount} photo${extraCount !== 1 ? "s" : ""} beyond package limit`,
            quantity: extraCount,
            unitPrice: extraPrice,
          },
        ],
      },
    });

    const invoice = invoiceResult?.data?.invoiceCreate?.invoice;
    if (!invoice) return json({ error: "Failed to create Wave invoice", detail: invoiceResult }, 500);

    // ── Save to session ───────────────────────────────────────────────────────
    await supabaseAdmin.from("photo_sessions").update({
      wave_invoice_id: invoice.id,
      wave_invoice_url: invoice.viewUrl,
    }).eq("id", session_id);

    console.log("[create-topup-invoice] Done, invoice URL:", invoice.viewUrl);
    return json({ ok: true, invoice_url: invoice.viewUrl });

  } catch (err) {
    console.error("[create-topup-invoice] Uncaught error:", err);
    return json({ error: "Internal server error", detail: String(err) }, 500);
  }
});
