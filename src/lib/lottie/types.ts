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
/** `fl`/`st` are solid; `gf`/`gs` are the gradient equivalents. */
export type LottieShapeType = "fl" | "st" | "gf" | "gs";
export type LottieColorUsage = LottieColorKind | "both";

export interface LottieColorOccurrence {
  /**
   * Path to the editable colour array: `c.k` for a static colour, and
   * `c.k.<index>.s` for one keyframe of an animated colour.
   */
  path: LottiePathSegment[];
  jsonPath: string;
  kind: LottieColorKind;
  shapeType: LottieShapeType;
  name: string | null;
  /** A detached copy of the source RGB or RGBA array. */
  sourceColor: number[];
  /** The untouched alpha channel, or null when the source only supplied RGB. */
  alpha: number | null;
  /** True when this colour is one keyframe of an animated property. */
  animated: boolean;
  /** Keyframe index within `c.k`, or null for a static colour. */
  keyframeIndex: number | null;
  /** Keyframe time in frames, for showing an editor when a colour changes. */
  keyframeTime: number | null;
  /**
   * Position of this colour within a gradient ramp, or null for a solid shape.
   * Gradient stops are stored in a flat, untagged array, so the index is what
   * ties an occurrence back to the numbers it may rewrite.
   */
  gradientStopIndex: number | null;
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
  /** Occurrences that sit on animated keyframes rather than a static value. */
  animatedCount: number;
  /** Occurrences that are stops inside a gradient ramp. */
  gradientCount: number;
  occurrences: LottieColorOccurrence[];
}

/** One stop of a gradient ramp, in ramp order. */
export interface LottieGradientStop {
  stopIndex: number;
  /** Position along the ramp, 0 to 1. */
  offset: number;
  hex: HexColor;
}

/**
 * A distinct gradient ramp.
 *
 * Keyed by the ordered stop sequence rather than by shape, because a file
 * typically reuses a handful of ramps across many shapes: the sample this was
 * built against has 19 gradient shapes drawing on 6 ramps.
 */
export interface LottieGradientRamp {
  /** Stable identity: the ordered offset and colour sequence. */
  id: string;
  stops: LottieGradientStop[];
  /** How many gradient shapes draw this exact ramp. */
  useCount: number;
  usage: LottieColorUsage;
  /** True when the ramp is defined by keyframes rather than a single value. */
  animated: boolean;
}

export type LottieUnsupportedFeatureCode =
  | "gradient-fill"
  | "gradient-stroke"
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
  /** Distinct gradient ramps, so an editor can present a ramp as one unit. */
  gradients: LottieGradientRamp[];
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
