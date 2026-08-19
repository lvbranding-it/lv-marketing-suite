/**
 * Removes markup that is explicitly non-rendered before evidence extraction.
 * This is a small, dependency-free tokenizer for the audit worker, not a browser
 * layout engine. It intentionally defaults closed for raw/template subtrees and
 * explicit HTML/ARIA/inline-style hiding signals.
 */

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const NON_RENDERED_ELEMENTS = new Set(["script", "style", "noscript", "template", "svg"]);
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "noscript", "textarea", "title"]);

/** Hard parser limits keep hostile markup bounded below the fetch-size ceiling. */
export const MAX_HTML_NODES = 20_000;
export const MAX_HTML_TOKENS = 40_000;
export const MAX_HTML_DEPTH = 256;
const MAX_HTML_TAG_LENGTH = 16_384;

export interface HtmlElementNode {
  index: number;
  name: string;
  openStart: number;
  openEnd: number;
  contentStart: number;
  contentEnd: number | null;
  closeEnd: number | null;
  parentIndex: number | null;
  closed: boolean;
}

export interface ParsedHtmlDocument {
  source: string;
  nodes: HtmlElementNode[];
  nodesByName: ReadonlyMap<string, readonly HtmlElementNode[]>;
  tokenCount: number;
  truncated: boolean;
}

function attribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : null;
}

