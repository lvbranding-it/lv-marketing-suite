import { Check, ThumbsUp, ThumbsDown, ShieldAlert, Info } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Step = Record<string, any>;

export function RequiredAck({ text, checked, onChange }: { text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3.5 transition-colors hover:border-primary/40">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
        {checked && <Check size={13} />}
      </span>
      <span className="text-sm leading-relaxed text-foreground">{text}</span>
    </label>
  );
}

function Bullets({ title, items, tone }: { title?: string; items: string[]; tone?: "good" | "bad" }) {
  if (!items?.length) return null;
  return (
    <div>
      {title && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>}
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            {tone === "good" ? <ThumbsUp size={14} className="mt-0.5 shrink-0 text-emerald-600" /> : tone === "bad" ? <ThumbsDown size={14} className="mt-0.5 shrink-0 text-muted-foreground" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />}
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({ children, icon: Icon = Info }: { children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-muted/60 p-3.5 text-sm text-muted-foreground">
      <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

export default function EducationalStep({ step, answers, onAnswer }: { step: Step; answers: Record<string, unknown>; onAnswer: (key: string, value: unknown) => void }) {
  const intro: string | string[] = step.intro;
  const introParas = Array.isArray(intro) ? intro : intro ? [intro] : [];

  return (
    <div className="space-y-5">
      {introParas.map((p, i) => <p key={i} className="text-sm leading-relaxed text-muted-foreground">{p}</p>)}
      {step.supportingMessage && <Notice>{step.supportingMessage}</Notice>}
      {step.allowanceExample && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-sm font-medium text-foreground">{step.allowanceExample}</div>}

      {step.displayParticipants && <Bullets title="Roles on this project" items={step.displayParticipants} />}

      {(step.helpfulFeedback || step.lessEffectiveFeedback) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4"><Bullets title="Helpful feedback" items={step.helpfulFeedback ?? []} tone="good" /></div>
          <div className="rounded-lg border border-border p-4"><Bullets title="Less effective" items={step.lessEffectiveFeedback ?? []} tone="bad" /></div>
        </div>
      )}
      {step.feedbackShouldAnswer && <Bullets title="Good feedback answers" items={step.feedbackShouldAnswer} />}
      {step.protectedMaterials && <Bullets title="Protected materials" items={step.protectedMaterials} />}
      {step.additionalRoundTriggers && <Bullets title="May count as an additional revision round" items={step.additionalRoundTriggers} />}
      {step.phases && <Bullets title="Project phases" items={step.phases} />}

      {step.classifications && (
        <div className="space-y-3">
          {step.classifications.map((c: Step, i: number) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{c.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
              {c.examples && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium">Examples:</span> {c.examples.join(", ")}</p>}
              {c.mayRequire && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium">May require:</span> {c.mayRequire.join(", ")}</p>}
              {c.note && <p className="mt-2 text-xs italic text-muted-foreground">{c.note}</p>}
            </div>
          ))}
        </div>
      )}

      {(step.included || step.notIncluded) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {step.included && <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"><Bullets title="Included, subject to agreement" items={step.included} tone="good" /></div>}
          {step.notIncluded && <div className="rounded-lg border border-border p-4"><Bullets title="Not automatically included" items={step.notIncluded} /></div>}
        </div>
      )}

      {step.approvalExplanation && <Notice icon={ShieldAlert}>{step.approvalExplanation}</Notice>}
      {step.informationalNotice && <Notice>{step.informationalNotice}</Notice>}
      {step.disclaimer && <Notice icon={ShieldAlert}>{step.disclaimer}</Notice>}

      {step.acknowledgments?.length > 0 && (
        <div className="space-y-2 pt-1">
          {step.acknowledgments.map((a: { key: string; text: string }) => (
            <RequiredAck key={a.key} text={a.text} checked={answers[a.key] === true} onChange={(v) => onAnswer(a.key, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function stepAcknowledgmentsComplete(step: Step, answers: Record<string, unknown>): boolean {
  const acks = step.acknowledgments ?? [];
  return acks.every((a: { key: string }) => answers[a.key] === true);
}
