import { getBuiltInSchemes, LV_BRANDING_SCHEME_ID, parsePaletteScheme } from "./schemes";
import type { PaletteScheme, SchemeStorage } from "./types";

export const SCHEME_STORAGE_KEY = "lv-motion-palette:schemes:v1";
export const SCHEME_STORAGE_VERSION = 1 as const;
export const MAX_STORED_SCHEMES = 250;

interface StoredSchemesV1 {
  version: typeof SCHEME_STORAGE_VERSION;
  schemes: PaletteScheme[];
}

function browserStorage(): SchemeStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function customSchemesFrom(value: unknown): PaletteScheme[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== SCHEME_STORAGE_VERSION || !Array.isArray(envelope.schemes)) return [];

  const custom: PaletteScheme[] = [];
  const ids = new Set<string>([LV_BRANDING_SCHEME_ID]);
  for (const candidate of envelope.schemes.slice(0, MAX_STORED_SCHEMES)) {
    const scheme = parsePaletteScheme(candidate);
    // Built-in records come from application code only. Refuse persisted
    // records that try to impersonate or replace one.
    if (!scheme || scheme.isBuiltIn || ids.has(scheme.id)) continue;
    ids.add(scheme.id);
    custom.push(scheme);
  }
  return custom;
}

/** Always returns the built-in preset, even when storage is absent or corrupt. */
export function loadSchemes(storage: SchemeStorage | null = browserStorage()): PaletteScheme[] {
  if (!storage) return getBuiltInSchemes();
  try {
    const raw = storage.getItem(SCHEME_STORAGE_KEY);
    if (!raw) return getBuiltInSchemes();
    const parsed: unknown = JSON.parse(raw);
    return [...getBuiltInSchemes(), ...customSchemesFrom(parsed)];
  } catch {
    return getBuiltInSchemes();
  }
}

/**
 * Persists validated custom schemes. Built-ins are intentionally omitted so
 * they cannot be overwritten or deleted through localStorage manipulation.
 */
export function saveSchemes(
  schemes: readonly PaletteScheme[],
  storage: SchemeStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const valid: PaletteScheme[] = [];
    const ids = new Set<string>([LV_BRANDING_SCHEME_ID]);
    for (const candidate of schemes) {
      if (valid.length >= MAX_STORED_SCHEMES) break;
      const scheme = parsePaletteScheme(candidate);
      if (!scheme || scheme.isBuiltIn || ids.has(scheme.id)) continue;
      ids.add(scheme.id);
      valid.push(scheme);
    }
    const payload: StoredSchemesV1 = { version: SCHEME_STORAGE_VERSION, schemes: valid };
    storage.setItem(SCHEME_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Private browsing, quota errors, or disabled storage must not break the editor.
    return false;
  }
}

/** Removes user-created schemes. The bundled preset remains available on load. */
export function clearSavedSchemes(storage: SchemeStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(SCHEME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
