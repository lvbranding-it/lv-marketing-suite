import {
  hexToRgb,
  normalizeHexColor,
  normalizeLottieColor,
  rgbToLottieChannels,
} from "./colors";
import type {
  DetectedLottieColor,
  HexColor,
  LottieAnalysis,
  LottieAnimation,
  LottieColorKind,
  LottieColorOccurrence,
  LottieColorReplacements,
  LottieGradientRamp,
  LottieMetadata,
  LottiePathSegment,
  LottieRecolorResult,
  LottieShapeType,
  RgbColor,
  LottieUnsupportedFeature,
  LottieUnsupportedFeatureCode,
  LottieUnsupportedIssue,
  LottieValidationIssue,
  LottieValidationResult,
  ParseLottieJsonResult,
} from "./types";

type JsonRecord = Record<string, unknown>;

const UNSUPPORTED_FEATURE_COPY: Record<
  LottieUnsupportedFeatureCode,
  { label: string; message: string }
> = {
  "gradient-fill": {
    label: "Gradient fills",
    message: "Gradient fills are preserved but cannot be recolored in this version.",
  },
  "gradient-stroke": {
    label: "Gradient strokes",
    message: "Gradient strokes are preserved but cannot be recolored in this version.",
  },
  "raster-asset": {
    label: "Raster assets",
    message: "Raster image assets are preserved but cannot be recolored.",
  },
  expression: {
    label: "Expressions",
    message: "Expressions are preserved as data but are never evaluated by the color editor.",
  },
  "malformed-color": {
    label: "Malformed colors",
    message: "Malformed or unsupported color arrays are preserved without modification.",
  },
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatLottiePath(path: readonly LottiePathSegment[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    if (/^[A-Za-z_$][\w$]*$/.test(segment)) return `${result}.${segment}`;
    return `${result}[${JSON.stringify(segment)}]`;
  }, "$");
}

function walkJson(
  value: unknown,
  visit: (value: unknown, path: LottiePathSegment[]) => void,
  path: LottiePathSegment[] = [],
  seen = new WeakSet<object>(),
): void {
  visit(value, path);

  if (typeof value !== "object" || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, visit, [...path, index], seen));
    return;
  }

  for (const key of Object.keys(value)) {
    walkJson((value as JsonRecord)[key], visit, [...path, key], seen);
  }
}

function isDirectItemIn(path: readonly LottiePathSegment[], property: string): boolean {
  return (
    path.length >= 2 &&
    typeof path[path.length - 1] === "number" &&
    path[path.length - 2] === property
  );
}

/** One recolourable keyframe inside an animated colour property. */
interface AnimatedColorKeyframe {
  index: number;
  time: number | null;
  color: NonNullable<ReturnType<typeof normalizeLottieColor>>;
  /** True when the keyframe also carries a legacy `e` end value to keep in step. */
  hasEndValue: boolean;
}

function classifyShapeColor(shape: JsonRecord):
  | { status: "editable"; color: NonNullable<ReturnType<typeof normalizeLottieColor>> }
  | { status: "animated"; keyframes: AnimatedColorKeyframe[] }
  | { status: "expression" }
  | { status: "malformed"; reason: string } {
  const colorProperty = shape.c;
  if (!isRecord(colorProperty)) {
    return { status: "malformed", reason: "The shape has no static color property." };
  }

  // An expression governs the value regardless of what the baked keyframes say,
  // so it is checked before them. Rewriting the keyframes under an expression
  // would change the file without changing what renders.
  if (typeof colorProperty.x === "string") return { status: "expression" };

  const animatedFlag = colorProperty.a;
  const keyframes = colorProperty.k;
  const looksLikeKeyframes =
    Array.isArray(keyframes) &&
    keyframes.some((entry) => isRecord(entry) && ("s" in entry || "e" in entry || "t" in entry));

  if (animatedFlag === 1 || looksLikeKeyframes) {
    if (!Array.isArray(keyframes)) {
      return { status: "malformed", reason: "The animated color has no keyframe array." };
    }

    const parsed: AnimatedColorKeyframe[] = [];
    for (const [index, frame] of keyframes.entries()) {
      if (!isRecord(frame)) continue;
      const color = normalizeLottieColor(frame.s);
      if (!color) continue;
      parsed.push({
        index,
        time: typeof frame.t === "number" ? frame.t : null,
        color,
        hasEndValue: normalizeLottieColor(frame.e) !== null,
      });
    }

    if (parsed.length === 0) {
      return {
        status: "malformed",
        reason: "No keyframe carried a readable RGB or RGBA value.",
      };
    }

    return { status: "animated", keyframes: parsed };
  }

  if (animatedFlag !== undefined && animatedFlag !== 0) {
    return { status: "malformed", reason: "The color animation flag is invalid." };
  }

  const color = normalizeLottieColor(keyframes);
  if (!color) {
    return {
      status: "malformed",
      reason: "Expected a static RGB or RGBA array with finite channels from 0 to 1.",
    };
  }

  return { status: "editable", color };
}

