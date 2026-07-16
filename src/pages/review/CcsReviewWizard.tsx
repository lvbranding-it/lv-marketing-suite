import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Lock, ArrowLeft, ArrowRight, Check, Cloud, CloudOff, Loader2, HelpCircle, ShieldCheck } from "lucide-react";
import LVLogo from "@/components/LVLogo";
import EducationalStep, { RequiredAck } from "@/components/ccs/wizard/EducationalStep";
import ParticipantsStep from "@/components/ccs/wizard/ParticipantsStep";
import ExternalAiStep from "@/components/ccs/wizard/ExternalAiStep";
import PriorUseStep from "@/components/ccs/wizard/PriorUseStep";
import ReviewSignStep from "@/components/ccs/wizard/ReviewSignStep";
import { PROJECT_PHASE_LABEL } from "@/components/ccs/ccsMeta";
import { ccsClient, CcsError, type CcsWizardData, type SignaturePayload } from "@/lib/ccsClient";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Answers = Record<string, Record<string, unknown>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Step = Record<string, any>;

export default function CcsReviewWizard() {
  const { token = "" } = useParams<{ token: string }>();
  const [data, setData] = useState<CcsWizardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let alive = true;
    ccsClient.load(token)
      .then((d) => { if (!alive) return; setData(d); setAnswers((d.responses as Answers) ?? {}); })
      .catch((e) => { if (alive) setLoadError(e instanceof CcsError ? e.code : "error"); });
    return () => { alive = false; };
  }, [token]);

  // Build the step list from the template, injecting the optional prior-use step
  // immediately after the external/AI step.
  const steps: Step[] = useMemo(() => {
    const content = data?.template?.content_json;
    if (!content?.steps) return [];
    const base: Step[] = [...content.steps].sort((a: Step, b: Step) => (a.index ?? 0) - (b.index ?? 0));
    if (content.priorUseDisclosure) {
      const at = base.findIndex((s) => s.key === "external_ai_input");
      const priorStep: Step = { key: "prior_use", title: content.priorUseDisclosure.label, __content: content.priorUseDisclosure };
      base.splice(at >= 0 ? at + 1 : base.length, 0, priorStep);
    }
    return base;
  }, [data]);

  const finalReview = data?.template?.content_json?.finalReview;
  const footerDisclaimer = data?.template?.content_json?.footerDisclaimer;

  const isStepComplete = useCallback((step: Step): boolean => {
    const a = answers[step.key] ?? {};
    const acks = step.acknowledgments ?? [];
    const acksOk = acks.every((x: { key: string }) => a[x.key] === true);
    switch (step.key) {
      case "prior_use": return true; // optional
      case "decision_makers": return acksOk && !!a.participants_correct;
      case "external_ai_input": {
        const uses = Array.isArray(a.expected_use) ? a.expected_use : [];
        return uses.length > 0 && acksOk;
      }
      case "review_sign": return (finalReview?.checkboxes ?? []).every((c: { key: string }) => a[c.key] === true);
      default: return acks.length ? acksOk : true;
    }
  }, [answers, finalReview]);

  const requiredSteps = useMemo(() => steps.filter((s) => s.key !== "prior_use"), [steps]);
  const pct = useMemo(() => {
    if (!requiredSteps.length) return 0;
    return Math.round((requiredSteps.filter(isStepComplete).length / requiredSteps.length) * 100);
  }, [requiredSteps, isStepComplete]);

  // ── Autosave helpers ──────────────────────────────────────────────────────────
  const debouncedSave = useCallback((key: string, fn: () => Promise<unknown>) => {
    setSaveStatus("saving");
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => { fn().then(() => setSaveStatus("saved")).catch(() => setSaveStatus("error")); }, 500);
  }, []);

  const onAnswer = (stepKey: string, questionKey: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [stepKey]: { ...(prev[stepKey] ?? {}), [questionKey]: value } };
      const done = requiredSteps.filter((s) => {
        const a = next[s.key] ?? {};
        const acks = s.acknowledgments ?? [];
        const acksOk = acks.every((x: { key: string }) => a[x.key] === true);
        if (s.key === "decision_makers") return acksOk && !!a.participants_correct;
        if (s.key === "external_ai_input") return (Array.isArray(a.expected_use) ? a.expected_use.length : 0) > 0 && acksOk;
        if (s.key === "review_sign") return (finalReview?.checkboxes ?? []).every((c: { key: string }) => a[c.key] === true);
        return acks.length ? acksOk : true;
      }).length;
      const completion = Math.round((done / (requiredSteps.length || 1)) * 100);
      debouncedSave(`${stepKey}:${questionKey}`, () => ccsClient.save(token, stepKey, questionKey, value, completion));
      return next;
    });
  };

  const onSaveIntended = (payload: Record<string, unknown>) => debouncedSave("intended", () => ccsClient.saveIntended(token, payload));
  const onSavePriorUse = (payload: Record<string, unknown>) => debouncedSave("prior", () => ccsClient.savePriorUse(token, payload));
  const onCorrection = async (corrections: Array<Record<string, unknown>>) => {
    setSaveStatus("saving");
    try { await ccsClient.correction(token, corrections); setSaveStatus("saved"); } catch { setSaveStatus("error"); }
  };
  const onSign = async (payload: SignaturePayload) => {
    setSigning(true);
    try { const res = await ccsClient.sign(token, payload); setSigned(res.confirmation_number); }
    catch (e) { setSaveStatus("error"); alert(e instanceof CcsError ? `Could not sign: ${e.code}` : "Could not sign. Please try again."); }
    finally { setSigning(false); }
  };

  // ── States ────────────────────────────────────────────────────────────────────
  if (loadError) return <FullScreen><ErrorCard code={loadError} /></FullScreen>;
  if (!data) return <FullScreen><Loader2 className="h-6 w-6 animate-spin text-primary" /></FullScreen>;
  if (signed) return <FullScreen><CompletionSuccess confirmation={signed} /></FullScreen>;
  if (data.snapshot) return <FullScreen><FinalizedCard confirmation={data.snapshot.confirmation_number} /></FullScreen>;
  if (data.expired) return <FullScreen><ErrorCard code="expired" /></FullScreen>;

  const project = data.project ?? {};
  const requireAcks = data.request.require_all_acknowledgments;
  const step = steps[stepIdx];
  const totalSteps = steps.length || 1;
  const isLast = stepIdx === totalSteps - 1;
  const canContinue = step?.key === "prior_use" || !requireAcks || isStepComplete(step);

  const summary: [string, string][] = [
    ["Client", data.client?.company_name ?? "—"],
    ["Project", project.project_name ?? "—"],
    ["Included revision rounds", String(project.included_revision_rounds ?? "—")],
    ["Final approver", project.final_client_approver ?? "—"],
    ["AI / external input", aiUseLabel(answers.external_ai_input?.expected_use)],
    ["Prior-use disclosure", priorLabel(data.priorUse?.prior_use_status)],
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <LVLogo size={30} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{project.project_name ?? "Creative Collaboration Standard"}</p>
              <p className="truncate text-xs text-muted-foreground">{data.client?.company_name}{project.project_number ? ` · ${project.project_number}` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <SaveIndicator status={saveStatus} />
            <span className="hidden items-center gap-1 text-muted-foreground sm:flex"><Lock size={12} /> Secure</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5 md:px-6">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-primary">Step {stepIdx + 1} of {totalSteps}</span>
          <span>{pct}% complete</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-border bg-background p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Creative Collaboration Standard</p>
          <h1 className="mt-1 text-xl font-semibold text-foreground md:text-2xl">{step?.title}</h1>
          <div className="mt-5">
            {step?.key === "welcome" ? (
              <WelcomeStep step={step} data={data} answers={answers[step.key] ?? {}} onAnswer={(q, v) => onAnswer(step.key, q, v)} />
            ) : step?.key === "decision_makers" ? (
              <ParticipantsStep step={step} project={project} answers={answers[step.key] ?? {}} onAnswer={(q, v) => onAnswer(step.key, q, v)} onCorrection={onCorrection} />
            ) : step?.key === "external_ai_input" ? (
              <ExternalAiStep step={step} answers={answers[step.key] ?? {}} onAnswer={(q, v) => onAnswer(step.key, q, v)} initialIntended={data.intended} onSaveIntended={onSaveIntended} />
            ) : step?.key === "prior_use" ? (
              <PriorUseStep content={step.__content} initialPrior={data.priorUse} onSavePriorUse={onSavePriorUse} />
            ) : step?.key === "review_sign" ? (
              <ReviewSignStep finalReview={finalReview} footerDisclaimer={footerDisclaimer} summary={summary}
                defaults={{ name: data.request.recipient_name ?? undefined, email: data.request.recipient_email ?? undefined, company: data.client?.company_name }}
                answers={answers[step.key] ?? {}} onAnswer={(q, v) => onAnswer(step.key, q, v)} onSign={onSign} busy={signing} />
            ) : (
              <EducationalStep step={step} answers={answers[step.key] ?? {}} onAnswer={(q, v) => onAnswer(step.key, q, v)} />
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40">
            <ArrowLeft size={16} /> Back
          </button>
          <a href="mailto:admin@lvbranding.com?subject=Question about my Creative Collaboration Standard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <HelpCircle size={13} /> Need help?
          </a>
          {!isLast ? (
            <button onClick={() => canContinue && setStepIdx((i) => Math.min(totalSteps - 1, i + 1))} disabled={!canContinue}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              Continue <ArrowRight size={16} />
            </button>
          ) : <span className="w-16" />}
        </div>

        {!isLast && !canContinue && step?.key !== "prior_use" && (
          <p className="mt-2 text-right text-xs text-muted-foreground">Please complete the required items above to continue.</p>
        )}
      </main>
    </div>
  );
}

function aiUseLabel(uses: unknown): string {
  const arr = Array.isArray(uses) ? uses : [];
  if (!arr.length) return "—";
  if (arr.includes("none")) return "None planned";
  if (arr.length === 1 && arr[0] === "unsure") return "Undecided";
  return `${arr.length} selection${arr.length > 1 ? "s" : ""}`;
}
function priorLabel(status: unknown): string {
  const map: Record<string, string> = { no: "No", yes: "Yes", unsure: "Unsure", prefer_discuss: "Discuss directly" };
  return typeof status === "string" ? (map[status] ?? "—") : "Not disclosed";
}

// ── Step 1: Welcome ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WelcomeStep({ step, data, answers, onAnswer }: { step: any; data: CcsWizardData; answers: Record<string, unknown>; onAnswer: (q: string, v: unknown) => void }) {
  const p = data.project ?? {};
  const lead = data.request.config_json?.participants?.lvProjectLead;
  const intro = Array.isArray(step.intro) ? step.intro : [step.intro];
  const summary: [string, string][] = [
    ["Client", data.client?.company_name ?? "—"],
    ["Project", p.project_name ?? "—"],
    ["Project number", p.project_number ?? "—"],
    ["LV Branding lead", lead || "—"],
    ["Included revision rounds", String(p.included_revision_rounds ?? "—")],
    ["Current phase", p.current_phase ? PROJECT_PHASE_LABEL[p.current_phase as keyof typeof PROJECT_PHASE_LABEL] : "—"],
    ["Estimated completion", p.estimated_completion_date ?? "—"],
  ];
  return (
    <div className="space-y-5">
      {intro.map((t: string, i: number) => <p key={i} className="text-sm leading-relaxed text-muted-foreground">{t}</p>)}
      {step.supportingMessage && (
        <div className="flex gap-2.5 rounded-lg bg-muted/60 p-3.5 text-sm text-muted-foreground">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" /><p className="leading-relaxed">{step.supportingMessage}</p>
        </div>
      )}
      <div className="rounded-xl border border-border">
        {summary.map(([k, v], i) => (
          <div key={k} className={cn("flex justify-between gap-4 px-4 py-2.5 text-sm", i < summary.length - 1 && "border-b border-border/60")}>
            <span className="text-muted-foreground">{k}</span><span className="text-right font-medium text-foreground">{v}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2 pt-1">
        {(step.acknowledgments ?? []).map((a: { key: string; text: string }) => (
          <RequiredAck key={a.key} text={a.text} checked={answers[a.key] === true} onChange={(v) => onAnswer(a.key, v)} />
        ))}
      </div>
    </div>
  );
}

// ── Chrome ──────────────────────────────────────────────────────────────────────
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") return <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Saving…</span>;
  if (status === "saved") return <span className="inline-flex items-center gap-1 text-emerald-600"><Check size={12} /> Saved</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 text-destructive"><CloudOff size={12} /> Save failed</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><Cloud size={12} /> Autosave on</span>;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">{children}</div>;
}

function CompletionSuccess({ confirmation }: { confirmation: string }) {
  return (
    <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Check size={28} /></div>
      <LVLogo size={32} className="mx-auto mb-3" />
      <h1 className="text-xl font-semibold text-foreground">Thank you — all set</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your Creative Collaboration Standard has been signed and submitted to LV Branding.</p>
      <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="text-xs text-muted-foreground">Confirmation number</p>
        <p className="font-mono font-semibold text-foreground">{confirmation}</p>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">A copy will be emailed to you. You may now close this window.</p>
    </div>
  );
}

function FinalizedCard({ confirmation }: { confirmation: string }) {
  return (
    <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={24} /></div>
      <h1 className="text-xl font-semibold text-foreground">Already completed</h1>
      <p className="mt-2 text-sm text-muted-foreground">This acknowledgment has been signed and submitted.</p>
      <p className="mt-3 text-xs text-muted-foreground">Confirmation <span className="font-mono font-medium text-foreground">{confirmation}</span></p>
    </div>
  );
}

function ErrorCard({ code }: { code: string }) {
  const map: Record<string, { title: string; body: string }> = {
    not_found: { title: "Link not found", body: "This secure link is invalid or has been removed. Please contact LV Branding." },
    expired: { title: "Link expired", body: "This acknowledgment link has expired. LV Branding can send you a new one." },
    revoked: { title: "Link no longer active", body: "This link has been revoked. Please contact LV Branding for assistance." },
    error: { title: "Something went wrong", body: "We couldn't load this page. Please try again or contact LV Branding." },
  };
  const m = map[code] ?? map.error;
  return (
    <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center">
      <LVLogo size={40} className="mx-auto mb-4" />
      <h1 className="text-xl font-semibold text-foreground">{m.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{m.body}</p>
      <a href="mailto:admin@lvbranding.com" className="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Contact LV Branding</a>
    </div>
  );
}
