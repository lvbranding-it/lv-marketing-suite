import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft, FileText, CheckCircle2, AlertTriangle, Sparkles, History as HistoryIcon,
  Flag, PenLine, StickyNote, Clock, UserCog, Check, X, Printer,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import CcsStatusBadge from "@/components/ccs/CcsStatusBadge";
import { useCcsRequestDetail, useCcsRequestActions, type CcsRequestStatus } from "@/hooks/useCcs";

export default function CcsRequestReview() {
  const { requestId } = useParams<{ requestId: string }>();
  const { data, isLoading } = useCcsRequestDetail(requestId);
  const actions = useCcsRequestActions();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  if (isLoading || !data) {
    return <AppShell><div className="mx-auto max-w-4xl px-4 py-8 md:px-8"><Skeleton className="h-64 rounded-xl" /></div></AppShell>;
  }

  const { request, client, project, template, responses, intended, priorUse, signature, snapshot, corrections, notes, audit } = data;
  const content = template?.content_json;
  const steps = [...(content?.steps ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const uses: string[] = intended?.ai_or_external_use_expected ?? [];
  const hasPrior = priorUse && priorUse.prior_use_status && priorUse.prior_use_status !== "no";

  const flags: { icon: React.ElementType; label: string; tone: "primary" | "amber" }[] = [];
  if (uses.includes("generate_visuals")) flags.push({ icon: Sparkles, label: "AI-generated visual alternatives expected", tone: "primary" });
  if (uses.includes("review_critique")) flags.push({ icon: Sparkles, label: "External critique expected", tone: "primary" });
  if (intended?.implementation_may_be_requested) flags.push({ icon: AlertTriangle, label: "Client may request implementation of external output", tone: "amber" });
  if (hasPrior) flags.push({ icon: HistoryIcon, label: "Prior-use disclosure submitted", tone: "amber" });
  if (corrections.length) flags.push({ icon: UserCog, label: "Client requested a participant correction", tone: "amber" });
  if (request.admin_review_required) flags.push({ icon: AlertTriangle, label: "Administrator review recommended", tone: "primary" });

  const timeline: [string, string | null][] = [
    ["Created", request.created_at], ["Sent", request.sent_at], ["Opened", request.opened_at],
    ["Submitted", request.submitted_at], ["Signed", request.signed_at], ["Accepted", request.accepted_at],
  ];

  const addNote = async () => {
    if (!note.trim() || !requestId) return;
    try { await actions.addNote.mutateAsync({ id: requestId, note: note.trim() }); setNote(""); toast({ title: "Note added" }); }
    catch { toast({ title: "Could not add note", variant: "destructive" }); }
  };
  const accept = async () => {
    if (!requestId) return;
    try { await actions.accept.mutateAsync(requestId); toast({ title: "Acknowledgment accepted" }); }
    catch { toast({ title: "Could not accept", variant: "destructive" }); }
  };
  const clearReview = async () => {
    if (!requestId) return;
    await actions.setFlags.mutateAsync({ id: requestId, fields: { admin_review_required: false } });
    toast({ title: "Review flag cleared" });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <Link to="/ccs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Dashboard</Link>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{client?.company_name ?? "—"}</h1>
              <CcsStatusBadge status={request.status as CcsRequestStatus} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{project?.project_name} · {project?.project_number || "—"} · {request.recipient_name ?? request.recipient_email}</p>
            {snapshot?.confirmation_number && <p className="mt-1 font-mono text-xs text-muted-foreground">{snapshot.confirmation_number}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {snapshot && (
              <Link to={`/ccs/requests/${requestId}/document`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                <Printer size={15} /> Document
              </Link>
            )}
            {(request.status === "submitted" || request.status === "signed") && (
              <Button onClick={accept} disabled={actions.accept.isPending}><CheckCircle2 size={16} className="mr-1.5" /> Accept</Button>
            )}
          </div>
        </header>

        {/* Flags */}
        {flags.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
            {flags.map((f, i) => (
              <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${f.tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`}>
                <f.icon size={12} /> {f.label}
              </span>
            ))}
            {request.admin_review_required && <button onClick={clearReview} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Mark reviewed</button>}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Timeline */}
          <Card title="Completion timeline" icon={Clock}>
            {timeline.map(([label, iso]) => (
              <Row key={label} label={label} value={iso ? format(new Date(iso), "MMM d, yyyy · h:mma") : "—"} muted={!iso} />
            ))}
          </Card>

          {/* Signature */}
          <Card title="Signature" icon={PenLine}>
            {signature ? (
              <>
                <Row label="Name" value={signature.signer_name} />
                <Row label="Title" value={signature.signer_title || "—"} />
                <Row label="Email" value={signature.signer_email || "—"} />
                <Row label="Type" value={signature.signature_type} />
                <Row label="Signed" value={signature.signed_at ? format(new Date(signature.signed_at), "MMM d, yyyy") : "—"} />
                {signature.ip_address && <Row label="IP" value={String(signature.ip_address)} />}
              </>
            ) : <p className="text-sm text-muted-foreground">Not yet signed.</p>}
          </Card>
        </div>

        {/* Responses by section */}
        <Card title="Acknowledgments by section" icon={FileText} className="mt-6">
          {steps.filter((s) => (s.acknowledgments ?? []).length).map((s) => (
            <div key={s.key} className="mb-3 last:mb-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</p>
              {s.acknowledgments.map((a: { key: string; text: string }) => {
                const ok = responses[s.key]?.[a.key] === true;
                return <div key={a.key} className="mt-1 flex items-start gap-2 text-sm"><span className={ok ? "text-emerald-600" : "text-muted-foreground/40"}>{ok ? <Check size={15} /> : <X size={15} />}</span><span className={ok ? "text-foreground" : "text-muted-foreground"}>{a.text}</span></div>;
              })}
            </div>
          ))}
        </Card>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* AI / external */}
          <Card title="Intended AI & external input" icon={Sparkles}>
            {uses.length ? (
              <>
                <Row label="Expected use" value={uses.join(", ")} />
                <Row label="Platforms" value={intended?.expected_platforms || "—"} />
                <Row label="Implementation may be requested" value={intended?.implementation_may_be_requested ? "Yes" : "No"} />
                {intended?.client_notes && <p className="mt-2 text-xs text-muted-foreground">{intended.client_notes}</p>}
              </>
            ) : <p className="text-sm text-muted-foreground">None reported.</p>}
          </Card>

          {/* Prior use */}
          <Card title="Prior-use disclosure" icon={HistoryIcon}>
            {hasPrior ? (
              <>
                <Row label="Status" value={priorUse.prior_use_status} />
                <Row label="Platform / advisor" value={priorUse.platforms_or_advisors || "—"} />
                <Row label="Materials" value={(priorUse.materials_shared ?? []).join(", ") || "—"} />
                <Row label="Review requested" value={priorUse.lv_review_requested ? "Yes" : "No"} />
                <Row label="Implementation requested" value={priorUse.implementation_requested ? "Yes" : "No"} />
              </>
            ) : <p className="text-sm text-muted-foreground">No prior use disclosed.</p>}
          </Card>
        </div>

        {/* Corrections */}
        {corrections.length > 0 && (
          <Card title="Participant correction requests" icon={UserCog} className="mt-6">
            {corrections.map((c) => (
              <div key={c.id} className="mb-3 rounded-lg border border-border p-3 last:mb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{c.field_name}</p>
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{c.review_status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">“{c.current_value || "—"}” → <span className="text-foreground">“{c.proposed_value || "—"}”</span></p>
                {c.review_status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => actions.reviewCorrection.mutate({ correctionId: c.id, status: "applied" })} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Mark applied</button>
                    <button onClick={() => actions.reviewCorrection.mutate({ correctionId: c.id, status: "dismissed" })} className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">Dismiss</button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* Audit */}
        <Card title="Audit activity" icon={Flag} className="mt-6">
          {audit.length ? audit.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
              <span className="text-foreground">{a.action.replace(/_/g, " ")}<span className="ml-2 text-xs text-muted-foreground">({a.actor_type})</span></span>
              <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, h:mma")}</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">No activity yet.</p>}
        </Card>

        {/* Private notes */}
        <Card title="Private internal notes" icon={StickyNote} className="mt-6">
          <p className="mb-2 text-xs text-muted-foreground">Never shown to the client.</p>
          {notes.map((n) => (
            <div key={n.id} className="mb-2 rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-foreground">{n.note}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{format(new Date(n.created_at), "MMM d, yyyy · h:mma")}</p>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note…" className="flex-1" />
            <Button onClick={addNote} disabled={!note.trim() || actions.addNote.isPending}>Add</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ title, icon: Icon, className, children }: { title: string; icon: React.ElementType; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon size={16} /> {title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${muted ? "text-muted-foreground" : "font-medium text-foreground"}`}>{value}</span>
    </div>
  );
}
