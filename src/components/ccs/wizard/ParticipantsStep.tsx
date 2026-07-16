import { useState } from "react";
import { Check } from "lucide-react";
import { RequiredAck } from "./EducationalStep";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Step = Record<string, any>;

interface Correction { field_name: string; current_value: string; proposed_value: string }

export default function ParticipantsStep({
  step, project, answers, onAnswer, onCorrection,
}: {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
  answers: Record<string, unknown>;
  onAnswer: (key: string, value: unknown) => void;
  onCorrection: (corrections: Array<Record<string, unknown>>) => Promise<void>;
}) {
  const roles: { field: string; label: string; value: string }[] = [
    { field: "primary_client_contact", label: "Primary contact", value: project?.primary_client_contact || "—" },
    { field: "final_client_approver", label: "Final approver", value: project?.final_client_approver || "—" },
    { field: "additional_reviewers", label: "Additional reviewers", value: (project?.additional_reviewers ?? []).join(", ") || "—" },
    { field: "cost_authorizer", label: "Authorized to approve additional costs", value: project?.cost_authorizer || "—" },
  ];

  const correct = answers.participants_correct as string | undefined;
  const [proposed, setProposed] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const submitCorrection = async () => {
    const corrections: Correction[] = roles
      .filter((r) => proposed[r.field]?.trim() && proposed[r.field] !== r.value)
      .map((r) => ({ field_name: r.field, current_value: r.value, proposed_value: proposed[r.field].trim() }));
    if (note.trim()) corrections.push({ field_name: "note", current_value: "", proposed_value: note.trim() });
    if (!corrections.length) return;
    setBusy(true);
    try { await onCorrection(corrections as unknown as Array<Record<string, unknown>>); setSubmitted(true); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">{step.intro}</p>

      <div className="rounded-xl border border-border">
        {roles.map((r, i) => (
          <div key={r.field} className={`flex justify-between gap-4 px-4 py-2.5 text-sm ${i < roles.length - 1 ? "border-b border-border/60" : ""}`}>
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right font-medium text-foreground">{r.value}</span>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{step.question?.prompt}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {step.question?.options?.map((o: { value: string; label: string }) => (
            <button key={o.value} type="button" onClick={() => onAnswer("participants_correct", o.value)}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${correct === o.value ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {correct === "no" && !submitted && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Propose corrections</p>
          <p className="text-xs text-muted-foreground">These are sent to LV Branding for review and do not overwrite the project record.</p>
          {roles.map((r) => (
            <div key={r.field} className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">{r.label}</label>
              <input value={proposed[r.field] ?? ""} onChange={(e) => setProposed((p) => ({ ...p, [r.field]: e.target.value }))}
                placeholder={r.value} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          ))}
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={submitCorrection} disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Sending…" : "Submit correction"}
          </button>
        </div>
      )}
      {correct === "no" && submitted && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-700">
          <Check size={16} /> Correction sent to LV Branding. You can continue.
        </div>
      )}

      <div className="space-y-2 pt-1">
        {(step.acknowledgments ?? []).map((a: { key: string; text: string }) => (
          <RequiredAck key={a.key} text={a.text} checked={answers[a.key] === true} onChange={(v) => onAnswer(a.key, v)} />
        ))}
      </div>
    </div>
  );
}