/** One colour stop inside a gradient ramp. */
interface GradientStop {
  stopIndex: number;
  /** Position along the ramp, 0 to 1. */
  offset: number;
  /** Index of this stop's red channel inside the flat ramp array. */
  redIndex: number;
  color: NonNullable<ReturnType<typeof normalizeLottieColor>>;
}

/**
 * Reads the colour stops out of a Lottie gradient ramp.
 *
 * The ramp is one flat, untagged array: `stopCount` groups of
 * `[offset, r, g, b]`, optionally followed by `[offset, alpha]` opacity pairs.
 * Nothing in the array marks where the colours end, so `stopCount` is the only
 * boundary. If it disagrees with the array length the ramp is rejected outright
 * rather than read past the colours, because writing into the opacity pairs
 * turns a gradient invisible instead of merely miscolouring it.
 */
function readGradientStops(ramp: unknown, stopCount: unknown): GradientStop[] | null {
  if (!Array.isArray(ramp)) return null;
  if (typeof stopCount !== "number" || !Number.isInteger(stopCount) || stopCount <= 0) return null;
  if (ramp.length < stopCount * 4) return null;

  const stops: GradientStop[] = [];
  for (let index = 0; index < stopCount; index += 1) {
    const redIndex = index * 4 + 1;
    const color = normalizeLottieColor([ramp[redIndex], ramp[redIndex + 1], ramp[redIndex + 2]]);
    if (!color) return null;
    const offset = ramp[redIndex - 1];
    if (typeof offset !== "number" || !Number.isFinite(offset)) return null;
    stops.push({ stopIndex: index, offset, redIndex, color });
  }
  return stops;
}

/**
 * Classifies a gradient fill or stroke.
 *
 * `shape.g.p` is the stop count and `shape.g.k` is the ramp property, which
 * follows the same static-or-keyframed shape as a solid colour.
 */
function classifyGradientColor(shape: JsonRecord):
  | { status: "static"; stops: GradientStop[] }
  | { status: "animated"; keyframes: Array<{ index: number; time: number | null; stops: GradientStop[] }> }
  | { status: "expression" }
  | { status: "malformed"; reason: string } {
  const gradient = shape.g;
  if (!isRecord(gradient)) return { status: "malformed", reason: "The gradient has no ramp." };

  const ramp = gradient.k;
  if (!isRecord(ramp)) return { status: "malformed", reason: "The gradient ramp is not a property." };
  if (typeof ramp.x === "string") return { status: "expression" };

  const stopCount = gradient.p;

  if (ramp.a === 1 || (Array.isArray(ramp.k) && ramp.k.some((entry) => isRecord(entry)))) {
    if (!Array.isArray(ramp.k)) {
      return { status: "malformed", reason: "The animated gradient has no keyframe array." };
    }
    const keyframes: Array<{ index: number; time: number | null; stops: GradientStop[] }> = [];
    for (const [index, frame] of ramp.k.entries()) {
      if (!isRecord(frame)) continue;
      const stops = readGradientStops(frame.s, stopCount);
      if (!stops) continue;
      keyframes.push({
        index,
        time: typeof frame.t === "number" ? frame.t : null,
        stops,
      });
    }
    if (keyframes.length === 0) {
      return { status: "malformed", reason: "No gradient keyframe held a readable ramp." };
    }
    return { status: "animated", keyframes };
  }

  const stops = readGradientStops(ramp.k, stopCount);
  if (!stops) {
    return {
      status: "malformed",
      reason: "The gradient ramp did not match its declared stop count.",
    };
  }
  return { status: "static", stops };
}

