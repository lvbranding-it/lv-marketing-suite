import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { auditCopyFor } from "../_shared/website-audit/copy/index.ts";
import { scoreAudit } from "../_shared/website-audit/engine.ts";
import {
  AUDIT_VERSION,
  emptyAuditAnswers,
  type AuditAnswers,
  type AuditCheck,
  type AuditLanguage,
  type OpportunityRoute,
} from "../_shared/website-audit/types.ts";
import { isBlockedIpv4, isBlockedIpv6, parseIpv4 } from "../_shared/website-audit/network.ts";
import { matchesSiteSignal } from "../_shared/website-audit/heuristics.ts";
import { meaningfulSchemaTypes } from "../_shared/website-audit/schema.ts";
import {
  decodeHtmlBytes,
  decodeHtmlEntities,
  createHtmlExtractionBudget,
  htmlHasAncestor,
  htmlInner,
  htmlNodes,
  htmlOpeningTag,
  interactiveHtml,
  machineReadableHtml,
  observableHtml,
  parseHtmlDocument,
  stripHtmlTags,
  supportsMobileViewport,
  type HtmlElementNode,
  type ParsedHtmlDocument,
} from "../_shared/website-audit/html.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PAGESPEED_API_KEY = Deno.env.get("PAGESPEED_API_KEY") ?? "";
/**
 * Credential for the scheduled outbox drain, held by this function and by the
 * cron job in Vault.
 *
 * The drain originally authenticated with the service role key, which broke in
 * production: Supabase injects `SUPABASE_SERVICE_ROLE_KEY` itself and can issue
 * a different value than the one an operator copied into Vault, so the cron got
 * a 403 every minute while every other code path kept working. A secret owned
 * by this feature has no such second source of truth.
 */
const DRAIN_SECRET = Deno.env.get("AUDIT_DRAIN_SECRET") ?? "";

const RULESET_VERSION = AUDIT_VERSION;
const MAX_REDIRECTS = 4;
/**
 * Response size ceilings, split by how many run at once.
 *
 * 1.5 MB rejected a large share of real sites: site-builder homepages inline
 * their content and routinely ship 3 MB or more of HTML, so the audit failed on
 * exactly the sites most likely to need it.
 *
 * The submitted page is fetched alone, so it gets the generous ceiling. The
 * representative pages are fetched four at a time, and each in-flight body is
 * held twice while its chunks are joined, so peak memory tracks roughly
 * `MAX_RESPONSE_BYTES + 8 x MAX_LINKED_RESPONSE_BYTES`. Keeping the linked
 * ceiling lower is what stops a wide crawl from exhausting the worker.
 */
const MAX_RESPONSE_BYTES = 8_000_000;
const MAX_LINKED_RESPONSE_BYTES = 2_500_000;
const MAX_REQUEST_BYTES = 50_000;
const FETCH_TIMEOUT_MS = 9_000;
const DNS_TIMEOUT_MS = 2_500;
const PAGESPEED_TIMEOUT_MS = 35_000;
/**
 * Ceiling for the background lab measurement. No visitor is blocked on it, so
 * it can outlast the request that started it and cover the slow tail that a
 * foreground budget has to give up on.
 */
const PAGESPEED_BACKGROUND_MS = 110_000;
const AUDIT_TIMEOUT_MS = 50_000;
const MAX_PAGES = 5;
const CRAWLER_VERSION = "lv-website-crawler-v3";

/**
 * "Email me my report" delivery.
 *
 * This is the only mail this function sends itself. Leads still travel through
 * the durable outbox to `submit-av-lead`, because a lost lead costs money and a
 * lost copy of a report costs one retry by someone who is still looking at the
 * report on screen.
 *
 * `SENDGRID_API_KEY` is a project-level Edge secret, already provisioned for
 * `submit-av-lead`; no new secret is needed. If it is ever missing the send
 * fails loudly rather than reporting a success that never left the building.
 */
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const REPORT_FROM_EMAIL = "admin@lvbranding.com";
const REPORT_FROM_NAME = "LV Branding";
const PUBLIC_SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://marketing.lvbranding.com").replace(/\/+$/, "");
const LV_LOGO_URL = `${PUBLIC_SITE_URL}/lv-logo.png`;
const BRAND_RED = "#CB2039";
const CRM_ORG_ID = Deno.env.get("AV_LEAD_ORG_ID") ?? "0122121e-5dec-446e-92b3-4e85b145910a";
/**
 * How many distinct addresses one audit may be used to mail. Holding the access
 * token proves you ran the audit, but not that the address you typed is yours,
 * so this ceiling is what stops the endpoint from becoming a way to send
 * LV Branding-branded mail to strangers.
 */
const MAX_REPORT_SENDS_PER_AUDIT = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

type InterfaceLanguage = "en" | "es";
type DetectedLanguage = InterfaceLanguage | "unknown";
type PageType = "submitted" | "home" | "service" | "about" | "contact" | "resource" | "other";

interface PageSignals {
  url: string;
  finalUrl: string;
  pageType: PageType;
  status: number;
  contentType: string;
  title: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  canonical: string | null;
  robots: string | null;
  htmlLang: string | null;
  hasViewport: boolean;
  h1Count: number;
  h1Text: string;
  headings: { level: number; text: string }[];
  headingSkips: number;
  wordCount: number;
  sectionCount: number;
  linkCount: number;
  internalLinkCount: number;
  unclearLinkCount: number;
  brokenAnchorCount: number;
  imageCount: number;
  imagesWithAlt: number;
  controlCount: number;
  namedControlCount: number;
  formCount: number;
  jsonLdCount: number;
  jsonLdValidCount: number;
  schemaTypes: string[];
  hasOrganizationSchema: boolean;
  hasServiceSchema: boolean;
  hasAuthorSignal: boolean;
  hasAddressSignal: boolean;
  hasContactSignal: boolean;
  hasCtaSignal: boolean;
  ctaLabels: string[];
  actionableCtaLabels: string[];
  ctaTargets: { label: string; destination: string; kind: "link" | "form" }[];
  hasTrustSignal: boolean;
  hasServiceLanguage: boolean;
  hasEntityLanguage: boolean;
  hasAudienceLanguage: boolean;
  directAnswerCount: number;
  visibleContentLength: number;
}

interface LabSignals {
  measured: boolean;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  screenshotDataUrl?: string | null;
  source: "pagespeed" | "none";
}

interface Observation {
  auditId: string;
  accessToken?: string;
  requestedUrl: string;
  finalUrl: string;
  normalizedDomain: string;
  createdAt: string;
  detectedLanguage: DetectedLanguage;
  pages: PageSignals[];
  lab: LabSignals;
  /**
   * True while the lab measurement is still running in the background.
   *
   * NOTE: this interface duplicates `AuditObservation` in the shared types and
   * has to be kept in step with it by hand.
   */
  labPending?: boolean;
  warnings: string[];
  discoveredPageCount?: number;
  failedPageCount?: number;
  cached?: boolean;
  sample?: boolean;
  answers?: AuditAnswers;
  provenance?: {
    source: "live-crawl";
    crawlerVersion: string;
    rulesetVersion: string;
  };
}

class AuditError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

async function readRequestJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES) throw new AuditError("request_too_large", "Request too large.", 413);
  if (!req.body) throw new AuditError("invalid_json", "Invalid JSON.", 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new AuditError("request_too_large", "Request too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
  return parsed as Record<string, unknown>;
}

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const recentRequests = new Map<string, number[]>();
let lastRetentionSweep = 0;

function enforceWorkerRateLimit(key: string, limit: number): void {
  const now = Date.now();
  const windowStart = now - 10 * 60_000;
  if (recentRequests.size > 5_000) {
    for (const [candidate, times] of recentRequests) {
      if (times.every((time) => time < windowStart)) recentRequests.delete(candidate);
      if (recentRequests.size <= 4_000) break;
    }
    // The durable limiter remains authoritative if a burst filled the map with
    // active, attacker-controlled keys.
    while (recentRequests.size > 5_000) recentRequests.delete(recentRequests.keys().next().value as string);
  }
  const prior = (recentRequests.get(key) ?? []).filter((time) => time >= windowStart);
  if (prior.length >= limit) throw new AuditError("rate_limited", "Too many recent audits for this destination. Try again later.", 429);
  prior.push(now);
  recentRequests.set(key, prior);
}

async function sweepExpiredAudits(): Promise<void> {
  if (!admin || Date.now() - lastRetentionSweep < 60 * 60_000) return;
  lastRetentionSweep = Date.now();
  const { error } = await admin.from("website_audits").delete().lt("expires_at", new Date().toISOString());
  if (error) console.error("website audit retention sweep failed", error.message);
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function normalizeSubmittedUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) throw new AuditError("url_required", "A website URL is required.");
  const value = raw.trim().slice(0, 2048);
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(candidate); } catch { throw new AuditError("url_invalid", "Enter a valid public website URL."); }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) {
    throw new AuditError("url_invalid", "Only public http and https websites are supported.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new AuditError("url_private", "Only standard public website ports are supported.");
  }
  url.hash = "";
  return url;
}

async function assertPublicDestination(url: URL, deadline: number): Promise<void> {
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new AuditError("url_invalid", "Unsupported destination.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new AuditError("url_private", "Unsupported destination port.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || /(^|\.)(localhost|local|internal|home|lan)$/.test(hostname)) {
    throw new AuditError("url_private", "Private destinations are not supported.");
  }
  if (parseIpv4(hostname)) {
    if (isBlockedIpv4(hostname)) throw new AuditError("url_private", "Private or reserved destinations are not supported.");
    return;
  }
  if (hostname.includes(":")) {
    if (isBlockedIpv6(hostname)) throw new AuditError("url_private", "Private or reserved destinations are not supported.");
    return;
  }

  let timeout: number | undefined;
  let a: string[] = [];
  let aaaa: string[] = [];
  try {
    const lookup = Promise.all([
      Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
    ]);
    const timeoutMs = remainingBudget(deadline, DNS_TIMEOUT_MS);
    [a, aaaa] = await Promise.race([
      lookup,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AuditError("dns_timeout", "The website address took too long to resolve.", 422)), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof AuditError) throw error;
    throw new AuditError("dns_failed", "The website address could not be resolved.", 422);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  if (a.length + aaaa.length === 0) throw new AuditError("dns_failed", "The website address could not be resolved.", 422);
  if (a.some(isBlockedIpv4) || aaaa.some(isBlockedIpv6)) {
    throw new AuditError("url_private", "Private or reserved destinations are not supported.");
  }
}

interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  robotsHeader: string | null;
  html: string;
}

/**
 * Retrieval is restricted to the two document kinds this service understands.
 * Sitemaps go through the same redirect and SSRF gate as pages; only the
 * accepted content type differs, so there is one vetted fetch path rather than
 * a second one that could drift out of step with it.
 */
type ContentKind = "html" | "xml";

const ACCEPT_HEADER: Record<ContentKind, string> = {
  html: "text/html,application/xhtml+xml;q=0.9",
  xml: "application/xml,text/xml;q=0.9",
};

const CONTENT_TYPE_PATTERN: Record<ContentKind, RegExp> = {
  html: /text\/html|application\/xhtml\+xml/i,
  xml: /(?:text|application)\/xml|application\/[\w.+-]*\+xml/i,
};

async function cancelBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); } catch { /* the request is already being abandoned */ }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await cancelBody(response);
    throw new AuditError("response_too_large", "The page response is too large to audit.", 422);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AuditError("response_too_large", "The page response is too large to audit.", 422);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return decodeHtmlBytes(body, response.headers.get("content-type") || "");
}

