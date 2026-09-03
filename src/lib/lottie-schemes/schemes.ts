import type {
  CreateSchemeInput,
  HexColor,
  PaletteScheme,
  PaletteSchemeExportV1,
  SchemeMutationResult,
  SchemeOperationOptions,
} from "./types";
import { SchemeError } from "./types";

export const MAX_SCHEME_NAME_LENGTH = 80;
export const MAX_SCHEME_COLORS = 512;
export const SCHEME_EXPORT_KIND = "lv-motion-palette-scheme" as const;
export const SCHEME_EXPORT_VERSION = 1 as const;
export const LV_BRANDING_SCHEME_ID = "builtin-lv-branding";

const BUILT_IN_DATE = "2026-01-01T00:00:00.000Z";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const frozenLvColors = Object.freeze([
  "#CB2039",
  "#231F20",
  "#FFFFFF",
] satisfies HexColor[]);

/** The immutable preset bundled with the application. */
export const LV_BRANDING_SCHEME: Readonly<PaletteScheme> = Object.freeze({
  id: LV_BRANDING_SCHEME_ID,
  name: "LV Branding",
  colors: frozenLvColors as unknown as HexColor[],
  createdAt: BUILT_IN_DATE,
  updatedAt: BUILT_IN_DATE,
  isBuiltIn: true,
});

function cloneScheme(scheme: Readonly<PaletteScheme>): PaletteScheme {
  return { ...scheme, colors: [...scheme.colors] };
}

export function getBuiltInSchemes(): PaletteScheme[] {
  return [cloneScheme(LV_BRANDING_SCHEME)];
}

/**
 * Makes a name safe to render as plain text: markup-like content, control and
 * bidi override characters are removed, whitespace is normalized, and the
 * result is length-limited. React will still escape this value when rendered.
 */
export function sanitizeSchemeName(value: unknown, fallback = "Untitled scheme"): string {
  if (typeof value !== "string") return fallback;

  const cleaned = value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const limited = Array.from(cleaned).slice(0, MAX_SCHEME_NAME_LENGTH).join("").trim();
  return limited || fallback;
}

/** Normalize common 3- and 6-digit RGB forms to uppercase #RRGGBB. */
export function normalizeHexColor(value: unknown): HexColor | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const short = /^#?([\da-f]{3})$/i.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase() as HexColor;
  }

  const full = /^#?([\da-f]{6})$/i.exec(trimmed);
  return full ? `#${full[1].toUpperCase()}` as HexColor : null;
}

function normalizeColors(value: unknown): HexColor[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SCHEME_COLORS) return null;
  const colors: HexColor[] = [];
  for (const entry of value) {
    const color = normalizeHexColor(entry);
    if (!color) return null;
    colors.push(color);
  }
  return colors;
}

export function isValidSchemeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function sanitizeSchemeId(value: unknown, fallback = "scheme"): string {
  const source = typeof value === "string" ? value.normalize("NFKC") : "";
  const cleaned = source
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  if (isValidSchemeId(cleaned)) return cleaned;

  const safeFallback = fallback
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return isValidSchemeId(safeFallback) ? safeFallback : "scheme";
}

export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** Validate and normalize an unknown scheme record without throwing. */
export function parsePaletteScheme(value: unknown): PaletteScheme | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isValidSchemeId(record.id) || typeof record.name !== "string" || typeof record.isBuiltIn !== "boolean") {
    return null;
  }

  const colors = normalizeColors(record.colors);
  const createdAt = normalizeIsoDate(record.createdAt);
  const updatedAt = normalizeIsoDate(record.updatedAt);
  if (!colors || !createdAt || !updatedAt || Date.parse(updatedAt) < Date.parse(createdAt)) return null;

  return {
    id: record.id,
    name: sanitizeSchemeName(record.name),
    colors,
    createdAt,
    updatedAt,
    isBuiltIn: record.isBuiltIn,
  };
}

function operationDate(options?: SchemeOperationOptions): string {
  const date = options?.now ?? new Date();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new SchemeError("INVALID_SCHEME", "A valid date is required for this scheme operation.");
  }
  return date.toISOString();
}

function randomIdPart(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    // A browser may expose crypto while blocking access to parts of it.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createUniqueSchemeId(
  schemes: readonly PaletteScheme[],
  idFactory: () => string = randomIdPart,
): string {
  const used = new Set(schemes.map(({ id }) => id));
  const raw = sanitizeSchemeId(idFactory(), randomIdPart());
  const base = sanitizeSchemeId(raw.startsWith("scheme-") ? raw : `scheme-${raw}`);
  if (!used.has(base) && base !== LV_BRANDING_SCHEME_ID) return base;

  let suffix = 2;
  let candidate = sanitizeSchemeId(`${base}-${suffix}`);
  while (used.has(candidate) || candidate === LV_BRANDING_SCHEME_ID) {
    suffix += 1;
    candidate = sanitizeSchemeId(`${base.slice(0, 124)}-${suffix}`);
  }
  return candidate;
}

function requireColors(colors: readonly string[]): HexColor[] {
  const normalized = normalizeColors(colors);
  if (!normalized) {
    throw new SchemeError(
      "INVALID_SCHEME",
      `A scheme must contain between 1 and ${MAX_SCHEME_COLORS} valid HEX colors.`,
    );
  }
  return normalized;
}