function addUnsupportedIssue(
  issues: LottieUnsupportedIssue[],
  code: LottieUnsupportedFeatureCode,
  path: LottiePathSegment[],
  detail?: string,
): void {
  const copy = UNSUPPORTED_FEATURE_COPY[code];
  issues.push({
    code,
    path: [...path],
    jsonPath: formatLottiePath(path),
    message: detail ? `${copy.message} ${detail}` : copy.message,
  });
}

function summarizeUnsupported(
  issues: LottieUnsupportedIssue[],
): LottieUnsupportedFeature[] {
  const summaries = new Map<LottieUnsupportedFeatureCode, LottieUnsupportedFeature>();

  for (const issue of issues) {
    const existing = summaries.get(issue.code);
    if (existing) {
      existing.count += 1;
      existing.issues.push(issue);
      continue;
    }

    const copy = UNSUPPORTED_FEATURE_COPY[issue.code];
    summaries.set(issue.code, {
      code: issue.code,
      label: copy.label,
      count: 1,
      message: copy.message,
      issues: [issue],
    });
  }

  return [...summaries.values()];
}

export function getLottieMetadata(value: unknown): LottieMetadata {
  const root = isRecord(value) ? value : {};
  let totalLayerCount = 0;
  let vectorLayerCount = 0;
  let rasterLayerCount = 0;
  let precompositionCount = 0;
  let rasterAssetCount = 0;

  walkJson(root, (entry, path) => {
    if (!isRecord(entry)) return;

    if (isDirectItemIn(path, "layers")) {
      totalLayerCount += 1;
      if (entry.ty === 4) vectorLayerCount += 1;
      if (entry.ty === 2) rasterLayerCount += 1;
    }

    if (isDirectItemIn(path, "assets")) {
      if (Array.isArray(entry.layers)) precompositionCount += 1;
      if (typeof entry.p === "string" && entry.p.length > 0) rasterAssetCount += 1;
    }
  });

  const frameRate = isFiniteNumber(root.fr) ? root.fr : null;
  const inPoint = isFiniteNumber(root.ip) ? root.ip : null;
  const outPoint = isFiniteNumber(root.op) ? root.op : null;
  const durationSeconds =
    frameRate !== null && frameRate > 0 && inPoint !== null && outPoint !== null
      ? (outPoint - inPoint) / frameRate
      : null;
  const fonts = isRecord(root.fonts) && Array.isArray(root.fonts.list) ? root.fonts.list : [];

  return {
    name: typeof root.nm === "string" ? root.nm : null,
    version: typeof root.v === "string" ? root.v : null,
    width: isFiniteNumber(root.w) ? root.w : null,
    height: isFiniteNumber(root.h) ? root.h : null,
    frameRate,
    inPoint,
    outPoint,
    durationSeconds,
    topLevelLayerCount: Array.isArray(root.layers) ? root.layers.length : 0,
    totalLayerCount,
    vectorLayerCount,
    rasterLayerCount,
    precompositionCount,
    rasterAssetCount,
    fontCount: fonts.length,
  };
}

