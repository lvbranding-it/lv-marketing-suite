export type LottiePathSegment = string | number;

export type HexColor = `#${string}`;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** A structurally validated Lottie document. Unknown fields are intentionally retained. */
export interface LottieAnimation {
  [key: string]: unknown;
  v?: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm?: string;
  layers: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>;
}

export type LottieColorKind = "fill" | "stroke";
export type LottieColorUsage = LottieColorKind | "both";

export interface LottieColorOccurrence {
  /** Path to the shape's `c.k` array. */
  path: LottiePathSegment[];
  jsonPath: string;
  kind: LottieColorKind;
  shapeType: "fl" | "st";
  name: string | null;
  /** A detached copy of the source RGB or RGBA array. */
  sourceColor: number[];
  /** The untouched alpha channel, or null when the source only supplied RGB. */
  alpha: number | null;
}

export interface DetectedLottieColor {
  /** Stable palette key. Equivalent to `originalHex`. */
  key: HexColor;
  originalHex: HexColor;
  rgb: RgbColor;
  order: number;
  occurrenceCount: number;
  fillCount: number;
  strokeCount: number;
  usage: LottieColorUsage;
  occurrences: LottieColorOccurrence[];
}

export type LottieUnsupportedFeatureCode =
  | "gradient-fill"
  | "gradient-stroke"
  | "animated-color"
  | "raster-asset"
  | "expression"
  | "malformed-color";

export interface LottieUnsupportedIssue {
  code: LottieUnsupportedFeatureCode;
  path: LottiePathSegment[];
  jsonPath: string;
  message: string;
}

export interface LottieUnsupportedFeature {
  code: LottieUnsupportedFeatureCode;
  label: string;
  count: number;
  message: string;
  issues: LottieUnsupportedIssue[];
}

export interface LottieMetadata {
  name: string | null;
  version: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  inPoint: number | null;
  outPoint: number | null;
  durationSeconds: number | null;
  topLevelLayerCount: number;
  totalLayerCount: number;
  vectorLayerCount: number;
  rasterLayerCount: number;
  precompositionCount: number;
  rasterAssetCount: number;
  fontCount: number;
}

export interface LottieAnalysis {
  metadata: LottieMetadata;
  colors: DetectedLottieColor[];
  editableColorCount: number;
  editableOccurrenceCount: number;
  fillCount: number;
  strokeCount: number;
  unsupportedIssues: LottieUnsupportedIssue[];
  unsupportedFeatures: LottieUnsupportedFeature[];
  hasUnsupportedFeatures: boolean;
}

export type LottieValidationIssueCode =
  | "invalid-json"
  | "invalid-root"
  | "missing-version"
  | "invalid-version"
  | "invalid-dimensions"
  | "invalid-frame-rate"
  | "invalid-frame-range"
  | "invalid-layers"
  | "invalid-assets"
  | "no-editable-colors";

export interface LottieValidationIssue {
  code: LottieValidationIssueCode;
  severity: "error" | "warning";
  message: string;
  path: LottiePathSegment[];
  jsonPath: string;
}

export interface LottieValidationResult {
  valid: boolean;
  errors: LottieValidationIssue[];
  warnings: LottieValidationIssue[];
  metadata: LottieMetadata | null;
}

export type ParseLottieJsonResult =
  | {
      ok: true;
      animation: LottieAnimation;
      analysis: LottieAnalysis;
      metadata: LottieMetadata;
      warnings: LottieValidationIssue[];
    }
  | {
      ok: false;
      errors: LottieValidationIssue[];
      warnings: LottieValidationIssue[];
    };

export type LottieColorReplacements =
  | Readonly<Record<string, string>>
  | ReadonlyMap<string, string>;

export interface LottieRecolorResult<T> {
  animation: T;
  appliedOccurrenceCount: number;
  appliedByOriginalColor: Partial<Record<HexColor, number>>;
  unmatchedOriginalColors: HexColor[];
}
