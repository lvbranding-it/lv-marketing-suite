import type { AuditLanguage, AuditPhase, OpportunityRoute } from "./types";

const BASE: Record<AuditLanguage, string> = {
  en: "/en/tools/website-opportunity-audit",
  es: "/es/tools/auditoria-de-oportunidades-web",
};

export function auditRoute(language: AuditLanguage, phase: AuditPhase = "landing", auditId?: string): string {
  const base = BASE[language];
  if (phase === "landing") return base;
  if (phase === "context") return `${base}/${language === "es" ? "contexto" : "context"}`;
  if (phase === "analyzing") return `${base}/${language === "es" ? "analizando" : "analyzing"}`;
  return `${base}/${language === "es" ? "resultados" : "results"}/${auditId ?? ""}`.replace(/\/$/, "");
}

export const canonicalAuditLanding = (language: AuditLanguage): string =>
  `https://marketing.lvbranding.com${auditRoute(language)}`;

export function serviceRoute(language: AuditLanguage, route: OpportunityRoute): string {
  const prefix = language === "es" ? "/es" : "";
  if (route === "platform") return `${prefix}/industry-web-solutions-web-app-development`;
  return `${prefix}/ux-ui-web-design-user-experiences-web-development`;
}
