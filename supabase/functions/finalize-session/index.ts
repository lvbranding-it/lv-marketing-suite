// supabase/functions/finalize-session/index.ts
// ─────────────────────────────────────────────
// Called by the anonymous client after they confirm their photo selection.
//
// Steps:
//   1. Validate share_token → resolve session
//   2. Guard against double-finalization
//   3. Count selected photos & calculate extras cost
//   4. Create a Wave invoice if extras > 0 and WAVE_API_KEY is configured
//      (creates product → creates customer → creates invoice)
//   5. Mark session as finalized (finalized_at, wave_invoice_id, wave_invoice_url)
//   6. Email the photographer via SendGrid (if SENDGRID_API_KEY is configured)
//   7. Return result to client
//
// Deployed with --no-verify-jwt so anon browsers can call it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function waveGQL(apiKey: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://gql.waveapps.com/graphql/public", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  console.log("[finalize-session] Wave response:", text.slice(0, 500));
  try { return JSON.parse(text); } catch { return { _rawText: text }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { share_token } = (await req.json()) as { share_token: string };

    if (!share_token) {
      return new Response(JSON.stringify({ error: "share_token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Service-role client (bypasses RLS) ───────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Resolve session from share_token ──────────────────────────────────
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, name, client_name, client_email, cc_emails, photo_limit, extra_photo_price, finalized_at, created_by, org_id")
      .eq("share_token", share_token)
      .single();

    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Guard: already finalized? return current data ─────────────────────
    if (session.finalized_at) {
      const { data: existingSession } = await supabaseAdmin
        .from("photo_sessions")
        .select("wave_invoice_url, finalized_at")
        .eq("id", session.id)
        .single();
      return new Response(
        JSON.stringify({
          ok: true,
          already_finalized: true,
          wave_invoice_url: existingSession?.wave_invoice_url ?? null,
          extra_count: 0,
          extra_total: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Count selected photos & calculate extras ──────────────────────────
    const { data: selectedPhotos } = await supabaseAdmin
      .from("session_photos")
      .select("id")
      .eq("session_id", session.id)
      .eq("status", "selected");

    const selectedCount = selectedPhotos?.length ?? 0;
    const photoLimit = session.photo_limit ?? 0;
    const extraPrice = Number(session.extra_photo_price ?? 0);
    const extraCount = photoLimit > 0 ? Math.max(0, selectedCount - photoLimit) : 0;
    const extraTotal = extraCount * extraPrice;

    console.log(`[finalize-session] selected=${selectedCount} limit=${photoLimit} extras=${extraCount} total=${extraTotal}`);

    // ── 4. Create Wave invoice (only if extras exist and Wave is configured) ──
    let waveInvoiceId: string | null = null;
    let waveInvoiceUrl: string | null = null;

    const waveApiKey = Deno.env.get("WAVE_API_KEY");
    const waveBusinessId = Deno.env.get("WAVE_BUSINESS_ID");

    if (waveApiKey && waveBusinessId && extraCount > 0 && extraTotal > 0 && session.client_email) {
      try {
        // Step 4a: Fetch income account (required for product creation)
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
        if (!incomeAccountId) throw new Error("No Wave income account found");

        // Step 4b: Create product for extra photos
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
        if (!productId) throw new Error(`Wave product creation failed: ${JSON.stringify(productResult)}`);

        // Step 4c: Create customer
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
        if (!customerId) throw new Error(`Wave customer creation failed: ${JSON.stringify(customerResult)}`);

        // Step 4d: Create invoice
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(today.getDate() + 14);

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

        waveInvoiceId = invoiceResult?.data?.invoiceCreate?.invoice?.id ?? null;
        waveInvoiceUrl = invoiceResult?.data?.invoiceCreate?.invoice?.viewUrl ?? null;

        if (!waveInvoiceId) throw new Error(`Wave invoice creation failed: ${JSON.stringify(invoiceResult)}`);

        console.log("[finalize-session] Wave invoice created:", waveInvoiceId);
      } catch (waveErr) {
        // Non-fatal — session finalization continues even if Wave fails
        console.error("[finalize-session] Wave invoice creation failed:", waveErr);
      }
    }

    // ── 5. Mark session as finalized ─────────────────────────────────────────
    await supabaseAdmin
      .from("photo_sessions")
      .update({
        finalized_at: new Date().toISOString(),
        ...(waveInvoiceId ? { wave_invoice_id: waveInvoiceId } : {}),
        ...(waveInvoiceUrl ? { wave_invoice_url: waveInvoiceUrl } : {}),
      })
      .eq("id", session.id);

    // ── 6. Email photographer notification ────────────────────────────────────
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL") ?? "noreply@lvbranding.com";

    if (sendgridKey && session.created_by) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(session.created_by);
        const photographerEmail = userData?.user?.email;

        if (photographerEmail) {
          const extrasNote = extraCount > 0 && extraTotal > 0
            ? `<p>⚠️ They selected <strong>${extraCount} extra photo${extraCount !== 1 ? "s" : ""}</strong> beyond their package limit, totalling <strong>$${extraTotal.toFixed(2)}</strong>.${waveInvoiceUrl ? ` <a href="${waveInvoiceUrl}">View Wave invoice →</a>` : " The top-up invoice can be created manually from the dashboard."}</p>`
            : "";

          await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: photographerEmail }] }],
              from: { email: fromEmail },
              subject: `📸 ${session.client_name} confirmed their photo selection — ${session.name}`,
              content: [{
                type: "text/html",
                value: `
                  <h2>Photo selection confirmed</h2>
                  <p><strong>${session.client_name}</strong> has confirmed their selection for session <strong>${session.name}</strong>.</p>
                  <p>They selected <strong>${selectedCount} photo${selectedCount !== 1 ? "s" : ""}</strong> in total.</p>
                  ${extrasNote}
                  <p>Log in to your dashboard to review their selection.</p>
                `,
              }],
            }),
          });
        }
      } catch (emailErr) {
        console.error("[finalize-session] Photographer email failed (non-fatal):", emailErr);
      }
    }

    // ── 7. Return result ─────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        ok: true,
        wave_invoice_url: waveInvoiceUrl,
        extra_count: extraCount,
        extra_total: extraTotal,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[finalize-session] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
