import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AuditAnalyzing from "@/components/website-audit/AuditAnalyzing";
import AuditContext from "@/components/website-audit/AuditContext";
import AuditLanding from "@/components/website-audit/AuditLanding";
import AuditResults from "@/components/website-audit/AuditResults";
import AuditShell from "@/components/website-audit/AuditShell";
import { asAuditApiError, AuditApiError, loadRemoteAudit, runLiveAudit } from "@/lib/website-audit/api";
import { auditCopyFor } from "@/lib/website-audit/copy";
import { scoreAudit } from "@/lib/website-audit/engine";
import {
  clearAuditDraft,
  loadAuditDraft,
  loadAuditObservation,
  saveAuditDraft,
  saveAuditObservation,
} from "@/lib/website-audit/persist";
import { auditRoute } from "@/lib/website-audit/routes";
import { SAMPLE_ANSWERS, SAMPLE_OBSERVATION } from "@/lib/website-audit/sample";
import { emptyAuditAnswers, type AuditAnswers, type AuditLanguage, type AuditObservation, type AuditPhase } from "@/lib/website-audit/types";
import { normalizePublicUrl } from "@/lib/website-audit/validate";

interface WebsiteOpportunityAuditProps {
  language?: AuditLanguage;
  phase?: AuditPhase;
}

const inFlight = new Map<string, Promise<AuditObservation>>();

function startOnce(url: string, answers: AuditAnswers, language: AuditLanguage): Promise<AuditObservation> {
  const key = `${url}|${JSON.stringify(answers)}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = runLiveAudit(url, answers, language).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

function isComplete(answers: AuditAnswers): boolean {
  return Boolean(
    answers.businessType && answers.audience.trim() && answers.purpose && answers.conversionAction &&
    answers.differentiation && answers.expectedResults && answers.lastReviewed,
  );
}

type UrlErrorCode = "required" | "invalid" | "publicOnly";

function accessTokenFromHash(): string {
  if (typeof window === "undefined") return "";
  try {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("access_token") ?? "";
    return /^[A-Za-z0-9-]{32,160}$/.test(token) ? token : "";
  } catch { return ""; }
}

function resultRoute(language: AuditLanguage, auditId: string, accessToken?: string): string {
  const route = auditRoute(language, "results", auditId);
  return accessToken ? `${route}#access_token=${encodeURIComponent(accessToken)}` : route;
}

function localizedAuditError(error: AuditApiError | null, language: AuditLanguage): string {
  if (!error) return "";
  const messages = auditCopyFor(language).errors;
  if (error.code === "rate_limited") return messages.rateLimited;
  if (["dns_failed", "fetch_failed"].includes(error.code)) return messages.siteUnreachable;
  if (["dns_timeout", "fetch_timeout", "audit_timeout", "request_timeout"].includes(error.code)) return messages.siteTimeout;
  if (error.code === "content_unsupported") return messages.unsupportedContent;
  if (error.code === "response_unhealthy") return messages.unhealthyResponse;
  if (error.code === "response_too_large") return messages.responseTooLarge;
  if (["redirect_invalid", "redirect_limit"].includes(error.code)) return messages.redirectFailed;
  if (error.code === "url_private") return messages.urlPublicOnly;
  if (["url_required", "url_invalid"].includes(error.code)) return messages.urlInvalid;
  return messages.auditUnavailable;
}

