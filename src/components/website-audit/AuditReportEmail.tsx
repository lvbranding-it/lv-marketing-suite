import { useState } from "react";
import { Check, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asAuditApiError, emailAuditReport } from "@/lib/website-audit/api";
import { auditCopyFor } from "@/lib/website-audit/copy";
import type { AuditLanguage, AuditReport } from "@/lib/website-audit/types";

interface AuditReportEmailProps {
  language: AuditLanguage;
  report: AuditReport;
}

type Status = "idle" | "sending" | "sent" | "error";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The optional "keep this report" capture.
 *
 * It sits below the finished report on purpose. The visitor has already been
 * given everything before an address is ever requested, which is what makes this
 * a convenience rather than a gate, and the disclosure says plainly where the
 * address goes.
 */
export default function AuditReportEmail({ language, report }: AuditReportEmailProps) {
  const copy = auditCopyFor(language).reportEmail;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | undefined>();
  const [honeypot, setHoneypot] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === "sending") return;
    const value = email.trim();
    if (!value) return setError(copy.required);
    if (!EMAIL.test(value)) return setError(copy.invalidEmail);
    if (!report.accessToken) return setError(copy.error);

    setError(undefined);
    setStatus("sending");
    try {
      await emailAuditReport({
        auditId: report.auditId,
        accessToken: report.accessToken,
        language,
        email: value,
        hp: honeypot,
      });
      setStatus("sent");
    } catch (cause) {
      // The per-audit ceiling is a distinct, actionable outcome: the visitor is
      // not being told to retry something that will refuse them again.
      setError(asAuditApiError(cause).code === "report_email_limit" ? copy.limitReached : copy.error);
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
        <div role="status" aria-live="polite" className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check size={17} strokeWidth={3} />
          </span>
          <div>
            <h2 className="text-base font-bold">{copy.successHeading}</h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">{copy.successBody}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Mail size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold">{copy.heading}</h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">{copy.body}</p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="mt-5">
        <div aria-hidden="true" className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="audit-report-site">Website</label>
          <input id="audit-report-site" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
        </div>
        <Label htmlFor="audit-report-email" className="text-xs">{copy.email}</Label>
        <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
          <Input
            id="audit-report-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={copy.placeholder}
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(undefined); }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "audit-report-email-error" : undefined}
            className="sm:max-w-xs"
          />
          <Button type="submit" disabled={status === "sending"} className="gap-2 sm:shrink-0">
            {status === "sending"
              ? <><Loader2 size={15} className="animate-spin" /> {copy.submitting}</>
              : copy.submit}
          </Button>
        </div>
        {error && <p id="audit-report-email-error" role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        <p className="mt-3 max-w-2xl text-[11px] leading-5 text-muted-foreground">{copy.disclosure}</p>
      </form>
    </section>
  );
}
