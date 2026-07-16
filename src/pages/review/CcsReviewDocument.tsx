import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, Loader2 } from "lucide-react";
import CcsAcknowledgmentDoc, { type AckDocData } from "@/components/ccs/CcsAcknowledgmentDoc";
import { ccsClient, CcsError, type CcsDocumentData } from "@/lib/ccsClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function snapshotToAckData(doc: CcsDocumentData): AckDocData {
  const snap = doc.snapshot;
  const full = snap.full_snapshot_json ?? {};
  const respArray: Array<{ step_key: string; question_key: string; response_json: unknown }> = full.responses ?? [];
  const responses: Record<string, Record<string, unknown>> = {};
  for (const r of respArray) (responses[r.step_key] ??= {})[r.question_key] = r.response_json;
  return {
    confirmationNumber: snap.confirmation_number,
    signedAt: full.signature?.signed_at ?? snap.created_at,
    client: doc.client, project: full.project, templateContent: full.template?.content_json,
    responses, intended: full.intended, priorUse: full.priorUse, signature: full.signature,
    templateVersion: snap.template_version, projectTermsVersion: snap.project_terms_version,
  };
}

export default function CcsReviewDocument() {
  const { token = "" } = useParams<{ token: string }>();
  const [data, setData] = useState<AckDocData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ccsClient.document(token)
      .then((d) => alive && setData(snapshotToAckData(d)))
      .catch((e) => alive && setError(e instanceof CcsError ? e.code : "error"));
    return () => { alive = false; };
  }, [token]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6 text-center text-sm text-muted-foreground">
    {error === "not_signed" ? "This acknowledgment has not been signed yet." : "This document is unavailable."}
  </div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-muted/40 py-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .ccs-print, .ccs-print * { visibility: visible !important; }
          .ccs-print { position: absolute; left: 0; top: 0; right: 0; margin: 0 auto; }
          .ccs-noprint { display: none !important; }
          body { background: #fff !important; }
          .ccs-doc { box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { margin: 0.5in; }
      `}</style>
      <div className="ccs-noprint mx-auto mb-4 flex max-w-[760px] justify-end px-4">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>
      <div className="ccs-print mx-auto max-w-[760px] px-4">
        <div className="rounded-lg bg-white shadow-sm">
          <CcsAcknowledgmentDoc data={data} />
        </div>
      </div>
    </div>
  );
}
