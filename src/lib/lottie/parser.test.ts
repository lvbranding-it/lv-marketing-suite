import { describe, expect, it } from "vitest";
import {
  analyzeLottie,
  appendRecoloredSuffix,
  parseLottieJson,
  recolorLottie,
  recolorLottieWithReport,
  serializeLottieJson,
  validateLottieDocument,
} from "./index";

function animationWith(shapes: unknown[], assets: unknown[] = []) {
  return {
    v: "5.9.6",
    fr: 30,
    ip: 0,
    op: 168,
    w: 1600,
    h: 1200,
    nm: "Synthetic palette",
    layers: [{ ty: 4, ind: 1, shapes }],
    assets,
    markers: [],
  };
}

describe("Lottie color analysis", () => {
  it("recurses through groups and precompositions while preserving first-occurrence order", () => {
    const lavenderA = [155 / 255, 146 / 255, 248 / 255, 0.35];
    const lavenderB = [0.60784314, 0.57254902, 0.97254902, 1];
    const animation = animationWith(
      [
        {
          ty: "gr",
          nm: "Nested group",
          it: [
            { ty: "fl", nm: "Lavender fill", c: { a: 0, k: lavenderA } },
            { ty: "st", nm: "White stroke", c: { a: 0, k: [1, 1, 1, 0.5] } },
            { ty: "st", nm: "Lavender stroke", c: { a: 0, k: lavenderB } },
          ],
        },
      ],
      [{ id: "precomp", layers: [{ ty: 4, shapes: [{ ty: "fl", c: { a: 0, k: [0, 0, 0, 1] } }] }] }],
    );

    const result = analyzeLottie(animation);

    expect(result.colors.map((color) => color.originalHex)).toEqual([
      "#9B92F8",
      "#FFFFFF",
      "#000000",
    ]);
    expect(result.colors[0]).toMatchObject({
      occurrenceCount: 2,
      fillCount: 1,
      strokeCount: 1,
      usage: "both",
      order: 0,
    });
    expect(result.colors[0].occurrences.map((item) => item.alpha)).toEqual([0.35, 1]);
    expect(result).toMatchObject({
      editableColorCount: 3,
      editableOccurrenceCount: 4,
      fillCount: 2,
      strokeCount: 2,
    });
  });

  it("reports unsupported structures without including them as editable colors", () => {
    const animation = animationWith(
      [
        { ty: "gf", g: { p: 2, k: { a: 0, k: [] } } },
        { ty: "gs", g: { p: 2, k: { a: 0, k: [] } } },
        { ty: "fl", c: { a: 1, k: [{ t: 0, s: [1, 0, 0, 1] }] } },
        { ty: "st", c: { a: 0, k: [2, 0, 0, 1] } },
        { ty: "fl", c: { a: 0, k: [1, 0, 0, 1], x: "wiggle(1, 1)" } },
      ],
      [{ id: "image_0", w: 50, h: 50, e: 1, p: "data:image/png;base64,AAAA" }],
    );

    const result = analyzeLottie(animation);

    // The animated fill is now editable, so it is the one colour that survives
    // into the palette. Everything else here is genuinely unrecolourable.
    expect(result.colors.map((color) => color.key)).toEqual(["#FF0000"]);
    expect(result.colors[0].animatedCount).toBe(1);
    expect(result.hasUnsupportedFeatures).toBe(true);
    expect(result.unsupportedFeatures.map((feature) => [feature.code, feature.count])).toEqual([
      ["gradient-fill", 1],
      ["gradient-stroke", 1],
      ["malformed-color", 1],
      ["expression", 1],
      ["raster-asset", 1],
    ]);
    expect(result.unsupportedIssues.every((issue) => issue.jsonPath.startsWith("$."))).toBe(true);
  });

  it("treats each colour keyframe as an editable occurrence and keeps easing intact", () => {
    const animation = animationWith([
      {
        ty: "fl",
        nm: "Pulse",
        c: {
          a: 1,
          k: [
            { t: 0, s: [1, 0, 0, 1], i: { x: [0.5], y: [1] }, o: { x: [0.2], y: [0] } },
            { t: 30, s: [0, 0, 1, 0.5], i: { x: [0.4], y: [1] }, o: { x: [0.1], y: [0] } },
          ],
        },
      },
    ]);

    const result = analyzeLottie(animation);

    expect(result.colors.map((color) => color.key)).toEqual(["#FF0000", "#0000FF"]);
    expect(result.colors.every((color) => color.animatedCount === 1)).toBe(true);
    expect(result.colors[1].occurrences[0]).toMatchObject({
      animated: true,
      keyframeIndex: 1,
      keyframeTime: 30,
      alpha: 0.5,
    });
    expect(result.unsupportedFeatures).toEqual([]);

    const recolored = recolorLottieWithReport(animation, {
      "#FF0000": "#00FF00",
      "#0000FF": "#FFFF00",
    });
    type Keyframe = { s: number[]; t: number; i: unknown; o: unknown };
    const keyframes = (
      recolored.animation as unknown as {
        layers: Array<{ shapes: Array<{ c: { k: Keyframe[] } }> }>;
      }
    ).layers[0].shapes[0].c.k;

    expect(recolored.appliedOccurrenceCount).toBe(2);
    // Alpha and the easing handles must survive untouched: recolouring may not
    // change the timing of the animation.
    expect(keyframes[0].s).toEqual([0, 1, 0, 1]);
    expect(keyframes[1].s).toEqual([1, 1, 0, 0.5]);
    expect(keyframes[0].i).toEqual({ x: [0.5], y: [1] });
    expect(keyframes[1].o).toEqual({ x: [0.1], y: [0] });
    expect(keyframes[1].t).toBe(30);
  });

  it("reads gradient stops as editable colours and leaves the opacity ramp alone", () => {
    const animation = animationWith([
      {
        ty: "gf",
        nm: "Ramp",
        // Three colour stops, then two opacity stops. Nothing in the array marks
        // the boundary; only `p` does.
        g: {
          p: 3,
          k: {
            a: 0,
            k: [
              0, 1, 0, 0,
              0.5, 0, 1, 0,
              1, 0, 0, 1,
              0, 1,
              1, 0.25,
            ],
          },
        },
      },
    ]);

    const result = analyzeLottie(animation);

    expect(result.colors.map((color) => color.key)).toEqual(["#FF0000", "#00FF00", "#0000FF"]);
    expect(result.colors.every((color) => color.gradientCount === 1)).toBe(true);
    expect(result.colors[1].occurrences[0]).toMatchObject({
      shapeType: "gf",
      kind: "fill",
      gradientStopIndex: 1,
    });
    expect(result.unsupportedFeatures).toEqual([]);

    const recolored = recolorLottieWithReport(animation, { "#00FF00": "#FFFF00" });
    const ramp = (
      recolored.animation as unknown as {
        layers: Array<{ shapes: Array<{ g: { k: { k: number[] } } }> }>;
      }
    ).layers[0].shapes[0].g.k.k;

    expect(recolored.appliedOccurrenceCount).toBe(1);
    // Only the middle stop's three channels moved.
    expect(ramp).toEqual([
      0, 1, 0, 0,
      0.5, 1, 1, 0,
      1, 0, 0, 1,
      0, 1,
      1, 0.25,
    ]);
  });

  it("refuses a gradient whose stop count disagrees with its ramp", () => {
    // `p: 3` claims three colour stops, but the array only holds two. Reading
    // the third would run into the opacity pairs and erase them on write.
    const animation = animationWith([
      { ty: "gf", g: { p: 3, k: { a: 0, k: [0, 1, 0, 0, 1, 0, 0, 1, 0, 1] } } },
    ]);

    const result = analyzeLottie(animation);

    expect(result.colors).toEqual([]);
    expect(result.unsupportedFeatures.map((f) => [f.code, f.count])).toEqual([
      ["gradient-fill", 1],
    ]);

    const snapshot = JSON.stringify(animation);
    const recolored = recolorLottieWithReport(animation, { "#FF0000": "#00FF00" });
    // A ramp it cannot read is a ramp it must not write.
    expect(JSON.stringify(recolored.animation)).toBe(snapshot);
    expect(recolored.appliedOccurrenceCount).toBe(0);
  });

  it("recolours an animated gradient per keyframe", () => {
    const animation = animationWith([
      {
        ty: "gs",
        g: {
          p: 2,
          k: {
            a: 1,
            k: [
              { t: 0, s: [0, 1, 0, 0, 1, 0, 0, 1] },
              { t: 30, s: [0, 0, 0, 1, 1, 1, 0, 0] },
            ],
          },
        },
      },
    ]);

    const result = analyzeLottie(animation);
    expect(result.colors.map((c) => c.key)).toEqual(["#FF0000", "#0000FF"]);
    expect(result.colors[0].animatedCount).toBe(2);
    expect(result.colors[0].gradientCount).toBe(2);

    const recolored = recolorLottieWithReport(animation, { "#FF0000": "#00FF00" });
    const frames = (
      recolored.animation as unknown as {
        layers: Array<{ shapes: Array<{ g: { k: { k: Array<{ s: number[]; t: number }> } } }> }>;
      }
    ).layers[0].shapes[0].g.k.k;

    // #FF0000 is stop 0 of frame 0 and stop 1 of frame 1.
    expect(recolored.appliedOccurrenceCount).toBe(2);
    expect(frames[0].s).toEqual([0, 0, 1, 0, 1, 0, 0, 1]);
    expect(frames[1].s).toEqual([0, 0, 0, 1, 1, 0, 1, 0]);
    expect(frames[1].t).toBe(30);
  });

  it("does not report an expression that governs a non-colour property", () => {
    const animation = animationWith([{ ty: "fl", c: { a: 0, k: [1, 0, 0, 1] } }]);
    // A rotation expression is the common case in real exports. A colour editor
    // neither edits nor is affected by it, so it must not be reported.
    (animation.layers[0] as Record<string, unknown>).ks = {
      r: { a: 1, x: "loopOut()", k: [{ t: 0, s: [0] }] },
    };

    const result = analyzeLottie(animation);

    expect(result.unsupportedFeatures).toEqual([]);
    expect(result.colors.map((color) => color.key)).toEqual(["#FF0000"]);
  });
});