function remainingBudget(deadline: number, maximum: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new AuditError("audit_timeout", "The audit reached its time limit.", 422);
  return Math.min(maximum, remaining);
}

async function fetchPublicHtml(
  input: URL,
  deadline: number,
  admitDestination: (url: URL) => Promise<void>,
  maxBytes: number = MAX_RESPONSE_BYTES,
  accepts: ContentKind = "html",
): Promise<FetchedPage> {
  let current = new URL(input.toString());
  const requestedUrl = current.toString();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    // Admission happens before DNS so rejected clients and destinations cannot
    // use this service as a resolver. Redirect targets pass through the same gate.
    await admitDestination(current);
    await assertPublicDestination(current, deadline);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingBudget(deadline, FETCH_TIMEOUT_MS));
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "LVWebsiteOpportunityAudit/1.0 (+https://www.lvbranding.com)",
          Accept: ACCEPT_HEADER[accepts],
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await cancelBody(response);
        if (!location) throw new AuditError("redirect_invalid", "The website returned an invalid redirect.", 422);
        if (redirect === MAX_REDIRECTS) throw new AuditError("redirect_limit", "The website redirected too many times.", 422);
        current = new URL(location, current);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!CONTENT_TYPE_PATTERN[accepts].test(contentType)) {
        await cancelBody(response);
        throw new AuditError("content_unsupported", "The destination did not return a public HTML page.", 422);
      }
      const html = await readLimitedBody(response, maxBytes);
      return {
        requestedUrl,
        finalUrl: current.toString(),
        status: response.status,
        contentType,
        robotsHeader: response.headers.get("x-robots-tag"),
        html,
      };
    } catch (error) {
      if (error instanceof AuditError) throw error;
      if ((error instanceof DOMException || error instanceof Error) && error.name === "AbortError") {
        throw new AuditError("fetch_timeout", "The website took too long to respond.", 422);
      }
      throw new AuditError("fetch_failed", "The website could not be reached.", 422);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new AuditError("redirect_limit", "The website redirected too many times.", 422);
}

const decodeEntities = decodeHtmlEntities;

function safeDecodeUriComponent(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function textOf(html: string): string {
  return decodeEntities(stripHtmlTags(html))
    .replace(/\s+/g, " ")
    .trim();
}

function textWithImageAlternatives(html: string): string {
  return decodeEntities(stripHtmlTags(html, true)).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "").trim() : null;
}

