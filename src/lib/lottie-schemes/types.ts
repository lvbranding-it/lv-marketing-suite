export type HexColor = `#${string}`;

/** A reusable, ordered palette for recoloring a Lottie document. */
export interface PaletteScheme {
  id: string;
  name: string;
  colors: HexColor[];
  createdAt: string;
  updatedAt: string;
  isBuiltIn: boolean;
}

export interface CreateSchemeInput {
  name: string;
  colors: readonly string[];
}

export interface SchemeOperationOptions {
  /** Primarily useful to make dates deterministic in tests. */
  now?: Date;
  /** The returned value is sanitized and made unique within the collection. */
  idFactory?: () => string;
}

export interface SchemeMutationResult {
  schemes: PaletteScheme[];
  /** The scheme created, changed, or removed by the operation. */
  scheme: PaletteScheme;
}

export interface PaletteSchemeExportV1 {
  kind: "lv-motion-palette-scheme";
  version: 1;
  scheme: PaletteScheme;
}

/** The localStorage subset used here, kept small so callers can inject a stub. */
export interface SchemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SchemeErrorCode =
  | "BUILT_IN_PROTECTED"
  | "INVALID_IMPORT"
  | "INVALID_SCHEME"
  | "SCHEME_NOT_FOUND";

export class SchemeError extends Error {
  readonly code: SchemeErrorCode;

  constructor(code: SchemeErrorCode, message: string) {
    super(message);
    this.name = "SchemeError";
    this.code = code;
  }
}
