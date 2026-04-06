// supabase/functions/create-session-invoice/index.ts
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
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[create-session-invoice] Request received");

  try {
    // ── Auth check ───────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      console.log("[create-session-invoice] No auth header");
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("[create-session-invoice] Missing SUPABASE env vars");
      return json({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      console.log("[create-session-invoice] Auth failed:", authErr?.message);
      return json({ error: "Unauthorized" }, 401);
    }

    console.log("[create-session-invoice] Authenticated as", user.id);

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as { session_id?: string };
    const { session_id } = body;
    if (!session_id) return json({ error: "session_id required" }, 400);

    // ── Load session ─────────────────────────────────────────────────────────
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, name, client_name, client_email, session_fee, session_invoice_url")
      .eq("id", session_id)
      .single();

    if (sessErr || !session) {
      console.error("[create-session-invoice] Session load error:", sessErr?.message);
      return json({ error: "Session not found" }, 404);
    }

    // Already has an invoice
    if (session.session_invoice_url) {
      return json({ ok: true, invoice_url: session.session_invoice_url });
    }

    // ── Wave config ──────────────────────────────────────────────────────────
    const waveApiKey     = Deno.env.get("WAVE_API_KEY");
    const waveBusinessId = Deno.env.get("WAVE_BUSINESS_ID");

    if (!waveApiKey || !waveBusinessId) {
      console.error("[create-session-invoice] Wave not configured");
      return json({ error: "Wave is not configured. Set WAVE_API_KEY and WAVE_BUSINESS_ID." }, 500);
    }

    // ── Fetch Wave income account (required for product creation) ────────────
    console.log("[create-session-invoice] Fetching Wave accounts");
    const accountsResult = await waveGQL(waveApiKey, `
      query GetAccounts($businessId: ID!) {
        business(id: $businessId) {
          accounts(types: [INCOME], page: 1, pageSize: 10) {
            edges {
              node { id name }
            }
          }
        }
      }
    `, { businessId: waveBusinessId });

    console.log("[create-session-invoice] Accounts result:", JSON.stringify(accountsResult));
    const incomeAccountId = accountsResult?.data?.business?.accounts?.edges?.[0]?.node?.id;
    if (!incomeAccountId) {
      return json({ error: "Could not find a Wave income account. Please ensure your Wave account has at least one income account configured.", detail: accountsResult }, 500);
    }

    // ── Create Wave product ───────────────────────────────────────────────────
    console.log("[create-session-invoice] Creating Wave product");
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
        name: "Photography Session",
        unitPrice: Number(session.session_fee ?? 0),
        incomeAccountId,
      },
    });

    console.log("[create-session-invoice] Product result:", JSON.stringify(productResult));
    const productId = productResult?.data?.productCreate?.product?.id;
    if (!productId) {
      return json({ error: "Failed to create Wave product", detail: productResult }, 500);
    }

    // ── Create/find Wave customer ────────────────────────────────────────────
    console.log("[create-session-invoice] Creating Wave customer");
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
        ...(session.client_email ? { email: session.client_email } : {}),
      },
    });

    console.log("[create-session-invoice] Customer result:", JSON.stringify(customerResult));
    const customerId = customerResult?.data?.customerCreate?.customer?.id;
    if (!customerId) {
      return json({ error: "Failed to create Wave customer", detail: customerResult }, 500);
    }

    // ── Create Wave invoice ──────────────────────────────────────────────────
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    console.log("[create-session-invoice] Creating Wave invoice");
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
        memo: `Photography session: ${session.name}`,
        items: [
          {
            productId,
            description: `Photography session: ${session.name}`,
            quantity: 1,
            unitPrice: Number(session.session_fee ?? 0),
          },
        ],
      },
    });

    console.log("[create-session-invoice] Invoice result:", JSON.stringify(invoiceResult));
    const invoice = invoiceResult?.data?.invoiceCreate?.invoice;
    if (!invoice) {
      return json({ error: "Failed to create Wave invoice", detail: invoiceResult }, 500);
    }

    // ── Save to session ──────────────────────────────────────────────────────
    await supabaseAdmin.from("photo_sessions").update({
      session_invoice_id: invoice.id,
      session_invoice_url: invoice.viewUrl,
      session_invoice_sent_at: new Date().toISOString(),
    }).eq("id", session_id);

    console.log("[create-session-invoice] Done, invoice URL:", invoice.viewUrl);
    return json({ ok: true, invoice_url: invoice.viewUrl });

  } catch (err) {
    console.error("[create-session-invoice] Uncaught error:", err);
    return json({ error: "Internal server error", detail: String(err) }, 500);
  }
});