export default function WebsiteOpportunityAudit({ language = "en", phase = "landing" }: WebsiteOpportunityAuditProps) {
  const copy = auditCopyFor(language);
  const navigate = useNavigate();
  const { auditId } = useParams<{ auditId: string }>();
  const restored = useRef(loadAuditDraft());
  const [url, setUrl] = useState(restored.current.url);
  const [answers, setAnswers] = useState<AuditAnswers>(restored.current.answers ?? emptyAuditAnswers());
  const [urlError, setUrlError] = useState<UrlErrorCode | null>(null);
  const [contextError, setContextError] = useState(false);
  const [auditError, setAuditError] = useState<AuditApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const [remoteAttempt, setRemoteAttempt] = useState(0);
  const [remoteError, setRemoteError] = useState<AuditApiError | null>(null);
  const resultStateRef = useRef<HTMLDivElement>(null);
  const initialObservation = useRef<AuditObservation | null>((() => {
    if (phase !== "results" || !auditId || auditId === SAMPLE_OBSERVATION.auditId) return restored.current.observation ?? null;
    return loadAuditObservation(auditId) ?? restored.current.observation ?? null;
  })());
  const [observation, setObservation] = useState<AuditObservation | null>(initialObservation.current);
  const [remoteLoading, setRemoteLoading] = useState(
    phase === "results" && Boolean(auditId) && auditId !== SAMPLE_OBSERVATION.auditId &&
      initialObservation.current?.auditId !== auditId && Boolean(accessTokenFromHash()),
  );

  useEffect(() => {
    if (phase === "context" && !url) navigate(auditRoute(language), { replace: true });
  }, [language, navigate, phase, url]);

  useEffect(() => {
    saveAuditDraft({ phase, url, answers, auditId, observation: observation ?? undefined });
  }, [answers, auditId, observation, phase, url]);

  useEffect(() => {
    if (phase !== "results" || !auditId || auditId === SAMPLE_OBSERVATION.auditId) {
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    if (observation?.auditId === auditId) {
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    const local = loadAuditObservation(auditId);
    if (local) {
      setObservation(local);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    const accessToken = accessTokenFromHash();
    if (!accessToken) {
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    let active = true;
    setRemoteLoading(true);
    setRemoteError(null);
    void loadRemoteAudit(auditId, accessToken)
      .then((result) => {
        if (!active) return;
        const resultAnswers = result.answers ?? emptyAuditAnswers();
        setObservation(result);
        setUrl(result.requestedUrl);
        setAnswers(resultAnswers);
        saveAuditObservation(result);
        saveAuditDraft({ phase: "results", url: result.requestedUrl, answers: resultAnswers, auditId, observation: result });
      })
      .catch((error: unknown) => { if (active) setRemoteError(asAuditApiError(error)); })
      .finally(() => { if (active) setRemoteLoading(false); });
    return () => { active = false; };
  }, [auditId, observation?.auditId, phase, remoteAttempt]);

  /**
   * Fills in the lab measurement after the report is already on screen.
   *
   * The audit returns without waiting for PageSpeed, which takes 25 to 40
   * seconds on a real site, so the report arrives in about half the time and
   * the technical scores follow. Polling stops as soon as the server settles
   * `labPending`, whether the measurement succeeded or not, and gives up after
   * the background budget has elapsed so a dead worker cannot poll forever.
   */
  useEffect(() => {
    if (phase !== "results" || !observation?.labPending) return;
    const token = observation.accessToken;
    const id = observation.auditId;
    if (!token || id === SAMPLE_OBSERVATION.auditId) return;

    let active = true;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;          // 40 x 3s covers the 110s background budget
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        window.clearInterval(timer);
        return;
      }
      void loadRemoteAudit(id, token)
        .then((result) => {
          if (!active || result.labPending) return;
          window.clearInterval(timer);
          setObservation(result);
          saveAuditObservation(result);
        })
        // A failed poll is not worth surfacing: the report on screen is already
        // complete, and the next tick will try again.
        .catch(() => undefined);
    }, 3000);

    return () => { active = false; window.clearInterval(timer); };
  }, [observation?.labPending, observation?.auditId, observation?.accessToken, phase]);

  useEffect(() => {
    if (phase !== "analyzing") return;
    if (!url || !isComplete(answers)) {
      navigate(auditRoute(language), { replace: true });
      return;
    }
    let active = true;
    setAuditError(null);
    startOnce(url, answers, language)
      .then((result) => {
        if (!active) return;
        setObservation(result);
        saveAuditObservation(result);
        saveAuditDraft({ phase: "results", url, answers, auditId: result.auditId, observation: result });
        navigate(resultRoute(language, result.auditId, result.accessToken), { replace: true });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Website audit failed", error);
        setAuditError(asAuditApiError(error));
      });
    return () => { active = false; };
  }, [answers, language, navigate, phase, retry, url]);

  const startOver = () => {
    clearAuditDraft();
    setUrl("");
    setAnswers(emptyAuditAnswers());
    setObservation(null);
    setUrlError(null);
    setContextError(false);
    setAuditError(null);
    setRemoteError(null);
    navigate(auditRoute(language));
    window.scrollTo({ top: 0 });
  };

  const submitUrl = () => {
    const normalized = normalizePublicUrl(url);
    if (!normalized.ok) {
      setUrlError(normalized.reason);
      return;
    }
    setUrl(normalized.url);
    setUrlError(null);
    saveAuditDraft({ phase: "context", url: normalized.url, answers });
    navigate(auditRoute(language, "context"));
    window.scrollTo({ top: 0 });
  };

  const submitContext = () => {
    if (!isComplete(answers)) {
      setContextError(true);
      return;
    }
    setContextError(false);
    saveAuditDraft({ phase: "analyzing", url, answers });
    navigate(auditRoute(language, "analyzing"));
    window.scrollTo({ top: 0 });
  };

  const showSample = () => {
    navigate(auditRoute(language, "results", SAMPLE_OBSERVATION.auditId));
    window.scrollTo({ top: 0 });
  };

  const reportObservation = auditId === SAMPLE_OBSERVATION.auditId ? SAMPLE_OBSERVATION : observation?.auditId === auditId ? observation : null;
  const reportAnswers = auditId === SAMPLE_OBSERVATION.auditId
    ? SAMPLE_ANSWERS
    : (reportObservation?.answers as AuditAnswers | undefined) ?? answers;
  const report = useMemo(
    () => reportObservation ? scoreAudit(reportObservation, reportAnswers) : null,
    [reportAnswers, reportObservation],
  );
  useEffect(() => {
    if (phase !== "results" || remoteLoading || (!report && !remoteError)) return;
    const frame = window.requestAnimationFrame(() => resultStateRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [phase, remoteError, remoteLoading, report]);
  const urlErrorMessage = urlError === "required"
    ? copy.errors.urlRequired
    : urlError === "publicOnly"
      ? copy.errors.urlPublicOnly
      : urlError === "invalid"
        ? copy.errors.urlInvalid
        : "";

  return (
    <AuditShell language={language} phase={phase} auditId={auditId} onStartOver={phase === "landing" ? undefined : startOver}>
      {phase === "landing" && (
        <AuditLanding
          language={language}
          url={url}
          error={urlErrorMessage}
          onUrlChange={(value) => { setUrl(value); setUrlError(null); }}
          onSubmit={submitUrl}
          onSample={showSample}
        />
      )}

      {phase === "context" && (
        <AuditContext
          language={language}
          url={url}
          answers={answers}
          error={contextError ? copy.errors.contextRequired : ""}
          onChange={(next) => { setAnswers(next); setContextError(false); }}
          onBack={() => navigate(auditRoute(language))}
          onSubmit={submitContext}
        />
      )}

      {phase === "analyzing" && (
        <AuditAnalyzing
          language={language}
          url={url}
          error={localizedAuditError(auditError, language)}
          onRetry={() => setRetry((value) => value + 1)}
          onSample={showSample}
        />
      )}

      {phase === "results" && report && (
        <div ref={resultStateRef} tabIndex={-1} className="outline-none">
          <AuditResults language={language} report={report} onRunAnother={startOver} />
        </div>
      )}

      {phase === "results" && !report && remoteLoading && (
        <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center px-4 py-12 text-center" role="status" aria-live="polite">
          <section className="w-full rounded-2xl border border-black/10 bg-white p-7 shadow-sm sm:p-10">
            <Loader2 className="mx-auto animate-spin text-primary" size={28} aria-hidden="true" />
            <h1 className="mt-5 text-xl font-bold">{copy.analyzing.heading}</h1>
          </section>
        </div>
      )}

      {phase === "results" && !report && !remoteLoading && (
        <div ref={resultStateRef} tabIndex={-1} className="mx-auto flex min-h-[65vh] max-w-2xl items-center px-4 py-12 text-center outline-none">
          <section role="alert" className="w-full rounded-2xl border border-black/10 bg-white p-7 shadow-sm sm:p-10">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><AlertTriangle size={22} /></span>
            <h1 className="mt-5 text-xl font-bold">
              {remoteError
                ? remoteError.code === "report_version_unsupported"
                  ? copy.errors.resultVersionUnsupported
                  : remoteError.status === 404 ? copy.errors.resultExpired : copy.errors.resultUnavailable
                : copy.errors.resultMissing}
            </h1>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              {remoteError && (
                <Button onClick={() => setRemoteAttempt((value) => value + 1)}>{copy.errors.retryResult}</Button>
              )}
              <Button variant={remoteError ? "outline" : "default"} onClick={startOver} className="gap-2">{copy.results.runAnother} <ArrowRight size={15} /></Button>
            </div>
          </section>
        </div>
      )}
    </AuditShell>
  );
}
