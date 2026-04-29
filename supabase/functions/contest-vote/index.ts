/**
 * contest-vote — public endpoint (no JWT required)
 * Receives a vote submission, checks for duplicates, creates a pending
 * vote_verifications record, and sends a branded verification email.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY   = Deno.env.get("SENDGRID_API_KEY")!;
const FROM_EMAIL         = "admin@lvbranding.com";
const FROM_NAME          = "LV Branding";
const APP_URL            = Deno.env.get("APP_URL") ?? "https://marketing.lvbranding.com";
const LV_LOGO_URL        = "https://lv-marketing-suite.vercel.app/lv-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function buildVerificationEmail(opts: {
  contestTitle: string;
  clientName:   string;
  contestantName: string;
  brandColor:   string;
  verifyUrl:    string;
  contestSlug:  string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirm your vote</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">

        <tr><td align="center" style="padding:0 0 20px;">
          <img src="${LV_LOGO_URL}" alt="LV Branding" width="60" height="60"
            style="display:block;border:0;width:60px;height:60px;" />
        </td></tr>

        <tr><td style="background:#fff;border-radius:14px;padding:36px 32px;border:1px solid #e4e4e7;">

          <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111827;">
            ✅ Confirm your vote!
          </h2>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
            You voted for <strong style="color:${opts.brandColor};">${opts.contestantName}</strong>
            in the <strong>${opts.contestTitle}</strong> contest by <strong>${opts.clientName}</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.7;">
            Click the button below to confirm your vote. This link expires in 24 hours.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr>
              <td style="border-radius:10px;background:${opts.brandColor};">
                <a href="${opts.verifyUrl}" target="_blank"
                  style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:10px;">
                  Confirm My Vote &rarr;
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            If you didn't request this, you can safely ignore this email.
            <br/>Link: <a href="${opts.verifyUrl}" style="color:${opts.brandColor};word-break:break-all;">${opts.verifyUrl}</a>
          </p>

        </td></tr>

        <tr><td align="center" style="padding:20px 0 32px;font-size:11px;color:#9CA3AF;line-height:1.8;">
          Made with &#10084;&#65039; by
          <a href="https://www.lvbranding.com" target="_blank" style="color:${opts.brandColor};text-decoration:none;">LV Branding</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: {
    contest_id:    string;
    contestant_id: string;
    voter_email:   string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { contest_id, contestant_id, voter_email } = body;
  if (!contest_id || !contestant_id || !voter_email) {
    return json({ error: "Missing required fields" }, 400);
  }

  const email = voter_email.trim().toLowerCase();
  const ipHeader = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const voter_ip = ipHeader?.split(",")[0]?.trim() ?? null;

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Fetch contest ──────────────────────────────────────────────────────────
  const { data: contest, error: contestErr } = await db
    .from("contests")
    .select("id, slug, title, client_name, brand_color, status, voting_opens_at, voting_closes_at")
    .eq("id", contest_id)
    .single();

  if (contestErr || !contest) return json({ error: "Contest not found" }, 404);
  if (contest.status !== "active")  return json({ error: "This contest is not currently accepting votes" }, 422);

  const now = new Date();
  if (contest.voting_opens_at && new Date(contest.voting_opens_at) > now) {
    return json({ error: "Voting hasn't started yet" }, 422);
  }
  if (contest.voting_closes_at && new Date(contest.voting_closes_at) < now) {
    return json({ error: "Voting has closed" }, 422);
  }

  // ── Fetch contestant ───────────────────────────────────────────────────────
  const { data: contestant, error: cErr } = await db
    .from("contestants")
    .select("id, name")
    .eq("id", contestant_id)
    .eq("contest_id", contest_id)
    .single();

  if (cErr || !contestant) return json({ error: "Contestant not found" }, 404);

  // ── Check if already voted (verified) ─────────────────────────────────────
  const { data: existingVote } = await db
    .from("votes")
    .select("id, verified_at")
    .eq("contest_id", contest_id)
    .eq("voter_email", email)
    .maybeSingle();

  if (existingVote?.verified_at) {
    return json({ error: "This email has already voted in this contest" }, 409);
  }

  // ── Cancel any outstanding (unused) verification for this email ────────────
  await db
    .from("vote_verifications")
    .update({ used_at: new Date().toISOString() })
    .eq("contest_id", contest_id)
    .eq("voter_email", email)
    .is("used_at", null);

  // ── Create new verification token ──────────────────────────────────────────
  const { data: verif, error: verifErr } = await db
    .from("vote_verifications")
    .insert({ contest_id, contestant_id, voter_email: email })
    .select("token")
    .single();

  if (verifErr || !verif) {
    console.error("verif insert error:", verifErr);
    return json({ error: "Failed to create verification" }, 500);
  }

  // ── Send email ─────────────────────────────────────────────────────────────
  const verifyUrl = `${APP_URL}/vote/${contest.slug}/verify?token=${verif.token}`;
  const html = buildVerificationEmail({
    contestTitle:   contest.title,
    clientName:     contest.client_name ?? "LV Branding",
    contestantName: contestant.name,
    brandColor:     contest.brand_color ?? "#CB2039",
    verifyUrl,
    contestSlug:    contest.slug,
  });

  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY is not configured");
    return json({ error: "Verification email is not configured" }, 500);
  }

  try {
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from:    { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Confirm your vote — ${contest.title}`,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (sgRes.status !== 202) {
      const err = await sgRes.text();
      console.error("SendGrid error:", sgRes.status, err);
      return json({ error: "Failed to send verification email" }, 502);
    }
  } catch (e) {
    console.error("SendGrid fetch error:", e);
    return json({ error: "Failed to send verification email" }, 502);
  }

  return json({
    ok: true,
    message: "Check your email to confirm your vote!",
    voter_ip,
  });
});