describe("Lottie recoloring", () => {
  it("recolors all normalized matches in a deep clone and preserves alpha and unrelated data", () => {
    const animation = animationWith([
      {
        ty: "gr",
        it: [
          { ty: "fl", c: { a: 0, k: [109 / 255, 106 / 255, 136 / 255, 0.27] } },
          { ty: "st", c: { a: 0, k: [0.42745099, 0.41568627, 0.53333334, 0.83] }, w: { a: 0, k: 7 } },
          { ty: "fl", c: { a: 1, k: [{ t: 0, s: [109 / 255, 106 / 255, 136 / 255, 1] }] } },
        ],
      },
    ]);
    const untouchedSnapshot = JSON.stringify(animation);

    const report = recolorLottieWithReport(animation, { "#6d6a88": "cb2039" });
    const nested = (report.animation.layers[0].shapes as Array<Record<string, unknown>>)[0];
    const items = nested.it as Array<{ c: { k: number[] | unknown[] } }>;

    expect(JSON.stringify(animation)).toBe(untouchedSnapshot);
    expect(report.animation).not.toBe(animation);
    // Three, not two: the animated fill shares this colour and is now recoloured
    // on its keyframe rather than skipped.
    expect(report.appliedOccurrenceCount).toBe(3);
    expect(report.appliedByOriginalColor).toEqual({ "#6D6A88": 3 });
    expect(report.unmatchedOriginalColors).toEqual([]);
    expect(items[0].c.k).toEqual([203 / 255, 32 / 255, 57 / 255, 0.27]);
    expect(items[1].c.k).toEqual([203 / 255, 32 / 255, 57 / 255, 0.83]);
    expect(items[2].c.k).toEqual([{ t: 0, s: [203 / 255, 32 / 255, 57 / 255, 1] }]);
    expect((items[1] as unknown as { w: unknown }).w).toEqual({ a: 0, k: 7 });
  });

  it("does not canonicalize floats when a replacement resolves to the original color", () => {
    const animation = animationWith([{ ty: "fl", c: { a: 0, k: [0.42745099, 0.41568627, 0.53333334, 0.4] } }]);
    const recolored = recolorLottie(animation, { "#6D6A88": "#6D6A88" });
    expect(recolored).toEqual(animation);
    expect(recolored).not.toBe(animation);
  });

  it("rejects malformed replacement HEX rather than silently skipping it", () => {
    const animation = animationWith([{ ty: "fl", c: { a: 0, k: [0, 0, 0, 1] } }]);
    expect(() => recolorLottie(animation, { "#000000": "red" })).toThrow("Invalid replacement HEX");
  });
});

