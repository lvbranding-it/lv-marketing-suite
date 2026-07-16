import { useParams, Link } from "react-router-dom";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import CcsAcknowledgmentDoc, { type AckDocData } from "@/components/ccs/CcsAcknowledgmentDoc";
import { useCcsRequestDetail, type CcsRequestDetail } from "@/hooks/useCcs";

function detailToAckData(d: CcsRequestDetail): AckDocData {
  // Prefer the immutable snapshot; fall back to live data for unsigned requests.
  if (d.snapshot?.full_snapshot_json) {
    const full = d.snapshot.full_snapshot_json;
    const respArray: Array<{ step_key: string; question_key: string; response_json: unknown }> = full.responses ?? [];
    const responses: Record<string, Record<string, unknown>> = {};
    for (const r of respArray) (responses[r.step_key] ??= {})[r.question_key] = r.response_json;
    return {
      confirmationNumber: d.snapshot.confirmation_number, signedAt: full.signature?.signed_at ?? d.snapshot.created_at,
      client: d.client, project: full.project, templateContent: full.template?.content_json,
      responses, intended: full.intended, priorUse: full.priorUse, signature: full.signature,
      templateVersion: d.snapshot.template_version, projectTermsVersion: d.snapshot.project_terms_version,
    };
  }
  return {
    confirmationNumber: undefined, signedAt: d.signature?.signed_at,
    client: d.client, project: d.project, templateContent: d.template?.content_json,
    responses: d.responses, intended: d.intended, priorUse: d.priorUse, signature: d.signature,
    templateVersion: d.request.template_version, projectTermsVersion: d.request.project_terms_version,
  };
}

export default function CcsRequestDocument() {
  const { requestId } = useParams<{ requestId: string }>();
  const { data, isLoading } = useCcsRequestDetail(requestId);

  if (isLoading || !data) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const ack = detailToAckData(data);

  return (
    <div className="min-h-screen bg-muted/40 py-8">
      <style>{`@media print { .ccs-noprint { display:none !important; } body { background:#fff !important; } .ccs-doc { box-shadow:none !important; } }`}</style>
      <div className="ccs-noprint mx-auto mb-4 flex max-w-[760px] items-center justify-between px-4">
        <Link to={`/ccs/requests/${requestId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Back to review</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>
      <div className="mx-auto max-w-[760px] px-4">
        <div className="rounded-lg bg-white shadow-sm"><CcsAcknowledgmentDoc data={ack} /></div>
      </div>
    </div>
  );
}
