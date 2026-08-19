import { enAuditCopy } from "./en.ts";
import { esAuditCopy } from "./es.ts";
import type { AuditLanguage } from "../types.ts";
import type { AuditCopy } from "./types.ts";

const CATALOGS: Record<AuditLanguage, AuditCopy> = {
  en: enAuditCopy,
  es: esAuditCopy,
};

export const auditCopyFor = (language: AuditLanguage): AuditCopy => CATALOGS[language];
export type { AuditCopy } from "./types.ts";