function hasAttr(tag: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\s${escaped}(?:\\s*=|\\s|\/?>)`, "i").test(tag);
}

function metaContent(document: ParsedHtmlDocument, name: string): string {
  for (const node of htmlNodes(document, "meta")) {
    const tag = htmlOpeningTag(document, node);
    const key = (attr(tag, "name") || attr(tag, "property") || "").toLowerCase();
    if (key === name.toLowerCase()) return attr(tag, "content") || "";
  }
  return "";
}

function metaContents(document: ParsedHtmlDocument, names: string[]): string[] {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  return htmlNodes(document, "meta").flatMap((node) => {
    const tag = htmlOpeningTag(document, node);
    const key = (attr(tag, "name") || attr(tag, "property") || "").toLowerCase();
    const content = attr(tag, "content") || "";
    return accepted.has(key) && content ? [content] : [];
  });
}

function canonicalUrl(document: ParsedHtmlDocument, baseUrl: string): string | null {
  const candidates = htmlNodes(document, "link").flatMap((node) => {
    const tag = htmlOpeningTag(document, node);
    const rel = (attr(tag, "rel") || "").toLowerCase().split(/\s+/);
    return rel.includes("canonical") ? [attr(tag, "href") || ""] : [];
  });
  if (candidates.length !== 1 || !candidates[0]) return null;
  try {
    const canonical = new URL(candidates[0], baseUrl);
    if (!/^https?:$/.test(canonical.protocol) || canonical.username || canonical.password) return null;
    canonical.hash = "";
    return canonical.toString();
  } catch {
    return null;
  }
}

function detectLanguage(htmlLang: string | null, visible: string): DetectedLanguage {
  const declared = htmlLang?.toLowerCase() ?? "";
  if (declared === "es" || declared.startsWith("es-")) return "es";
  if (declared === "en" || declared.startsWith("en-")) return "en";
  const sample = ` ${visible.toLowerCase().slice(0, 12_000)} `;
  const spanish = (sample.match(/\b(el|la|los|las|para|con|que|una|nuestro|servicios|contacto)\b/g) || []).length;
  const english = (sample.match(/\b(the|and|for|with|that|our|services|contact|your|from)\b/g) || []).length;
  if (spanish >= 5 && spanish > english * 1.25) return "es";
  if (english >= 5 && english > spanish * 1.25) return "en";
  return "unknown";
}

function classifyPage(url: URL, anchorText = ""): Exclude<PageType, "submitted"> {
  const haystack = ` ${safeDecodeUriComponent(`${url.pathname} ${anchorText}`)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const includesAny = (terms: string[]) => terms.some((term) => haystack.includes(` ${term} `));
  if (url.pathname === "/" || /^\/(en|es)\/?$/.test(url.pathname)) return "home";
  if (includesAny(["contact", "contacto", "book", "booking", "agenda", "cotiza", "quote", "estimate", "consulta"])) return "contact";
  if (includesAny(["about", "nosotros", "equipo", "team", "company", "empresa", "historia"])) return "about";
  if (includesAny(["service", "services", "servicio", "servicios", "product", "products", "producto", "productos", "solution", "solutions", "solucion", "soluciones", "what we do"])) return "service";
  if (includesAny(["blog", "insight", "insights", "resource", "resources", "case", "caso", "article", "articulo", "news", "noticia", "learn"])) return "resource";
  return "other";
}

const MAX_ELEMENT_EVIDENCE_HTML = 16_000;
const MAX_EVIDENCE_ROWS_PER_TYPE = 2_000;
const MAX_FORM_EVIDENCE_ROWS = 512;
const MAX_JSON_LD_EVIDENCE_ROWS = 64;

function firstClosedNode(document: ParsedHtmlDocument, name: string): HtmlElementNode | null {
  return htmlNodes(document, name).find((node) => node.closed) ?? null;
}

function analyzeHtml(fetched: FetchedPage, pageType: PageType): PageSignals {
  const sourceHtml = fetched.html;
  const documentHtml = observableHtml(sourceHtml);
  const document = parseHtmlDocument(documentHtml);
  const headNode = firstClosedNode(document, "head");
  const metadataHtml = headNode ? htmlInner(document, headNode) : documentHtml;
  const metadataDocument = headNode ? parseHtmlDocument(metadataHtml) : document;
  const bodyNode = firstClosedNode(document, "body");
  const html = bodyNode ? htmlInner(document, bodyNode) : documentHtml;
  const visibleDocument = bodyNode ? parseHtmlDocument(html) : document;
  const interactiveDocument = interactiveHtml(sourceHtml);
  const interactiveRoot = parseHtmlDocument(interactiveDocument);
  const interactiveBodyNode = firstClosedNode(interactiveRoot, "body");
  const interactiveMarkup = interactiveBodyNode ? htmlInner(interactiveRoot, interactiveBodyNode) : interactiveDocument;
  const interactiveTree = interactiveBodyNode ? parseHtmlDocument(interactiveMarkup) : interactiveRoot;
  const evidence = createHtmlExtractionBudget();
  const visible = textOf(html);
  const titleNode = firstClosedNode(metadataDocument, "title");
  const title = textOf(titleNode ? evidence.inner(metadataDocument, titleNode, MAX_ELEMENT_EVIDENCE_HTML) : "").slice(0, 300);
  const description = metaContent(metadataDocument, "description").slice(0, 500);
  const robots = [...metaContents(metadataDocument, ["robots", "googlebot", "bingbot"]), fetched.robotsHeader || ""]
    .filter(Boolean)
    .join("; ") || null;
  const htmlNode = htmlNodes(document, "html")[0];
  const htmlTag = htmlNode ? htmlOpeningTag(document, htmlNode) : "";
  const htmlLang = attr(htmlTag, "lang");
  const pageLanguage = detectLanguage(htmlLang, visible);

  const headingNodes = visibleDocument.nodes.filter((node) => /^h[1-6]$/.test(node.name) && node.closed);
  const headings: { level: number; text: string }[] = [];
  for (const node of headingNodes) {
    const text = textOf(evidence.inner(visibleDocument, node, MAX_ELEMENT_EVIDENCE_HTML)).slice(0, 240);
    if (text) headings.push({ level: Number(node.name[1]), text });
    if (headings.length >= 80) break;
  }
  let headingSkips = 0;
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level - headings[index - 1].level > 1) headingSkips += 1;
  }

  const ids = new Set<string>();
  const idText = new Map<string, string>();
  for (const node of visibleDocument.nodes) {
    const tag = htmlOpeningTag(visibleDocument, node);
    const id = attr(tag, "id") || "";
    if (!id) continue;
    ids.add(id);
    const closesNearby = node.closed && node.closeEnd !== null && node.closeEnd <= node.contentStart + 1_000;
    const label = closesNearby ? textWithImageAlternatives(evidence.inner(visibleDocument, node, 1_000)) : "";
    if (label) idText.set(id, label.slice(0, 240));
  }
  const closedAnchorNodes = htmlNodes(visibleDocument, "a").filter((node) => node.closed);
  const anchorRows = closedAnchorNodes.slice(0, MAX_EVIDENCE_ROWS_PER_TYPE).map((node) => {
    const tag = htmlOpeningTag(visibleDocument, node);
    const href = attr(tag, "href") || "";
    const referenced = (attr(tag, "aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => idText.get(id) || "").join(" ").trim();
    const label = (attr(tag, "aria-label") || referenced || attr(tag, "title") ||
      textWithImageAlternatives(evidence.inner(visibleDocument, node, MAX_ELEMENT_EVIDENCE_HTML))).trim();
    return { href, label };
  });
  const base = new URL(fetched.finalUrl);
  const internalLinks = new Set<string>();
  let brokenAnchors = 0;
  let unclearLinks = 0;
  const vague = /^(click here|here|learn more|read more|more|link|aqu[ií]|ver m[aá]s|leer m[aá]s|m[aá]s)$/i;
  for (const link of anchorRows) {
    if (!link.label || vague.test(link.label)) unclearLinks += 1;
    if (link.href.startsWith("#") && link.href.length > 1 && !ids.has(safeDecodeUriComponent(link.href.slice(1)))) brokenAnchors += 1;
    const rawHref = link.href.trim();
    if (!rawHref || rawHref.startsWith("#")) continue;
    try {
      const resolved = new URL(rawHref, base);
      const destination = new URL(resolved);
      const current = new URL(base);
      destination.hash = "";
      destination.search = "";
      current.hash = "";
      current.search = "";
      if (/^https?:$/.test(resolved.protocol) &&
          normalizeHostname(resolved.hostname) === normalizeHostname(base.hostname) &&
          destination.toString() !== current.toString()) {
        internalLinks.add(destination.toString());
      }
    } catch { /* malformed links are already low-value but do not stop analysis */ }
  }

  const images = htmlNodes(visibleDocument, "img").map((node) => htmlOpeningTag(visibleDocument, node));
  const controls = interactiveTree.nodes
    .filter((node) => ["input", "select", "textarea", "button"].includes(node.name))
    .map((node) => ({ node, tag: htmlOpeningTag(interactiveTree, node), controlType: node.name }))
    .filter((control) => !/\btype\s*=\s*["']?hidden/i.test(control.tag));
  const labelRows = htmlNodes(interactiveTree, "label").filter((node) => node.closed).slice(0, MAX_EVIDENCE_ROWS_PER_TYPE).map((node) => ({
    node,
    tag: htmlOpeningTag(interactiveTree, node),
    text: textWithImageAlternatives(evidence.inner(interactiveTree, node, MAX_ELEMENT_EVIDENCE_HTML)),
  }));
  const explicitLabels = new Map<string, string>();
  const nonemptyLabelIndices = new Set<number>();
  for (const label of labelRows) {
    const target = attr(label.tag, "for");
    if (target && label.text) explicitLabels.set(target, label.text);
    if (label.text) nonemptyLabelIndices.add(label.node.index);
  }
  let namedControls = 0;
  for (const control of controls) {
    const tag = control.tag;
    const id = attr(tag, "id");
    const controlType = control.controlType;
    const inputType = (attr(tag, "type") || "text").toLowerCase();
    const buttonText = controlType === "button"
      ? textWithImageAlternatives(evidence.inner(interactiveTree, control.node, MAX_ELEMENT_EVIDENCE_HTML))
      : "";
    const ariaReferences = (attr(tag, "aria-labelledby") || "").split(/\s+/).filter(Boolean);
    const referencedLabel = ariaReferences.map((reference) => idText.get(reference) || "").join(" ").trim();
    const inputValue = controlType === "input" && /^(submit|button|reset)$/.test(inputType) ? attr(tag, "value") || "" : "";
    const imageAlt = controlType === "input" && inputType === "image" ? attr(tag, "alt") || "" : "";
    const implicitLabel = htmlHasAncestor(interactiveTree, control.node, (candidate) =>
      candidate.name === "label" && nonemptyLabelIndices.has(candidate.index));
    if ((attr(tag, "aria-label") || "").trim() || referencedLabel || (attr(tag, "title") || "").trim() ||
        buttonText || inputValue || imageAlt || (id && explicitLabels.has(id)) || implicitLabel) namedControls += 1;
  }

  const schemaTypes = new Set<string>();
  let jsonLdCount = 0;
  let jsonLdValidCount = 0;
  let parsedJsonLdCount = 0;
  const machineDocument = parseHtmlDocument(machineReadableHtml(sourceHtml));
  for (const node of htmlNodes(machineDocument, "script")) {
    if (!node.closed || (attr(htmlOpeningTag(machineDocument, node), "type") || "").toLowerCase() !== "application/ld+json") continue;
    jsonLdCount += 1;
    if (parsedJsonLdCount >= MAX_JSON_LD_EVIDENCE_ROWS) continue;
    parsedJsonLdCount += 1;
    try {
      const parsed = JSON.parse(htmlInner(machineDocument, node).trim());
      const documentTypes = meaningfulSchemaTypes(parsed);
      if (documentTypes.size > 0) {
        jsonLdValidCount += 1;
        documentTypes.forEach((type) => schemaTypes.add(type));
      }
    } catch { /* invalid JSON-LD remains counted but not valid */ }
  }

  const buttonRows = htmlNodes(interactiveTree, "button").filter((node) => node.closed).slice(0, MAX_EVIDENCE_ROWS_PER_TYPE).map((node) => {
    const tag = htmlOpeningTag(interactiveTree, node);
    return {
      node,
      tag,
      label: (attr(tag, "aria-label") ||
        (attr(tag, "aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => idText.get(id) || "").join(" ") ||
        textWithImageAlternatives(evidence.inner(interactiveTree, node, MAX_ELEMENT_EVIDENCE_HTML))).trim(),
    };
  });
  const actionInputs = htmlNodes(interactiveTree, "input").slice(0, MAX_EVIDENCE_ROWS_PER_TYPE).flatMap((node) => {
    const tag = htmlOpeningTag(interactiveTree, node);
    const type = (attr(tag, "type") || "").toLowerCase();
    if (!/^(submit|button|image)$/.test(type)) return [];
    const label = (attr(tag, "aria-label") || attr(tag, "value") || attr(tag, "alt") || "").trim();
    return label ? [{ node, tag, label, type }] : [];
  });
  const forms = htmlNodes(interactiveTree, "form").filter((node) => node.closed).slice(0, MAX_FORM_EVIDENCE_ROWS).map((node) => {
    const tag = htmlOpeningTag(interactiveTree, node);
    let destination = "";
    try {
      const candidate = new URL(attr(tag, "action") || base.toString(), base);
      if (/^https?:$/.test(candidate.protocol)) destination = candidate.toString();
    } catch { /* malformed actions are not treated as working paths */ }
    return { node, tag, destination };
  });
  const actionableAnchorRows = htmlNodes(interactiveTree, "a").filter((node) => node.closed).slice(0, MAX_EVIDENCE_ROWS_PER_TYPE).map((node) => {
    const tag = htmlOpeningTag(interactiveTree, node);
    const referenced = (attr(tag, "aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => idText.get(id) || "").join(" ").trim();
    return {
      href: attr(tag, "href") || "",
      label: (attr(tag, "aria-label") || referenced || attr(tag, "title") ||
        textWithImageAlternatives(evidence.inner(interactiveTree, node, MAX_ELEMENT_EVIDENCE_HTML))).trim(),
    };
  });
  const actionableAnchorTargets = actionableAnchorRows.flatMap((link) => {
    const href = link.href.trim();
    if (!link.label || !href || href === "#" || /^javascript:/i.test(href)) return [];
    if (href.startsWith("#")) {
      return ids.has(safeDecodeUriComponent(href.slice(1)))
        ? [{ label: link.label, destination: new URL(href, base).toString(), kind: "link" as const }]
        : [];
    }
    try {
      const destination = new URL(href, base);
      return /^(https?:|mailto:|tel:)$/.test(destination.protocol)
        ? [{ label: link.label, destination: destination.toString(), kind: "link" as const }]
        : [];
    } catch { return []; }
  });
  const formByNode = new Map(forms.map((form) => [form.node.index, form]));
  const formById = new Map(forms.flatMap((form) => {
    const id = attr(form.tag, "id");
    return id ? [[id, form] as const] : [];
  }));
  const associatedForm = (node: HtmlElementNode, formId: string | null) => {
    let parentIndex = node.parentIndex;
    while (parentIndex !== null) {
      const form = formByNode.get(parentIndex);
      if (form) return form;
      parentIndex = interactiveTree.nodes[parentIndex]?.parentIndex ?? null;
    }
    return formId ? formById.get(formId) : undefined;
  };
  const actionableButtonTargets = buttonRows.flatMap((button) => {
    const type = (attr(button.tag, "type") || "").toLowerCase();
    const formId = attr(button.tag, "form");
    const form = associatedForm(button.node, formId);
    return button.label && form?.destination && (type === "submit" || !type)
      ? [{ label: button.label, destination: form.destination, kind: "form" as const }]
      : [];
  });
  const actionableInputTargets = actionInputs.flatMap((input) => {
    if (input.type === "button") return [];
    const formId = attr(input.tag, "form");
    const form = associatedForm(input.node, formId);
    return form?.destination ? [{ label: input.label, destination: form.destination, kind: "form" as const }] : [];
  });
  const interactiveLabels = [
    ...actionableAnchorRows.map((link) => link.label),
    ...buttonRows.map((button) => button.label),
    ...actionInputs.map((input) => input.label),
  ].filter(Boolean);
  const ctaLabels = [...new Set(interactiveLabels.filter((label) => matchesSiteSignal(label, pageLanguage, "cta")).map((label) => label.slice(0, 100)))].slice(0, 8);
  const ctaTargetRows: { label: string; destination: string; kind: "link" | "form" }[] = [
    ...actionableAnchorTargets,
    ...actionableButtonTargets,
    ...actionableInputTargets,
  ].filter((target) => matchesSiteSignal(target.label, pageLanguage, "cta"));
  const ctaTargetMap = new Map<string, (typeof ctaTargetRows)[number]>();
  for (const target of ctaTargetRows) {
    ctaTargetMap.set(`${target.kind}:${target.destination}:${target.label}`, { ...target, label: target.label.slice(0, 100) });
  }
  const ctaTargets = [...ctaTargetMap.values()].slice(0, 8);
  const actionableCtaLabels = [...new Set(ctaTargets.map((target) => target.label))];
  const lower = visible.toLowerCase();
  const types = [...schemaTypes];
  const organizationTypes = new Set([
    "Organization", "LocalBusiness", "Corporation", "NGO", "ProfessionalService", "MedicalOrganization",
    "EducationalOrganization", "GovernmentOrganization", "AutoRepair", "Dentist", "FinancialService", "FoodEstablishment",
    "HealthAndBeautyBusiness", "HomeAndConstructionBusiness", "LegalService", "LodgingBusiness", "RealEstateAgent",
    "Restaurant", "Store", "TravelAgency",
  ]);
  const serviceTypes = new Set(["Service", "Product", "Offer"]);
  const authorTypes = new Set(["Person", "Article", "BlogPosting", "NewsArticle"]);
  const hasOrgSchema = types.some((type) => organizationTypes.has(type));
  const hasServiceSchema = types.some((type) => serviceTypes.has(type));
  const answerOutline = visibleDocument.nodes.filter((node) => /^h[1-4]$/.test(node.name));
  let directAnswerCount = 0;
  for (let outlineIndex = 0; outlineIndex < answerOutline.length; outlineIndex += 1) {
    const node = answerOutline[outlineIndex];
    if (!/^h[2-4]$/.test(node.name) || !node.closed || node.closeEnd === null) continue;
    let nextIndex = outlineIndex + 1;
    while (nextIndex < answerOutline.length && answerOutline[nextIndex].openStart < node.closeEnd) nextIndex += 1;
    const nextHeading = answerOutline[nextIndex];
    const explanationEnd = nextHeading?.openStart ?? visibleDocument.source.length;
    const heading = textWithImageAlternatives(evidence.inner(visibleDocument, node, MAX_ELEMENT_EVIDENCE_HTML));
    const explanation = textWithImageAlternatives(evidence.slice(visibleDocument.source, node.closeEnd, explanationEnd));
    if (heading.length >= 12 && explanation.length >= 45 && explanation.length <= 1_200) directAnswerCount += 1;
  }

  const hasUsableViewport = supportsMobileViewport(metaContent(metadataDocument, "viewport"));

  return {
    url: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    pageType,
    status: fetched.status,
    contentType: fetched.contentType,
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    canonical: canonicalUrl(metadataDocument, fetched.finalUrl),
    robots,
    htmlLang,
    hasViewport: hasUsableViewport,
    h1Count: headings.filter((heading) => heading.level === 1).length,
    h1Text: headings.find((heading) => heading.level === 1)?.text || "",
    headings,
    headingSkips,
    wordCount: visible ? visible.split(/\s+/).length : 0,
    sectionCount: visibleDocument.nodes.filter((node) => ["section", "main", "article"].includes(node.name)).length,
    linkCount: closedAnchorNodes.length,
    internalLinkCount: internalLinks.size,
    unclearLinkCount: unclearLinks,
    brokenAnchorCount: brokenAnchors,
    imageCount: images.length,
    imagesWithAlt: images.filter((tag) => hasAttr(tag, "alt")).length,
    controlCount: controls.length,
    namedControlCount: namedControls,
    formCount: htmlNodes(visibleDocument, "form").length,
    jsonLdCount,
    jsonLdValidCount,
    schemaTypes: types.slice(0, 20),
    hasOrganizationSchema: hasOrgSchema,
    hasServiceSchema,
    hasAuthorSignal: matchesSiteSignal(lower, pageLanguage, "author") || types.some((type) => authorTypes.has(type)),
    hasAddressSignal: matchesSiteSignal(lower, pageLanguage, "address"),
    hasContactSignal: matchesSiteSignal(lower, pageLanguage, "contact"),
    hasCtaSignal: ctaLabels.length > 0,
    ctaLabels,
    actionableCtaLabels,
    ctaTargets,
    hasTrustSignal: matchesSiteSignal(lower, pageLanguage, "trust"),
    hasServiceLanguage: hasServiceSchema || matchesSiteSignal(lower, pageLanguage, "service"),
    hasEntityLanguage: hasOrgSchema || matchesSiteSignal(lower, pageLanguage, "entity"),
    hasAudienceLanguage: matchesSiteSignal(lower, pageLanguage, "audience"),
    directAnswerCount,
    visibleContentLength: visible.length,
  };
}

function discoverRepresentativeLinks(html: string, baseUrl: URL): { url: URL; type: Exclude<PageType, "submitted"> }[] {
  const documentHtml = observableHtml(html);
  const document = parseHtmlDocument(documentHtml);
  const bodyNode = firstClosedNode(document, "body");
  html = bodyNode ? htmlInner(document, bodyNode) : documentHtml;
  const visibleDocument = bodyNode ? parseHtmlDocument(html) : document;
  const evidence = createHtmlExtractionBudget();
  const domain = normalizeHostname(baseUrl.hostname);
  const candidates: { url: URL; type: Exclude<PageType, "submitted">; label: string }[] = [];
  if (classifyPage(baseUrl) !== "home") candidates.push({ url: new URL("/", baseUrl), type: "home", label: "home" });
  const closedNavIndices = new Set(htmlNodes(visibleDocument, "nav").filter((node) => node.closed).map((node) => node.index));
  let evidenceRows = 0;
  for (const node of htmlNodes(visibleDocument, "a")) {
    if (!node.closed) continue;
    if (closedNavIndices.size > 0 && !htmlHasAncestor(visibleDocument, node, (candidate) => closedNavIndices.has(candidate.index))) continue;
    if (evidenceRows >= MAX_EVIDENCE_ROWS_PER_TYPE) break;
    evidenceRows += 1;
    const tag = htmlOpeningTag(visibleDocument, node);
    const href = attr(tag, "href");
    const label = attr(tag, "aria-label") || textOf(evidence.inner(visibleDocument, node, MAX_ELEMENT_EVIDENCE_HTML));
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      url.hash = "";
      if (!/^https?:$/.test(url.protocol) || normalizeHostname(url.hostname) !== domain) continue;
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(url.pathname)) continue;
      if (/\b(logout|log-out|signout|sign-out|delete|remove|unsubscribe|wp-admin|admin|cart|checkout)\b/i.test(`${url.pathname} ${url.search}`)) continue;
      const type = classifyPage(url, label);
      if (type === "other") continue;
      candidates.push({ url, type, label });
    } catch { /* ignore malformed destinations */ }
  }

  return selectRepresentative(candidates, baseUrl);
}

/** Identity of a page for de-duplication: origin plus path, ignoring a trailing slash. */
function pageKey(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
}

/**
 * Reduces candidates to at most one page per type, in the order that makes a
 * report most useful, and never re-audits the submitted page.
 *
 * Shared by in-page link discovery and the sitemap fallback so both produce the
 * same shape of report; a second copy of this ranking would eventually disagree
 * with the first.
 */
function selectRepresentative(
  candidates: { url: URL; type: Exclude<PageType, "submitted"> }[],
  baseUrl: URL,
  exclude: Set<string> = new Set(),
): { url: URL; type: Exclude<PageType, "submitted"> }[] {
  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = pageKey(candidate.url);
    if (key !== pageKey(baseUrl) && !exclude.has(key) && !unique.has(key)) unique.set(key, candidate);
  }
  const rows = [...unique.values()];
  const selected: (typeof rows)[number][] = [];
  for (const type of ["home", "service", "about", "contact", "resource"] as const) {
    const match = rows.find((candidate) => candidate.type === type && !selected.includes(candidate));
    if (match && selected.length < MAX_PAGES - 1) selected.push(match);
  }
  return selected.map(({ url, type }) => ({ url, type }));
}

/**
 * Sitemap fallback for representative pages.
 *
 * Site builders render navigation with JavaScript, so a homepage can arrive with
 * no crawlable same-domain anchors at all and the audit reduces to a single
 * page. `sitemap.xml` is the one place those sites still publish their structure
 * in plain markup.
 *
 * Bounded on purpose: it runs only when in-page discovery found nothing, tries
 * two well-known filenames, and follows a sitemap index one level deep, so it
 * adds at most three requests to an audit that would otherwise have had one
 * page to show.
 */
const SITEMAP_CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml"] as const;
const MAX_SITEMAP_LOCATIONS = 2_000;
const MAX_SITEMAP_CHILDREN = 2;
/**
 * A sitemap index is split by content type and the general pages are rarely the
 * first entry. On a Wix index the pages sitemap sits behind bookings, blog
 * posts and eleven per-collection dynamic sitemaps, so taking document order
 * would read a bookings feed and conclude the site has no pages.
 */
const PAGE_SITEMAP_HINT = /(^|\/)pages?[_-]?sitemap|sitemap[_-]?pages?/i;

function sitemapLocations(xml: string): string[] {
  const locations: string[] = [];
  const pattern = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null && locations.length < MAX_SITEMAP_LOCATIONS) {
    locations.push(decodeEntities(match[1]));
  }
  return locations;
}

const isSitemapIndex = (xml: string): boolean => /<sitemapindex[\s>]/i.test(xml);

async function fetchSitemap(
  url: URL,
  deadline: number,
  admitDestination: (url: URL) => Promise<void>,
): Promise<string | null> {
  try {
    const fetched = await fetchPublicHtml(url, deadline, admitDestination, MAX_LINKED_RESPONSE_BYTES, "xml");
    return fetched.status >= 200 && fetched.status < 300 ? fetched.html : null;
  } catch {
    // A missing or unparseable sitemap is the normal case, not an audit failure.
    return null;
  }
}

async function discoverSitemapLinks(
  baseUrl: URL,
  deadline: number,
  admitDestination: (url: URL) => Promise<void>,
): Promise<{ url: URL; type: Exclude<PageType, "submitted"> }[]> {
  const domain = normalizeHostname(baseUrl.hostname);
  let xml: string | null = null;
  for (const candidate of SITEMAP_CANDIDATES) {
    xml = await fetchSitemap(new URL(candidate, baseUrl), deadline, admitDestination);
    if (xml) break;
  }
  if (!xml) return [];

  const documents: string[] = [];
  if (isSitemapIndex(xml)) {
    const children = sitemapLocations(xml).filter((location) => {
      try { return normalizeHostname(new URL(location).hostname) === domain; } catch { return false; }
    });
    const ranked = [
      ...children.filter((child) => PAGE_SITEMAP_HINT.test(child)),
      ...children.filter((child) => !PAGE_SITEMAP_HINT.test(child)),
    ];
    for (const child of ranked.slice(0, MAX_SITEMAP_CHILDREN)) {
      const body = await fetchSitemap(new URL(child), deadline, admitDestination);
      if (!body) continue;
      documents.push(body);
      // One page-bearing sitemap is normally the whole story; stop rather than
      // spend another request inside the audit deadline.
      if (sitemapLocations(body).length >= MAX_PAGES) break;
    }
    if (documents.length === 0) return [];
  } else {
    documents.push(xml);
  }

  const candidates: { url: URL; type: Exclude<PageType, "submitted"> }[] = [];
  for (const location of documents.flatMap(sitemapLocations)) {
    try {
      const url = new URL(location);
      url.hash = "";
      // The same exclusions in-page discovery applies, so the two paths cannot
      // disagree about what counts as an auditable page.
      if (!/^https?:$/.test(url.protocol) || normalizeHostname(url.hostname) !== domain) continue;
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(url.pathname)) continue;
      if (/\b(logout|log-out|signout|sign-out|delete|remove|unsubscribe|wp-admin|admin|cart|checkout)\b/i.test(`${url.pathname} ${url.search}`)) continue;
      const type = classifyPage(url);
      if (type === "other") continue;
      candidates.push({ url, type });
    } catch { /* ignore malformed sitemap entries */ }
  }

  return selectRepresentative(candidates, baseUrl);
}

const noLab = (): LabSignals => ({
  measured: false,
  performanceScore: null,
  accessibilityScore: null,
  bestPracticesScore: null,
  seoScore: null,
  lcpMs: null,
  cls: null,
  tbtMs: null,
  screenshotDataUrl: null,
  source: "none",
});

/**
 * One PageSpeed attempt.
 *
 * Returns `retryable` when the failure is Google's rather than ours. Lighthouse
 * intermittently answers 500 "Something went wrong" for a page it will analyse
 * perfectly well seconds later, and that has been the single most common
 * failure here. A 4xx is not retried: a quota error, a key that is not enabled,
 * and a rejected URL will all fail again the same way.
 */
async function attemptPageSpeed(
  url: string,
  deadline: number,
  maxMs: number,
): Promise<{ lab: LabSignals | null; retryable: boolean }> {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("key", PAGESPEED_API_KEY);
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) endpoint.searchParams.append("category", category);
  const controller = new AbortController();
  let timeoutMs: number;
  try { timeoutMs = remainingBudget(deadline, maxMs); } catch { return { lab: null, retryable: false }; }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      // Recording the status keeps a quota error, a disabled key and a rejected
      // URL distinguishable from each other without another deploy.
      const detail = await response.text().catch(() => "");
      console.error("pagespeed request failed", response.status, detail.slice(0, 300).replace(/\s+/g, " "));
      return { lab: null, retryable: response.status >= 500 };
    }
    const data = await response.json() as Record<string, unknown>;
    const lighthouse = data.lighthouseResult as Record<string, unknown> | undefined;
    const categories = lighthouse?.categories as Record<string, { score?: number }> | undefined;
    const audits = lighthouse?.audits as Record<string, { numericValue?: number; details?: { data?: string } }> | undefined;
    const score = (key: string) => typeof categories?.[key]?.score === "number" ? Math.round(categories[key].score! * 100) : null;
    const metric = (key: string) => typeof audits?.[key]?.numericValue === "number" ? audits[key].numericValue! : null;
    const rawScreenshot = audits?.["final-screenshot"]?.details?.data;
    const screenshotDataUrl = typeof rawScreenshot === "string" && rawScreenshot.length <= 500_000 &&
      /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(rawScreenshot) ? rawScreenshot : null;
    const measured: LabSignals = {
      measured: true,
      performanceScore: score("performance"),
      accessibilityScore: score("accessibility"),
      bestPracticesScore: score("best-practices"),
      seoScore: score("seo"),
      lcpMs: metric("largest-contentful-paint") === null ? null : Math.round(metric("largest-contentful-paint")!),
      cls: metric("cumulative-layout-shift") === null ? null : Number(metric("cumulative-layout-shift")!.toFixed(3)),
      tbtMs: metric("total-blocking-time") === null ? null : Math.round(metric("total-blocking-time")!),
      screenshotDataUrl,
      source: "pagespeed",
    };
    return { lab: measured, retryable: false };
  } catch (error) {
    const aborted = (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
    console.error("pagespeed request failed", aborted ? `timeout after ${timeoutMs}ms` : (error instanceof Error ? error.message : String(error)));
    // A timeout has already spent the budget, so trying again inside the same
    // deadline would only fail again. A transport error is worth one retry.
    return { lab: null, retryable: !aborted };
  } finally {
    clearTimeout(timeout);
  }
}

