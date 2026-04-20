import { useState, useEffect } from "react";
import { ExternalLink, Sparkles, Loader2, CheckCircle2, XCircle, AlertCircle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type { Contact } from "@/data/contacts";
import { IND_META, SIGNALS } from "@/data/contacts";
import { cn } from "@/lib/utils";
import { runSkillStream } from "@/lib/claude";
import {
  verifyContact,
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  type VerifyResult,
} from "@/lib/contactResearch";
import type { ImportedContact } from "@/hooks/useContacts";

interface ContactDetailModalProps {
  contact: Contact | null;
  onClose: () => void;
}

// ── Adapt static Contact → minimal ImportedContact shape for shared utils ─────
function toImportedContact(c: Contact): ImportedContact {
  return {
    id: String(c.id),
    org_id: "",
    branch_id: null,
    first_name: c.first,
    last_name: c.last,
    title: c.title,
    company: c.company,
    email: c.email !== "—" ? c.email : null,
    phone: c.phone !== "—" ? c.phone : null,
    linkedin_url: c.linkedin !== "—"
      ? (c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`)
      : null,
    website: c.website !== "—" ? c.website : null,
    city: c.city,
    state: "TX",
    country: "US",
    industry: IND_META[c.ind]?.label ?? null,
    employees_range: c.employees,
    fit_score: c.score,
    signals: c.signals,
    source: "manual" as const,
    source_id: null,
    apollo_id: null,
    raw_data: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pipeline_stage: "lead" as const,
    deal_value: null,
    deal_probability: null,
    last_contacted_at: null,
    next_followup_at: null,
    tags: [],
    crm_notes: null,
    verification_status: "unverified" as const,
    research_notes: null,
    research_result: null,
    verified_at: null,
  };
}

// ── Verify pill ───────────────────────────────────────────────────────────────
function VerifyPill({
  label,
  live,
  detail,
}: {
  label: string;
  live: boolean | null;
  detail: string;
}) {
  if (live === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
        <AlertCircle size={9} />
        {label}: {detail}
      </span>
    );
  }
  return live ? (
    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={9} />
      {label}: {detail}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle size={9} />
      {label}: {detail}
    </span>
  );
}

export default function ContactDetailModal({ contact, onClose }: ContactDetailModalProps) {
  const [researchVerifying, setResearchVerifying] = useState(false);
  const [researchStreaming, setResearchStreaming] = useState(false);
  const [researchText, setResearchText] = useState("");
  const [verification, setVerification] = useState<VerifyResult | null>(null);

  // Reset research state whenever a different contact is opened
  useEffect(() => {
    setResearchText("");
    setVerification(null);
    setResearchVerifying(false);
    setResearchStreaming(false);
  }, [contact?.id]);

  if (!contact) return null;

  const ind = IND_META[contact.ind] ?? IND_META.biz;
  const signalMetas = SIGNALS.filter((s) => contact.signals.includes(s.id));
  const isBusy = researchVerifying || researchStreaming;

  const scoreColor =
    contact.score >= 85 ? "text-emerald-500" :
    contact.score >= 70 ? "text-amber-500" :
    "text-muted-foreground";

  const handleResearch = async () => {
    setResearchText("");
    setVerification(null);

    // Step 1 — real HTTP/DNS checks
    setResearchVerifying(true);
    const adapted = toImportedContact(contact);
    const vr = await verifyContact(adapted);
    setVerification(vr);
    setResearchVerifying(false);

    // Step 2 — stream Claude analysis using verified facts
    setResearchStreaming(true);
    await runSkillStream(
      {
        skillSystemPrompt: RESEARCH_SYSTEM_PROMPT,
        userMessage: buildResearchPrompt(adapted, vr),
        conversationHistory: [],
        marketingContext: {},
      },
      {
        onToken: (t) => setResearchText((prev) => prev + t),
        onComplete: () => setResearchStreaming(false),
        onError: () => setResearchStreaming(false),
      }
    );
  };

  return (
    <Dialog open={!!contact} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          {/* pr-10 keeps content clear of the Radix auto-close button (absolute right-4 top-4) */}
          <div className="flex items-start gap-3 pr-10">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold text-foreground">
                {contact.first} {contact.last}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                {contact.title}
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-sm border",
                    ind.bgClass, ind.textClass, ind.borderClass
                  )}
                >
                  {ind.label}
                </span>
                <span className="text-xs text-muted-foreground truncate">{contact.company}</span>
              </div>
            </div>
            {/* Fit score pushed left of the X button */}
            <div className="text-right shrink-0">
              <p className={cn("text-2xl font-bold font-mono", scoreColor)}>{contact.score}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">fit score</p>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-4 text-sm">
          <Field label="Email">
            {contact.email !== '—'
              ? <a href={`mailto:${contact.email}`} className="text-primary hover:underline text-xs break-all">{contact.email}</a>
              : <Dash />}
          </Field>
          <Field label="Phone">
            {contact.phone !== '—'
              ? <span className="text-xs font-mono">{contact.phone}</span>
              : <Dash />}
          </Field>
          <Field label="City">
            <span className="text-xs">{contact.city}, TX</span>
          </Field>
          <Field label="Employees">
            <span className="text-xs">{contact.employees}</span>
          </Field>
          <Field label="Website">
            {contact.website !== '—'
              ? (
                <a
                  href={`https://${contact.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-xs flex items-center gap-1"
                >
                  {contact.website} <ExternalLink size={10} />
                </a>
              )
              : <Dash />}
          </Field>
          <Field label="LinkedIn">
            {contact.linkedin !== '—'
              ? (
                <a
                  href={`https://${contact.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-xs flex items-center gap-1"
                >
                  View profile <ExternalLink size={10} />
                </a>
              )
              : <Dash />}
          </Field>
        </div>

        <Separator />

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Growth Signals
          </p>
          {signalMetas.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {signalMetas.map((s) => (
                <span
                  key={s.id}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border"
                  style={{
                    borderColor: `${s.color}50`,
                    color: s.color,
                    background: `${s.color}12`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No signals detected in 90-day window
            </p>
          )}
        </div>

        <Separator />

        {/* ── AI Research Section ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              AI Research
            </p>
            {researchText && !isBusy && (
              <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Analysis ready
              </span>
            )}
          </div>

          {/* Research button */}
          <Button
            size="sm"
            variant={researchText ? "outline" : "default"}
            onClick={handleResearch}
            disabled={isBusy}
            className="gap-2 w-full"
          >
            {researchVerifying ? (
              <><Loader2 size={13} className="animate-spin" />Checking links…</>
            ) : researchStreaming ? (
              <><Loader2 size={13} className="animate-spin" />Analyzing…</>
            ) : researchText ? (
              <><Sparkles size={13} />Re-run Research</>
            ) : (
              <><Sparkles size={13} />Research with AI</>
            )}
          </Button>

          {/* Verification pills */}
          {verification && (
            <div className="flex flex-wrap gap-1.5">
              <VerifyPill
                label="Website"
                live={verification.website.live}
                detail={
                  verification.website.live
                    ? `HTTP ${verification.website.status}`
                    : (verification.website.error ?? "no response")
                }
              />
              <VerifyPill
                label="Email domain"
                live={verification.email.mx_valid}
                detail={verification.email.domain ?? "—"}
              />
              <VerifyPill
                label="LinkedIn"
                live={
                  !verification.linkedin.url
                    ? null
                    : verification.linkedin.format_valid
                }
                detail={
                  verification.linkedin.username ??
                  (verification.linkedin.url ? "bad URL" : "not provided")
                }
              />
            </div>
          )}

          {/* Streamed result */}
          {researchText && (
            <div className="bg-muted/40 border border-border rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <ShieldCheck size={12} className="text-primary" />
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                  AI Research Brief
                </span>
                {researchStreaming && (
                  <Loader2 size={10} className="animate-spin text-muted-foreground ml-1" />
                )}
              </div>
              <MarkdownContent>{researchText}</MarkdownContent>
              {researchStreaming && (
                <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle mt-1" />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="text-xs text-muted-foreground/40">—</span>;
}
