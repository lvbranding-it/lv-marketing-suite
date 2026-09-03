import { useEffect, useRef, type ReactNode } from "react";
import { Globe2, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LVLogo from "@/components/LVLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auditCopyFor } from "@/lib/website-audit/copy";
import { auditRoute, canonicalAuditLanding } from "@/lib/website-audit/routes";
import type { AuditLanguage, AuditPhase } from "@/lib/website-audit/types";

function useAuditMetadata(language: AuditLanguage, phase: AuditPhase) {
  const copy = auditCopyFor(language);
  useEffect(() => {
    const oldTitle = document.title;
    const oldLang = document.documentElement.lang;
    document.title = copy.meta.title;
    document.documentElement.lang = language;

    const ensureMeta = (name: string) => {
      let node = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      const created = !node;
      if (!node) {
        node = document.createElement("meta");
        node.name = name;
        document.head.appendChild(node);
      }
      return { node, created, previous: node.content };
    };
    const description = ensureMeta("description");
    description.node.content = copy.meta.description;
    const robots = ensureMeta("robots");
    robots.node.content = phase === "landing" ? "index,follow" : "noindex,nofollow";

    document.querySelectorAll("link[data-lv-audit-meta]").forEach((node) => node.remove());
    const links = [
      { rel: "canonical", href: canonicalAuditLanding(language) },
      { rel: "alternate", href: canonicalAuditLanding("en"), hreflang: "en" },
      { rel: "alternate", href: canonicalAuditLanding("es"), hreflang: "es" },
      { rel: "alternate", href: canonicalAuditLanding("en"), hreflang: "x-default" },
    ];
    links.forEach((data) => {
      const link = document.createElement("link");
      link.rel = data.rel;
      link.href = data.href;
      if ("hreflang" in data && data.hreflang) link.hreflang = data.hreflang;
      link.dataset.lvAuditMeta = "true";
      document.head.appendChild(link);
    });

    return () => {
      document.title = oldTitle;
      document.documentElement.lang = oldLang;
      if (description.created) description.node.remove(); else description.node.content = description.previous;
      if (robots.created) robots.node.remove(); else robots.node.content = robots.previous;
      document.querySelectorAll("link[data-lv-audit-meta]").forEach((node) => node.remove());
    };
  }, [copy.meta.description, copy.meta.title, language, phase]);
}

interface AuditShellProps {
  language: AuditLanguage;
  phase: AuditPhase;
  auditId?: string;
  onStartOver?: () => void;
  children: ReactNode;
  mainClassName?: string;
}

export default function AuditShell({
  language,
  phase,
  auditId,
  onStartOver,
  children,
  mainClassName,
}: AuditShellProps) {
  useAuditMetadata(language, phase);
  const copy = auditCopyFor(language);
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try { localStorage.setItem("lv-website-opportunity-audit:language", language); } catch { /* no-op */ }
  }, [language]);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
        .flatMap((key) => params.get(key) ? [[key, params.get(key)!.slice(0, 160)]] : []));
      if (Object.keys(utm).length) sessionStorage.setItem("lv-website-opportunity-audit:utm", JSON.stringify(utm));
    } catch { /* storage and malformed campaign data must never block an audit */ }
  }, []);
  useEffect(() => {
    if (phase === "landing") return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === document.documentElement) {
        mainRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [auditId, phase]);
  const switchLanguage = (next: AuditLanguage) => {
    if (next === language) return;
    try { localStorage.setItem("lv-website-opportunity-audit:language", next); } catch { /* no-op */ }
    const search = phase === "landing" ? window.location.search : "";
    const hash = phase === "results" ? window.location.hash : "";
    navigate(`${auditRoute(next, phase, auditId)}${search}${hash}`);
  };

  return (
    <div className="min-h-screen bg-[#f6f5f3] text-foreground flex flex-col">
      <header className="relative z-30 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[68px] w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(auditRoute(language))}
            className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={copy.meta.productName}
          >
            <LVLogo size={38} className="shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="hidden text-sm font-bold tracking-[-0.01em] text-lv-charcoal sm:block">{copy.meta.productName}</span>
              <span className="hidden text-sm font-bold text-lv-charcoal min-[400px]:block sm:hidden">{copy.meta.shortName}</span>
              <span className="block text-xs font-bold text-lv-charcoal min-[400px]:hidden">{copy.meta.mobileName}</span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {onStartOver && phase !== "landing" && (
              <Button variant="ghost" size="sm" onClick={onStartOver} className="hidden h-9 gap-1.5 text-xs sm:inline-flex">
                <RotateCcw size={13} aria-hidden="true" /> {copy.common.startOver}
              </Button>
            )}
            <div className="flex items-center rounded-full border border-border bg-[#f7f7f6] p-1" aria-label={copy.common.language}>
              <Globe2 size={14} className="ml-1.5 mr-1 text-muted-foreground" aria-hidden="true" />
              {(["en", "es"] as AuditLanguage[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => switchLanguage(code)}
                  aria-pressed={language === code}
                  className={cn(
                    "min-h-7 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    language === code ? "bg-lv-charcoal text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {code === "en" ? "EN" : "ES"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main ref={mainRef} tabIndex={-1} className={cn("flex-1 outline-none", mainClassName)}>{children}</main>

      <footer className="border-t border-black/10 bg-white px-4 py-5 text-center">
        <p className="text-xs text-muted-foreground">
          {copy.footer} <span className="mx-1 text-primary">•</span>{" "}
          <a href="https://www.lvbranding.com" target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:text-primary">
            lvbranding.com
          </a>
        </p>
      </footer>
    </div>
  );
}