function findScheme(schemes: readonly PaletteScheme[], id: string): { scheme: PaletteScheme; index: number } {
  const index = schemes.findIndex((candidate) => candidate.id === id);
  if (index < 0) throw new SchemeError("SCHEME_NOT_FOUND", "That color scheme no longer exists.");
  return { scheme: schemes[index], index };
}

function assertEditable(scheme: PaletteScheme): void {
  if (scheme.isBuiltIn || scheme.id === LV_BRANDING_SCHEME_ID) {
    throw new SchemeError(
      "BUILT_IN_PROTECTED",
      "Built-in schemes cannot be changed or deleted. Duplicate the scheme to edit a copy.",
    );
  }
}

export function createScheme(
  schemes: readonly PaletteScheme[],
  input: CreateSchemeInput,
  options?: SchemeOperationOptions,
): SchemeMutationResult {
  const timestamp = operationDate(options);
  const scheme: PaletteScheme = {
    id: createUniqueSchemeId(schemes, options?.idFactory),
    name: sanitizeSchemeName(input.name),
    colors: requireColors(input.colors),
    createdAt: timestamp,
    updatedAt: timestamp,
    isBuiltIn: false,
  };
  return { schemes: [...schemes, scheme], scheme };
}

export function renameScheme(
  schemes: readonly PaletteScheme[],
  id: string,
  name: string,
  options?: SchemeOperationOptions,
): SchemeMutationResult {
  const { scheme, index } = findScheme(schemes, id);
  assertEditable(scheme);
  const requestedDate = operationDate(options);
  const updated: PaletteScheme = {
    ...scheme,
    name: sanitizeSchemeName(name),
    updatedAt: Date.parse(requestedDate) < Date.parse(scheme.createdAt) ? scheme.createdAt : requestedDate,
    colors: [...scheme.colors],
  };
  const next = [...schemes];
  next[index] = updated;
  return { schemes: next, scheme: updated };
}

export function updateSchemeColors(
  schemes: readonly PaletteScheme[],
  id: string,
  colors: readonly string[],
  options?: SchemeOperationOptions,
): SchemeMutationResult {
  const { scheme, index } = findScheme(schemes, id);
  assertEditable(scheme);
  const requestedDate = operationDate(options);
  const updated: PaletteScheme = {
    ...scheme,
    colors: requireColors(colors),
    updatedAt: Date.parse(requestedDate) < Date.parse(scheme.createdAt) ? scheme.createdAt : requestedDate,
  };
  const next = [...schemes];
  next[index] = updated;
  return { schemes: next, scheme: updated };
}

export function duplicateScheme(
  schemes: readonly PaletteScheme[],
  id: string,
  options?: SchemeOperationOptions & { name?: string },
): SchemeMutationResult {
  const { scheme } = findScheme(schemes, id);
  return createScheme(
    schemes,
    { name: options?.name ?? `${scheme.name} copy`, colors: scheme.colors },
    options,
  );
}

export function deleteScheme(
  schemes: readonly PaletteScheme[],
  id: string,
): SchemeMutationResult {
  const { scheme, index } = findScheme(schemes, id);
  assertEditable(scheme);
  return {
    schemes: schemes.filter((_, candidateIndex) => candidateIndex !== index),
    scheme: cloneScheme(scheme),
  };
}

export function exportScheme(scheme: PaletteScheme): string {
  const normalized = parsePaletteScheme(scheme);
  if (!normalized) throw new SchemeError("INVALID_SCHEME", "This scheme cannot be exported because it is invalid.");
  const payload: PaletteSchemeExportV1 = {
    kind: SCHEME_EXPORT_KIND,
    version: SCHEME_EXPORT_VERSION,
    scheme: normalized,
  };
  return JSON.stringify(payload, null, 2);
}

export function importScheme(
  serialized: string,
  schemes: readonly PaletteScheme[],
  options?: SchemeOperationOptions,
): SchemeMutationResult {
  if (typeof serialized !== "string" || serialized.length === 0 || serialized.length > 1_000_000) {
    throw new SchemeError("INVALID_IMPORT", "Choose a valid Motion Palette scheme JSON file.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new SchemeError("INVALID_IMPORT", "The scheme file is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SchemeError("INVALID_IMPORT", "The JSON does not contain a Motion Palette scheme.");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.kind !== SCHEME_EXPORT_KIND || envelope.version !== SCHEME_EXPORT_VERSION) {
    throw new SchemeError("INVALID_IMPORT", "This scheme format or version is not supported.");
  }

  const imported = parsePaletteScheme(envelope.scheme);
  if (!imported) throw new SchemeError("INVALID_IMPORT", "The imported scheme is missing required or valid fields.");

  // An import is a new, editable local record. Its original ID and built-in
  // status are deliberately not trusted, which also prevents ID collisions.
  return createScheme(schemes, { name: imported.name, colors: imported.colors }, options);
}

/** Plain text suitable for navigator.clipboard.writeText(). */
export function formatSchemeColorsForCopy(
  schemeOrColors: Pick<PaletteScheme, "colors"> | readonly string[],
  separator = "\n",
): string {
  // Array.isArray's built-in predicate does not narrow readonly arrays.
  const input: readonly string[] = Array.isArray(schemeOrColors)
    ? schemeOrColors
    : (schemeOrColors as Pick<PaletteScheme, "colors">).colors;
  const colors = requireColors(input);
  return colors.join(separator);
}

export function schemeExportFilename(scheme: Pick<PaletteScheme, "name">): string {
  const slug = sanitizeSchemeName(scheme.name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "color-scheme"}.motion-palette.json`;
}
