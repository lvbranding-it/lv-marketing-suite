/**
 * Readable forms of the structured values in a brand snapshot.
 *
 * Agents often record lists of things rather than single facts — a studio's
 * service menu with prices, membership tiers, target countries, contacts. The
 * panel and the exports rendered every one of those items with JSON.stringify,
 * so a price list arrived as {"name":"Signature cut","price":85}. This turns
 * each item into a title and labelled fields, and a list of flat items into a
 * table when there is room for one.
 */

export type SnapshotRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is SnapshotRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Fields that name the item, in the order they are preferred as its title. */
const TITLE_KEYS = ["name", "title", "label", "tier", "company", "product", "service", "pais", "country", "id"];

/** Strip the Markdown markers agents leave in values: bold, code, headings. */
export function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/**
 * "key_features" → "Key features". Keys are written for code; labels are read.
 * A key already in capitals is an acronym (LATAM, URL, CTA) and keeps them.
 */
export function humanLabel(key: string): string {
  if (/^[A-Z0-9_]+$/.test(key)) return key.replace(/_/g, " ").trim();
  const spaced = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** A value that can be written on one line, or null when it needs more room. */
export function scalarText(value: unknown): string | null {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return cleanText(value) || "—";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value) && value.every((item) => !isRecord(item) && !Array.isArray(item))) {
    return value.length ? value.map((item) => scalarText(item)).join(", ") : "—";
  }
  return null;
}

/**
 * Any value on one line. Scalars as they are, lists joined, and a nested item
 * as its labelled fields in brackets — never as JSON, which is the thing this
 * module exists to stop showing people.
 */
export function inlineText(value: unknown): string {
  const simple = scalarText(value);
  if (simple !== null) return simple;
  if (Array.isArray(value)) return value.map(inlineText).join("; ");
  const entries = Object.entries(value as SnapshotRecord);
  return `(${entries.map(([key, inner]) => `${humanLabel(key)}: ${inlineText(inner)}`).join(", ")})`;
}

/** The field that names an item, if it has one. */
export function titleKeyOf(item: SnapshotRecord): string | null {
  const keys = Object.keys(item);
  for (const preferred of TITLE_KEYS) {
    const key = keys.find((candidate) => candidate.toLowerCase() === preferred);
    if (key && (typeof item[key] === "string" || typeof item[key] === "number") && String(item[key]).trim()) return key;
  }
  return null;
}

/** An item split into its title and the fields that follow it. */
export function describeItem(item: SnapshotRecord, fallbackTitle: string) {
  const titleKey = titleKeyOf(item);
  return {
    title: titleKey ? cleanText(String(item[titleKey])) : fallbackTitle,
    fields: Object.entries(item).filter(([key]) => key !== titleKey),
  };
}

/** Whether a list can be a table: every item flat, with few enough columns to read. */
function tableColumns(items: SnapshotRecord[]): string[] | null {
  if (!items.length || items.some((item) => Object.values(item).some((value) => scalarText(value) === null))) return null;
  const columns: string[] = [];
  items.forEach((item) => Object.keys(item).forEach((key) => !columns.includes(key) && columns.push(key)));
  if (columns.length > 6) return null;
  const title = titleKeyOf(items[0]);
  return title ? [title, ...columns.filter((key) => key !== title)] : columns;
}

/** A cell must stay on one line and must not open a new column. */
const cell = (value: unknown) => inlineText(value).replace(/\|/g, "/").replace(/\s*\n\s*/g, " ");

/**
 * A list of items as Markdown, for the PDF and Word exports.
 *
 * Flat items with up to six fields become a table — a service menu or a set of
 * tiers reads best as rows. Anything richer becomes one line per item, its title
 * in bold and its fields after it.
 */
export function objectListToMarkdown(items: SnapshotRecord[]): string {
  const columns = tableColumns(items);
  if (columns) {
    return [
      `| ${columns.map(humanLabel).join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...items.map((item) => `| ${columns.map((key) => cell(item[key])).join(" | ")} |`),
    ].join("\n");
  }
  return items
    .map((item, index) => {
      const { title, fields } = describeItem(item, `Item ${index + 1}`);
      const detail = fields.map(([key, value]) => `${humanLabel(key)}: ${inlineText(value)}`).join("; ");
      return `- **${title}**${detail ? ` — ${detail}` : ""}`;
    })
    .join("\n");
}

/** A list of items as plain text, one line each, for the .txt export. */
export function objectListToText(items: SnapshotRecord[], indent: string): string[] {
  return items.map((item, index) => {
    const { title, fields } = describeItem(item, `Item ${index + 1}`);
    const detail = fields.map(([key, value]) => `${humanLabel(key)}: ${inlineText(value)}`).join(", ");
    return `${indent}• ${title}${detail ? ` — ${detail}` : ""}`;
  });
}