const PAGESPEED_ATTEMPTS = 2;
const PAGESPEED_RETRY_PAUSE_MS = 2_000;

/**
 * Measures a page, retrying once when Google fails on its own side.
 *
 * The retry only runs when the remaining budget can actually accommodate
 * another attempt, so a foreground call cannot overrun the audit deadline
 * trying twice.
 */
async function runPageSpeed(
  url: string,
  deadline: number,
  maxMs: number = PAGESPEED_TIMEOUT_MS,
): Promise<LabSignals> {
  if (!PAGESPEED_API_KEY) return noLab();

  for (let attempt = 1; attempt <= PAGESPEED_ATTEMPTS; attempt += 1) {
    const { lab, retryable } = await attemptPageSpeed(url, deadline, maxMs);
    if (lab) return lab;
    if (!retryable || attempt === PAGESPEED_ATTEMPTS) break;

    // Only retry with enough budget left for the pause and a real attempt.
    const remaining = deadline - Date.now();
    if (remaining < PAGESPEED_RETRY_PAUSE_MS + 10_000) {
      console.error("pagespeed retry skipped", `${remaining}ms left`);
      break;
    }
    console.error("pagespeed retrying after a server-side failure");
    await new Promise((resolve) => setTimeout(resolve, PAGESPEED_RETRY_PAUSE_MS));
  }

  return noLab();
}

