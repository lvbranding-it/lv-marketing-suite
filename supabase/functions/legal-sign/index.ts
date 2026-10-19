// LegalSigns, a signer's side, through the personal link in their email:
// peek (enough to ask for their email in the right language), open (the
// document, once their email matches) and sign. No sign-in; the link's token
// is checked against the hash stored for that signer. A document can have
// several signers; it is ready for LV Branding's countersignature once the
// last of them signs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clientReceiptEmail, cors, json, requestOrigin, sendEmail, sha256Hex, signedByClientEmail, validSignature, type Signer,
} from "../_shared/legal-signs.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
/** Wrong emails allowed per link per hour, so a forwarded link can't be used to guess the address. */
const EMAIL_TRIES_PER_HOUR = 8;

/** "a•••@gmail.com": enough for the signer to know which address, not enough to learn it. */
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

  const tokenHash = await sha256Hex(token);
  const { data: signerRow } = await db.from("legal_document_signers").select("*").eq("token_hash", tokenHash).maybeSingle();
  const signer = signerRow as Signer | null;
  if (!signer) return json({ error: "not_found" }, 404);
  const { data: doc } = await db.from("legal_documents").select("*").eq("id", signer.document_id).maybeSingle();
  if (!doc) return json({ error: "not_found" }, 404);
  const waiting = ["sent", "viewed"].includes(doc.status);
  const expired = waiting && new Date(doc.expires_at).getTime() < Date.now();
  // This signer's view: already signed is final for them even while others still sign.
  const state = doc.status === "voided" ? "voided"
    : doc.status === "completed" ? "completed"
    : signer.signed_at ? "client_signed"
    : expired ? "expired"
    : doc.status === "client_signed" ? "client_signed"
    : signer.viewed_at ? "viewed" : "sent";

  if (input.action === "peek") {
    return json({ language: doc.language, title: doc.title, state, email_hint: maskEmail(signer.email) });
  }

  // Everything past here needs the address this link was sent to.
  const origin = requestOrigin(req);
  const label = (name = signer.name) => `${name} <${signer.email}>`;
  const log = (event: string, actor: string, metadata: Record<string, unknown> = {}) =>
    db.from("legal_document_events").insert({
      document_id: doc.id, org_id: doc.org_id, event, actor_label: actor, ip: origin.ip, user_agent: origin.userAgent,
      metadata: { signer_id: signer.id, ...metadata },
    });
  const { count: misses } = await db.from("legal_document_events").select("id", { count: "exact", head: true })
    .eq("document_id", doc.id).eq("event", "email_mismatch").eq("metadata->>signer_id", signer.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((misses ?? 0) >= EMAIL_TRIES_PER_HOUR) return json({ error: "too_many_tries" }, 429);
  if (text(input.email, 320).toLowerCase() !== signer.email.toLowerCase()) {
    await log("email_mismatch", "Wrong email entered on the signing page");
    return json({ error: "email_mismatch" }, 403);
  }
  if (state === "voided" || state === "expired") return json({ error: state }, 410);

  if (input.action === "open") {
    if (!signer.viewed_at && !signer.signed_at) {
      const viewedAt = new Date().toISOString();
      const { data: opened } = await db.from("legal_document_signers").update({ viewed_at: viewedAt })
        .eq("id", signer.id).eq("token_hash", tokenHash).is("viewed_at", null).select("id").maybeSingle();
      if (!opened) return json({ error: "not_found" }, 404);
      await log("viewed", label());
      if (doc.status === "sent") {
        await db.from("legal_documents").update({ status: "viewed", viewed_at: viewedAt }).eq("id", doc.id).eq("status", "sent");
      }
    }
    return json({
      document: {
        title: doc.title, language: doc.language, company_name: signer.company_name, recipient_name: signer.name,
        content: doc.content, position: signer.position, state: state === "sent" ? "viewed" : state, client_signed_at: signer.signed_at,
      },
    });
  }

  if (input.action === "sign") {
    if (signer.signed_at || !waiting) return json({ error: "already_signed" }, 409);
    if (input.consent !== true) return json({ error: "consent_required" }, 400);
    const signature = validSignature(input.signature);
    const signerName = text(input.signer_name, 120);
    if (!signature || signerName.length < 2) return json({ error: "signature_required" }, 400);

    const signedAt = new Date().toISOString();
    // The token in the condition makes a revision or a new link that landed
    // first win: this signature was made on a version that no longer stands.
    const { data: updated, error } = await db.from("legal_document_signers").update({
      signed_at: signedAt, signer_name: signerName, signer_title: text(input.signer_title, 120) || null,
      signature, ip: origin.ip, user_agent: origin.userAgent, viewed_at: signer.viewed_at ?? signedAt,
    }).eq("id", signer.id).eq("token_hash", tokenHash).is("signed_at", null).select("id").maybeSingle();
    if (error) throw error;
    // Two tabs signing at once: the first one counts.
    if (!updated) return json({ error: "already_signed" }, 409);
    await log("client_signed", label(signerName), { consent: true, signature_type: signature.type });

    // The last signer makes the document ready to countersign.
    const { data: everyone } = await db.from("legal_document_signers").select("name, company_name, signed_at")
      .eq("document_id", doc.id).order("position");
    const othersPending = ((everyone ?? []) as { signed_at: string | null }[]).some((other) => !other.signed_at);
    let allSigned = false;
    if (!othersPending) {
      const { data: ready } = await db.from("legal_documents").update({
        status: "client_signed", client_signed_at: signedAt, viewed_at: doc.viewed_at ?? signedAt,
      }).eq("id", doc.id).in("status", ["sent", "viewed"]).select("id").maybeSingle();
      allSigned = !!ready;
    }

    if (allSigned) {
      const team = doc.created_by ? (await db.auth.admin.getUserById(doc.created_by)).data.user?.email : null;
      await sendEmail({ to: { email: team || "admin@lvbranding.com" }, ...signedByClientEmail(doc, everyone ?? []) })
        .catch((emailError) => console.error("Countersign notice failed", emailError));
    }
    await sendEmail({ to: { email: signer.email, name: signerName }, ...clientReceiptEmail({ ...doc, recipient_name: signerName }, othersPending) })
      .catch((emailError) => console.error("Signer receipt failed", emailError));
    return json({ ok: true, others_pending: othersPending });
  }

  return json({ error: "Unknown action" }, 400);
}
