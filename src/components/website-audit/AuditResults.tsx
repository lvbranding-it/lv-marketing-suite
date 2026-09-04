import { useEffect, useMemo } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Code2,
  ExternalLink,
  Eye,
  FileSearch,
  Gauge,
  Loader2,
  Globe2,
  Hammer,
  Info,
  LayoutTemplate,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recordAuditEvent } from "@/lib/website-audit/api";
import { auditCopyFor } from "@/lib/website-audit/copy";
import {
  DIMENSIONS,
  type AuditCheck,
  type AuditDimension,
  type AuditLanguage,
  type AuditReport,
  type CheckOutcome,
  type EvidenceType,
} from "@/lib/website-audit/types";
import AuditLeadCta from "./AuditLeadCta";
import AuditReportEmail from "./AuditReportEmail";

interface AuditResultsProps {
  language: AuditLanguage;
  report: AuditReport;
  onRunAnother: () => void;
}

const icons: Record<AuditDimension, typeof Gauge> = {
  experience: LayoutTemplate,
  positioning: Target,
  search: Search,
  aiReadiness: Bot,
  technical: Code2,
};

const evidenceStyle: Record<EvidenceType, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  inferred: "border-blue-200 bg-blue-50 text-blue-800",
  selfReported: "border-amber-200 bg-amber-50 text-amber-800",
  needsReview: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const outcomeStyle: Record<CheckOutcome, string> = {
  pass: "text-emerald-700",
  partial: "text-amber-700",
  fail: "text-primary",
  notMeasured: "text-muted-foreground",
};

function EvidenceBadge({ type, label, description }: { type: EvidenceType; label: string; description: string }) {
  return (
    <span title={description} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", evidenceStyle[type])}>
      {label}
    </span>
  );
}

function summaryFor(check: AuditCheck, language: AuditLanguage): string {
  const rule = auditCopyFor(language).rules[check.ruleId];
  return rule[check.outcome];
}

function pickDimensionHighlights(checks: AuditCheck[]) {
  const strength = checks
    .filter((check) => check.outcome === "pass")
    .sort((a, b) => b.businessImpact - a.businessImpact || b.maxPoints - a.maxPoints)[0];
  const issue = checks
    .filter((check) => check.outcome === "fail" || check.outcome === "partial")
    .sort((a, b) => b.priority - a.priority || b.maxPoints - a.maxPoints)[0];
  const missing = checks.find((check) => check.outcome === "notMeasured");
  return { strength, issue, missing };
}

