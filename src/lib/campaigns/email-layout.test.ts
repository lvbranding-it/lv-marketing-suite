import { describe, expect, it } from "vitest";
import {
  applyFullBleed, EMAIL_CONTENT_WIDTH, EMAIL_MAX_WIDTH, EMAIL_SIDE_PADDING,
  FULL_BLEED_ATTR, FULL_BLEED_FALLBACK_WIDTH, FULL_BLEED_STYLE,
  IMAGE_STYLE, imageStyleFor, isFullBleed,
} from "./email-layout";

/** Minimal stand-in for the element both editors hand in. */
const element = (attrs: Record<string, string> = {}) => ({
  attrs: { ...attrs },
  getAttribute(name: string) { return this.attrs[name] ?? null; },
  setAttribute(name: string, value: string) { this.attrs[name] = value; },
  removeAttribute(name: string) { delete this.attrs[name]; },
});

describe("the full-bleed style", () => {
  it("cancels the body inset exactly", () => {
    // If these ever disagree the image sits a few pixels off the edge, which
    // reads as a mistake rather than a choice.
    expect(FULL_BLEED_STYLE).toContain(`margin:16px -${EMAIL_SIDE_PADDING}px`);
    expect(FULL_BLEED_STYLE).toContain(`calc(100% + ${EMAIL_SIDE_PADDING * 2}px)`);
  });

  it("declares width exactly once, because the DOM keeps only the last", () => {
    // A duplicate declaration as an Outlook fallback does not survive being
    // written to an element and read back, so the guard is the width attribute.
    const widths = FULL_BLEED_STYLE.split(";").filter((rule) => rule.startsWith("width:"));
    expect(widths).toEqual([`width:calc(100% + ${EMAIL_SIDE_PADDING * 2}px)`]);
  });

  it("falls back to the content width for clients without calc", () => {
    expect(FULL_BLEED_FALLBACK_WIDTH).toBe(String(EMAIL_CONTENT_WIDTH));
    // 600 wide, inset 32 a side — the fallback must be the inner width, or
    // Outlook renders an image wider than the cell holding it.
    expect(EMAIL_CONTENT_WIDTH).toBe(EMAIL_MAX_WIDTH - EMAIL_SIDE_PADDING * 2);
  });

  it("keeps the ordinary image style constrained", () => {
    expect(IMAGE_STYLE).toContain("max-width:100%");
    expect(IMAGE_STYLE).not.toContain("calc");
  });
});

describe("applyFullBleed", () => {
  it("sets the marker and the style together", () => {
    const image = element();
    applyFullBleed(image, true);
    expect(image.getAttribute("style")).toBe(FULL_BLEED_STYLE);
    expect(image.getAttribute(FULL_BLEED_ATTR)).toBe("true");
    expect(image.getAttribute("width")).toBe(FULL_BLEED_FALLBACK_WIDTH);
    expect(isFullBleed(image)).toBe(true);
  });

  it("puts an image back the way it was", () => {
    const image = element();
    applyFullBleed(image, true);
    applyFullBleed(image, false);
    expect(image.getAttribute("style")).toBe(IMAGE_STYLE);
    // The marker has to go, or the toolbar keeps showing the image as full width.
    expect(image.getAttribute(FULL_BLEED_ATTR)).toBeNull();
    // The fallback width has to go too, or an inset image is pinned to 536px.
    expect(image.getAttribute("width")).toBeNull();
    expect(isFullBleed(image)).toBe(false);
  });

  it("reads an untouched image as inset", () => {
    expect(isFullBleed(element())).toBe(false);
    expect(isFullBleed(element({ [FULL_BLEED_ATTR]: "false" }))).toBe(false);
  });

  it("matches imageStyleFor", () => {
    expect(imageStyleFor(true)).toBe(FULL_BLEED_STYLE);
    expect(imageStyleFor(false)).toBe(IMAGE_STYLE);
  });
});