async function hashToken(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * Both sides are hashed first so the loop always runs over 64 hex characters:
 * comparing the raw strings would return early on the first differing byte and
 * would also reveal the expected length.
 */
async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const [a, b] = await Promise.all([hashToken(provided), hashToken(expected)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Authorizes the scheduled outbox drain.
 *
 * `AUDIT_DRAIN_SECRET` is the supported credential. The service role key is
 * still accepted so an already-scheduled cron keeps draining across the deploy
 * that introduces the new secret; once the schedule sends the drain secret, the
 * service role branch can be dropped.
 */
async function authorizedDrain(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);
  return (await secretsMatch(provided, DRAIN_SECRET)) ||
    (await secretsMatch(provided, SERVICE_ROLE_KEY));
}

function safeAnswers(value: unknown): AuditAnswers {
  const answers = emptyAuditAnswers();
  if (!value || typeof value !== "object" || Array.isArray(value)) return answers;
  const input = value as Record<string, unknown>;
  const oneOf = <T extends string>(key: string, choices: readonly T[]): T | null =>
    typeof input[key] === "string" && choices.includes(input[key] as T) ? input[key] as T : null;
  answers.businessType = oneOf("businessType", ["professional-services", "local-business", "ecommerce", "nonprofit", "b2b", "platform", "other"]);
  answers.audience = typeof input.audience === "string" ? input.audience.trim().slice(0, 240) : "";
  answers.purpose = oneOf("purpose", ["generate-leads", "sell", "book", "educate", "partners", "support"]);
  answers.conversionAction = oneOf("conversionAction", ["contact", "request-quote", "book", "buy", "sign-up", "use-tool", "call", "other"]);
  answers.differentiation = oneOf("differentiation", ["yes", "no", "unsure"]);
  answers.expectedResults = oneOf("expectedResults", ["yes", "no", "unsure"]);
  answers.lastReviewed = oneOf("lastReviewed", ["six-months", "one-year", "two-years", "unknown"]);
  return answers;
}

async function updateAudit(id: string, values: Record<string, unknown>): Promise<void> {
  if (!admin) return;
  const { error } = await admin.from("website_audits").update(values).eq("id", id);
  if (error) console.error("website_audits update failed", error.message);
}

async function consumePersistentRateLimit(scope: string, key: string, limit: number, windowSeconds = 600): Promise<void> {
  if (!admin) throw new AuditError("service_unavailable", "The audit service is not configured.", 503);
  const keyHash = await hashToken(`${scope}:${key}`);
  const { data, error } = await admin.rpc("consume_edge_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("edge rate limit check failed", error.message);
    throw new AuditError("service_unavailable", "The audit service is temporarily unavailable.", 503);
  }
  if (data !== true) throw new AuditError("rate_limited", "Too many recent audits for this destination. Try again later.", 429);
}

interface CachedObservation {
  auditId: string;
  observation: Observation;
}

async function cachedObservation(requestedUrl: string): Promise<CachedObservation | null> {
  if (!admin) return null;
  const since = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
  const { data, error } = await admin.from("website_audits")
    .select("id,observation")
    .eq("requested_url", requestedUrl)
    .eq("ruleset_version", RULESET_VERSION)
    .is("cached_from", null)
    .contains("observation", {
      provenance: { source: "live-crawl", crawlerVersion: CRAWLER_VERSION, rulesetVersion: RULESET_VERSION },
    })
    .in("status", ["completed", "partial"])
    // An audit whose lab is still pending is not a finished result and must not
    // be handed to the next visitor as one.
    .not("observation->labPending", "eq", true)
    .gte("created_at", since)
    .not("observation", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.observation) return null;
  const observation = data.observation as Observation;
  return Array.isArray(observation.pages) && observation.pages.length > 0
    ? { auditId: String(data.id), observation }
    : null;
}

async function persistCompletedAudit(
  observation: Observation,
  tokenHash: string,
  interfaceLanguage: InterfaceLanguage,
  cachedFrom: string | null = null,
  recordEvent = true,
): Promise<void> {
  if (!admin) throw new AuditError("service_unavailable", "The audit service is not configured.", 503);
  const report = scoreAudit(observation, observation.answers ?? emptyAuditAnswers());
  const storedObservation = { ...observation };
  delete storedObservation.accessToken;
  const { data: updated, error } = await admin.from("website_audits").update({
    requested_url: observation.requestedUrl,
    final_url: observation.finalUrl,
    // Keep normalized_domain immutable: it is the submitted-domain admission
    // record. The redirect destination remains available in final_url and the
    // normalized observation without erasing the original rate-limit history.
    status: observation.warnings.length ? "partial" : "completed",
    interface_language: interfaceLanguage,
    detected_language: observation.detectedLanguage,
    ruleset_version: RULESET_VERSION,
    coverage: report.coverage,
    scores: {
      overallScore: report.overallScore,
      band: report.band,
      opportunityRoute: report.opportunityRoute,
      dimensions: Object.fromEntries(Object.entries(report.dimensions).map(([key, dimension]) => [key, {
        score: dimension.score,
        coverage: dimension.coverage,
        measuredPoints: dimension.measuredPoints,
        availablePoints: dimension.availablePoints,
      }])),
    },
    answers: observation.answers ?? {},
    observation: storedObservation,
    cached_from: cachedFrom,
    completed_at: new Date().toISOString(),
  })
    .eq("id", observation.auditId)
    .eq("public_token_hash", tokenHash)
    .select("id")
    .single();
  if (error || !updated) {
    console.error("website_audits persistence failed", error?.message ?? "matching audit row not found");
    throw new AuditError("audit_save_failed", "The audit result could not be saved.", 500);
  }
  const pageRows = observation.pages.map((page) => ({
    audit_id: observation.auditId,
    url: page.url,
    final_url: page.finalUrl,
    page_type: page.pageType,
    title: page.title,
    response_status: page.status,
    analysis_metadata: page,
  }));
  const { error: pageError } = await admin.from("website_audit_pages").upsert(pageRows, { onConflict: "audit_id,final_url" });
  if (pageError) console.error("website_audit_pages persistence failed", pageError.message);
  const findingRows = report.checks.map((check) => ({
    audit_id: observation.auditId,
    rule_id: check.ruleId,
    dimension: check.dimension,
    outcome: check.outcome,
    severity: check.severity,
    business_impact: check.businessImpact,
    effort: check.effort,
    evidence_type: check.evidenceType,
    earned_points: check.earnedPoints,
    max_points: check.maxPoints,
    priority: check.priority,
    evidence: { value: check.evidenceValue ?? null, pageUrl: check.pageUrl ?? null },
  }));
  const { error: findingError } = await admin.from("website_audit_findings").upsert(findingRows, { onConflict: "audit_id,rule_id" });
  if (findingError) console.error("website_audit_findings persistence failed", findingError.message);
  await admin.from("website_audit_answers").upsert({ audit_id: observation.auditId, answers: observation.answers ?? {}, updated_at: new Date().toISOString() });
  if (recordEvent) {
    await admin.from("website_audit_events").insert({ audit_id: observation.auditId, event_name: "completed", detail: { pages: observation.pages.length, warnings: observation.warnings } });
  }
}

/**
 * Measures the lab signals after the report has already been delivered.
 *
 * Runs detached from the request that started it, so it can spend far longer on
 * PageSpeed than a waiting visitor would tolerate. When it finishes it reloads
 * the stored audit, merges the result, clears `labPending` and re-scores, which
 * is what the polling client is waiting to see.
 *
 * Failure is not an error state: the audit is already complete and useful
 * without lab data. A failed measurement simply settles as unavailable.
 */
async function measureLabInBackground(
  auditId: string,
  finalUrl: string,
  interfaceLanguage: InterfaceLanguage,
): Promise<void> {
  if (!admin) return;
  const deadline = Date.now() + PAGESPEED_BACKGROUND_MS;
  const lab = await runPageSpeed(finalUrl, deadline, PAGESPEED_BACKGROUND_MS);

  const { data, error } = await admin.from("website_audits")
    .select("observation,public_token_hash,interface_language")
    .eq("id", auditId)
    .maybeSingle();
  if (error || !data?.observation) {
    console.error("lab merge could not load the audit", error?.message ?? "row not found");
    return;
  }

  const stored = data.observation as Observation;
  const warnings = stored.warnings.filter((warning) => !warning.startsWith("pagespeed_"));
  if (!lab.measured) warnings.push(PAGESPEED_API_KEY ? "pagespeed_unavailable" : "pagespeed_not_configured");
  warnings.sort();

  const merged: Observation = { ...stored, lab, labPending: false, warnings };
  try {
    await persistCompletedAudit(
      merged,
      String(data.public_token_hash),
      (data.interface_language as InterfaceLanguage) ?? interfaceLanguage,
      null,
      false,
    );
  } catch (persistError) {
    console.error("lab merge persistence failed", persistError instanceof Error ? persistError.message : String(persistError));
  }
}

async function runAudit(rawUrl: unknown, rawAnswers: unknown, interfaceLanguage: InterfaceLanguage, requestKey: string): Promise<Observation> {
  if (!admin) throw new AuditError("service_unavailable", "The audit service is not configured.", 503);
  const deadline = Date.now() + AUDIT_TIMEOUT_MS;
  const submitted = normalizeSubmittedUrl(rawUrl);
  const domain = normalizeHostname(submitted.hostname);
  // Cheap worker admission and the durable job reservation both run before DNS.
  // This prevents rejected clients and domains from consuming resolver work.
  enforceWorkerRateLimit(`client:${requestKey}`, 8);
  enforceWorkerRateLimit(`domain:${domain}`, 5);
  const requestFingerprintHash = await hashToken(`website-audit:${requestKey}`);
  const auditId = crypto.randomUUID();
  const accessToken = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await hashToken(accessToken);
  const createdAt = new Date().toISOString();
  const answers = safeAnswers(rawAnswers);

  const { data: creation, error: creationError } = await admin.rpc("create_website_audit_job", {
    p_id: auditId,
    p_public_token_hash: tokenHash,
    p_requested_url: submitted.toString(),
    p_normalized_domain: domain,
    p_request_fingerprint_hash: requestFingerprintHash,
    p_interface_language: interfaceLanguage,
    p_ruleset_version: RULESET_VERSION,
    p_answers: answers,
    p_terms_accepted_at: createdAt,
    p_started_at: createdAt,
  });
  if (creationError) {
    console.error("website audit reservation failed", creationError.message);
    throw new AuditError("audit_save_failed", "The audit could not be started.", 500);
  }
  if (creation === "client_limited" || creation === "domain_limited") {
    throw new AuditError("rate_limited", "Too many recent audits. Try again later.", 429);
  }
  if (creation !== "created") throw new AuditError("audit_save_failed", "The audit could not be started.", 500);
  await admin.from("website_audit_events").insert({ audit_id: auditId, event_name: "started", detail: { interfaceLanguage } });

  const destinationAdmissions = new Map<string, Promise<void>>([[domain, Promise.resolve()]]);
  const admitDestination = async (url: URL): Promise<void> => {
    const destinationDomain = normalizeHostname(url.hostname);
    let admission = destinationAdmissions.get(destinationDomain);
    if (!admission) {
      admission = (async () => {
        enforceWorkerRateLimit(`domain:${destinationDomain}`, 5);
        await consumePersistentRateLimit("website-audit-destination", destinationDomain, 15);
      })();
      destinationAdmissions.set(destinationDomain, admission);
    }
    try {
      // Parallel representative pages that resolve to the same redirect host
      // share the same durable admission and cannot race past a rejected one.
      await admission;
    } catch (error) {
      if (destinationAdmissions.get(destinationDomain) === admission) {
        destinationAdmissions.delete(destinationDomain);
      }
      throw error;
    }
    // Every actual target fetch, including representative pages and every
    // redirect hop, consumes a separate destination-host allowance.
    enforceWorkerRateLimit(`fetch-domain:${destinationDomain}`, 75);
    await consumePersistentRateLimit("website-audit-fetch", destinationDomain, 75);
  };

  try {
    const cached = await cachedObservation(submitted.toString());
    if (cached) {
      const observation: Observation = {
        ...cached.observation,
        auditId,
        accessToken,
        requestedUrl: submitted.toString(),
        createdAt: Number.isFinite(new Date(cached.observation.createdAt).getTime()) ? cached.observation.createdAt : createdAt,
        answers,
        cached: true,
        sample: false,
      };
      await persistCompletedAudit(observation, tokenHash, interfaceLanguage, cached.auditId);
      return observation;
    }

    const primaryFetched = await fetchPublicHtml(submitted, deadline, admitDestination);
    const primaryUrl = new URL(primaryFetched.finalUrl);
    const primary = analyzeHtml(primaryFetched, classifyPage(primaryUrl) === "home" ? "home" : "submitted");
    if (primary.status < 200 || primary.status >= 400) throw new AuditError("response_unhealthy", `The submitted page returned HTTP ${primary.status}.`, 422);
    const finalDomain = normalizeHostname(new URL(primary.finalUrl).hostname);
    let links = discoverRepresentativeLinks(primaryFetched.html, primaryUrl);
    const warnings: string[] = [];
    // Only when the page yielded nothing. Sites whose navigation is already in
    // the markup keep their existing behaviour and pay no extra request, which
    // matters because this runs inside the same audit deadline.
    if (links.length === 0) {
      links = await discoverSitemapLinks(primaryUrl, deadline, admitDestination);
      // Only a genuine miss is a warning. The report renders one amber notice
      // for any non-PageSpeed warning, so flagging a successful sitemap
      // discovery would tell the visitor their scope was incomplete at exactly
      // the moment it was recovered.
      if (links.length === 0) warnings.push("no_representative_pages");
    }
    const [representativeRows] = await Promise.all([
      Promise.all(links.map(async (candidate) => {
        try {
          const fetched = await fetchPublicHtml(candidate.url, deadline, admitDestination, MAX_LINKED_RESPONSE_BYTES);
          if (normalizeHostname(new URL(fetched.finalUrl).hostname) !== finalDomain) {
            warnings.push(`${candidate.type}:redirect_off_domain`);
            return null;
          }
          return analyzeHtml(fetched, candidate.type);
        } catch (error) {
          const code = error instanceof AuditError ? error.code : "page_fetch_failed";
          warnings.push(`${candidate.type}:${code}`);
          return null;
        }
      })),
    ]);
    warnings.sort();
    const seenFinalUrls = new Set([new URL(primary.finalUrl).toString()]);
    const representatives: PageSignals[] = [];
    for (const row of representativeRows) {
      if (!row) continue;
      const finalUrl = new URL(row.finalUrl);
      finalUrl.hash = "";
      const key = finalUrl.toString();
      if (seenFinalUrls.has(key)) {
        warnings.push(`${row.pageType}:duplicate_destination`);
        continue;
      }
      seenFinalUrls.add(key);
      representatives.push(row);
    }
    warnings.sort();
    const pages = [primary, ...representatives].slice(0, MAX_PAGES);
    const failedPageCount = representativeRows.filter((row) => row === null).length;
    const visibleLanguage = detectLanguage(primary.htmlLang, textOf(observableHtml(primaryFetched.html)));
    const observation: Observation = {
      auditId,
      accessToken,
      requestedUrl: submitted.toString(),
      finalUrl: primary.finalUrl,
      normalizedDomain: finalDomain,
      createdAt,
      detectedLanguage: visibleLanguage,
      pages,
      // The lab measurement runs after this response is sent. Until it lands the
      // report is complete on everything the HTML analysis can answer.
      lab: noLab(),
      labPending: PAGESPEED_API_KEY ? true : false,
      warnings: PAGESPEED_API_KEY ? warnings : [...warnings, "pagespeed_not_configured"].sort(),
      discoveredPageCount: Math.min(MAX_PAGES, pages.length + failedPageCount),
      failedPageCount,
      cached: false,
      sample: false,
      answers,
      provenance: { source: "live-crawl", crawlerVersion: CRAWLER_VERSION, rulesetVersion: RULESET_VERSION },
    };
    await persistCompletedAudit(observation, tokenHash, interfaceLanguage);
    if (PAGESPEED_API_KEY) {
      scheduleBackground(measureLabInBackground(auditId, primary.finalUrl, interfaceLanguage));
    }
    return observation;
  } catch (error) {
    const failure = error instanceof AuditError ? error : new AuditError("audit_failed", "The audit could not be completed.", 500);
    await updateAudit(auditId, { status: "failed", error_code: failure.code, error_detail: failure.message.slice(0, 500), completed_at: new Date().toISOString() });
    if (admin) await admin.from("website_audit_events").insert({ audit_id: auditId, event_name: "failed", detail: { code: failure.code } });
    throw failure;
  }
}

async function authorizedAudit(auditId: unknown, accessToken: unknown): Promise<Record<string, unknown> | null> {
  if (!admin || typeof auditId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auditId) ||
      typeof accessToken !== "string" ||
      !/^[A-Za-z0-9-]{32,160}$/.test(accessToken)) return null;
  const tokenHash = await hashToken(accessToken);
  const { data, error } = await admin.from("website_audits")
    .select("id,public_token_hash,status,observation,answers,expires_at,ruleset_version,interface_language")
    .eq("id", auditId)
    .eq("public_token_hash", tokenHash)
    .maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as Record<string, unknown>;
}

const LEAD_TIMELINES = ["now", "one-three", "three-six", "exploring"] as const;
type LeadTimeline = (typeof LEAD_TIMELINES)[number];

function leadTemperature(
  score: number,
  route: OpportunityRoute,
  timeline: LeadTimeline,
  answers: AuditAnswers,
): "high" | "medium" | "nurture" {
  const commercialGoal = answers.purpose !== null && ["generate-leads", "sell", "book", "partners"].includes(answers.purpose);
  const structural = route === "redesign" || route === "platform";
  const nearTerm = timeline === "now" || timeline === "one-three";
  if (score < 70 && structural && commercialGoal && nearTerm) return "high";
  if ((score >= 70 && score <= 84) || timeline === "now" || timeline === "one-three" || timeline === "three-six") return "medium";
  return "nurture";
}

function textField(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeUtm(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
    .flatMap((key) => typeof input[key] === "string" ? [[key, textField(input[key], 160)]] : []));
}

function safeEventDetail(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 12).flatMap(([key, item]) => {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 50);
    if (!safeKey) return [];
    if (typeof item === "string") return [[safeKey, item.slice(0, 200)]];
    if (typeof item === "number" && Number.isFinite(item)) return [[safeKey, item]];
    if (typeof item === "boolean" || item === null) return [[safeKey, item]];
    return [];
  }));
}

