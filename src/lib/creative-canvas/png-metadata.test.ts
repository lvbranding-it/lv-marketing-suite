import { describe, expect, it } from "vitest";
import { embedPngMetadata, exportProvenance } from "./png-metadata";

const onePixelPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));

describe("PNG export provenance", () => {
  it("embeds LV Branding and developer provenance before IEND", async () => {
    const output = await embedPngMetadata(new Blob([onePixelPng], { type: "image/png" }), exportProvenance("Campaign image"));
    const text = new TextDecoder().decode(await output.arrayBuffer());
    expect(text).toContain("Author\0LV Branding");
    expect(text).toContain("Developer\0Luis Velasquez");
    expect(text).toContain("Software\0LV Branding Creative Canvas");
    expect(text.indexOf("Provenance\0")).toBeLessThan(text.indexOf("IEND"));
  });

  it("rejects non-PNG input", async () => {
    await expect(embedPngMetadata(new Blob(["not an image"]), {})).rejects.toThrow(/PNG/);
  });
});
