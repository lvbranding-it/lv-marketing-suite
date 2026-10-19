// LegalSigns, the team's side: send a document for signature to one or more
// signers, revise or resend it, void it, countersign it once every signer has
// signed (which makes the signed PDF and emails it to every party), and
// download the signed PDF. Owners, administrators and managers may act; any
// member may download.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  APP_URL, completedEmail, contentHash, cors, json, newToken, requestOrigin,
  sendEmail, signatureRequestEmail, signerRolesOf, validSignature, type Content, type Language, type Signer,
} from "../_shared/legal-signs.ts";
import { base64, buildSignedPdf } from "../_shared/legal-pdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LINK_DAYS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTING_ROLES = ["owner", "admin", "manager"];
/** Signers besides LV Branding: the main recipient and up to three more parties. */
const MAX_SIGNERS = 4;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function validContent(value: unknown): Content | null {
  const content = value as Content;
  if (!content || !Array.isArray(content.blocks) || content.blocks.length === 0 || content.blocks.length > 300) return null;
  const kinds = ["title", "meta", "heading", "paragraph"];
  const blocksOk = content.blocks.every((block) =>
    block && kinds.includes(block.kind) && typeof block.text === "string" && block.text.length <= 10_000
    && (block.kind !== "meta" || typeof (block as { label?: unknown }).label === "string"));
  if (!blocksOk || typeof content.signerRole !== "string" || typeof content.countersignerRole !== "string") return null;
  const roles = content.signerRoles;
  if (roles !== undefined && (!Array.isArray(roles) || roles.length > MAX_SIGNERS || roles.some((role) => typeof role !== "string"))) return null;
  return {
    blocks: content.blocks, signerRole: content.signerRole.slice(0, 120),
    ...(roles?.length ? { signerRoles: roles.map((role) => role.slice(0, 160)) } : {}),
    countersignerRole: content.countersignerRole.slice(0, 120),
  };
}

type NewSigner = { name: string; email: string; contact_id: string | null; company_name: string; party_values: Record<string, string> };

/** A party's lines from the form: short strings only. */
function partyValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => /^[a-zA-Z0-9_]{1,40}$/.test(key) && typeof item === "string")
    .slice(0, 20)
    .map(([key, item]) => [key, (item as string).trim().slice(0, 500)]));
}

