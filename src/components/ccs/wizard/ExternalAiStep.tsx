import { useEffect, useRef, useState } from "react";
import { Check, Info, AlertTriangle } from "lucide-react";
import { RequiredAck } from "./EducationalStep";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Step = Record<string, any>;

const ACTIVE_USES = ["review_critique", "check_quality", "generate_copy", "generate_visuals", "modify_work", "external_opinion"];
const IMPLEMENTATION_RESPONSES = ["To reproduce or adapt the suggested direction", "To create a new variation"];

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5 text-sm text-foreground">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
        {checked && <Check size={12} />}
      </span>
      <span>{label}</span>
    </label>
  );
}

export default function ExternalAiStep({
  step, answers, onAnswer, initialIntended, onSaveIntended,
}: {
  step: Step;
  answers: Record<string, unknown>;
  onAnswer: (key: string, value: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialIntended: any;
  onSaveIntended: (payload: Record<string, unknown>) => void;
}) {
  const [uses, setUses] = useState<string[]>(initialIntended?.ai_or_external_use_expected ?? []);
  const [purpose, setPurpose] = useState<string[]>(initialIntended?.expected_purpose ?? []);
  const [lvResponse, setLvResponse] = useState<string>((initialIntended?.expected_lv_response ?? [])[0] ?? "");
  const [platforms, setPlatforms] = useState<string>(initialIntended?.expected_platforms ?? "");
  const [notes, setNotes] = useState<string>(initialIntended?.client_notes ?? "");

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showConditional = uses.some((u) => ACTIVE_USES.includes(u));
  const implementation = uses.includes("modify_work") || IMPLEMENTATION_RESPONSES.includes(lvResponse);

  // Mirror the primary selection into wizard answers so the shell can gate Continue.
  useEffect(() => {
    onAnswer("expected_use", uses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uses]);

  // Autosave the structured intended-input record (debounced).
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onSaveIntended({
        ai_or_external_use_expected: uses,
        expected_usage_types: uses,
        expected_purpose: purpose,
        expected_lv_response: lvResponse ? [lvResponse] : [],
        expected_platforms: platforms,
        implementation_may_be_requested: implementation,
        client_notes: notes,
      });
    }, 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uses, purpose, lvResponse, platforms, notes]);

  const toggleUse = (value: string, exclusive?: boolean) => {
    setUses((prev) => {
      if (exclusive) return prev.includes(value) ? [] : [value];
      const withoutExclusive = prev.filter((v) => v !== "none");
      return withoutExclusive.includes(value) ? withoutExclusive.filter((v) => v !== value) : [...withoutExclusive, value];
    });
  };
  const togglePurpose = (v: string) => setPurpose((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const intro: string[] = Array.isArray(step.intro) ? step.intro : [step.intro];

  return (
    <div className="space-y-5">
      {intro.map((t, i) => <p key={i} className="text-sm leading-relaxed text-muted-foreground">{t}</p>)}

      {/* Primary question */}
      <div className="rounded-lg border border-border p-4">
        <p className="mb-2 text-sm font-medium text-foreground">{step.primaryQuestion?.prompt}</p>
        {step.primaryQuestion?.options?.map((o: { value: string; label: string; exclusive?: boolean }) => (
          <CheckRow key={o.value} label={o.label} checked={uses.includes(o.value)} onChange={() => toggleUse(o.value, o.exclusive)} />
        ))}
      </div>

      {/* Conditional questions */}
      {showConditional && (
        <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{step.conditional?.purpose?.prompt}</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {step.conditional?.purpose?.options?.map((o: string) => (
                <CheckRow key={o} label={o} checked={purpose.includes(o)} onChange={() => togglePurpose(o)} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{step.conditional?.lvResponse?.prompt}</p>
            <div className="grid gap-2">
              {step.conditional?.lvResponse?.options?.map((o: string) => (
                <button key={o} type="button" onClick={() => setLvResponse(o)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${lvResponse === o ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted"}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{step.conditional?.platforms?.prompt}</p>
            <input value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="e.g. ChatGPT, Midjourney, a marketing consultant…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <p className="mt-1.5 text-xs text-muted-foreground">Optional. Examples: {step.conditional?.platforms?.examples?.slice(0, 6).join(", ")}</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Anything else LV Branding should know?</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      {implementation && (
        <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{step.implementationNotice}</p>
        </div>
      )}

      {/* Acknowledgments */}
      <div className="space-y-2">
        {(step.acknowledgments ?? []).map((a: { key: string; text: string }) => (
          <RequiredAck key={a.key} text={a.text} checked={answers[a.key] === true} onChange={(v) => onAnswer(a.key, v)} />
        ))}
      </div>

      {step.informationalNotice && (
        <div className="flex gap-2.5 rounded-lg bg-muted/60 p-3.5 text-sm text-muted-foreground">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" /><p className="leading-relaxed">{step.informationalNotice}</p>
        </div>
      )}
    </div>
  );
}

export function externalAiComplete(step: Step, answers: Record<string, unknown>, uses: string[]): boolean {
  const acksOk = (step.acknowledgments ?? []).every((a: { key: string }) => answers[a.key] === true);
  return uses.length > 0 && acksOk;
}