export function analyzeLottie(value: unknown): LottieAnalysis {
  const palette = new Map<HexColor, DetectedLottieColor>();
  const ramps = new Map<string, LottieGradientRamp>();
  const unsupportedIssues: LottieUnsupportedIssue[] = [];
  let fillCount = 0;
  let strokeCount = 0;

  walkJson(value, (entry, path) => {
    if (!isRecord(entry)) return;

    if (isDirectItemIn(path, "assets") && typeof entry.p === "string" && entry.p.length > 0) {
      addUnsupportedIssue(unsupportedIssues, "raster-asset", path);
    }

    const isGradient = entry.ty === "gf" || entry.ty === "gs";
    if (entry.ty !== "fl" && entry.ty !== "st" && !isGradient) return;

    const kind: LottieColorKind =
      entry.ty === "fl" || entry.ty === "gf" ? "fill" : "stroke";
    const shapeName = typeof entry.nm === "string" ? entry.nm : null;

    const register = (occurrence: LottieColorOccurrence, color: {
      hex: HexColor;
      rgb: RgbColor;
    }): void => {
      const existing = palette.get(color.hex);
      if (existing) {
        existing.occurrences.push(occurrence);
        existing.occurrenceCount += 1;
        if (occurrence.animated) existing.animatedCount += 1;
        if (occurrence.gradientStopIndex !== null) existing.gradientCount += 1;
        if (kind === "fill") existing.fillCount += 1;
        else existing.strokeCount += 1;
        existing.usage = existing.fillCount > 0 && existing.strokeCount > 0
          ? "both"
          : kind;
        return;
      }

      palette.set(color.hex, {
        key: color.hex,
        originalHex: color.hex,
        rgb: color.rgb,
        order: palette.size,
        occurrenceCount: 1,
        fillCount: kind === "fill" ? 1 : 0,
        strokeCount: kind === "stroke" ? 1 : 0,
        usage: kind,
        animatedCount: occurrence.animated ? 1 : 0,
        gradientCount: occurrence.gradientStopIndex !== null ? 1 : 0,
        occurrences: [occurrence],
      });
    };

    if (isGradient) {
      const gradient = classifyGradientColor(entry);

      if (gradient.status === "expression") {
        addUnsupportedIssue(unsupportedIssues, "expression", [...path, "g", "k", "x"]);
        return;
      }
      if (gradient.status === "malformed") {
        addUnsupportedIssue(
          unsupportedIssues,
          entry.ty === "gf" ? "gradient-fill" : "gradient-stroke",
          [...path, "g"],
          gradient.reason,
        );
        return;
      }

      const addStop = (
        stop: GradientStop,
        stopPath: LottiePathSegment[],
        animated: boolean,
        keyframeIndex: number | null,
        keyframeTime: number | null,
      ): void => {
        register(
          {
            path: stopPath,
            jsonPath: formatLottiePath(stopPath),
            kind,
            shapeType: entry.ty as "gf" | "gs",
            name: shapeName,
            sourceColor: stop.color.sourceColor,
            alpha: stop.color.alpha,
            animated,
            keyframeIndex,
            keyframeTime,
            gradientStopIndex: stop.stopIndex,
          },
          stop.color,
        );
      };

      if (gradient.status === "animated") {
        for (const frame of gradient.keyframes) {
          for (const stop of frame.stops) {
            addStop(
              stop,
              [...path, "g", "k", "k", frame.index, "s", stop.redIndex],
              true,
              frame.index,
              frame.time,
            );
          }
        }
      } else {
        for (const stop of gradient.stops) {
          addStop(stop, [...path, "g", "k", "k", stop.redIndex], false, null, null);
        }
      }

      // Record the ramp itself so an editor can show its stops together. The
      // first keyframe stands for an animated ramp: it is the shape of the
      // gradient, and every keyframe shares that shape.
      const rampStops = gradient.status === "animated"
        ? gradient.keyframes[0].stops
        : gradient.stops;
      const rampId = rampStops
        .map((stop) => `${stop.offset.toFixed(4)}:${stop.color.hex}`)
        .join("|");
      const existingRamp = ramps.get(rampId);
      if (existingRamp) {
        existingRamp.useCount += 1;
        if (existingRamp.usage !== kind) existingRamp.usage = "both";
      } else {
        ramps.set(rampId, {
          id: rampId,
          stops: rampStops.map((stop) => ({
            stopIndex: stop.stopIndex,
            offset: stop.offset,
            hex: stop.color.hex,
          })),
          useCount: 1,
          usage: kind,
          animated: gradient.status === "animated",
        });
      }

      if (kind === "fill") fillCount += 1;
      else strokeCount += 1;
      return;
    }

    const classification = classifyShapeColor(entry);

    if (classification.status === "malformed") {
      addUnsupportedIssue(
        unsupportedIssues,
        "malformed-color",
        [...path, "c"],
        classification.reason,
      );
      return;
    }
    // An expression drives this colour at render time, so the stored value is
    // not what the viewer sees. This is the only expression a colour editor has
    // any business reporting.
    if (classification.status === "expression") {
      addUnsupportedIssue(unsupportedIssues, "expression", [...path, "c", "x"]);
      return;
    }

    if (classification.status === "animated") {
      for (const frame of classification.keyframes) {
        const framePath = [...path, "c", "k", frame.index, "s"];
        register(
          {
            path: framePath,
            jsonPath: formatLottiePath(framePath),
            kind,
            shapeType: entry.ty as LottieShapeType,
            name: shapeName,
            sourceColor: frame.color.sourceColor,
            alpha: frame.color.alpha,
            animated: true,
            keyframeIndex: frame.index,
            keyframeTime: frame.time,
            gradientStopIndex: null,
          },
          frame.color,
        );
      }
      if (kind === "fill") fillCount += 1;
      else strokeCount += 1;
      return;
    }

    const { color } = classification;
    const occurrence: LottieColorOccurrence = {
      path: [...path, "c", "k"],
      jsonPath: formatLottiePath([...path, "c", "k"]),
      kind,
      shapeType: entry.ty as LottieShapeType,
      name: shapeName,
      sourceColor: color.sourceColor,
      alpha: color.alpha,
      animated: false,
      keyframeIndex: null,
      keyframeTime: null,
      gradientStopIndex: null,
    };

    register(occurrence, color);

    if (kind === "fill") fillCount += 1;
    else strokeCount += 1;
  });

  const colors = [...palette.values()];
  const unsupportedFeatures = summarizeUnsupported(unsupportedIssues);

  return {
    metadata: getLottieMetadata(value),
    colors,
    editableColorCount: colors.length,
    // Counted from the palette, not from shape totals: one animated property
    // contributes a recolourable occurrence per keyframe, so summing shapes
    // would under-report what the editor actually lets you change and disagree
    // with the per-colour counts shown on each swatch.
    editableOccurrenceCount: colors.reduce((total, color) => total + color.occurrenceCount, 0),
    fillCount,
    strokeCount,
    gradients: [...ramps.values()],
    unsupportedIssues,
    unsupportedFeatures,
    hasUnsupportedFeatures: unsupportedIssues.length > 0,
  };
}

