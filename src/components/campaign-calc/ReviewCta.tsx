// ── Consultation CTA ────────────────────────────────────────────────────────────
// The ask changes with where the prospect landed, and the form submits in place
// so the plan stays on screen. Everything except name, email, phone, and intent
// is already known from the calculator, so those are the only fields asked for.
//
// The result is never gated. This sits below a complete, finished plan and the
// prospect can ignore it, print it, or copy it without giving up anything.

import { useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  CTA_COPY, LEAD_INTENTS, buildLeadBody, isEmail, planSummaryLines,
  type LeadIntent,
} from "@/lib/campaign/lead";
import type { CalculationResult, CalculatorAnswers, ScenarioPlan } from "@/lib/campaign/types";

interface ReviewCtaProps {
  answers: CalculatorAnswers;
  result:  CalculationResult;
  plan:    ScenarioPlan;
}

export default function ReviewCta({ answers, result, plan }: ReviewCtaProps) {
  const copy = CTA_COPY[result.feasibility.status];

  const [name,   setName]   = useState("");
  const [email,  setEmail]  = useState("");
  const [phone,  setPhone]  = useState("");
  const [intent, setIntent] = useState<LeadIntent>("second-opinion");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const hp = useRef("");

  const summary = planSummaryLines(answers, result, plan);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;

    const next: typeof errors = {};
    if (!name.trim())    next.name  = "Please add your name.";
    if (!email.trim())   next.email = "Please add your email.";
    else if (!isEmail(email)) next.email = "That email does not look right.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("sending");
    try {
      const body = buildLeadBody(answers, result, plan, intent, {
        name, email, phone, hp: hp.current,
      });
      const { data, error } = await supabase.functions.invoke("submit-av-lead", { body });
      if (error || (data as { error?: string } | null)?.error) {
        throw new Error((data as { error?: string } | null)?.error || error?.message);
      }
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <section
        aria-labelledby="cta-h"
        className="rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
      >
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="cta-h" className="text-sm font-semibold">
              Got it, {name.trim().split(/\s+/)[0]}. Your plan is on its way.
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              A copy is heading to {email.trim()} so you have it on hand, and it reached our team
              with everything you worked out here. Someone will follow up within one business day,
              and they will have read the plan first.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Nothing on this page changed. Print it or copy the summary any time.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="cta-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="cta-h" className="text-sm font-semibold">{copy.heading}</h3>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {copy.body}
      </p>

      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        {/* Honeypot: off-screen rather than display:none so bots still fill it. */}
        <div aria-hidden="true" className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="cta-website">Website</label>
          <input
            id="cta-website" type="text" tabIndex={-1} autoComplete="off"
            onChange={(e) => { hp.current = e.target.value; }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cta-name" className="text-xs">Your name</Label>
            <Input
              id="cta-name" value={name} autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "cta-name-err" : undefined}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
            />
            {errors.name && (
              <p id="cta-name-err" className="text-[11px] text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cta-email" className="text-xs">Email</Label>
            <Input
              id="cta-email" type="email" value={email} autoComplete="email" inputMode="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "cta-email-err" : undefined}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
            />
            {errors.email && (
              <p id="cta-email-err" className="text-[11px] text-destructive">{errors.email}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5 sm:max-w-[calc(50%-0.375rem)]">
          <Label htmlFor="cta-phone" className="text-xs">
            Phone <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="cta-phone" type="tel" value={phone} autoComplete="tel"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">What would help most right now?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEAD_INTENTS.map((option) => {
              const checked = intent === option.key;
              return (
                <label
                  key={option.key}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <input
                    type="radio" name="cta-intent" value={option.key} checked={checked}
                    onChange={() => setIntent(option.key)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary focus:outline-none"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-snug">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Exactly what leaves the browser, in the prospect's own numbers. */}
        <details className="group rounded-lg border border-border bg-muted/30 px-3 py-2">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
            <ChevronDown
              size={13}
              className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
            Your plan goes with this. See exactly what we receive.
          </summary>
          <dl className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] leading-relaxed">
            {summary.map((line) => (
              <div key={line.label} className="flex flex-wrap gap-x-2">
                <dt className="shrink-0 font-medium text-muted-foreground">{line.label}:</dt>
                <dd className="min-w-0 text-foreground">{line.value}</dd>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-2 pt-1">
              <dt className="shrink-0 font-medium text-muted-foreground">Plus:</dt>
              <dd className="min-w-0 text-foreground">
                your objective, channels, market, and the answers behind the plan.
              </dd>
            </div>
          </dl>
        </details>

        {status === "error" && (
          <p role="alert" className="text-xs text-destructive">
            That did not go through. Please try again, or email us at{" "}
            <a href="mailto:luis@lvbranding.com" className="font-medium underline underline-offset-2">
              luis@lvbranding.com
            </a>.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" disabled={status === "sending"} className="gap-1.5">
            {status === "sending" ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Sending
              </>
            ) : (
              <>
                {copy.action}
                <ArrowRight size={14} aria-hidden="true" />
              </>
            )}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            No obligation, and the plan stays yours either way.
          </p>
        </div>
        <p aria-live="polite" className="sr-only">
          {status === "sending" ? "Sending your plan." : ""}
        </p>
      </form>
    </section>
  );
}