/** The signers to send to: input.signers, or the single recipient the older page sends. */
function signersFrom(input: Record<string, unknown>): NewSigner[] | string {
  const list = Array.isArray(input.signers) ? input.signers as Record<string, unknown>[] : [{
    name: input.recipient_name, email: input.recipient_email, contact_id: input.contact_id, company_name: input.company_name,
  }];
  if (list.length === 0 || list.length > MAX_SIGNERS) return `A document goes to between 1 and ${MAX_SIGNERS} signers`;
  const signers = list.map((item) => ({
    name: text(item?.name, 160), email: text(item?.email, 320).toLowerCase(),
    contact_id: UUID.test(text(item?.contact_id, 40)) ? text(item?.contact_id, 40) : null, company_name: text(item?.company_name, 200),
    party_values: partyValues(item?.party_values),
  }));
  const bad = signers.find((signer) => !signer.name || !EMAIL.test(signer.email));
  if (bad) return `Add a name and a valid email for every signer${bad.email ? ` (${bad.email})` : ""}`;
  if (new Set(signers.map((signer) => signer.email)).size !== signers.length) return "Each signer needs their own email address";
  return signers;
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
      const title = text(input.title, 200);
      const content = validContent(input.content);
      const fieldValues = input.field_values && typeof input.field_values === "object" ? input.field_values : {};
      const signers = signersFrom(input);
      if (typeof signers === "string") return json({ error: signers }, 400);
      if (!title || !content || !text(input.template_key, 60)) return json({ error: "The document is missing its title or content" }, 400);
      if (signerRolesOf(content).length !== signers.length) return json({ error: "Each signer needs their role in the document" }, 400);
      if (JSON.stringify(fieldValues).length > 30_000) return json({ error: "The document's fields are too long" }, 400);

      const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      const first = signers[0];
      const { data: doc, error } = await db.from("legal_documents").insert({
        org_id: orgId, created_by: user.id,
        template_key: text(input.template_key, 60), template_version: text(input.template_version, 20) || "1.0",
        language, title, contact_id: first.contact_id, company_name: first.company_name,
        recipient_name: first.name, recipient_email: first.email,
        field_values: fieldValues, content, content_hash: await contentHash(content), expires_at: expiresAt,
      }).select("*").single();
      if (error) throw error;

      const links = await Promise.all(signers.map(() => newToken()));
      const { data: rows, error: signerError } = await db.from("legal_document_signers").insert(signers.map((signer, index) => ({
        document_id: doc.id, org_id: orgId, position: index + 1, contact_id: signer.contact_id,
        name: signer.name, email: signer.email, company_name: signer.company_name, party_values: signer.party_values,
        token_hash: links[index].hash,
      }))).select("id, position");
      if (signerError || !rows) {
        await db.from("legal_documents").delete().eq("id", doc.id);
        throw signerError ?? new Error("The signers could not be saved");
      }

      const failed: string[] = [];
      for (const [index, signer] of signers.entries()) {
        try {
          const email = signatureRequestEmail({ ...doc, recipient_name: signer.name, company_name: signer.company_name }, `${APP_URL}/sign/${links[index].token}`);
          await sendEmail({ to: { email: signer.email, name: signer.name }, ...email });
          await log(doc, "sent", { to: signer.email, signer_id: (rows as { id: string; position: number }[]).find((row) => row.position === index + 1)?.id });
        } catch (emailError) {
          console.error("Signature request email failed", signer.email, emailError);
          failed.push(signer.email);
        }
      }
      if (failed.length === signers.length) {
        // Nobody got a link: an unsent document is not left behind looking sent.
        await db.from("legal_documents").delete().eq("id", doc.id);
        throw new Error(`The email to ${failed.join(", ")} could not be sent`);
      }
      for (const email of failed) await log(doc, "delivery_failed", { to: email });
      return json({ ok: true, id: doc.id, ...(failed.length ? { failed } : {}) });
    }

    if (!UUID.test(text(input.id, 40))) return json({ error: "Document not found" }, 404);
    const { data: doc } = await db.from("legal_documents").select("*").eq("id", input.id).maybeSingle();
    const role = doc ? await roleIn(doc.org_id) : undefined;
    if (!doc || !role) return json({ error: "Document not found" }, 404);
    const { data: signerRows } = await db.from("legal_document_signers").select("*").eq("document_id", doc.id).order("position");
    const signers = (signerRows ?? []) as Signer[];
    const unsigned = signers.filter((signer) => !signer.signed_at);
    /** A new link for each of these signers, emailed; returns the addresses it could not reach. */
    const emailLinks = async (targets: Signer[], links: Map<string, string>, docForEmail: typeof doc, event: string) => {
      const failed: string[] = [];
      for (const signer of targets) {
        try {
          const email = signatureRequestEmail({ ...docForEmail, recipient_name: signer.name, company_name: signer.company_name }, `${APP_URL}/sign/${links.get(signer.id)}`);
          await sendEmail({ to: { email: signer.email, name: signer.name }, ...email });
          await log(doc, event, { to: signer.email, signer_id: signer.id });
        } catch (emailError) {
          console.error("Signing link email failed", signer.email, emailError);
          await log(doc, "delivery_failed", { to: signer.email, signer_id: signer.id });
          failed.push(signer.email);
        }
      }
      return failed;
    };

    if (input.action === "download") {
      if (!doc.signed_pdf_path) return json({ error: "This document has no signed PDF yet" }, 409);
      const { data, error } = await db.storage.from("legal-documents").createSignedUrl(doc.signed_pdf_path, 600, {
        download: `${doc.title} - ${doc.recipient_name}.pdf`.replace(/[\\/:*?"<>|]+/g, "-"),
      });
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    if (!ACTING_ROLES.includes(role)) return json({ error: "Only owners, administrators and managers can do this" }, 403);

    if (input.action === "revise") {
      if (!["sent", "viewed"].includes(doc.status) || doc.client_signed_at || doc.lv_signed_at || signers.some((signer) => signer.signed_at)) {
        return json({ error: "A document can only be edited before anyone signs it" }, 409);
      }
      const title = text(input.title, 200);
      const content = validContent(input.content);
      if (!title || !content || content.blocks.some((block) => !block.text.trim())) {
        return json({ error: "Add a title and text for every document section" }, 400);
      }
      // The parties as edited, or (from a page that only edits the text) the ones it has.
      const nextSigners: NewSigner[] | string = Array.isArray(input.signers)
        ? signersFrom(input)
        : signers.map((signer) => ({
          name: signer.name, email: signer.email, contact_id: signer.contact_id, company_name: signer.company_name,
          party_values: signer.party_values ?? {},
        }));
      if (typeof nextSigners === "string") return json({ error: nextSigners }, 400);
      if (signerRolesOf(content).length !== nextSigners.length) return json({ error: "Each signer needs their role in the document" }, 400);
      const fieldValues = input.field_values && typeof input.field_values === "object" && !Array.isArray(input.field_values) ? input.field_values : null;
      if (fieldValues && JSON.stringify(fieldValues).length > 30_000) return json({ error: "The document's fields are too long" }, 400);
      const nextHash = await contentHash(content);
      const samePeople = JSON.stringify(nextSigners.map((signer) => [signer.name, signer.email, signer.company_name]))
        === JSON.stringify(signers.map((signer) => [signer.name, signer.email, signer.company_name]));
      if (title === doc.title && nextHash === doc.content_hash && samePeople) return json({ error: "Make a change before sending a revision" }, 400);

      // The text, the details and every signer, each with a new link, change
      // together, and not at all if someone signed first (legal_edit_document).
      const links = await Promise.all(nextSigners.map(() => newToken()));
      const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      const { data: revised, error: reviseError } = await db.rpc("legal_edit_document", {
        p_document_id: doc.id, p_title: title, p_content: content, p_content_hash: nextHash, p_expires_at: expiresAt,
        p_field_values: fieldValues,
        p_signers: nextSigners.map((signer, index) => ({ ...signer, position: index + 1, token_hash: links[index].hash })),
      });
      if (reviseError && !reviseError.message.includes("legal_revise_conflict")) throw reviseError;
      if (!revised) return json({ error: "This document changed or was signed. Reload it before editing." }, 409);
      await log(doc, "revised", {
        previous_title: doc.title, previous_content: doc.content, previous_content_hash: doc.content_hash,
        previous_signers: signers.map((signer) => signer.email), title, content_hash: nextHash, to: nextSigners.map((signer) => signer.email),
      });

      const { data: newRows } = await db.from("legal_document_signers").select("*").eq("document_id", doc.id).order("position");
      const linkFor = new Map<string, string>();
      for (const row of (newRows ?? []) as Signer[]) linkFor.set(row.id, links[row.position - 1].token);
      const failed = await emailLinks((newRows ?? []) as Signer[], linkFor, { ...doc, title, content, expires_at: expiresAt }, "revision_sent");
      return json({ ok: true, emailed: failed.length === 0, ...(failed.length ? { failed } : {}) });
    }

    if (input.action === "resend") {
      if (!["sent", "viewed"].includes(doc.status)) return json({ error: "Only a document waiting for signatures can be sent again" }, 409);
      // Everyone who hasn't signed, or the one signer asked for.
      const targets = UUID.test(text(input.signer_id, 40)) ? unsigned.filter((signer) => signer.id === input.signer_id) : unsigned;
      if (targets.length === 0) return json({ error: "Everyone it can go to has already signed" }, 409);
      // Fresh links: the earlier ones stop working, in case they went astray.
      const links = new Map<string, string>();
      const sent: Signer[] = [];
      for (const signer of targets) {
        const { token, hash } = await newToken();
        const { data: rotated, error: rotateError } = await db.from("legal_document_signers")
          .update({ token_hash: hash, sent_at: new Date().toISOString(), viewed_at: null })
          .eq("id", signer.id).eq("token_hash", signer.token_hash).is("signed_at", null).select("id").maybeSingle();
        if (rotateError) throw rotateError;
        if (rotated) {
          links.set(signer.id, token);
          sent.push(signer);
        }
      }
      if (sent.length === 0) return json({ error: "This document changed or was signed. Reload it before sending again." }, 409);
      const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      await db.from("legal_documents").update({ expires_at: expiresAt, sent_at: new Date().toISOString() }).eq("id", doc.id).in("status", ["sent", "viewed"]);
      const failed = await emailLinks(sent, links, { ...doc, expires_at: expiresAt }, "resent");
      return json({ ok: true, emailed: failed.length === 0, sent_to: sent.map((signer) => signer.email), ...(failed.length ? { failed } : {}) });
    }

    if (input.action === "void") {
      if (["completed", "voided"].includes(doc.status)) return json({ error: "This document can no longer be voided" }, 409);
      const reason = text(input.reason, 500) || null;
      await db.from("legal_documents").update({ status: "voided", voided_at: new Date().toISOString(), void_reason: reason }).eq("id", doc.id);
      await log(doc, "voided", reason ? { reason } : {});
      return json({ ok: true });
    }

    if (input.action === "countersign") {
      if (doc.status !== "client_signed" || signers.length === 0 || unsigned.length) return json({ error: "Every party has to sign first" }, 409);
      const signature = validSignature(input.signature);
      const signerName = text(input.signer_name, 120);
      if (!signature || signerName.length < 2) return json({ error: "Add your name and signature" }, 400);
      // The signed content has to be what was sent.
      if ((await contentHash(doc.content)) !== doc.content_hash) return json({ error: "This document's content changed after it was sent and cannot be completed" }, 409);

      const signedAt = new Date().toISOString();
      const signed = {
        ...doc, lv_signed_at: signedAt, lv_signer_user_id: user.id, lv_signer_name: signerName,
        lv_signer_title: text(input.signer_title, 120) || null, lv_signature: signature,
        signers: signers.map((signer) => ({
          name: signer.name, email: signer.email, signer_name: signer.signer_name ?? signer.name,
          signer_title: signer.signer_title, signature: signer.signature!, signed_at: signer.signed_at!,
        })),
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
        .eq("document_id", doc.id).in("event", ["sent", "resent", "revised", "revision_sent", "viewed", "client_signed", "countersigned"]).order("created_at");
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
      const parties = signers.length + 1;
      for (const signer of signers) {
        await sendEmail({ to: { email: signer.email, name: signer.name }, ...completedEmail({ ...doc, recipient_name: signer.name }, doc.language, false, parties), attachments: [attachment] })
          .catch((error) => failures.push(`${signer.email}: ${error.message}`));
      }
      const team = doc.created_by ? (await db.auth.admin.getUserById(doc.created_by)).data.user?.email : null;
      const withWhom = signers.map((signer) => signer.name).join(", ");
      await sendEmail({ to: { email: team || "admin@lvbranding.com" }, ...completedEmail({ ...doc, recipient_name: withWhom }, "en", true, parties), attachments: [attachment] })
        .catch((error) => failures.push(`team: ${error.message}`));
      return json({ ok: true, emailed: failures.length === 0, ...(failures.length ? { email_problems: failures } : {}) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("legal-signs failed", error);
    return json({ error: error instanceof Error ? error.message : "LegalSigns could not complete this" }, 500);
  }
});
