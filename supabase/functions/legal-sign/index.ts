// LegalSigns, the recipient's side, through the personal link in their email:
// peek (enough to ask for their email in the right language), open (the
// document, once their email matches) and sign. No sign-in; the link's token
// is checked against the hash stored when it was sent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clientReceiptEmail, cors, json, requestOrigin, sendEmail, sha256Hex, signedByClientEmail, validSignature,
} from "../_shared/legal-signs.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
/** Wrong emails allowed per document per hour, so a forwarded link can't be used to guess the address. */
const EMAIL_TRIES_PER_HOUR = 8;

/** "a•••@gmail.com": enough for the recipient to know which address, not enough to learn it. */
const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await handle(req);
  } catch (error) {
    console.error("legal-sign failed", error);
    return json({ error: "unavailable" }, 500);
  }
});

async function handle(req: Request) {
  const input = await req.json().catch(() => ({}));
  const token = text(input.token, 200);
  if (token.length < 20) return json({ error: "not_found" }, 404);

  const { data: doc } = await db.from("legal_documents").select("*").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!doc) return json({ error: "not_found" }, 404);
  const expired = new Date(doc.expires_at).getTime() < Date.now() && ["sent", "viewed"].includes(doc.status);
  const state = doc.status === "voided" ? "voided" : expired ? "expired" : doc.status;

  if (input.action === "peek") {
    return json({ language: doc.language, title: doc.title, state, email_hint: maskEmail(doc.recipient_email) });
  }

  // Everything past here needs the address the document was sent to.
  const origin = requestOrigin(req);
  const log = (event: string, label: string, metadata: Record<string, unknown> = {}) =>
    db.from("legal_document_events").insert({
      document_id: doc.id, org_id: doc.org_id, event, actor_label: label, ip: origin.ip, user_agent: origin.userAgent, metadata,
    });
  const { count: misses } = await db.from("legal_document_events").select("id", { count: "exact", head: true })
    .eq("document_id", doc.id).eq("event", "email_mismatch").gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((misses ?? 0) >= EMAIL_TRIES_PER_HOUR) return json({ error: "too_many_tries" }, 429);
  if (text(input.email, 320).toLowerCase() !== doc.recipient_email.toLowerCase()) {
    await log("email_mismatch", "Wrong email entered on the signing page");
    return json({ error: "email_mismatch" }, 403);
  }
  if (state === "voided" || state === "expired") return json({ error: state }, 410);

  if (input.action === "open") {
    if (doc.status === "sent") {
      const { data: opened } = await db.from("legal_documents").update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", doc.id).eq("token_hash", doc.token_hash).eq("status", "sent").select("id").maybeSingle();
      if (!opened) return json({ error: "not_found" }, 404);
      await log("viewed", `${doc.recipient_name} <${doc.recipient_email}>`);
    } else {
      const { data: current } = await db.from("legal_documents").select("id").eq("id", doc.id).eq("token_hash", doc.token_hash).maybeSingle();
      if (!current) return json({ error: "not_found" }, 404);
    }
    return json({
      document: {
        title: doc.title, language: doc.language, company_name: doc.company_name, recipient_name: doc.recipient_name,
        content: doc.content, state: doc.status === "sent" ? "viewed" : state, client_signed_at: doc.client_signed_at,
      },
    });
  }

  if (input.action === "sign") {
    if (!["sent", "viewed"].includes(doc.status)) return json({ error: "already_signed" }, 409);
    if (input.consent !== true) return json({ error: "consent_required" }, 400);
    const signature = validSignature(input.signature);
    const signerName = text(input.signer_name, 120);
    if (!signature || signerName.length < 2) return json({ error: "signature_required" }, 400);

    const signedAt = new Date().toISOString();
    const { data: updated, error } = await db.from("legal_documents").update({
      status: "client_signed", client_signed_at: signedAt, client_signer_name: signerName,
      client_signer_title: text(input.signer_title, 120) || null, client_signature: signature,
      client_ip: origin.ip, client_user_agent: origin.userAgent, viewed_at: doc.viewed_at ?? signedAt,
    }).eq("id", doc.id).eq("token_hash", doc.token_hash).in("status", ["sent", "viewed"]).select("id").maybeSingle();
    if (error) throw error;
    // Two tabs signing at once: the first one counts.
    if (!updated) return json({ error: "already_signed" }, 409);
    await log("client_signed", `${signerName} <${doc.recipient_email}>`, { consent: true, signature_type: signature.type });

    const team = doc.created_by ? (await db.auth.admin.getUserById(doc.created_by)).data.user?.email : null;
    await sendEmail({ to: { email: team || "admin@lvbranding.com" }, ...signedByClientEmail(doc) })
      .catch((emailError) => console.error("Countersign notice failed", emailError));
    await sendEmail({ to: { email: doc.recipient_email, name: signerName }, ...clientReceiptEmail(doc) })
      .catch((emailError) => console.error("Signer receipt failed", emailError));
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}
