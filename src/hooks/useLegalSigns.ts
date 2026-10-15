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
  content: { blocks: LegalBlock[]; signerRole: string; countersignerRole: string };
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
}

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
      const { data, error } = await db.from("legal_documents").select("*").eq("org_id", org!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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

export interface SendLegalInput {
  templateKey: string;
  language: LegalLanguage;
  client: SessionClient;
  companyName: string;
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
        const contactId = await linkClientContact({
          client: input.client, orgId: org.id, userId: user.id, branchId: null,
          company: input.companyName, rawData: { from_legal_signs: true },
        });
        const recipient = input.client.name.trim();
        return invoke<{ id: string }>({
          action: "send", org_id: org.id, template_key: template.key, template_version: template.version,
          language: input.language, title: template.name[input.language], contact_id: contactId,
          company_name: input.companyName.trim(), recipient_name: recipient, recipient_email: input.client.email.trim(),
          field_values: input.values, content: input.content,
        });
      },
      onSuccess: () => refresh(),
    }),
    resend: useMutation({
      mutationFn: (id: string) => invoke({ action: "resend", id }),
      onSuccess: (_data, id) => refresh(id),
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