function hasBooleanAttribute(tag: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\s${escaped}(?:\\s*=|\\s|/?>)`, "i").test(tag);
}

function openingTagIsHidden(tag: string, name: string, interactiveOnly: boolean, keepJsonLd: boolean): boolean {
  const visibleJsonLd = keepJsonLd && name === "script" &&
    (attribute(tag, "type") ?? "").toLowerCase() === "application/ld+json";
  if ((NON_RENDERED_ELEMENTS.has(name) && !visibleJsonLd) || hasBooleanAttribute(tag, "hidden")) return true;
  if ((attribute(tag, "aria-hidden") ?? "").toLowerCase() === "true") return true;
  const style = (attribute(tag, "style") ?? "").toLowerCase().replace(/\s+/g, "");
  if (/(?:^|;)(?:display:none|visibility:hidden|content-visibility:hidden)(?:;|$)/.test(style)) return true;
  return interactiveOnly && (
    hasBooleanAttribute(tag, "inert") ||
    hasBooleanAttribute(tag, "disabled") ||
    (attribute(tag, "aria-disabled") ?? "").toLowerCase() === "true"
  );
}

interface StackEntry {
  name: string;
  suppressed: boolean;
}

interface ClosingTagSpan {
  start: number;
  end: number;
}

function tagEnd(source: string, start: number): number {
  const limit = Math.min(source.length, start + MAX_HTML_TAG_LENGTH);
  let quote = "";
  for (let cursor = start + 1; cursor < limit; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor + 1;
    }
  }
  return -1;
}

function tagNameAt(source: string, start: number): { closing: boolean; name: string } | null {
  let cursor = start + 1;
  const closing = source[cursor] === "/";
  if (closing) cursor += 1;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  if (!/[a-z]/i.test(source[cursor] ?? "")) return null;
  const nameStart = cursor;
  while (cursor < source.length && /[\w:-]/.test(source[cursor])) cursor += 1;
  return { closing, name: source.slice(nameStart, cursor).toLowerCase() };
}

function findClosingTag(source: string, name: string, from: number): ClosingTagSpan | null {
  let candidate = source.indexOf("</", from);
  while (candidate >= 0) {
    const parsed = tagNameAt(source, candidate);
    if (parsed?.closing && parsed.name === name) {
      const end = tagEnd(source, candidate);
      if (end >= 0) return { start: candidate, end };
      return null;
    }
    candidate = source.indexOf("</", candidate + 2);
  }
  return null;
}

function isSelfClosingTag(source: string, start: number, end: number): boolean {
  let cursor = end - 2;
  while (cursor > start && /\s/.test(source[cursor])) cursor -= 1;
  return source[cursor] === "/";
}

function filteredHtml(source: string, interactiveOnly: boolean, keepJsonLd = false): string {
  const stack: StackEntry[] = [];
  let suppressedDepth = 0;
  let cursor = 0;
  let tokenCount = 0;
  let nodeCount = 0;
  const output: string[] = [];

  while (cursor < source.length) {
    const rawParent = stack[stack.length - 1]?.name;
    if (rawParent && RAW_TEXT_ELEMENTS.has(rawParent)) {
      const close = findClosingTag(source, rawParent, cursor);
      if (!close) break;
      if (suppressedDepth === 0) output.push(source.slice(cursor, close.end));
      cursor = close.end;
      tokenCount += 1;
      if (tokenCount > MAX_HTML_TOKENS) break;
      const entry = stack.pop();
      if (entry?.suppressed) suppressedDepth -= 1;
      continue;
    }

    const index = source.indexOf("<", cursor);
    if (index < 0) {
      if (suppressedDepth === 0) output.push(source.slice(cursor));
      break;
    }
    if (suppressedDepth === 0) output.push(source.slice(cursor, index));

    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      cursor = end < 0 ? source.length : end + 3;
      tokenCount += 1;
      if (tokenCount > MAX_HTML_TOKENS) break;
      continue;
    }
    if (!/^<\/?\s*[a-z]|^<!/i.test(source.slice(index, index + 12))) {
      if (suppressedDepth === 0) output.push("<");
      cursor = index + 1;
      continue;
    }

    const end = tagEnd(source, index);
    if (end < 0) {
      // A syntactically plausible but overlong/unclosed tag makes the remainder
      // ambiguous. Stop closed instead of turning hidden markup into evidence.
      break;
    }
    const token = source.slice(index, end);
    cursor = end;
    tokenCount += 1;
    if (tokenCount > MAX_HTML_TOKENS) break;
    if (/^<!/.test(token)) continue;

    const parsed = tagNameAt(token, 0);
    if (!parsed) continue;
    const { closing, name } = parsed;

    if (closing) {
      let match = -1;
      for (let position = stack.length - 1; position >= 0; position -= 1) {
        if (stack[position]?.name === name) { match = position; break; }
      }
      // An unmatched closer is inert. In particular, it must never unwind a
      // hidden ancestor and make the remainder of that subtree observable.
      if (match < 0) continue;
      let entry: StackEntry | undefined;
      while (stack.length > match) {
        entry = stack.pop();
        if (entry?.suppressed) suppressedDepth -= 1;
      }
      if (suppressedDepth === 0 && !entry?.suppressed) output.push(token);
      continue;
    }

    nodeCount += 1;
    if (nodeCount > MAX_HTML_NODES) break;
    const suppressed = suppressedDepth > 0 || openingTagIsHidden(token, name, interactiveOnly, keepJsonLd);
    if (!suppressed) output.push(token);
    const selfClosing = isSelfClosingTag(source, index, end) || VOID_ELEMENTS.has(name);
    if (!selfClosing) {
      if (stack.length >= MAX_HTML_DEPTH) break;
      stack.push({ name, suppressed });
      if (suppressed) suppressedDepth += 1;
    }
  }
  return output.join("");
}

export function observableHtml(source: string): string {
  return filteredHtml(source, false);
}

/** Visible markup with disabled/inert interaction subtrees removed as well. */
export function interactiveHtml(source: string): string {
  return filteredHtml(source, true);
}

/** Keeps JSON-LD scripts only when they are outside non-rendered containers. */
export function machineReadableHtml(source: string): string {
  return filteredHtml(source, false, true);
}

/**
 * A bounded, offset-based HTML parser for audit evidence extraction. It is not
 * an HTML5 tree builder; explicit closing tags define paired elements, while
 * malformed or over-limit input is safely truncated. Every source character is
 * scanned at most a constant number of times and subtree strings are not copied.
 */
export function parseHtmlDocument(source: string): ParsedHtmlDocument {
  const nodes: HtmlElementNode[] = [];
  const mutableByName = new Map<string, HtmlElementNode[]>();
  const stack: number[] = [];
  let cursor = 0;
  let tokenCount = 0;
  let truncated = false;

  while (cursor < source.length) {
    const index = source.indexOf("<", cursor);
    if (index < 0) break;

    if (source.startsWith("<!--", index)) {
      const commentEnd = source.indexOf("-->", index + 4);
      tokenCount += 1;
      if (tokenCount > MAX_HTML_TOKENS) { truncated = true; break; }
      cursor = commentEnd < 0 ? source.length : commentEnd + 3;
      continue;
    }

    const parsed = tagNameAt(source, index);
    if (!parsed) {
      if (source.startsWith("<!", index)) {
        const declarationEnd = tagEnd(source, index);
        if (declarationEnd < 0) { truncated = true; break; }
        tokenCount += 1;
        if (tokenCount > MAX_HTML_TOKENS) { truncated = true; break; }
        cursor = declarationEnd;
      } else {
        cursor = index + 1;
      }
      continue;
    }

    const end = tagEnd(source, index);
    if (end < 0) {
      truncated = true;
      break;
    }
    tokenCount += 1;
    if (tokenCount > MAX_HTML_TOKENS) { truncated = true; break; }
    cursor = end;

    if (parsed.closing) {
      let match = -1;
      for (let position = stack.length - 1; position >= 0; position -= 1) {
        if (nodes[stack[position]]?.name === parsed.name) { match = position; break; }
      }
      if (match < 0) continue;
      while (stack.length > match) {
        const nodeIndex = stack.pop()!;
        if (stack.length === match) {
          const node = nodes[nodeIndex];
          node.contentEnd = index;
          node.closeEnd = end;
          node.closed = true;
        }
      }
      continue;
    }

    if (nodes.length >= MAX_HTML_NODES || stack.length >= MAX_HTML_DEPTH) {
      truncated = true;
      break;
    }
    const node: HtmlElementNode = {
      index: nodes.length,
      name: parsed.name,
      openStart: index,
      openEnd: end,
      contentStart: end,
      contentEnd: null,
      closeEnd: null,
      parentIndex: stack[stack.length - 1] ?? null,
      closed: false,
    };
    nodes.push(node);
    const named = mutableByName.get(node.name);
    if (named) named.push(node);
    else mutableByName.set(node.name, [node]);

    const selfClosing = isSelfClosingTag(source, index, end) || VOID_ELEMENTS.has(node.name);
    if (selfClosing) {
      node.contentEnd = end;
      node.closeEnd = end;
      node.closed = true;
      continue;
    }

    if (RAW_TEXT_ELEMENTS.has(node.name)) {
      const close = findClosingTag(source, node.name, end);
      if (!close) {
        truncated = true;
        break;
      }
      tokenCount += 1;
      if (tokenCount > MAX_HTML_TOKENS) { truncated = true; break; }
      node.contentEnd = close.start;
      node.closeEnd = close.end;
      node.closed = true;
      cursor = close.end;
      continue;
    }

    stack.push(node.index);
  }

  return { source, nodes, nodesByName: mutableByName, tokenCount, truncated };
}

export function htmlNodes(document: ParsedHtmlDocument, name: string): readonly HtmlElementNode[] {
  return document.nodesByName.get(name.toLowerCase()) ?? [];
}

export function htmlOpeningTag(document: ParsedHtmlDocument, node: HtmlElementNode): string {
  return document.source.slice(node.openStart, node.openEnd);
}

export function htmlInner(document: ParsedHtmlDocument, node: HtmlElementNode, maximum = Number.POSITIVE_INFINITY): string {
  if (!node.closed || node.contentEnd === null) return "";
  return document.source.slice(node.contentStart, Math.min(node.contentEnd, node.contentStart + Math.max(0, maximum)));
}

export const MAX_HTML_EVIDENCE_CHARACTERS = 2_000_000;

export interface HtmlExtractionBudget {
  readonly consumed: number;
  readonly remaining: number;
  inner(document: ParsedHtmlDocument, node: HtmlElementNode, maximum?: number): string;
  slice(source: string, start: number, end: number, maximum?: number): string;
}

/** Caps the aggregate subtree text handed to synchronous evidence extraction. */
export function createHtmlExtractionBudget(maximum = MAX_HTML_EVIDENCE_CHARACTERS): HtmlExtractionBudget {
  const limit = Math.max(0, Math.floor(maximum));
  let consumed = 0;
  const take = (source: string, start: number, end: number, maximumPerRead: number): string => {
    const safeStart = Math.max(0, Math.min(source.length, start));
    const safeEnd = Math.max(safeStart, Math.min(source.length, end));
    const available = Math.max(0, limit - consumed);
    const length = Math.min(safeEnd - safeStart, Math.max(0, maximumPerRead), available);
    consumed += length;
    return source.slice(safeStart, safeStart + length);
  };
  return {
    get consumed() { return consumed; },
    get remaining() { return Math.max(0, limit - consumed); },
    inner(document, node, maximumPerRead = Number.POSITIVE_INFINITY) {
      if (!node.closed || node.contentEnd === null) return "";
      return take(document.source, node.contentStart, node.contentEnd, maximumPerRead);
    },
    slice(source, start, end, maximumPerRead = Number.POSITIVE_INFINITY) {
      return take(source, start, end, maximumPerRead);
    },
  };
}

export function htmlOuter(document: ParsedHtmlDocument, node: HtmlElementNode, maximum = Number.POSITIVE_INFINITY): string {
  const naturalEnd = node.closed && node.closeEnd !== null ? node.closeEnd : node.openEnd;
  return document.source.slice(node.openStart, Math.min(naturalEnd, node.openStart + Math.max(0, maximum)));
}

export function htmlHasAncestor(
  document: ParsedHtmlDocument,
  node: HtmlElementNode,
  predicate: (candidate: HtmlElementNode) => boolean,
): boolean {
  let parentIndex = node.parentIndex;
  let depth = 0;
  while (parentIndex !== null && depth < MAX_HTML_DEPTH) {
    const parent = document.nodes[parentIndex];
    if (!parent) return false;
    if (predicate(parent)) return true;
    parentIndex = parent.parentIndex;
    depth += 1;
  }
  return false;
}

/** Removes tags in one forward pass, optionally substituting image alt text. */
export function stripHtmlTags(source: string, includeImageAlternatives = false): string {
  const output: string[] = [];
  let cursor = 0;
  let tokenCount = 0;
  while (cursor < source.length) {
    const index = source.indexOf("<", cursor);
    if (index < 0) {
      output.push(source.slice(cursor));
      break;
    }
    output.push(source.slice(cursor, index));
    if (source.startsWith("<!--", index)) {
      const commentEnd = source.indexOf("-->", index + 4);
      cursor = commentEnd < 0 ? source.length : commentEnd + 3;
      continue;
    }
    const parsed = tagNameAt(source, index);
    if (!parsed && !source.startsWith("<!", index)) {
      output.push("<");
      cursor = index + 1;
      continue;
    }
    const end = tagEnd(source, index);
    if (end < 0) {
      break;
    }
    if (includeImageAlternatives && !parsed?.closing && parsed?.name === "img") {
      output.push(" ", attribute(source.slice(index, end), "alt") ?? "", " ");
    } else {
      output.push(" ");
    }
    cursor = end;
    tokenCount += 1;
    if (tokenCount >= MAX_HTML_TOKENS) break;
  }
  return output.join("");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù",
  acirc: "â", ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û",
  atilde: "ã", otilde: "õ", ccedil: "ç", iquest: "¿", iexcl: "¡",
  laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", middot: "·",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[\da-f]+|[a-z][\da-z]+);/gi, (literal, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : literal;
    }
    const decoded = NAMED_ENTITIES[entity.toLowerCase()];
    if (!decoded) return literal;
    return /^[A-Z]/.test(entity) && /^\p{Ll}$/u.test(decoded) ? decoded.toUpperCase() : decoded;
  });
}

function normalizedEncoding(label: string | null): string | null {
  if (!label) return null;
  const clean = label.trim().toLowerCase().replace(/["']/g, "");
  if (["utf8", "utf-8"].includes(clean)) return "utf-8";
  if (["iso-8859-1", "latin1", "latin-1", "windows-1252", "cp1252", "us-ascii"].includes(clean)) return "windows-1252";
  if (["utf-16", "utf-16le"].includes(clean)) return "utf-16le";
  if (clean === "utf-16be") return "utf-16be";
  return null;
}

export function decodeHtmlBytes(bytes: Uint8Array, contentType = ""): string {
  let encoding: string | null = null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) encoding = "utf-8";
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";

  encoding ??= normalizedEncoding(contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? null);
  if (!encoding) {
    const preview = String.fromCharCode(...bytes.slice(0, 2_048));
    const metaLabel = preview.match(/<meta\b[^>]*\bcharset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1] ??
      preview.match(/<meta\b[^>]*\bcontent\s*=\s*["'][^"']*charset\s*=\s*([^\s;"']+)/i)?.[1] ?? null;
    encoding = normalizedEncoding(metaLabel);
  }
  try {
    return new TextDecoder(encoding ?? "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

export function supportsMobileViewport(content: string): boolean {
  const viewport = content.toLowerCase().replace(/\s+/g, "");
  const maximumScale = Number(viewport.match(/maximum-scale=([\d.]+)/)?.[1] ?? Number.NaN);
  return /(?:^|[,;])width=device-width(?:[,;]|$)/.test(viewport) &&
    !/(?:^|[,;])user-scalable=(?:no|0)(?:[,;]|$)/.test(viewport) &&
    (!Number.isFinite(maximumScale) || maximumScale >= 2);
}
