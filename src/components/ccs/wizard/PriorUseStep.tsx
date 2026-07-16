import { useEffect, useRef, useState } from "react";
import { Check, ShieldQuestion } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Content = Record<string, any>;

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex gap-1">
        {[["Yes", true], ["No", false]].map(([l, v]) => (
          <button key={l as string} type="button" onClick={() => onChange(v as boolean)}
            className={`rounded-md border px-3 py-1 text-xs transition-colors ${value === v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {l as string}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PriorUseStep({
  content, initialPrior, onSavePriorUse,
}: {
  content: Content;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialPrior: any;
  onSavePriorUse: (payload: Record<string, unknown>) => void;
}) {
  const [status, setStatus] = useState<string>(initialPrior?.prior_use_status ?? "");
  const [platforms, setPlatforms] = useState<string>(initialPrior?.platforms_or_advisors ?? "");
  const [materials, setMaterials] = useState<string[]>(initialPrior?.materials_shared ?? []);
  const [output, setOutput] = useState<string>(initialPrior?.output_generated ?? "");
  const [review, setReview] = useState<boolean | null>(initialPrior?.lv_review_requested ?? null);
  const [implement, setImplement] = useState<boolean | null>(initialPrior?.implementation_requested ?? null);
  const [notes, setNotes] = useState<string>(initialPrior?.client_notes ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!status) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onSavePriorUse({
        prior_use_status: status, platforms_or_advisors: platforms, materials_shared: materials,
        output_generated: output, lv_review_requested: review ?? false, implementation_requested: implement ?? false, client_notes: notes,
      });
    }, 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, platforms, materials, output, review, implement, notes]);

  const toggleMaterial = (m: string) => setMaterials((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  const showFollowUp = status && status !== "no";

  return (
    <div className="space-y-5">
      <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        <ShieldQuestion size={13} /> {content.label}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{content.explanation}</p>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{content.question?.prompt}</p>
        <div className="grid gap-2">
          {content.question?.options?.map((o: { value: string; label: string }) => (
            <button key={o.value} type="button" onClick={() => setStatus(o.value)}
              className={`rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${status === o.value ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {showFollowUp && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Which platform or advisor may have received the material?</label>
            <input value={platforms} onChange={(e) => setPlatforms(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">What type of material may have been shared?</label>
            <div className="flex flex-wrap gap-2">
              {content.materialTypes?.map((m: string) => (
                <button key={m} type="button" onClick={() => toggleMaterial(m)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${materials.includes(m) ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {materials.includes(m) && <Check size={11} />} {m}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">What critique, output, or alternative may have been generated?</label>
            <textarea value={output} onChange={(e) => setOutput(e.target.value)} rows={2} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="divide-y divide-border">
            <YesNo label="Would you like LV Branding to review the resulting output?" value={review} onChange={setReview} />
            <YesNo label="Do you expect LV Branding to implement or reproduce any part of it?" value={implement} onChange={setImplement} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Any relevant context</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      <div className="flex gap-2.5 rounded-lg bg-muted/60 p-3.5 text-sm text-muted-foreground">
        <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-primary" /><p className="leading-relaxed">{content.notice}</p>
      </div>
    </div>
  );
}
