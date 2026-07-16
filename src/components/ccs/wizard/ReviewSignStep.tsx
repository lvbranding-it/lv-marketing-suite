import { useState } from "react";
import { Check, PenLine, Type, Loader2 } from "lucide-react";
import SignaturePad from "./SignaturePad";
import type { SignaturePayload } from "@/lib/ccsClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FinalReview = Record<string, any>;

export default function ReviewSignStep({
  finalReview, footerDisclaimer, summary, defaults, answers, onAnswer, onSign, busy,
}: {
  finalReview: FinalReview;
  footerDisclaimer?: string;
  summary: [string, string][];
  defaults: { name?: string; email?: string; company?: string };
  answers: Record<string, unknown>;
  onAnswer: (key: string, value: unknown) => void;
  onSign: (payload: SignaturePayload) => Promise<void>;
  busy: boolean;
}) {
  const checkboxes: { key: string; text: string }[] = finalReview?.checkboxes ?? [];
  const allChecked = checkboxes.every((c) => answers[c.key] === true);

  const [name, setName] = useState(defaults.name ?? "");
  const [company, setCompany] = useState(defaults.company ?? "");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState(defaults.email ?? "");
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);

  const hasSignature = mode === "type" ? typed.trim().length > 1 : !!drawn;
  const canSign = allChecked && name.trim().length > 1 && hasSignature && !busy;

  const submit = () => {
    if (!canSign) return;
    onSign({
      signer_name: name.trim(), signer_company: company.trim() || undefined, signer_title: title.trim() || undefined,
      signer_email: email.trim() || undefined,
      signature_type: mode === "type" ? "typed" : "drawn",
      signature_data: mode === "type" ? typed.trim() : (drawn ?? undefined),
      consent_text: finalReview?.consentText ?? "",
    });
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Your responses</p>
        <div className="rounded-xl border border-border">
          {summary.map(([k, v], i) => (
            <div key={k} className={`flex justify-between gap-4 px-4 py-2.5 text-sm ${i < summary.length - 1 ? "border-b border-border/60" : ""}`}>
              <span className="text-muted-foreground">{k}</span><span className="max-w-[60%] text-right font-medium text-foreground">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Use “Back” to change any response before signing.</p>
      </div>

      {/* Final checkboxes */}
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Please confirm</p>
        <div className="space-y-2">
          {checkboxes.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/40">
              <input type="checkbox" className="peer sr-only" checked={answers[c.key] === true} onChange={(e) => onAnswer(c.key, e.target.checked)} />
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 ${answers[c.key] === true ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                {answers[c.key] === true && <Check size={13} />}
              </span>
              <span className="text-sm leading-relaxed text-foreground">{c.text}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Signer identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full legal name" required><input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></Field>
        <Field label="Company"><input value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></Field>
        <Field label="Job title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></Field>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></Field>
      </div>

      {/* Signature */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Signature</p>
          <div className="ml-auto flex rounded-md border border-border p-0.5">
            <button type="button" onClick={() => setMode("type")} className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs ${mode === "type" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Type size={12} /> Type</button>
            <button type="button" onClick={() => setMode("draw")} className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs ${mode === "draw" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><PenLine size={12} /> Draw</button>
          </div>
        </div>
        {mode === "type" ? (
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full legal name"
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-lg" style={{ fontFamily: "'Fira Sans', cursive" }} />
        ) : (
          <SignaturePad onChange={setDrawn} />
        )}
      </div>

      {/* Consent + sign */}
      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{finalReview?.consentText}</p>
      </div>

      <button type="button" onClick={submit} disabled={!canSign}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Sign & submit acknowledgment
      </button>
      {!allChecked && <p className="text-center text-xs text-muted-foreground">Confirm all statements above to sign.</p>}

      {footerDisclaimer && <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">{footerDisclaimer}</p>}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}{required && <span className="text-primary"> *</span>}</span>
      {children}
    </label>
  );
}
