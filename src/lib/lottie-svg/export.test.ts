import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SVG_SNAPSHOT_MIME_TYPE,
  createLottieSvgFrameExport,
  createLottieSvgFrameFilename,
  createSvgSnapshot,
  serializeSvgSnapshot,
} from "./index";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

interface FakeAttribute {
  localName: string;
  name: string;
  value: string;
}

class FakeSvgNode {
  readonly localName: string;
  readonly namespaceURI: string;
  readonly attributes: FakeAttribute[] = [];
  readonly children: FakeSvgNode[] = [];
  parent: FakeSvgNode | null = null;
  textContent: string;

  constructor(
    localName: string,
    attributes: Record<string, string> = {},
    children: FakeSvgNode[] = [],
    textContent = "",
    namespaceURI = SVG_NAMESPACE,
  ) {
    this.localName = localName;
    this.namespaceURI = namespaceURI;
    this.textContent = textContent;
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
    for (const child of children) this.appendChild(child);
  }

  appendChild(child: FakeSvgNode): void {
    child.parent = this;
    this.children.push(child);
  }

  cloneNode(deep: boolean): FakeSvgNode {
    return new FakeSvgNode(
      this.localName,
      Object.fromEntries(this.attributes.map(({ name, value }) => [name, value])),
      deep ? this.children.map((child) => child.cloneNode(true)) : [],
      this.textContent,
      this.namespaceURI,
    );
  }

  getAttribute(name: string): string | null {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null;
  }

  setAttribute(name: string, value: string): void {
    const existing = this.attributes.find((attribute) => attribute.name === name);
    if (existing) {
      existing.value = value;
      return;
    }
    this.attributes.push({
      name,
      localName: name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name,
      value,
    });
  }

  setAttributeNS(_namespace: string, name: string, value: string): void {
    this.setAttribute(name, value);
  }

  removeAttributeNode(attribute: FakeAttribute): void {
    const index = this.attributes.indexOf(attribute);
    if (index >= 0) this.attributes.splice(index, 1);
  }

