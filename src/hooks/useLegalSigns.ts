// LegalSigns: the organization's documents and their audit trails, and the
// team's actions on them. The browser only reads; every change goes through
// the legal-signs Edge Function, which checks roles and keeps the trail.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { linkClientContact } from "@/hooks/usePhotoSessions";
import type { SessionClient } from "@/lib/photo-sessions/clients";
import { legalTemplate, type LegalBlock, type LegalLanguage } from "@/lib/legal/templates";
import type { LegalSignature } from "@/lib/legal/signature";

// legal_documents is newer than the generated types.
const db = supabase as any;

export type LegalStatus = "sent" | "viewed" | "client_signed" | "completed" | "voided";

export interface LegalDocument {
  id: string;
  org_id: string;
  created_by: string | null;
  template_key: string;
  template_version: string;
  language: LegalLanguage;
  title: string;
  contact_id: string | null;
  company_name: string;
  recipient_name: string;
  recipient_email: string;
  field_values: Record<string, string>;
  content: { blocks: LegalBlock[]; signerRole: string; signerRoles?: string[]; countersignerRole: string };
  status: LegalStatus;
  expires_at: string;
  sent_at: string;
  viewed_at: string | null;
  client_signed_at: string | null;
  client_signer_name: string | null;
  client_signer_title: string | null;
  client_signature: LegalSignature | null;
  lv_signed_at: string | null;
  lv_signer_name: string | null;
  lv_signer_title: string | null;
  lv_signature: LegalSignature | null;
  signed_pdf_path: string | null;
  completed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Everyone who signs besides LV Branding, in signing order. */
  signers: LegalSigner[];
}

/** A party who signs besides LV Branding, through their own link. */
export interface LegalSigner {
  id: string;
  position: number;
  contact_id: string | null;
  name: string;
  email: string;
  company_name: string;
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature: LegalSignature | null;
}

/** Each signer's role in the document, in signing order. */
export const signerRolesOf = (content: LegalDocument["content"]) =>
  (content.signerRoles?.length ? content.signerRoles : [content.signerRole]);

export interface LegalEvent {
  id: string;
  event: string;
  actor_label: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A document still waiting for its recipient whose link has run out. */
export const isExpired = (doc: Pick<LegalDocument, "status" | "expires_at">) =>
  (doc.status === "sent" || doc.status === "viewed") && new Date(doc.expires_at).getTime() < Date.now();

/** The function's own message when it refused, rather than "non-2xx status code". */
async function invoke<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("legal-signs", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context && typeof context.json === "function" ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error || (context?.status === 404 ? "LegalSigns isn't set up yet. Deploy the legal-signs function." : error.message));
  }
  return data as T;
}

export function useLegalDocuments() {
  const { org } = useOrg();
  return useQuery<LegalDocument[]>({
    queryKey: ["legal-documents", org?.id],
    queryFn: async () => {
      const { data, error } = await db.from("legal_documents")
        .select("*, signers:legal_document_signers(id, position, contact_id, name, email, company_name, sent_at, viewed_at, signed_at, signer_name, signer_title, signature)")
        .eq("org_id", org!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as LegalDocument[]).map((doc) => ({
        ...doc, signers: [...(doc.signers ?? [])].sort((a, b) => a.position - b.position),
      }));
    },
    enabled: !!org,
    // A recipient signing shows up without a reload.
    refetchInterval: 60_000,
  });
}

export function useLegalEvents(documentId: string | null) {
  return useQuery<LegalEvent[]>({
    queryKey: ["legal-document-events", documentId],
    queryFn: async () => {
      const { data, error } = await db.from("legal_document_events").select("*").eq("document_id", documentId).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!documentId,
  });
}

/** Who signs for a party: chosen from Contacts or added to them, and their company. */
export interface LegalSignerInput {
  client: SessionClient;
  companyName: string;
}

export interface SendLegalInput {
  templateKey: string;
  language: LegalLanguage;
  /** The main recipient first, then any additional parties. */
  signers: LegalSignerInput[];
  values: Record<string, string>;
  content: LegalDocument["content"];
}

export function useLegalActions() {
  const { org } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const refresh = (id?: string) => {
    qc.invalidateQueries({ queryKey: ["legal-documents"] });
    if (id) qc.invalidateQueries({ queryKey: ["legal-document-events", id] });
  };

  return {
    send: useMutation({
      mutationFn: async (input: SendLegalInput) => {
        if (!org || !user) throw new Error("Sign in to send documents");
        const template = legalTemplate(input.templateKey);
        if (!template?.available) throw new Error("This document can't be sent yet");
        const signers = [];
        for (const signer of input.signers) {
          const contactId = await linkClientContact({
            client: signer.client, orgId: org.id, userId: user.id, branchId: null,
            company: signer.companyName, rawData: { from_legal_signs: true },
          });
          signers.push({
            name: signer.client.name.trim(), email: signer.client.email.trim(), contact_id: contactId, company_name: signer.companyName.trim(),
          });
        }
        return invoke<{ id: string; failed?: string[] }>({
          action: "send", org_id: org.id, template_key: template.key, template_version: template.version,
          language: input.language, title: template.name[input.language],
          signers, field_values: input.values, content: input.content,
        });
      },
      onSuccess: () => refresh(),
    }),
    resend: useMutation({
      /** To everyone who hasn't signed, or just signerId. */
      mutationFn: ({ id, signerId }: { id: string; signerId?: string }) =>
        invoke<{ ok: true; emailed: boolean; sent_to: string[]; failed?: string[] }>({ action: "resend", id, signer_id: signerId }),
      onSuccess: (_data, { id }) => refresh(id),
    }),
    revise: useMutation({
      mutationFn: (input: { id: string; title: string; content: LegalDocument["content"] }) =>
        invoke<{ ok: true; emailed: boolean; failed?: string[] }>({ action: "revise", ...input }),
      onSuccess: (_data, { id }) => refresh(id),
    }),
    void: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => invoke({ action: "void", id, reason }),
      onSuccess: (_data, { id }) => refresh(id),
    }),
    countersign: useMutation({
      mutationFn: (input: { id: string; signerName: string; signerTitle: string; signature: LegalSignature }) =>
        invoke<{ ok: true; emailed: boolean; email_problems?: string[] }>({
          action: "countersign", id: input.id, signer_name: input.signerName, signer_title: input.signerTitle, signature: input.signature,
        }),
      onSuccess: (_data, { id }) => refresh(id),
    }),
    download: useMutation({
      mutationFn: async (id: string) => {
        const { url } = await invoke<{ url: string }>({ action: "download", id });
        window.location.assign(url);
      },
    }),
  };
}
