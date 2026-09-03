const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

export const SVG_SNAPSHOT_MIME_TYPE = "image/svg+xml;charset=utf-8";

export type LottieSvgVariant = "original" | "recolored";

export interface SvgSnapshotOptions {
  /** Optional intrinsic dimensions for the downloaded document. */
  width?: number;
  height?: number;
}

export interface LottieSvgFrameExportOptions extends SvgSnapshotOptions {
  variant: LottieSvgVariant;
  frame: number;
}

export interface SvgSnapshot {
  /** Complete standalone SVG source, including its XML declaration. */
  svg: string;
  /** The same source packaged for a browser download. */
  blob: Blob;
}

export interface LottieSvgFrameExport extends SvgSnapshot {
  filename: string;
}

const UNSAFE_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "discard",
  "script",
  "set",
  "foreignobject",
  "iframe",
  "object",
  "embed",
]);

const SAFE_EMBEDDED_IMAGE = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z\d+/=\s]+$/i;
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/giu;

function isSafeResourceReference(value: string): boolean {
  const reference = value.trim();
  return (reference.startsWith("#") && reference.length > 1)
    || SAFE_EMBEDDED_IMAGE.test(reference);
}

function containsUnsafeCss(value: string): boolean {
  if (/javascript\s*:|expression\s*\(|@import\b|behavior\s*:/iu.test(value)) return true;
  if (!/url\s*\(/iu.test(value)) return false;

  const references = [...value.matchAll(CSS_URL)];
  // Treat malformed url() syntax conservatively instead of emitting CSS that
  // a browser may interpret differently from this parser.
  return references.length === 0
    || references.some((match) => !isSafeResourceReference(match[2]));
}

function sanitizeClone(root: SVGSVGElement): void {
  const descendants = Array.from(root.querySelectorAll("*"));

  for (const element of descendants) {
    const elementName = element.localName.toLowerCase();
    if (element.namespaceURI !== SVG_NAMESPACE || UNSAFE_ELEMENTS.has(elementName)) {
      element.remove();
      continue;
    }

    if (elementName === "style" && containsUnsafeCss(element.textContent || "")) {
      element.remove();
      continue;
    }
  }

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      const isHref = attribute.localName.toLowerCase() === "href";

      if (
        name.startsWith("on")
        || /javascript\s*:/iu.test(value)
        || (isHref && !isSafeResourceReference(value))
        || ((name === "style" || /url\s*\(/iu.test(value)) && containsUnsafeCss(value))
      ) {
        element.removeAttributeNode(attribute);
      }
    }
  }
}

function normalizedDimension(value: number | undefined, label: "width" | "height"): string | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`SVG export ${label} must be a positive finite number.`);
  }
  return String(value);
}

function assertSvgRoot(value: SVGSVGElement): void {
  const candidate = value as SVGSVGElement | null | undefined;
  if (
    !candidate
    || typeof candidate.cloneNode !== "function"
    || typeof candidate.localName !== "string"
    || candidate.localName.toLowerCase() !== "svg"
  ) {
    throw new TypeError("An SVG root element is required to export the current frame.");
  }

  if (candidate.namespaceURI && candidate.namespaceURI !== SVG_NAMESPACE) {
    throw new TypeError("The export root is not in the SVG namespace.");
  }
}

/**
 * Makes a detached, deep copy and adds the declarations needed when the SVG is
 * opened outside the page. All renderer-authored attributes, inline styles,
 * definitions, and current-frame geometry remain on the copy.
 */
function cloneStandaloneSvg(
  source: SVGSVGElement,
  options: SvgSnapshotOptions,
): SVGSVGElement {
  assertSvgRoot(source);

  const clone = source.cloneNode(true) as SVGSVGElement;
  if (clone === source || clone.localName.toLowerCase() !== "svg") {
    throw new TypeError("The SVG renderer did not provide a cloneable root element.");
  }

  // Namespace declarations are not guaranteed to appear as ordinary DOM
  // attributes, even though the live element itself is namespaced. Lottie may
  // also provide no-namespace declarations, so remove those before installing
  // canonical declarations to avoid duplicate xmlns attributes after XML serialization.
  for (const attribute of Array.from(clone.attributes)) {
    if (attribute.name === "xmlns" || attribute.name === "xmlns:xlink") {
      clone.removeAttributeNode(attribute);
    }
  }
  clone.setAttributeNS(XMLNS_NAMESPACE, "xmlns", SVG_NAMESPACE);
  clone.setAttributeNS(XMLNS_NAMESPACE, "xmlns:xlink", XLINK_NAMESPACE);
  sanitizeClone(clone);

  const width = normalizedDimension(options.width, "width");
  const height = normalizedDimension(options.height, "height");
  if (width !== null) clone.setAttribute("width", width);
  if (height !== null) clone.setAttribute("height", height);
  return clone;
}

/**
 * Serializes the renderer's current SVG state without mutating the live DOM.
 * XMLSerializer handles XML escaping for text and attribute values.
 */
export function serializeSvgSnapshot(
  source: SVGSVGElement,
  options: SvgSnapshotOptions = {},
): string {
  const clone = cloneStandaloneSvg(source, options);
  const Serializer = globalThis.XMLSerializer;

  if (typeof Serializer !== "function") {
    throw new Error("SVG export is not supported in this browser.");
  }

  let serialized: string;
  try {
    serialized = new Serializer().serializeToString(clone).trim();
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(`The SVG frame could not be serialized.${detail}`);
  }

  if (!serialized) {
    throw new Error("The SVG frame could not be serialized because the result was empty.");
  }

  return serialized.startsWith("<?xml")
    ? serialized
    : `${XML_DECLARATION}\n${serialized}`;
}

/** Builds both representations from one serialization pass. */
export function createSvgSnapshot(
  source: SVGSVGElement,
  options: SvgSnapshotOptions = {},
): SvgSnapshot {
  const svg = serializeSvgSnapshot(source, options);
  return {
    svg,
    blob: new Blob([svg], { type: SVG_SNAPSHOT_MIME_TYPE }),
  };
}

/**
 * Reduces an uploaded path/name to a safe filename stem for the frame export.
 */
function filenameStem(filename: string): string {
  const trimmed = typeof filename === "string"
    ? filename.replace(/[\u0000-\u001f\u007f]/g, "").trim()
    : "";
  const leafName = trimmed.split(/[\\/]/).pop() || "animation.json";
  const stem = /\.json$/i.test(leafName) ? leafName.slice(0, -5) : leafName;
  return stem || "animation";
}

function normalizedFrame(frame: number): number {
  if (!Number.isFinite(frame) || frame < 0) {
    throw new RangeError("SVG export frame must be a non-negative finite number.");
  }
  return Math.round(frame);
}

export function createLottieSvgFrameFilename(
  filename: string,
  options: Pick<LottieSvgFrameExportOptions, "variant" | "frame">,
): string {
  if (options.variant !== "original" && options.variant !== "recolored") {
    throw new TypeError('SVG export variant must be either "original" or "recolored".');
  }

  const frame = String(normalizedFrame(options.frame)).padStart(4, "0");
  return `${filenameStem(filename)}-${options.variant}-frame-${frame}.svg`;
}

/** One-call result for the Motion Palette download action. */
export function createLottieSvgFrameExport(
  source: SVGSVGElement,
  sourceFilename: string,
  options: LottieSvgFrameExportOptions,
): LottieSvgFrameExport {
  return {
    ...createSvgSnapshot(source, options),
    filename: createLottieSvgFrameFilename(sourceFilename, options),
  };
}
