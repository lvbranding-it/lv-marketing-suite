// LegalSigns, the team's side: send a document for signature, send it again,
// void it, countersign it (which makes the signed PDF and emails it to both
// parties), and download the signed PDF. Owners, administrators and managers
// may act; any member may download.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  APP_URL, completedEmail, contentHash, cors, json, newToken, requestOrigin,
  sendEmail, signatureRequestEmail, validSignature, type Content, type Language,
} from "../_shared/legal-signs.ts";
import { base64, buildSignedPdf } from "../_shared/legal-pdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LINK_DAYS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTING_ROLES = ["owner", "admin", "manager"];

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function validContent(value: unknown): Content | null {
  const content = value as Content;
  if (!content || !Array.isArray(content.blocks) || content.blocks.length === 0 || content.blocks.length > 300) return null;
  const kinds = ["title", "meta", "heading", "paragraph"];
  const blocksOk = content.blocks.every((block) =>
    block && kinds.includes(block.kind) && typeof block.text === "string" && block.text.length <= 10_000
    && (block.kind !== "meta" || typeof (block as { label?: unknown }).label === "string"));
  if (!blocksOk || typeof content.signerRole !== "string" || typeof content.countersignerRole !== "string") return null;
  return { blocks: content.blocks, signerRole: content.signerRole.slice(0, 120), countersignerRole: content.countersignerRole.slice(0, 120) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in to use LegalSigns" }, 401);
  const input = await req.json().catch(() => ({}));
  const origin = requestOrigin(req);

  const roleIn = async (orgId: string) => {
    const { data } = await db.from("team_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    return data?.role as string | undefined;
  };
  const log = (doc: { id: string; org_id: string }, event: string, metadata: Record<string, unknown> = {}) =>
    db.from("legal_document_events").insert({
      document_id: doc.id, org_id: doc.org_id, event, actor_user_id: user.id,
      actor_label: user.email ?? null, ip: origin.ip, user_agent: origin.userAgent, metadata,
    });

  try {
    if (input.action === "send") {
      const orgId = text(input.org_id, 40);
      if (!UUID.test(orgId) || !ACTING_ROLES.includes((await roleIn(orgId)) ?? "")) return json({ error: "Only owners, administrators and managers can send documents" }, 403);
      const language: Language = input.language === "es" ? "es" : "en";
      const recipientEmail = text(input.recipient_email, 320).toLowerCase();
      const recipientName = text(input.recipient_name, 160);
      const title = text(input.title, 200);
      const content = validContent(input.content);
      const contactId = UUID.test(text(input.contact_id, 40)) ? text(input.contact_id, 40) : null;
      const fieldValues = input.field_values && typeof input.field_values === "object" ? input.field_values : {};
      if (!EMAIL.test(recipientEmail) || !recipientName || !title || !content || !text(input.template_key, 60)) {
        return json({ error: "The document is missing its recipient, title or content" }, 400);
      }
      if (JSON.stringify(fieldValues).length > 30_000) return json({ error: "The document's fields are too long" }, 400);

      const { token, hash } = await newToken();
      const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      const { data: doc, error } = await db.from("legal_documents").insert({
        org_id: orgId, created_by: user.id,
        template_key: text(input.template_key, 60), template_version: text(input.template_version, 20) || "1.0",
        language, title, contact_id: contactId, company_name: text(input.company_name, 200),
        recipient_name: recipientName, recipient_email: recipientEmail,
        field_values: fieldValues, content, content_hash: await contentHash(content),
        token_hash: hash, expires_at: expiresAt,
      }).select("*").single();
      if (error) throw error;

      try {
        const email = signatureRequestEmail(doc, `${APP_URL}/sign/${token}`);
        await sendEmail({ to: { email: recipientEmail, name: recipientName }, ...email });
      } catch (emailError) {
        // An unsent document is not left behind looking sent.
        await db.from("legal_documents").delete().eq("id", doc.id);
        throw emailError;
      }
      await log(doc, "sent", { to: recipientEmail });
      return json({ ok: true, id: doc.id });
    }

    if (!UUID.test(text(input.id, 40))) return json({ error: "Document not found" }, 404);
    const { data: doc } = await db.from("legal_documents").select("*").eq("id", input.id).maybeSingle();
    const role = doc ? await roleIn(doc.org_id) : undefined;
    if (!doc || !role) return json({ error: "Document not found" }, 404);

    if (input.action === "download") {
      if (!doc.signed_pdf_path) return json({ error: "This document has no signed PDF yet" }, 409);
      const { data, error } = await db.storage.from("legal-documents").createSignedUrl(doc.signed_pdf_path, 600, {
        download: `${doc.title} - ${doc.recipient_name}.pdf`.replace(/[\\/:*?"<>|]+/g, "-"),
      });
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    if (!ACTING_ROLES.includes(role)) return json({ error: "Only owners, administrators and managers can do this" }, 403);

    if (input.action === "resend") {
      if (!["sent", "viewed"].includes(doc.status)) return json({ error: "Only a document waiting for its signature can be sent again" }, 409);
      // A fresh link: the earlier one stops working, in case it went astray.
      const { token, hash } = await newToken();
      const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      const email = signatureRequestEmail({ ...doc, expires_at: expiresAt }, `${APP_URL}/sign/${token}`);
      await sendEmail({ to: { email: doc.recipient_email, name: doc.recipient_name }, ...email });
      await db.from("legal_documents").update({ token_hash: hash, expires_at: expiresAt }).eq("id", doc.id);
      await log(doc, "resent", { to: doc.recipient_email });
      return json({ ok: true });
    }

    if (input.action === "void") {
      if (["completed", "voided"].includes(doc.status)) return json({ error: "This document can no longer be voided" }, 409);
      const reason = text(input.reason, 500) || null;
      await db.from("legal_documents").update({ status: "voided", voided_at: new Date().toISOString(), void_reason: reason }).eq("id", doc.id);
      await log(doc, "voided", reason ? { reason } : {});
      return json({ ok: true });
    }

    if (input.action === "countersign") {
      if (doc.status !== "client_signed") return json({ error: "The recipient has to sign first" }, 409);
      const signature = validSignature(input.signature);
      const signerName = text(input.signer_name, 120);
      if (!signature || signerName.length < 2) return json({ error: "Add your name and signature" }, 400);
      // The signed content has to be what was sent.
      if ((await contentHash(doc.content)) !== doc.content_hash) return json({ error: "This document's content changed after it was sent and cannot be completed" }, 409);

      const signedAt = new Date().toISOString();
      const signed = {
        ...doc, lv_signed_at: signedAt, lv_signer_user_id: user.id, lv_signer_name: signerName,
        lv_signer_title: text(input.signer_title, 120) || null, lv_signature: signature,
      };
      const { data: claimed, error: claimError } = await db.from("legal_documents").update({
        lv_signed_at: signed.lv_signed_at, lv_signer_user_id: user.id, lv_signer_name: signed.lv_signer_name,
        lv_signer_title: signed.lv_signer_title, lv_signature: signature,
      }).eq("id", doc.id).eq("status", "client_signed").select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json({ error: "This document was completed or voided a moment ago" }, 409);
      await log(doc, "countersigned", { name: signerName });

      // The certificate lists the signing steps; wrong-email attempts stay in LegalSigns only.
      const { data: events } = await db.from("legal_document_events").select("event, created_at, actor_label, ip, user_agent")
        .eq("document_id", doc.id).in("event", ["sent", "resent", "viewed", "client_signed", "countersigned"]).order("created_at");
      const pdf = await buildSignedPdf(signed, events || []);
      const path = `${doc.org_id}/${doc.id}.pdf`;
      const { error: uploadError } = await db.storage.from("legal-documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const completedAt = new Date().toISOString();
      const { error: completeError } = await db.from("legal_documents")
        .update({ status: "completed", completed_at: completedAt, signed_pdf_path: path }).eq("id", doc.id);
      if (completeError) throw completeError;
      await log(doc, "completed");

      const attachment = { content: base64(pdf), filename: `${doc.title} - ${doc.recipient_name}.pdf`.replace(/[\\/:*?"<>|]+/g, "-"), type: "application/pdf" };
      const failures: string[] = [];
      await sendEmail({ to: { email: doc.recipient_email, name: doc.recipient_name }, ...completedEmail(doc, doc.language, false), attachments: [attachment] })
        .catch((error) => failures.push(`recipient: ${error.message}`));
      const team = doc.created_by ? (await db.auth.admin.getUserById(doc.created_by)).data.user?.email : null;
      await sendEmail({ to: { email: team || "admin@lvbranding.com" }, ...completedEmail(doc, "en", true), attachments: [attachment] })
        .catch((error) => failures.push(`team: ${error.message}`));
      return json({ ok: true, emailed: failures.length === 0, ...(failures.length ? { email_problems: failures } : {}) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("legal-signs failed", error);
    return json({ error: error instanceof Error ? error.message : "LegalSigns could not complete this" }, 500);
  }
});
