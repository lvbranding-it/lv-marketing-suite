import { describe, expect, it } from "vitest";
import {
  buildBrandedDocument, documentFileName, escapeHtml, markdownToHtml, transcriptToHtml,
} from "./document-export";

describe("markdownToHtml", () => {
  it("converts the markdown agent output actually uses", () => {
    const html = markdownToHtml("# Title\n## Section\n- one\n**bold** and *soft*");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>soft</em>");
  });

  it("builds a table with a header row and body rows", () => {
    const html = markdownToHtml("| Audience | Message |\n| --- | --- |\n| New | Ease |\n| Returning | Value |");
    expect(html).toContain("<th>Audience</th>");
    expect(html).toContain("<td>Returning</td>");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3);
  });

  it("escapes markup in the content rather than rendering it", () => {
    // A client name with an ampersand, or copy that mentions a tag.
    const html = markdownToHtml("Ruiz & Co <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("wraps loose lines in paragraphs and drops the empty ones", () => {
    const html = markdownToHtml("First line\n\nSecond line");
    expect(html).toContain("<p>First line</p>");
    expect(html).toContain("<p>Second line</p>");
    expect(html).not.toContain("<p></p>");
  });
});

describe("buildBrandedDocument", () => {
  const doc = (extra = {}) => buildBrandedDocument({
    title: "Brand Snapshot", meta: "Context · 14 Sep 2026", bodyHtml: "<p>Body</p>", ...extra,
  });

  it("puts the letterhead, the body and the notice in one document", () => {
    const html = doc();
    expect(html).toContain("LV Branding");
    expect(html).toContain("Strategy that works. Creativity that moves.");
    expect(html).toContain("<p>Body</p>");
    expect(html).toContain("CONFIDENTIAL");
  });

  it("adds a QR code only when there is somewhere to point", () => {
    expect(doc({ qrTarget: "https://example.test/agents/42" })).toContain("api.qrserver.com");
    expect(doc()).not.toContain("api.qrserver.com");
  });

  it("escapes the title and meta it is handed", () => {
    const html = doc({ title: 'Ruiz & Co "brief"', meta: "<b>meta</b>" });
    expect(html).toContain("Ruiz &amp; Co &quot;brief&quot;");
    expect(html).not.toContain("<b>meta</b>");
  });
});

describe("transcriptToHtml", () => {
  const turns = [
    { role: "user" as const, content: "What should the headline do?" },
    { role: "assistant" as const, content: "## Options\n- One", meta: "Strategist · 09:14" },
  ];

  it("labels who said what", () => {
    const html = transcriptToHtml(turns);
    expect(html).toContain("You");
    expect(html).toContain("LV Intelligence");
    expect(html).toContain("Strategist · 09:14");
  });

  it("renders each turn's markdown inside its own block", () => {
    const html = transcriptToHtml(turns);
    expect(html).toContain("<h2>Options</h2>");
    expect((html.match(/class="turn"/g) ?? []).length).toBe(2);
  });

  it("drops empty turns rather than printing a bare label", () => {
    expect(transcriptToHtml([{ role: "user", content: "   " }])).toBe("");
  });
});

describe("documentFileName", () => {
  it("dates the file so a folder of them sorts", () => {
    expect(documentFileName("Brand Snapshot", "pdf")).toMatch(/^Brand Snapshot \d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("strips what a file system would reject", () => {
    expect(documentFileName('Ruiz/Co: "brief"', "doc")).toMatch(/^Ruiz Co brief \d{4}-\d{2}-\d{2}\.doc$/);
  });

  it("never produces a nameless file", () => {
    expect(documentFileName("   ", "pdf")).toMatch(/^document \d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe("escapeHtml", () => {
  it("handles the characters that would otherwise become markup", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
