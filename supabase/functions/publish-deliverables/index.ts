// supabase/functions/publish-deliverables/index.ts
// Marks a session's deliverables as ready and emails the client.
// Requires JWT — called only by authenticated photographers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller — use service role to validate the JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { session_id } = (await req.json()) as { session_id: string };

    // Load session
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, name, client_name, client_email, share_token, allow_zip_download, deliverables_ready_at")
      .eq("id", session_id)
      .single();
    if (sessErr || !session) return json({ error: "Session not found" }, 404);

    const now = new Date().toISOString();

    // Mark ready
    await supabaseAdmin.from("photo_sessions").update({
      deliverables_ready_at: session.deliverables_ready_at ?? now,
      allow_zip_download: true,
      deliverables_notified_at: now,
    }).eq("id", session_id);

    // Email client
    let notified = false;
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL") ?? "noreply@lvbranding.com";
    const appUrl = Deno.env.get("APP_URL") ?? "https://marketing.lvbranding.com";

    if (sendgridKey && session.client_email) {
      const downloadLink = `${appUrl}/share/${session.share_token}`;

      try {
        const emailRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sendgridKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: session.client_email, name: session.client_name }] }],
            from: { email: fromEmail },
            subject: `Your edited photos are ready — ${session.name}`,
            content: [
              {
                type: "text/html",
                value: `
                  <p>Dear ${session.client_name},</p>
                  <p>We are pleased to let you know that your edited photos for <strong>${session.name}</strong> are now ready for download.</p>
                  <p>Please visit the link below to access your gallery and download your files in HD and low-resolution versions:</p>
                  <p><a href="${downloadLink}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">View &amp; Download Your Photos</a></p>
                  <p>The download will be available as a ZIP file containing both versions of your edited photos.</p>
                  <p>Should you have any questions, please do not hesitate to reach out.</p>
                  <p>Warm regards,<br/>The Photography Team</p>
                `,
              },
            ],
          }),
        });
        notified = emailRes.ok;
      } catch (emailErr) {
        console.error("Email notification failed (non-fatal):", emailErr);
      }
    }

    return json({ ok: true, notified });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}