function validationIssue(
  code: LottieValidationIssue["code"],
  severity: LottieValidationIssue["severity"],
  message: string,
  path: LottiePathSegment[] = [],
): LottieValidationIssue {
  return { code, severity, message, path, jsonPath: formatLottiePath(path) };
}

export function validateLottieDocument(value: unknown): LottieValidationResult {
  if (!isRecord(value)) {
    const issue = validationIssue(
      "invalid-root",
      "error",
      "The JSON root must be an object that contains Lottie animation data.",
    );
    return { valid: false, errors: [issue], warnings: [], metadata: null };
  }

  const errors: LottieValidationIssue[] = [];
  const warnings: LottieValidationIssue[] = [];

  if (value.v === undefined) {
    warnings.push(validationIssue("missing-version", "warning", "The Lottie version is missing.", ["v"]));
  } else if (typeof value.v !== "string" || value.v.trim() === "") {
    warnings.push(validationIssue("invalid-version", "warning", "The Lottie version is not a valid string.", ["v"]));
  }

  if (!isFiniteNumber(value.w) || value.w <= 0 || !isFiniteNumber(value.h) || value.h <= 0) {
    errors.push(validationIssue(
      "invalid-dimensions",
      "error",
      "The animation must have positive numeric width and height values.",
    ));
  }

  if (!isFiniteNumber(value.fr) || value.fr <= 0) {
    errors.push(validationIssue(
      "invalid-frame-rate",
      "error",
      "The animation must have a positive numeric frame rate.",
      ["fr"],
    ));
  }

  if (
    !isFiniteNumber(value.ip) ||
    !isFiniteNumber(value.op) ||
    (isFiniteNumber(value.ip) && isFiniteNumber(value.op) && value.op <= value.ip)
  ) {
    errors.push(validationIssue(
      "invalid-frame-range",
      "error",
      "The animation must have numeric in/out points, with the out point after the in point.",
    ));
  }

  if (!Array.isArray(value.layers)) {
    errors.push(validationIssue(
      "invalid-layers",
      "error",
      "The animation must contain a layers array.",
      ["layers"],
    ));
  }

  if (value.assets !== undefined && !Array.isArray(value.assets)) {
    errors.push(validationIssue(
      "invalid-assets",
      "error",
      "The assets property must be an array when present.",
      ["assets"],
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: getLottieMetadata(value),
  };
}

export function isLottieAnimation(value: unknown): value is LottieAnimation {
  return validateLottieDocument(value).valid;
}

export function assertValidLottieDocument(value: unknown): asserts value is LottieAnimation {
  const validation = validateLottieDocument(value);
  if (!validation.valid) throw new LottieValidationError(validation.errors);
}

export class LottieValidationError extends Error {
  readonly issues: LottieValidationIssue[];

  constructor(issues: LottieValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "LottieValidationError";
    this.issues = issues;
  }
}

export function parseLottieJson(source: string): ParseLottieJsonResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    return {
      ok: false,
      errors: [validationIssue("invalid-json", "error", `The selected file is not valid JSON.${detail}`)],
      warnings: [],
    };
  }

  const validation = validateLottieDocument(parsed);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }

  const animation = parsed as LottieAnimation;
  const analysis = analyzeLottie(animation);
  const warnings = [...validation.warnings];
  if (analysis.editableColorCount === 0) {
    warnings.push(validationIssue(
      "no-editable-colors",
      "warning",
      "No supported static fill or stroke colors were found.",
    ));
  }

  return {
    ok: true,
    animation,
    analysis,
    metadata: analysis.metadata,
    warnings,
  };
}