async function saveAuditLead(audit: Record<string, unknown>, body: Record<string, unknown>): Promise<void> {
  if (!admin) throw new AuditError("service_unavailable", "Lead capture is temporarily unavailable.", 503);
  if (audit.ruleset_version !== RULESET_VERSION) throw new AuditError("report_version_unsupported", "This report can no longer be submitted.", 409);
  const observation = audit.observation as Observation | null;
  if (!observation?.pages?.length) throw new AuditError("audit_incomplete", "The audit is not complete.", 409);

  const name = textField(body.name, 160);
  const workEmail = textField(body.workEmail, 254).toLowerCase();
  const company = textField(body.company, 200);
  const context = textField(body.projectContext, 1_600);
  const pathway = typeof body.pathway === "string" && ["improve", "ux", "redesign", "platform"].includes(body.pathway)
    ? body.pathway as OpportunityRoute
    : null;
  const timeline = typeof body.timeline === "string" && LEAD_TIMELINES.includes(body.timeline as LeadTimeline)
    ? body.timeline as LeadTimeline
    : null;
  if (!name || !company || !workEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(workEmail) || !pathway || !timeline || body.consent !== true) {
    throw new AuditError("lead_invalid", "Complete the required contact fields and consent.", 400);
  }
  enforceWorkerRateLimit(`lead:${String(audit.id)}`, 3);
  await consumePersistentRateLimit("website-audit-lead", String(audit.id), 6);

  const answers = safeAnswers(audit.answers);
  const report = scoreAudit(observation, answers);
  const language: AuditLanguage = body.language === "es" ? "es" : "en";
  const copy = auditCopyFor(language);
  const temperature = leadTemperature(report.overallScore, report.opportunityRoute, timeline, answers);
  const consentedAt = new Date().toISOString();
  const topChecks = [report.priorityPlan.fixNow, report.priorityPlan.planNext, report.priorityPlan.protect]
    .filter((check): check is AuditCheck => check !== null);
  const timelineLabel = copy.lead.timelines.find((item) => item.value === timeline)?.label ?? timeline;
  const businessLabel = copy.context.businessTypes.find((item) => item.value === answers.businessType)?.label ?? answers.businessType;
  const routeCopy = copy.routes[pathway];
  const planSummary = [
    { label: copy.results.opportunityScore, value: `${report.overallScore} / 100 · ${copy.bands[report.band].label}` },
    ...Object.values(report.dimensions).map((dimension) => ({
      label: copy.dimensions[dimension.key].label,
      value: `${dimension.score} / 100`,
    })),
    ...(report.priorityPlan.fixNow ? [{ label: copy.results.fixNow, value: copy.rules[report.priorityPlan.fixNow.ruleId].title }] : []),
    ...(report.priorityPlan.planNext ? [{ label: copy.results.planNext, value: copy.rules[report.priorityPlan.planNext.ruleId].title }] : []),
    ...(report.priorityPlan.protect ? [{ label: copy.results.protect, value: copy.rules[report.priorityPlan.protect.ruleId].title }] : []),
  ];
  const trustedSummary = {
    rulesetVersion: report.version,
    overallScore: report.overallScore,
    dimensions: Object.fromEntries(Object.entries(report.dimensions).map(([key, value]) => [key, value.score])),
    topRuleIds: topChecks.map((check) => check.ruleId),
    recommendedRoute: report.opportunityRoute,
    requestedRoute: pathway,
    leadTemperature: temperature,
    answers,
    utm: safeUtm(body.utm),
  };

  const notificationPayload = {
    source: "website-audit",
    lang: language,
    event_type: routeCopy.label,
    services: topChecks.map((check) => copy.rules[check.ruleId].title),
    industry: businessLabel || null,
    event_timeframe: timelineLabel,
    // `av_leads.event_date` is a date column. Sending the audit id here made
    // every audit lead fail its insert with an invalid-date error, silently, so
    // no audit lead ever reached the CRM. The id travels in `audit_summary` and
    // in the message body instead, where it is readable and correctly typed.
    event_date: null,
    venue: report.url,
    attendees: `${report.overallScore} / 100`,
    contact_name: name,
    contact_email: workEmail,
    company,
    message: [
      `${copy.context.audience}: ${answers.audience}`,
      `${copy.lead.pathway}: ${routeCopy.label}`,
      context ? `${copy.lead.context}: ${context}` : null,
      `Audit ID: ${audit.id}`,
      `Internal lead temperature: ${temperature}`,
    ].filter(Boolean).join("\n"),
    plan_summary: planSummary,
    audit_summary: trustedSummary,
    consent_record: { acceptedAt: consentedAt, version: "website-audit-contact-v1", language },
  };

  const { data: leadRows, error: insertError } = await admin.rpc("create_website_audit_lead", {
    p_audit_id: audit.id,
    p_name: name,
    p_work_email: workEmail,
    p_company: company,
    p_preferred_pathway: pathway,
    p_timeline: timeline,
    p_project_context: context || null,
    p_consented_at: consentedAt,
    p_lead_temperature: temperature,
    p_source_data: trustedSummary,
    p_notification_payload: notificationPayload,
  });
  const leadRow = Array.isArray(leadRows) ? leadRows[0] as { lead_id?: string; created?: boolean } | undefined : undefined;
  if (insertError || !leadRow?.lead_id) {
    console.error("website_audit_leads atomic insert failed", insertError?.message ?? "missing lead id");
    throw new AuditError("lead_save_failed", "Your request could not be saved. Please try again.", 500);
  }

  if (leadRow.created) {
    await admin.from("website_audit_events").insert({
      audit_id: audit.id,
      event_name: "lead_submitted",
      detail: { route: pathway, recommendedRoute: report.opportunityRoute, timeline, temperature },
    });
  }

  scheduleBackground(deliverAuditLeadNotification(leadRow.lead_id));
}