describe("Lottie parsing, metadata, and output validation", () => {
  it("extracts timing and nested layer metadata", () => {
    const animation = animationWith(
      [{ ty: "fl", c: { a: 0, k: [1, 1, 1, 1] } }],
      [{ id: "precomp", layers: [{ ty: 4 }, { ty: 2 }] }],
    );

    const parsed = parseLottieJson(JSON.stringify(animation));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.metadata).toMatchObject({
      version: "5.9.6",
      width: 1600,
      height: 1200,
      frameRate: 30,
      durationSeconds: 5.6,
      topLevelLayerCount: 1,
      totalLayerCount: 3,
      vectorLayerCount: 2,
      rasterLayerCount: 1,
      precompositionCount: 1,
    });
  });

  it("returns actionable validation errors for invalid JSON and non-Lottie objects", () => {
    const invalidJson = parseLottieJson("{not json");
    expect(invalidJson.ok).toBe(false);
    if (!invalidJson.ok) expect(invalidJson.errors[0].code).toBe("invalid-json");

    const notLottie = validateLottieDocument({ hello: "world" });
    expect(notLottie.valid).toBe(false);
    expect(notLottie.errors.map((issue) => issue.code)).toEqual([
      "invalid-dimensions",
      "invalid-frame-rate",
      "invalid-frame-range",
      "invalid-layers",
    ]);
  });

  it("validates the serialized recolored document and produces the download filename", () => {
    const animation = animationWith([{ ty: "fl", c: { a: 0, k: [1, 1, 1, 1] } }]);
    const serialized = serializeLottieJson(recolorLottie(animation, { "#FFFFFF": "#CB2039" }));
    expect(parseLottieJson(serialized).ok).toBe(true);
    expect(appendRecoloredSuffix("motion.JSON")).toBe("motion-recolored.json");
    expect(appendRecoloredSuffix("motion")).toBe("motion-recolored.json");
  });
});