/** Deep-clones JSON-like Lottie data without serializing it or mutating the source. */
export function deepCloneLottie<T>(value: T): T {
  const clones = new WeakMap<object, unknown>();

  const clone = (entry: unknown): unknown => {
    if (typeof entry !== "object" || entry === null) return entry;
    const existing = clones.get(entry);
    if (existing !== undefined) return existing;

    if (Array.isArray(entry)) {
      const output: unknown[] = [];
      clones.set(entry, output);
      entry.forEach((item) => output.push(clone(item)));
      return output;
    }

    const output = Object.create(Object.getPrototypeOf(entry)) as JsonRecord;
    clones.set(entry, output);
    for (const key of Object.keys(entry)) {
      Object.defineProperty(output, key, {
        value: clone((entry as JsonRecord)[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output;
  };

  return clone(value) as T;
}

function normalizedReplacementMap(replacements: LottieColorReplacements): Map<HexColor, HexColor> {
  const entries = replacements instanceof Map
    ? [...replacements.entries()]
    : Object.entries(replacements);
  const normalized = new Map<HexColor, HexColor>();

  for (const [source, replacement] of entries) {
    const normalizedSource = normalizeHexColor(source);
    const normalizedReplacement = normalizeHexColor(replacement);
    if (!normalizedSource) throw new TypeError(`Invalid original HEX color: ${String(source)}`);
    if (!normalizedReplacement) throw new TypeError(`Invalid replacement HEX color: ${String(replacement)}`);
    normalized.set(normalizedSource, normalizedReplacement);
  }

  return normalized;
}

export function recolorLottieWithReport<T>(
  original: T,
  replacements: LottieColorReplacements,
): LottieRecolorResult<T> {
  const normalized = normalizedReplacementMap(replacements);
  const animation = deepCloneLottie(original);
  const appliedByOriginalColor: Partial<Record<HexColor, number>> = {};
  const matched = new Set<HexColor>();
  let appliedOccurrenceCount = 0;

  walkJson(animation, (entry) => {
    if (!isRecord(entry)) return;
    if (entry.ty !== "fl" && entry.ty !== "st" && entry.ty !== "gf" && entry.ty !== "gs") return;

    const isGradient = entry.ty === "gf" || entry.ty === "gs";

    /**
     * Writes the replacement into an existing channel array in place.
     *
     * Only indices 0 to 2 are touched: index 3 is the alpha the animation
     * author set, and on a keyframe the surrounding `i`, `o` and `t` fields are
     * the easing and timing. Recolouring must not disturb either, or the motion
     * changes along with the colour.
     */
    const applyTo = (channels: unknown, replacementHex: HexColor): boolean => {
      if (!Array.isArray(channels)) return false;
      const rgb = hexToRgb(replacementHex);
      if (!rgb) return false;
      const [red, green, blue] = rgbToLottieChannels(rgb);
      channels[0] = red;
      channels[1] = green;
      channels[2] = blue;
      return true;
    };

    if (isGradient) {
      const gradient = classifyGradientColor(entry);
      if (gradient.status === "malformed" || gradient.status === "expression") return;

      /**
       * Writes one stop's RGB into the flat ramp.
       *
       * Only the three channels after the stop's offset are touched. The offset
       * itself positions the stop along the ramp, and the numbers past the last
       * colour stop are the opacity pairs; writing into either would move or
       * erase part of the gradient rather than recolour it.
       */
      const applyStop = (ramp: unknown, stop: GradientStop, replacementHex: HexColor): boolean => {
        if (!Array.isArray(ramp)) return false;
        const rgb = hexToRgb(replacementHex);
        if (!rgb) return false;
        const [red, green, blue] = rgbToLottieChannels(rgb);
        ramp[stop.redIndex] = red;
        ramp[stop.redIndex + 1] = green;
        ramp[stop.redIndex + 2] = blue;
        return true;
      };

      const rampProperty = (entry.g as JsonRecord).k as JsonRecord;

      const recolorStops = (ramp: unknown, stops: GradientStop[]): void => {
        for (const stop of stops) {
          const originalHex = stop.color.hex;
          const replacementHex = normalized.get(originalHex);
          if (!replacementHex) continue;
          matched.add(originalHex);
          if (replacementHex === originalHex) continue;
          if (!applyStop(ramp, stop, replacementHex)) continue;

          appliedOccurrenceCount += 1;
          appliedByOriginalColor[originalHex] = (appliedByOriginalColor[originalHex] ?? 0) + 1;
        }
      };

      if (gradient.status === "animated") {
        const keyframes = rampProperty.k as unknown[];
        for (const frame of gradient.keyframes) {
          const target = keyframes[frame.index];
          if (!isRecord(target)) continue;
          recolorStops(target.s, frame.stops);
        }
        return;
      }

      recolorStops(rampProperty.k, gradient.stops);
      return;
    }

    const classification = classifyShapeColor(entry);
    if (classification.status === "malformed" || classification.status === "expression") return;

    const colorProperty = entry.c as JsonRecord;

    if (classification.status === "animated") {
      const keyframes = colorProperty.k as unknown[];
      for (const frame of classification.keyframes) {
        const originalHex = frame.color.hex;
        const replacementHex = normalized.get(originalHex);
        if (!replacementHex) continue;
        matched.add(originalHex);
        if (replacementHex === originalHex) continue;

        const target = keyframes[frame.index];
        if (!isRecord(target)) continue;
        if (!applyTo(target.s, replacementHex)) continue;
        // Older exports repeat the value as the previous keyframe's `e`. Leaving
        // it behind would make the colour jump back for one interval.
        if (frame.hasEndValue) applyTo(target.e, replacementHex);

        appliedOccurrenceCount += 1;
        appliedByOriginalColor[originalHex] = (appliedByOriginalColor[originalHex] ?? 0) + 1;
      }
      return;
    }

    const originalHex = classification.color.hex;
    const replacementHex = normalized.get(originalHex);
    if (!replacementHex) return;
    matched.add(originalHex);

    if (replacementHex === originalHex) return;
    if (!applyTo(colorProperty.k, replacementHex)) return;

    appliedOccurrenceCount += 1;
    appliedByOriginalColor[originalHex] = (appliedByOriginalColor[originalHex] ?? 0) + 1;
  });

  return {
    animation,
    appliedOccurrenceCount,
    appliedByOriginalColor,
    unmatchedOriginalColors: [...normalized.keys()].filter((color) => !matched.has(color)),
  };
}

/** Returns a recolored deep clone. The uploaded source object is never mutated. */
export function recolorLottie<T>(original: T, replacements: LottieColorReplacements): T {
  return recolorLottieWithReport(original, replacements).animation;
}

/** Stringifies only after structural validation, then parses and validates the exact output once more. */
export function serializeLottieJson(value: unknown, space: number | string = 2): string {
  assertValidLottieDocument(value);

  let serialized: string;
  try {
    const result = JSON.stringify(value, null, space);
    if (result === undefined) throw new TypeError("The animation could not be serialized.");
    serialized = result;
  } catch (error) {
    if (error instanceof LottieValidationError) throw error;
    throw new TypeError(
      error instanceof Error ? `The animation could not be serialized. ${error.message}` : "The animation could not be serialized.",
    );
  }

  const reparsed = JSON.parse(serialized) as unknown;
  assertValidLottieDocument(reparsed);
  return serialized;
}

export function appendRecoloredSuffix(filename: string): string {
  const safeName = filename.trim() || "animation.json";
  return /\.json$/i.test(safeName)
    ? `${safeName.slice(0, -5)}-recolored.json`
    : `${safeName}-recolored.json`;
}