function scheduleBackground(promise: Promise<unknown>): void {
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
  else promise.catch((error) => console.error("website audit background task failed", error));
}

async function deliverAuditLeadNotification(leadId: string): Promise<void> {
  if (!admin) return;
  const { data: claimRows, error: claimError } = await admin.rpc("claim_website_audit_lead_notification", {
    p_lead_id: leadId,
  });
  const claim = Array.isArray(claimRows)
    ? claimRows[0] as {
      lead_id?: string;
      notification_payload?: Record<string, unknown>;
      notification_attempts?: number;
      lease_token?: string;
    } | undefined
    : undefined;
  if (claimError) {
    console.error("website audit outbox claim failed", claimError.message);
    return;
  }
  if (!claim?.lead_id || !claim.notification_payload || !claim.lease_token) return;

  const bridgeController = new AbortController();
  const bridgeTimeout = setTimeout(() => bridgeController.abort(), 20_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-av-lead`, {
      method: "POST",
      signal: bridgeController.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ ...claim.notification_payload, idempotency_key: claim.lead_id }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const { data, error } = await admin.from("website_audit_leads").update({
      notification_status: "delivered",
      notification_last_error: null,
      notification_lease_token: null,
      notified_at: new Date().toISOString(),
    })
      .eq("id", claim.lead_id)
      .eq("notification_status", "processing")
      .eq("notification_lease_token", claim.lease_token)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`outbox acknowledgement failed: ${error.message}`);
    if (!data) throw new Error("outbox lease was superseded before acknowledgement");
  } catch (error) {
    const attempts = Math.max(1, Number(claim.notification_attempts) || 1);
    const retryDelayMs = Math.min(6 * 60 * 60_000, 60_000 * (2 ** Math.min(8, attempts - 1)));
    const message = error instanceof Error ? error.message : String(error);
    console.error("submit-av-lead outbox delivery failed", message);
    const { error: retryError } = await admin.from("website_audit_leads").update({
      notification_status: "retry",
      notification_last_error: message.slice(0, 500),
      notification_lease_token: null,
      next_notification_at: new Date(Date.now() + retryDelayMs).toISOString(),
    })
      .eq("id", claim.lead_id)
      .eq("notification_status", "processing")
      .eq("notification_lease_token", claim.lease_token);
    if (retryError) console.error("website audit outbox retry update failed", retryError.message);
  } finally {
    clearTimeout(bridgeTimeout);
  }
}

let lastOutboxSweep = 0;

async function drainAuditLeadOutbox(): Promise<void> {
  if (!admin) return;
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const [dueResult, staleResult] = await Promise.all([
    admin.from("website_audit_leads").select("id")
      .in("notification_status", ["pending", "retry"])
      .lte("next_notification_at", now)
      .order("next_notification_at", { ascending: true })
      .limit(3),
    admin.from("website_audit_leads").select("id")
      .eq("notification_status", "processing")
      .lte("notification_last_attempt_at", stale)
      .order("notification_last_attempt_at", { ascending: true })
      .limit(2),
  ]);
  if (dueResult.error) console.error("website audit outbox scan failed", dueResult.error.message);
  if (staleResult.error) console.error("website audit stale outbox scan failed", staleResult.error.message);
  const ids = [...new Set([...(dueResult.data ?? []), ...(staleResult.data ?? [])].map((row) => String(row.id)))];
  await Promise.allSettled(ids.map(deliverAuditLeadNotification));
}

function scheduleOutboxSweep(): void {
  if (!admin || Date.now() - lastOutboxSweep < 30_000) return;
  lastOutboxSweep = Date.now();
  scheduleBackground(drainAuditLeadOutbox());
}

// ---------------------------------------------------------------------------
// "Email me my report"
// ---------------------------------------------------------------------------

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string);

/**
 * The portable result link. The access token rides in the URL fragment, which
 * browsers never put on the wire, so it stays out of server logs, proxies, and
 * the `Referer` header of anything the reader clicks next.
 */
function reportUrlFor(language: InterfaceLanguage, auditId: string, accessToken: string): string {
  const path = language === "es"
    ? "/es/tools/auditoria-de-oportunidades-web/resultados"
    : "/en/tools/website-opportunity-audit/results";
  return `${PUBLIC_SITE_URL}${path}/${auditId}#access_token=${encodeURIComponent(accessToken)}`;
}

/** The one-click stop link carried by every report email. */
const stopUrlFor = (sendId: string): string =>
  `${SUPABASE_URL}/functions/v1/website-audit?stop=${encodeURIComponent(sendId)}`;

/**
 * Files the address as a contact that is deliberately not a lead.
 *
 * The tag is its own (`Website Audit Report Sent`, never `Website Audit Lead`),
 * so lead reporting and follow-up queues never silently absorb people whose only
 * action was to save a document about their own website. `pipeline_stage` stays
 * at the schema default: the CRM pipeline board renders one column per known
 * stage and filters contacts into it, so inventing a stage here would file these
 * contacts into a column that does not exist and make them invisible.
 *
 * The marker in the note makes a repeat send idempotent rather than appending
 * the same paragraph to a contact every time.
 */
async function syncReportContactToCrm(
  email: string,
  domain: string,
  score: number,
  sendId: string,
  language: InterfaceLanguage,
): Promise<void> {
  if (!admin) throw new Error("CRM client unavailable");
  const marker = `[Audit report emailed: ${sendId}]`;
  const note = [
    marker,
    `Website Opportunity Audit report emailed${language === "es" ? " (Spanish)" : ""}`,
    `Website: ${domain}`,
    `Opportunity score: ${score} / 100`,
    "Asked for a copy of their own report. This is not a service enquiry.",
  ].join("\n");
  const tags = language === "es"
    ? ["Website Audit Report Sent", "Website", "Español"]
    : ["Website Audit Report Sent", "Website"];

  const { data: existing, error: lookupError } = await admin.from("contacts")
    .select("id, crm_notes, tags, website")
    .eq("org_id", CRM_ORG_ID)
    .eq("email", email)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    if (typeof existing.crm_notes === "string" && existing.crm_notes.includes(marker)) return;
    // An existing contact keeps its stage and its website. Someone already in
    // the pipeline must not be rewritten because they saved a report.
    const { error } = await admin.from("contacts").update({
      crm_notes: `${note}\n\n${existing.crm_notes ?? ""}`.trim(),
      tags: Array.from(new Set([...(existing.tags ?? []), ...tags])),
      website: existing.website || domain,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("contacts").insert({
    org_id: CRM_ORG_ID,
    // No name is collected: the whole point of this form is that it asks for one
    // field. The local part keeps the contact readable in a list view.
    first_name: email.split("@")[0].slice(0, 80),
    email,
    website: domain,
    source: "manual",
    source_id: sendId,
    tags,
    crm_notes: note,
  });
  if (error) throw new Error(error.message);
}

/** Renders one label/value line in the emailed summary. */
const reportRow = (label: string, value: string): string => `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid #ececec;font-size:12px;color:#6B7280;">${escapeHtml(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid #ececec;font-size:12px;font-weight:700;color:#111827;text-align:right;">${escapeHtml(value)}</td>
  </tr>`;

/**
 * The report email.
 *
 * Nothing the visitor typed is echoed back into the body. The only variable
 * content is the audited domain, which the crawler already validated and
 * fetched, and numbers this function computed. That is what keeps an endpoint
 * that mails arbitrary addresses from being usable to deliver arbitrary text.
 */
function reportEmailHtml(
  copy: ReturnType<typeof auditCopyFor>,
  domain: string,
  score: number,
  bandLabel: string,
  rows: { label: string; value: string }[],
  reportUrl: string,
  stopUrl: string,
): string {
  const t = copy.reportEmail;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px 0;">
    <table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:0 0 20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="52" height="52" style="display:block;border:0;width:52px;height:52px;"/></td></tr>
      <tr><td style="background:#fff;border-radius:14px;padding:32px;border:1px solid #e4e4e7;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(t.emailHeading)}</h1>
        <p style="margin:0 0 22px;font-size:14px;color:#374151;line-height:1.65;">${escapeHtml(t.emailIntro(domain))}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#FAFAFA;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 22px;">
          <tr><td style="padding:18px 18px 14px;text-align:center;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6B7280;">${escapeHtml(t.emailScoreLabel)}</p>
            <p style="margin:0;font-size:40px;font-weight:700;color:${BRAND_RED};line-height:1.1;">${score}<span style="font-size:15px;color:#9CA3AF;font-weight:400;"> / 100</span></p>
            <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#111827;">${escapeHtml(bandLabel)}</p>
          </td></tr>
        </table>

        ${rows.length === 0 ? "" : `
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;">${escapeHtml(t.emailPriorityHeading)}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          ${rows.map((entry) => reportRow(entry.label, entry.value)).join("")}
        </table>`}

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 6px;"><tr>
          <td style="border-radius:10px;background:${BRAND_RED};">
            <a href="${escapeHtml(reportUrl)}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;border-radius:10px;">${escapeHtml(t.emailCta)}</a>
          </td>
        </tr></table>
        <p style="margin:14px 0 0;font-size:11px;color:#9CA3AF;line-height:1.6;">${escapeHtml(t.emailExpiry)}</p>
      </td></tr>
      <tr><td align="center" style="padding:20px 8px 32px;font-size:11px;color:#9CA3AF;line-height:1.8;">
        ${escapeHtml(t.emailWhy)}<br/>
        <a href="${escapeHtml(stopUrl)}" style="color:#9CA3AF;text-decoration:underline;">${escapeHtml(t.emailStop)}</a><br/>
        LV Branding · Houston, TX
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function sendReportMail(to: string, subject: string, html: string): Promise<void> {
  if (!SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY is not configured");
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: REPORT_FROM_EMAIL, name: REPORT_FROM_NAME },
      reply_to: { email: REPORT_FROM_EMAIL, name: REPORT_FROM_NAME },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!response.ok) {
    throw new Error(`SendGrid responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/**
 * Mails a finished report to an address the visitor supplies, and records that
 * address in the CRM.
 *
 * Ordering matters: the mail goes out first and the CRM write follows. A failed
 * CRM write must not cost the visitor the thing they actually asked for, and it
 * is recoverable from `website_audit_report_sends` afterwards; a failed send
 * has to surface as an error while they are still looking at the form.
 */
async function emailAuditReport(audit: Record<string, unknown>, body: Record<string, unknown>): Promise<void> {
  if (!admin) throw new AuditError("service_unavailable", "Report delivery is temporarily unavailable.", 503);
  const observation = audit.observation as Observation | null;
  if (!observation?.pages?.length) throw new AuditError("audit_incomplete", "The audit is not complete.", 409);

  const email = textField(body.email, 254).toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AuditError("email_invalid", "Enter a valid email address.", 400);
  }

  const auditId = String(audit.id);
  const accessToken = textField(body.accessToken, 160);
  const language: InterfaceLanguage = body.language === "es" ? "es" : "en";
  const copy = auditCopyFor(language);

  enforceWorkerRateLimit(`report-email:${auditId}`, 3);
  await consumePersistentRateLimit("website-audit-report-email", auditId, 6);

  // Someone who has asked us to stop is never written to again, whoever types
  // their address and for whatever reason.
  const emailHash = await hashToken(`email:${email}`);
  const { data: suppressed } = await admin.from("email_suppressions")
    .select("email_hash").eq("email_hash", emailHash).maybeSingle();
  if (suppressed) {
    // Reported as success. Telling the sender that this specific address has
    // opted out would turn the endpoint into a way to test whether it has.
    return;
  }

  const { data: reservationRows, error: reservationError } = await admin.rpc("reserve_website_audit_report_send", {
    p_audit_id: auditId,
    p_email: email,
    p_language: language,
    p_max_per_audit: MAX_REPORT_SENDS_PER_AUDIT,
  });
  const reservation = Array.isArray(reservationRows)
    ? reservationRows[0] as { send_id?: string; created?: boolean; over_limit?: boolean } | undefined
    : undefined;
  if (reservationError) {
    console.error("website audit report send reservation failed", reservationError.message);
    throw new AuditError("report_email_failed", "The report could not be sent. Please try again.", 500);
  }
  if (reservation?.over_limit) {
    throw new AuditError("report_email_limit", "This report has already been emailed several times.", 429);
  }
  if (!reservation?.send_id) {
    throw new AuditError("report_email_failed", "The report could not be sent. Please try again.", 500);
  }
  const sendId = reservation.send_id;

  const report = scoreAudit(observation, safeAnswers(audit.answers));
  const domain = observation.normalizedDomain || observation.finalUrl;
  const rows = [
    report.priorityPlan.fixNow && { label: copy.results.fixNow, value: copy.rules[report.priorityPlan.fixNow.ruleId].title },
    report.priorityPlan.planNext && { label: copy.results.planNext, value: copy.rules[report.priorityPlan.planNext.ruleId].title },
    report.priorityPlan.protect && { label: copy.results.protect, value: copy.rules[report.priorityPlan.protect.ruleId].title },
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  try {
    await sendReportMail(
      email,
      copy.reportEmail.emailSubject(domain),
      reportEmailHtml(
        copy,
        domain,
        report.overallScore,
        copy.bands[report.band].label,
        rows,
        reportUrlFor(language, auditId, accessToken),
        stopUrlFor(sendId),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("website audit report email failed", message);
    await admin.from("website_audit_report_sends")
      .update({ last_error: message.slice(0, 500) }).eq("id", sendId);
    throw new AuditError("report_email_failed", "The report could not be sent. Please try again.", 502);
  }
  await admin.from("website_audit_report_sends")
    .update({ email_sent_at: new Date().toISOString(), last_error: null }).eq("id", sendId);

  await admin.from("website_audit_events").insert({
    audit_id: auditId,
    event_name: "report_emailed",
    detail: { language, score: report.overallScore, resend: reservation.created === false },
  });

  // The CRM write is the part that can be repaired later, so it runs last and
  // never turns a delivered report into a visible failure.
  try {
    await syncReportContactToCrm(email, domain, report.overallScore, sendId, language);
    await admin.from("website_audit_report_sends")
      .update({ crm_synced_at: new Date().toISOString() }).eq("id", sendId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("website audit report CRM sync failed", message);
    await admin.from("website_audit_report_sends")
      .update({ last_error: `crm: ${message}`.slice(0, 500) }).eq("id", sendId);
  }
}

/** The page behind the stop link in a report email. */
function stopResponse(language: InterfaceLanguage, ok: boolean): Response {
  const t = auditCopyFor(language).reportEmail;
  const html = `<!DOCTYPE html><html lang="${language}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(ok ? t.stopHeading : t.stopInvalid)}</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:14vh auto;padding:32px;background:#fff;border:1px solid #e4e4e7;border-radius:14px;">
    <h1 style="margin:0 0 10px;font-size:18px;color:#111827;">${escapeHtml(ok ? t.stopHeading : t.stopInvalid)}</h1>
    ${ok ? `<p style="margin:0;font-size:14px;line-height:1.65;color:#374151;">${escapeHtml(t.stopBody)}</p>` : ""}
  </div>
</body></html>`;
  return new Response(html, {
    status: ok ? 200 : 404,
    headers: { ...cors, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Honors the stop link. The send id is an unguessable UUID that only reaches the
 * inbox that received the mail, so possessing it is the authorization.
 */
async function handleStopRequest(sendId: string): Promise<Response> {
  if (!admin || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sendId)) {
    return stopResponse("en", false);
  }
  const { data, error } = await admin.from("website_audit_report_sends")
    .select("email, interface_language").eq("id", sendId).maybeSingle();
  if (error || !data?.email) return stopResponse("en", false);
  const language: InterfaceLanguage = data.interface_language === "es" ? "es" : "en";
  const emailHash = await hashToken(`email:${String(data.email).toLowerCase()}`);
  const { error: suppressError } = await admin.from("email_suppressions")
    .upsert({ email_hash: emailHash, reason: "website-audit-report" }, { onConflict: "email_hash" });
  if (suppressError) {
    console.error("website audit suppression failed", suppressError.message);
    return stopResponse(language, false);
  }
  return stopResponse(language, true);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // The stop link is followed from an email client, so it has to be a plain GET
  // with no key and no JSON body.
  if (req.method === "GET") {
    const stop = new URL(req.url).searchParams.get("stop");
    if (stop) return await handleStopRequest(stop);
    return json({ error: "Method not allowed" }, 405);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await readRequestJson(req);
  } catch (error) {
    if (error instanceof AuditError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = body.action;

  try {
    await sweepExpiredAudits();
    if (action === "drain") {
      if (!await authorizedDrain(req)) {
        return json({ error: "Forbidden" }, 403);
      }
      await drainAuditLeadOutbox();
      return json({ ok: true });
    }
    scheduleOutboxSweep();
    if (action === "landing") {
      const requestKey = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
      enforceWorkerRateLimit(`landing:${requestKey}`, 30);
      await consumePersistentRateLimit("website-audit-landing", requestKey, 30);
      if (admin) await admin.from("website_audit_events").insert({
        audit_id: null,
        event_name: "landing_view",
        detail: { language: body.language === "es" ? "es" : "en", utm: safeUtm(body.utm) },
      });
      return json({ ok: true });
    }
    if (action === "run") {
      if (body.termsAccepted !== true) return json({ error: "Accept the audit terms before continuing.", code: "terms_required" }, 400);
      const interfaceLanguage: InterfaceLanguage = body.interfaceLanguage === "es" ? "es" : "en";
      const requestKey = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
      const observation = await runAudit(body.url, body.answers, interfaceLanguage, requestKey);
      return json({ observation });
    }
    if (action === "get") {
      const audit = await authorizedAudit(body.auditId, body.accessToken);
      if (!audit || !audit.observation) return json({ error: "Audit not found" }, 404);
      if (audit.ruleset_version !== RULESET_VERSION) {
        return json({ error: "This result was created with an unsupported audit version.", code: "report_version_unsupported" }, 409);
      }
      const observation = { ...(audit.observation as Observation), accessToken: body.accessToken, answers: audit.answers };
      return json({ observation });
    }
    if (action === "event") {
      const audit = await authorizedAudit(body.auditId, body.accessToken);
      if (!audit) return json({ error: "Audit not found" }, 404);
      await consumePersistentRateLimit("website-audit-event", String(audit.id), 60);
      const event = typeof body.event === "string" ? body.event.slice(0, 80) : "unknown";
      const allowed = new Set(["results_viewed", "finding_expanded", "service_cta_clicked"]);
      if (!allowed.has(event)) return json({ error: "Unsupported event" }, 400);
      const detail = safeEventDetail(body.detail);
      if (admin) await admin.from("website_audit_events").insert({ audit_id: body.auditId, event_name: event, detail });
      return json({ ok: true });
    }
    if (action === "lead") {
      if (textField(body.hp, 200)) return json({ ok: true });
      const audit = await authorizedAudit(body.auditId, body.accessToken);
      if (!audit) return json({ error: "Audit not found" }, 404);
      await saveAuditLead(audit, body);
      return json({ ok: true });
    }
    if (action === "email_report") {
      if (textField(body.hp, 200)) return json({ ok: true });
      const audit = await authorizedAudit(body.auditId, body.accessToken);
      if (!audit) return json({ error: "Audit not found" }, 404);
      await emailAuditReport(audit, body);
      return json({ ok: true });
    }
    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    if (error instanceof AuditError) return json({ error: error.message, code: error.code }, error.status);
    console.error("website-audit unexpected error", error);
    return json({ error: "The audit could not be completed." }, 500);
  }
});
