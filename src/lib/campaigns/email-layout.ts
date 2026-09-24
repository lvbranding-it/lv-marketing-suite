/**
 * How an email body is inset, and how an image escapes that inset.
 *
 * The composer preview and the sent email are built by two different pieces of
 * code — one in the browser, one in the send function — and they had drifted:
 * the preview inset the body by 36px a side, the real email by 32px. A
 * full-bleed image is a negative margin that has to cancel that inset exactly,
 * so the number lives here and both shells read it.
 */

/** Horizontal inset of the email body, in pixels. */
export const EMAIL_SIDE_PADDING = 32;
/** Vertical inset of the email body, in pixels. */
export const EMAIL_TOP_PADDING = 36;

/** The style an ordinary image carries. */
export const IMAGE_STYLE = "max-width:100%;height:auto;display:block;margin:8px 0;";

/** Widest an email body gets, and the width of its content once inset. */
export const EMAIL_MAX_WIDTH = 600;
export const EMAIL_CONTENT_WIDTH = EMAIL_MAX_WIDTH - EMAIL_SIDE_PADDING * 2;

/**
 * The style that pulls an image out to the edges of the email.
 *
 * A client that understands `calc()` widens the image by exactly the inset on
 * each side and the negative margins pull it out flush. Outlook's Word engine
 * understands neither, so it drops both and would fall back to `max-width:none`
 * — the image at natural size, several times the width of the email.
 *
 * The guard is the HTML `width` attribute, set alongside this style. Outlook
 * honours it and renders an ordinary inset image; every modern client lets the
 * CSS width win and renders the full bleed. A second `width` declaration in the
 * style would have been simpler, but the DOM collapses duplicate properties on
 * the way to being saved, so only the last one survives.
 */
export const FULL_BLEED_STYLE = [
  "display:block",
  "height:auto",
  `margin:16px -${EMAIL_SIDE_PADDING}px`,
  `width:calc(100% + ${EMAIL_SIDE_PADDING * 2}px)`,
  "max-width:none",
].join(";") + ";";

/** What Outlook falls back to when it drops the calc. */
export const FULL_BLEED_FALLBACK_WIDTH = String(EMAIL_CONTENT_WIDTH);

/** Marks the element so the editors can tell what a person chose. */
export const FULL_BLEED_ATTR = "data-full-bleed";

export const imageStyleFor = (fullBleed: boolean) => (fullBleed ? FULL_BLEED_STYLE : IMAGE_STYLE);

/** Whether an image is currently set to run to the edges. */
export function isFullBleed(element: { getAttribute(name: string): string | null }): boolean {
  return element.getAttribute(FULL_BLEED_ATTR) === "true";
}

/**
 * Switches one image element between inset and full bleed.
 *
 * Both the marker and the style are set together: the marker is what the UI
 * reads back, and the style is what an email client acts on. Setting only one
 * produces a button that looks toggled and an email that is not.
 */
export function applyFullBleed(
  element: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
  fullBleed: boolean,
): void {
  element.setAttribute("style", imageStyleFor(fullBleed));
  if (fullBleed) {
    element.setAttribute(FULL_BLEED_ATTR, "true");
    element.setAttribute("width", FULL_BLEED_FALLBACK_WIDTH);
  } else {
    element.removeAttribute(FULL_BLEED_ATTR);
    element.removeAttribute("width");
  }
}

/** The CSS both shells use so the preview matches what is sent. */
export const EMAIL_BODY_PADDING = `${EMAIL_TOP_PADDING}px ${EMAIL_SIDE_PADDING}px`;

/**
 * Where a call-to-action points before anyone sets it.
 *
 * Kept here rather than in the composer so the send guard and the block
 * templates cannot disagree about what "unset" looks like.
 */
export const LINK_PLACEHOLDER = "#set-the-destination-url";

/** How many links in a body still point nowhere. */
export function countUnsetLinks(html: string): number {
  return (html.match(new RegExp(`href="${LINK_PLACEHOLDER}"`, "g")) ?? []).length;
}