  querySelectorAll(_selector: string): FakeSvgNode[] {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
  }

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializeFakeNode(node: FakeSvgNode): string {
  const attributes = node.attributes
    .map(({ name, value }) => ` ${name}="${escapeXml(value)}"`)
    .join("");
  const contents = `${escapeXml(node.textContent)}${node.children.map(serializeFakeNode).join("")}`;
  return `<${node.localName}${attributes}>${contents}</${node.localName}>`;
}

let serializedRoot: FakeSvgNode | null = null;

class FakeXmlSerializer {
  serializeToString(node: FakeSvgNode): string {
    serializedRoot = node;
    return serializeFakeNode(node);
  }
}

function asSvg(node: FakeSvgNode): SVGSVGElement {
  return node as unknown as SVGSVGElement;
}

afterEach(() => {
  serializedRoot = null;
  vi.unstubAllGlobals();
});

describe("SVG frame serialization", () => {
  it("deep-clones the current frame, preserves attributes and styles, and adds namespaces", () => {
    vi.stubGlobal("XMLSerializer", FakeXmlSerializer);
    const path = new FakeSvgNode("path", {
      d: "M0 0L10 10",
      fill: "#CB2039",
      style: "opacity: 0.625; transform: none;",
      "data-label": 'Current & "safe"',
    });
    const source = new FakeSvgNode("svg", {
      xmlns: SVG_NAMESPACE,
      "xmlns:xlink": "http://www.w3.org/1999/xlink",
      viewBox: "0 0 1600 1200",
      preserveAspectRatio: "xMidYMid meet",
      style: "width: 100%; height: 100%;",
    }, [path]);

    const result = serializeSvgSnapshot(asSvg(source), { width: 1600, height: 1200 });

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(result.match(/xmlns="/g)).toHaveLength(1);
    expect(result.match(/xmlns:xlink="/g)).toHaveLength(1);
    expect(result).toContain('viewBox="0 0 1600 1200"');
    expect(result).toContain('width="1600"');
    expect(result).toContain('height="1200"');
    expect(result).toContain('style="opacity: 0.625; transform: none;"');
    expect(result).toContain('data-label="Current &amp; &quot;safe&quot;"');

    expect(serializedRoot).not.toBe(source);
    expect(serializedRoot?.children[0]).not.toBe(path);
    expect(source.getAttribute("xmlns")).toBe(SVG_NAMESPACE);
    expect(source.getAttribute("xmlns:xlink")).toBe("http://www.w3.org/1999/xlink");
    expect(source.getAttribute("width")).toBeNull();
    expect(path.getAttribute("fill")).toBe("#CB2039");
  });

  it("keeps defs, masks, fragment references, and embedded raster images", () => {
    vi.stubGlobal("XMLSerializer", FakeXmlSerializer);
    const source = new FakeSvgNode("svg", {}, [
      new FakeSvgNode("defs", {}, [
        new FakeSvgNode("mask", { id: "cutout" }, [new FakeSvgNode("path", { fill: "white" })]),
        new FakeSvgNode("filter", { id: "shadow" }),
      ]),
      new FakeSvgNode("g", { mask: "url(#cutout)", filter: "url('#shadow')" }, [
        new FakeSvgNode("use", { href: "#shape" }),
        new FakeSvgNode("image", { href: "data:image/png;base64,iVBORw0KGgo=" }),
      ]),
    ]);

    const result = serializeSvgSnapshot(asSvg(source));

    expect(result).toContain("<defs>");
    expect(result).toContain('<mask id="cutout">');
    expect(result).toContain('mask="url(#cutout)"');
    expect(result).toContain("filter=\"url('#shadow')\"");
    expect(result).toContain('href="#shape"');
    expect(result).toContain('href="data:image/png;base64,iVBORw0KGgo="');
  });

  it("removes active content and external references from only the clone", () => {
    vi.stubGlobal("XMLSerializer", FakeXmlSerializer);
    const script = new FakeSvgNode("script", {}, [], "alert(1)");
    const animation = new FakeSvgNode("animate", {
      attributeName: "href",
      to: "https://tracking.example/animated.svg",
    });
    const foreignObject = new FakeSvgNode("foreignObject", {}, [
      new FakeSvgNode("div", {}, [], "HTML", "http://www.w3.org/1999/xhtml"),
    ]);
    const image = new FakeSvgNode("image", {
      href: "https://tracking.example/pixel.png",
      onload: "alert(1)",
    });
    const path = new FakeSvgNode("path", {
      fill: "url(https://tracking.example/paint.svg#red)",
      stroke: "url(#local-gradient)",
      style: "filter: url(https://tracking.example/filter.svg#blur)",
      onclick: "alert(1)",
    });
    const source = new FakeSvgNode("svg", {}, [script, animation, foreignObject, image, path]);

    const result = serializeSvgSnapshot(asSvg(source));

    expect(result).not.toContain("<script");
    expect(result).not.toContain("<animate");
    expect(result).not.toContain("foreignObject");
    expect(result).not.toContain("tracking.example");
    expect(result).not.toContain("onload=");
    expect(result).not.toContain("onclick=");
    expect(result).toContain('stroke="url(#local-gradient)"');

    expect(source.children).toContain(script);
    expect(source.children).toContain(animation);
    expect(source.children).toContain(foreignObject);
    expect(image.getAttribute("href")).toBe("https://tracking.example/pixel.png");
    expect(path.getAttribute("onclick")).toBe("alert(1)");
  });

  it("returns matching text and Blob representations", async () => {
    vi.stubGlobal("XMLSerializer", FakeXmlSerializer);
    const source = asSvg(new FakeSvgNode("svg", {}, [new FakeSvgNode("g")]));

    const snapshot = createSvgSnapshot(source);

    expect(snapshot.blob.type).toBe(SVG_SNAPSHOT_MIME_TYPE);
    expect(await snapshot.blob.text()).toBe(snapshot.svg);
  });

  it("returns a complete export object with visible variant, frame, and dimensions", async () => {
    vi.stubGlobal("XMLSerializer", FakeXmlSerializer);
    const frame = createLottieSvgFrameExport(
      asSvg(new FakeSvgNode("svg")),
      "campaign.animation.JSON",
      { variant: "original", frame: 41.6, width: 1600, height: 1200 },
    );

    expect(frame.filename).toBe("campaign.animation-original-frame-0042.svg");
    expect(frame.svg).toContain('width="1600"');
    expect(frame.svg).toContain('height="1200"');
    expect(await frame.blob.text()).toBe(frame.svg);
  });

  it("rejects invalid roots, dimensions, and unsupported serialization environments", () => {
    expect(() => serializeSvgSnapshot(asSvg(new FakeSvgNode("div")))).toThrow(
      "An SVG root element is required",
    );

    expect(() => serializeSvgSnapshot(asSvg(new FakeSvgNode("svg")), { width: 0 })).toThrow(
      "SVG export width must be a positive finite number",
    );

    expect(() => serializeSvgSnapshot(asSvg(new FakeSvgNode("svg")))).toThrow(
      "SVG export is not supported",
    );
  });

  it("wraps serializer failures in an actionable export error", () => {
    vi.stubGlobal("XMLSerializer", class {
      serializeToString(): string {
        throw new Error("Invalid XML character");
      }
    });

    expect(() => serializeSvgSnapshot(asSvg(new FakeSvgNode("svg")))).toThrow(
      "The SVG frame could not be serialized. Invalid XML character",
    );
  });
});

describe("SVG frame filenames", () => {
  it.each([
    ["motion.json", "recolored", 42, "motion-recolored-frame-0042.svg"],
    ["motion.JSON", "original", 0, "motion-original-frame-0000.svg"],
    ["motion", "recolored", 12345, "motion-recolored-frame-12345.svg"],
    ["  nested/path/motion.json  ", "original", 2.6, "motion-original-frame-0003.svg"],
    ["C:\\uploads\\motion.json", "recolored", 9, "motion-recolored-frame-0009.svg"],
    ["", "recolored", 1, "animation-recolored-frame-0001.svg"],
    [".json", "original", 1, "animation-original-frame-0001.svg"],
  ] as const)("derives %s as %s at %s", (source, variant, frame, expected) => {
    expect(createLottieSvgFrameFilename(source, { variant, frame })).toBe(expected);
  });

  it("rejects invalid frame values", () => {
    expect(() => createLottieSvgFrameFilename("motion.json", {
      variant: "recolored",
      frame: Number.NaN,
    })).toThrow("SVG export frame must be a non-negative finite number");
  });
});