function ScoreRing({ score, label, size = "large" }: { score: number; label: string; size?: "large" | "small" }) {
  const large = size === "large";
  return (
    <div
      role="img"
      aria-label={`${label}: ${score}`}
      className={cn("relative shrink-0 rounded-full p-[7px]", large ? "h-44 w-44 sm:h-52 sm:w-52" : "h-14 w-14 p-[3px]")}
      style={{ background: `conic-gradient(#CB2039 ${score * 3.6}deg, #e7e5e4 0deg)` }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(35,31,32,.05)]">
        <span className={cn("font-semibold tabular-nums tracking-[-0.055em]", large ? "text-6xl" : "text-xl")}>{score}</span>
        {large && <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">/ 100</span>}
      </div>
    </div>
  );
}

function PagePreview({ report, language }: { report: AuditReport; language: AuditLanguage }) {
  const copy = auditCopyFor(language);
  const primary = report.pages[0];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{copy.results.pagePreview}</p>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">HTTP {primary.status}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_12px_30px_rgba(35,31,32,.09)]">
        <div className="flex h-9 items-center gap-1.5 border-b border-black/10 bg-[#efeeec] px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b68]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f0bd4e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#63c66d]" />
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 text-[9px] text-muted-foreground">
            {report.url.startsWith("https:") ? <LockKeyhole size={8} className="shrink-0" /> : <Globe2 size={8} className="shrink-0" />}
            <span className="truncate">{report.url}</span>
          </div>
        </div>
        {report.lab.screenshotDataUrl ? (
          <div className="max-h-[360px] overflow-hidden bg-[#fbfaf8]">
            <img src={report.lab.screenshotDataUrl} alt={copy.results.pageScreenshotAlt} className="h-auto w-full object-cover object-top" />
          </div>
        ) : (
          <div className="relative min-h-[250px] overflow-hidden bg-[#fbfaf8] p-5 sm:min-h-[285px] sm:p-7">
            <div className="absolute right-[-45px] top-[-55px] h-36 w-36 rounded-full bg-primary/[0.07]" />
            <div className="h-2 w-20 rounded-full bg-primary/80" />
            <p className="mt-5 max-w-md text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{primary.title || report.domain}</p>
            <h3 className="mt-2 max-w-lg text-xl font-bold leading-tight tracking-[-0.025em] text-lv-charcoal sm:text-2xl">
              {primary.h1Text || primary.title || report.domain}
            </h3>
            <div className="mt-4 h-2 w-[88%] max-w-md rounded-full bg-black/10" />
            <div className="mt-2 h-2 w-[70%] max-w-sm rounded-full bg-black/10" />
            <div className="mt-6 inline-flex rounded-md bg-primary px-3 py-2 text-[10px] font-bold text-white">
              {primary.ctaLabels[0] || report.domain}
            </div>
            <div className="mt-7 grid grid-cols-3 gap-2">
              {[68, 86, 55].map((width, index) => (
                <div key={index} className="rounded-lg border border-black/[0.07] bg-white p-2.5">
                  <div className="h-5 w-5 rounded-md bg-black/[0.07]" />
                  <div className="mt-2 h-1.5 rounded-full bg-black/10" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{report.lab.screenshotDataUrl ? copy.results.pageScreenshotNote : copy.results.pagePreviewNote}</p>
    </div>
  );
}

function DimensionCard({ dimension, report, language, index }: { dimension: AuditDimension; report: AuditReport; language: AuditLanguage; index: number }) {
  const copy = auditCopyFor(language);
  const data = report.dimensions[dimension];
  const Icon = icons[dimension];
  const { strength, issue, missing } = pickDimensionHighlights(data.checks);
  const evidenceCheck = issue ?? missing ?? strength;
  const spans = ["lg:col-span-2", "lg:col-span-2", "lg:col-span-2", "lg:col-span-3", "lg:col-span-3"];
  return (
    <article className={cn("flex flex-col rounded-2xl border border-black/10 bg-white p-5 shadow-[0_8px_24px_rgba(35,31,32,.045)] sm:p-6", spans[index])}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lv-charcoal text-white"><Icon size={18} strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-5">{copy.dimensions[dimension].label}</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{copy.bands[data.band].label}</p>
        </div>
        <ScoreRing score={data.score} label={copy.dimensions[dimension].label} size="small" />
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-primary" style={{ width: `${data.score}%` }} /></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.dimensions[dimension].description}</p>

      <dl className="mt-5 space-y-4 border-t border-black/10 pt-5">
        <div>
          <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700"><CheckCircle2 size={12} /> {copy.results.working}</dt>
          <dd className="mt-1.5 text-xs leading-5 text-foreground">{strength ? summaryFor(strength, language) : copy.results.noStrength}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary"><AlertCircle size={12} /> {copy.results.friction}</dt>
          <dd className="mt-1.5 text-xs leading-5 text-foreground">{issue ? summaryFor(issue, language) : copy.results.noFriction}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.results.nextAction}</dt>
          <dd className="mt-1.5 text-xs leading-5 text-foreground">{issue ? copy.rules[issue.ruleId].recommendation : copy.results.protectDimension}</dd>
        </div>
      </dl>
      {evidenceCheck && <div className="mt-auto pt-5">
        <EvidenceBadge type={evidenceCheck.evidenceType} label={copy.evidence[evidenceCheck.evidenceType].label} description={copy.evidence[evidenceCheck.evidenceType].description} />
      </div>}
    </article>
  );
}

function PriorityCard({
  check,
  title,
  hint,
  kind,
  language,
}: {
  check: AuditCheck;
  title: string;
  hint: string;
  kind: "fix" | "plan" | "protect";
  language: AuditLanguage;
}) {
  const copy = auditCopyFor(language);
  const Icon = kind === "fix" ? Hammer : kind === "plan" ? Sparkles : ShieldCheck;
  return (
    <article className={cn(
      "flex flex-col rounded-2xl border p-5 sm:p-6",
      kind === "fix" ? "border-primary/25 bg-primary/[0.045]" : "border-black/10 bg-white",
    )}>
      <div className="flex items-center gap-3">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", kind === "fix" ? "bg-primary text-white" : kind === "protect" ? "bg-emerald-100 text-emerald-800" : "bg-lv-charcoal text-white")}>
          <Icon size={17} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em]">{title}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </div>
      <h3 className="mt-5 text-base font-bold">{copy.rules[check.ruleId].title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{summaryFor(check, language)}</p>
      {kind !== "protect" && <p className="mt-4 border-t border-black/10 pt-4 text-xs font-medium leading-5">{copy.rules[check.ruleId].recommendation}</p>}
      <div className="mt-auto pt-5">
        <EvidenceBadge type={check.evidenceType} label={copy.evidence[check.evidenceType].label} description={copy.evidence[check.evidenceType].description} />
      </div>
    </article>
  );
}

function Findings({ report, language }: { report: AuditReport; language: AuditLanguage }) {
  const copy = auditCopyFor(language);
  return (
    <section className="rounded-2xl border border-black/10 bg-white">
      <div className="border-b border-black/10 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><FileSearch size={18} /></span>
          <div>
            <h2 className="text-lg font-bold">{copy.results.fullFindings}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.results.fullFindingsBody}</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-black/10">
        {DIMENSIONS.map((dimension) => {
          const data = report.dimensions[dimension];
          const Icon = icons[dimension];
          return (
            <details
              key={dimension}
              className="group"
              onToggle={(event) => {
                if ((event.currentTarget as HTMLDetailsElement).open) recordAuditEvent(report.auditId, report.accessToken, "finding_expanded", { dimension });
              }}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
                <Icon size={16} className="text-primary" />
                <span className="min-w-0 flex-1 text-sm font-semibold">{copy.dimensions[dimension].label}</span>
                <span className="text-xs font-bold tabular-nums">{data.score}</span>
                <span className="hidden text-[10px] text-muted-foreground sm:inline">{copy.results.findingsCount(data.checks.length)}</span>
                <ChevronDown size={15} className="text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-black/10 bg-[#fbfaf8] px-4 py-3 sm:px-6 sm:py-4">
                <div className="divide-y divide-black/[0.07]">
                  {data.checks.map((check) => {
                    const rule = copy.rules[check.ruleId];
                    return (
                      <article key={check.ruleId} className="grid gap-3 py-4 first:pt-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em]", outcomeStyle[check.outcome])}>
                              {check.outcome === "pass" ? <Check size={11} /> : check.outcome === "notMeasured" ? <Info size={11} /> : <CircleDot size={11} />}
                              {copy.outcomes[check.outcome]}
                            </span>
                            <EvidenceBadge type={check.evidenceType} label={copy.evidence[check.evidenceType].label} description={copy.evidence[check.evidenceType].description} />
                          </div>
                          <h3 className="mt-2 text-sm font-bold">{rule.title}</h3>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{rule[check.outcome]}</p>
                          {check.outcome !== "pass" && check.outcome !== "notMeasured" && (
                            <p className="mt-2 text-xs font-medium leading-5 text-foreground">{rule.recommendation}</p>
                          )}
                          {check.pageUrl && (
                            report.sample ? (
                              <p className="mt-2 truncate text-[10px] text-muted-foreground">{check.pageUrl}</p>
                            ) : (
                              <a href={check.pageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[10px] text-muted-foreground hover:text-primary">
                                <span className="truncate">{check.pageUrl}</span> <ExternalLink size={9} className="shrink-0" />
                              </a>
                            )
                          )}
                        </div>
                        <div className="text-left sm:min-w-20 sm:text-right">
                          {check.outcome === "notMeasured" ? (
                            <span className="text-[10px] font-medium text-muted-foreground">{copy.results.notMeasured}</span>
                          ) : (
                            <span className="text-xs font-semibold tabular-nums">{Math.round(check.earnedPoints)} / {check.maxPoints}</span>
                          )}
                          {check.evidenceValue !== null && check.evidenceValue !== undefined && (
                            <p className="mt-1 max-w-40 truncate text-[10px] text-muted-foreground sm:ml-auto" title={String(check.evidenceValue)}>{String(check.evidenceValue)}</p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default function AuditResults({ language, report, onRunAnother }: AuditResultsProps) {
  const copy = auditCopyFor(language);
  const date = useMemo(() => new Intl.DateTimeFormat(language === "es" ? "es-MX" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  }).format(new Date(report.createdAt)), [language, report.createdAt]);
  const detected = report.detectedLanguage === "en" ? copy.results.englishPage : report.detectedLanguage === "es" ? copy.results.spanishPage : copy.results.unknownPage;
  const hasPriorityIssue = Boolean(report.priorityPlan.fixNow || report.priorityPlan.planNext);

  useEffect(() => {
    recordAuditEvent(report.auditId, report.accessToken, "results_viewed", { language });
  }, [language, report.accessToken, report.auditId]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {report.sample && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
          <Eye size={17} className="mt-0.5 shrink-0 text-blue-700" />
          <p className="text-xs leading-5"><strong>{copy.results.sampleBanner}.</strong> {copy.results.sampleBannerBody}</p>
        </div>
      )}

      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">{copy.results.eyebrow}</p>
          <h1 className="mt-2 break-words text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{copy.results.reportFor} <span className="text-muted-foreground">{report.domain}</span></h1>
        </div>
        <Button variant="outline" size="sm" onClick={onRunAnother} className="gap-2 self-start sm:self-auto">
          <Globe2 size={14} /> {copy.results.runAnother}
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_14px_40px_rgba(35,31,32,.07)]">
        <div className="grid lg:grid-cols-[1.08fr_.92fr]">
          <div className="border-b border-black/10 p-5 sm:p-7 lg:border-b-0 lg:border-r lg:p-8">
            <PagePreview report={report} language={language} />
          </div>
          <div className="flex flex-col items-center justify-center p-6 text-center sm:p-8 lg:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{copy.results.opportunityScore}</p>
            <div className="mt-5"><ScoreRing score={report.overallScore} label={copy.results.opportunityScore} /></div>
            <span className="mt-5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{copy.bands[report.band].label}</span>
            <p className="mt-3 max-w-md text-sm font-medium leading-6">{copy.results.diagnosis[report.band]}</p>
            <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">{copy.bands[report.band].meaning}</p>
          </div>
        </div>
        <div className="grid gap-px border-t border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-[#fbfaf8] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-muted-foreground">{copy.results.auditedOn}</p>
            <p className="mt-1 text-xs font-semibold">{date}</p>
          </div>
          <div className="bg-[#fbfaf8] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-muted-foreground">{copy.results.pageLanguage}</p>
            <p className="mt-1 text-xs font-semibold">{detected}</p>
          </div>
          <div className="bg-[#fbfaf8] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-muted-foreground">{copy.results.analyzed}</p>
            <p className="mt-1 text-xs font-semibold">{copy.results.pagesAnalyzed(report.pages.length)}</p>
          </div>
          <div className="bg-[#fbfaf8] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-muted-foreground">{copy.results.coverage}</p>
            <p className="mt-1 text-xs font-semibold tabular-nums">{report.coverage}% {copy.results.coverageShort}</p>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-[-0.025em]">{copy.results.dimensionHeading}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.results.dimensionBody}</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-6">
          {DIMENSIONS.map((dimension, index) => <DimensionCard key={dimension} dimension={dimension} report={report} language={language} index={index} />)}
        </div>
      </section>

      <section className="mt-14">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">{copy.results.priorityEyebrow}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.025em] sm:text-3xl">{hasPriorityIssue ? copy.results.priorityHeading : copy.results.priorityHeadingClear}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{hasPriorityIssue ? copy.results.priorityBody : copy.results.priorityBodyClear}</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {report.priorityPlan.fixNow && <PriorityCard check={report.priorityPlan.fixNow} title={copy.results.fixNow} hint={copy.results.fixNowHint} kind="fix" language={language} />}
          {report.priorityPlan.planNext && <PriorityCard check={report.priorityPlan.planNext} title={copy.results.planNext} hint={copy.results.planNextHint} kind="plan" language={language} />}
          {report.priorityPlan.protect && <PriorityCard check={report.priorityPlan.protect} title={copy.results.protect} hint={copy.results.protectHint} kind="protect" language={language} />}
        </div>
      </section>

      <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_.72fr]">
        <Findings report={report} language={language} />
        <aside className="space-y-5">
          <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2"><Gauge size={17} className="text-primary" /><h2 className="text-sm font-bold">{copy.results.pageScope}</h2></div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.results.coverageBody}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-primary" style={{ width: `${report.coverage}%` }} /></div>
            <p className="mt-2 text-right text-xs font-bold tabular-nums">{report.coverage}%</p>
            {!report.lab.measured && (
              report.labPending ? (
                // Still running in the background. Saying "unavailable" here would
                // be wrong: nothing has failed yet.
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-[11px] leading-5 text-sky-900">
                  <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
                  <span aria-live="polite">{copy.results.labPending}</span>
                </p>
              ) : (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">{copy.results.labUnavailable}</p>
              )
            )}
            {report.warnings.some((warning) => !warning.startsWith("pagespeed_")) && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">{copy.results.pageScopeIncomplete}</p>
            )}
            <ul className="mt-5 space-y-3">
              {report.pages.map((page) => (
                <li key={page.finalUrl} className="flex items-start gap-2.5 text-xs">
                  {page.status >= 200 && page.status < 400 ? (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check size={11} aria-hidden="true" /></span>
                  ) : (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><AlertCircle size={11} aria-hidden="true" /></span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{page.title || new URL(page.finalUrl).pathname}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{page.finalUrl}</span>
                    <span className={cn("mt-0.5 block text-[10px] font-semibold", page.status >= 200 && page.status < 400 ? "text-emerald-700" : "text-primary")}>HTTP {page.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950 sm:p-6">
            <div className="flex items-start gap-3"><Bot size={19} className="mt-0.5 shrink-0 text-blue-700" /><p className="text-xs leading-5">{copy.results.aiDisclaimer}</p></div>
          </section>
        </aside>
      </div>

      <div className="mt-12">
        {report.sample ? (
          <section className="relative overflow-hidden rounded-2xl bg-lv-charcoal p-6 text-white shadow-[0_18px_50px_rgba(35,31,32,.16)] sm:p-9">
            <div className="audit-grid absolute inset-0 opacity-[0.08]" aria-hidden="true" />
            <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold tracking-[-0.025em]">{copy.results.sampleCtaHeading}</h2>
                <p className="mt-3 text-sm leading-6 text-white/70">{copy.results.sampleCtaBody}</p>
              </div>
              <Button size="lg" onClick={onRunAnother} className="gap-2 lg:min-w-52">{copy.results.sampleCtaAction} <ArrowRight size={16} /></Button>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            {/* Offered after the report, never before it: the low-commitment ask
                comes first, the service conversation second. */}
            <AuditReportEmail language={language} report={report} />
            <AuditLeadCta language={language} report={report} />
          </div>
        )}
      </div>
    </div>
  );
}
