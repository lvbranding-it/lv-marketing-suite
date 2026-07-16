// ccs-client — mediates all Creative Collaboration Standard client-wizard I/O.
// Public (verify_jwt = false). Every request carries a `token`; only its SHA-256
// hash is stored server-side. The function validates the token, then reads/writes
// with the service-role key (clients never touch the database directly).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const FROM_EMAIL = "admin@lvbranding.com";
const FROM_NAME = "LV Branding";
const ADMIN_EMAIL = "admin@lvbranding.com";
const LV_LOGO_URL = "https://lv-marketing-suite.vercel.app/lv-logo.png";

// Best-effort branded completion email (does not block signing on failure).
async function sendCompletionEmail(to: string, opts: { confirmation: string; projectName: string; heading: string; body: string }) {
  if (!SENDGRID_API_KEY || !to) return;
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" style="max-width:560px;width:100%;">
    <tr><td align="center" style="padding-bottom:20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="60" height="60" style="border:0;"/></td></tr>
    <tr><td style="background:#fff;border-radius:14px;padding:36px 32px;border:1px solid #e4e4e7;">
      <h1 style="margin:0 0 12px;font-size:19px;color:#231F20;">${opts.heading}</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">${opts.body}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Project</p>
      <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#231F20;">${opts.projectName}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Confirmation number</p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#CB2039;">${opts.confirmation}</p>
    </td></tr>
    <tr><td align="center" style="padding:20px 0;font-size:11px;color:#9ca3af;">LV Branding · Houston, TX</td></tr>
  </table></td></tr></table></body></html>`;
  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME }, reply_to: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `${opts.heading} — ${opts.projectName}`, content: [{ type: "text/html", value: html }],
    }),
  });
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function confirmationNumber(): string {
  const year = new Date().getFullYear();
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `LV-CCS-${year}-${rand}`;
}

const TERMINAL = ["revoked", "archived"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const action = String(body.action ?? "");
  const token = String(body.token ?? "");
  if (!token) return json({ error: "Missing token" }, 400);

  // Resolve the request by token hash.
  const tokenHash = await sha256Hex(token);
  const { data: request, error: reqErr } = await db
    .from("ccs_requests").select("*").eq("secure_token_hash", tokenHash).maybeSingle();
  if (reqErr) return json({ error: "Lookup failed" }, 500);
  if (!request) return json({ error: "not_found" }, 404);
  if (TERMINAL.includes(request.status)) return json({ error: "revoked" }, 403);

  const now = new Date();
  const isExpired = request.expires_at && new Date(request.expires_at) < now && !["signed", "accepted"].includes(request.status);
  if (isExpired && action !== "load") return json({ error: "expired" }, 403);

  // Once signed/accepted, the record is frozen: reject any mutation. Only read
  // actions (load, document) remain available.
  const MUTATIONS = ["save", "save_intended", "save_prior_use", "correction", "submit", "sign"];
  if (["signed", "accepted"].includes(request.status) && MUTATIONS.includes(action)) {
    return json({ error: "already_finalized" }, 409);
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const audit = (actor_type: string, actn: string, metadata: Record<string, unknown> = {}) =>
    db.from("ccs_audit_logs").insert({ request_id: request.id, actor_type, actor_id: request.recipient_email ?? null, action: actn, metadata_json: metadata });

  const touch = (fields: Record<string, unknown>) =>
    db.from("ccs_requests").update({ ...fields, last_activity_at: now.toISOString() }).eq("id", request.id);

  try {
    switch (action) {
      case "load": {
        // Mark opened on first view.
        if (["sent", "ready_to_send"].includes(request.status)) {
          await touch({ status: "opened", opened_at: request.opened_at ?? now.toISOString() });
          await audit("client", "opened");
          request.status = "opened";
        }
        const [client, project, template, responses, intended, prior, signature, snapshot] = await Promise.all([
          db.from("ccs_clients").select("company_name, primary_contact_name, primary_contact_email").eq("id", request.client_id).maybeSingle(),
          db.from("ccs_projects").select("*").eq("id", request.project_id).maybeSingle(),
          request.template_id ? db.from("ccs_templates").select("content_json, legal_disclaimer, version, name").eq("id", request.template_id).maybeSingle() : Promise.resolve({ data: null }),
          db.from("ccs_responses").select("step_key, question_key, response_json").eq("request_id", request.id),
          db.from("ccs_intended_external_input").select("*").eq("request_id", request.id).maybeSingle(),
          db.from("ccs_prior_use_disclosures").select("*").eq("request_id", request.id).maybeSingle(),
          db.from("ccs_signatures").select("signer_name, signed_at").eq("request_id", request.id).maybeSingle(),
          db.from("ccs_snapshots").select("confirmation_number").eq("request_id", request.id).maybeSingle(),
        ]);
        // Nest responses as { step_key: { question_key: value } }
        const respMap: Record<string, Record<string, unknown>> = {};
        for (const r of responses.data ?? []) {
          (respMap[r.step_key] ??= {})[r.question_key] = r.response_json;
        }
        return json({
          expired: !!isExpired,
          request: {
            id: request.id, status: request.status, completion_percentage: request.completion_percentage,
            recipient_name: request.recipient_name, recipient_email: request.recipient_email,
            require_email_verification: request.require_email_verification,
            require_all_acknowledgments: request.require_all_acknowledgments,
            capture_ip: request.capture_ip, config_json: request.config_json,
            template_version: request.template_version, project_terms_version: request.project_terms_version,
            intro_message: request.intro_message, expires_at: request.expires_at,
          },
          client: client.data, project: project.data, template: template.data,
          responses: respMap, intended: intended.data, priorUse: prior.data,
          signature: signature.data, snapshot: snapshot.data,
        });
      }

      case "save": {
        const step_key = String(body.step_key ?? "");
        const question_key = String(body.question_key ?? "");
        if (!step_key || !question_key) return json({ error: "Missing keys" }, 400);
        await db.from("ccs_responses").upsert(
          { request_id: request.id, step_key, question_key, response_json: body.response_json ?? {}, updated_at: now.toISOString() },
          { onConflict: "request_id,step_key,question_key" },
        );
        const pct = typeof body.completion_percentage === "number" ? Math.max(0, Math.min(100, body.completion_percentage)) : request.completion_percentage;
        const status = ["opened", "sent", "ready_to_send"].includes(request.status) ? "in_progress" : request.status;
        await touch({ completion_percentage: pct, status });
        return json({ ok: true });
      }

      case "save_intended": {
        const p = (body.payload ?? {}) as Record<string, unknown>;
        await db.from("ccs_intended_external_input").upsert(
          { request_id: request.id, ...p, updated_at: now.toISOString() },
          { onConflict: "request_id" },
        );
        await touch({});
        return json({ ok: true });
      }

      case "save_prior_use": {
        const p = (body.payload ?? {}) as Record<string, unknown>;
        const status = String(p.prior_use_status ?? "no");
        const needsReview = status !== "no";
        await db.from("ccs_prior_use_disclosures").upsert(
          { request_id: request.id, ...p, admin_review_required: needsReview, updated_at: now.toISOString() },
          { onConflict: "request_id" },
        );
        if (needsReview) await touch({ admin_review_required: true });
        else await touch({});
        return json({ ok: true });
      }

      case "correction": {
        const corrections = (body.corrections ?? []) as Array<Record<string, unknown>>;
        if (corrections.length) {
          await db.from("ccs_participant_correction_requests").insert(
            corrections.map((c) => ({ request_id: request.id, field_name: c.field_name, current_value: c.current_value ?? null, proposed_value: c.proposed_value ?? null, client_note: c.client_note ?? null })),
          );
          await touch({ admin_review_required: true, follow_up_flag: true });
          await audit("client", "participant_correction");
        }
        return json({ ok: true });
      }

      case "submit": {
        if (["signed", "accepted"].includes(request.status)) return json({ error: "already_finalized" }, 409);
        await touch({ status: "submitted", submitted_at: now.toISOString(), completion_percentage: 100 });
        await audit("client", "submitted");
        return json({ ok: true });
      }

      case "sign": {
        if (["signed", "accepted"].includes(request.status)) return json({ error: "already_signed" }, 409);
        const s = (body.signature ?? {}) as Record<string, unknown>;
        await db.from("ccs_signatures").insert({
          request_id: request.id,
          signer_name: s.signer_name, signer_company: s.signer_company ?? null, signer_title: s.signer_title ?? null,
          signer_email: s.signer_email ?? request.recipient_email, signature_type: s.signature_type ?? "typed",
          signature_data: s.signature_data ?? null, consent_text: s.consent_text ?? "",
          ip_address: request.capture_ip ? clientIp : null, user_agent: userAgent, signed_at: now.toISOString(),
        });
        // Build the immutable snapshot from current state.
        const [project, template, responses, intended, prior] = await Promise.all([
          db.from("ccs_projects").select("*").eq("id", request.project_id).maybeSingle(),
          request.template_id ? db.from("ccs_templates").select("content_json, legal_disclaimer, version").eq("id", request.template_id).maybeSingle() : Promise.resolve({ data: null }),
          db.from("ccs_responses").select("step_key, question_key, response_json").eq("request_id", request.id),
          db.from("ccs_intended_external_input").select("*").eq("request_id", request.id).maybeSingle(),
          db.from("ccs_prior_use_disclosures").select("*").eq("request_id", request.id).maybeSingle(),
        ]);
        const confirmation = confirmationNumber();
        await db.from("ccs_snapshots").upsert({
          request_id: request.id,
          full_snapshot_json: {
            capturedAt: now.toISOString(),
            request: { config_json: request.config_json, recipient_name: request.recipient_name, recipient_email: request.recipient_email },
            project: project.data, template: template.data,
            responses: responses.data, intended: intended.data, priorUse: prior.data,
            signature: s,
          },
          confirmation_number: confirmation,
          template_version: request.template_version, project_terms_version: request.project_terms_version,
        }, { onConflict: "request_id" });
        await touch({ status: "signed", signed_at: now.toISOString(), submitted_at: request.submitted_at ?? now.toISOString(), completion_percentage: 100 });
        await audit("client", "signed", { confirmation });
        // Completion emails (best-effort) to the client and LV Branding admin.
        const projectName = project.data?.project_name ?? "your project";
        try {
          await sendCompletionEmail(String(request.recipient_email ?? ""), { confirmation, projectName, heading: "Thank you — your acknowledgment is signed", body: "Your Creative Collaboration Standard has been signed and submitted to LV Branding. Please keep this confirmation number for your records." });
          await sendCompletionEmail(ADMIN_EMAIL, { confirmation, projectName, heading: "A Creative Collaboration Standard was signed", body: `${request.recipient_name ?? "A client"} has completed and signed the acknowledgment.` });
        } catch (mailErr) { console.error("completion email failed:", mailErr); }
        return json({ ok: true, confirmation_number: confirmation });
      }

      case "document": {
        const [snap, client] = await Promise.all([
          db.from("ccs_snapshots").select("confirmation_number, full_snapshot_json, template_version, project_terms_version, created_at").eq("request_id", request.id).maybeSingle(),
          db.from("ccs_clients").select("company_name").eq("id", request.client_id).maybeSingle(),
        ]);
        if (!snap.data) return json({ error: "not_signed" }, 404);
        return json({ snapshot: snap.data, client: client.data });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("ccs-client error:", e);
    return json({ error: String(e) }, 500);
  }
});
