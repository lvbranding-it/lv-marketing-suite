import { describe, expect, it } from "vitest";
import {
  blocksToHtml,
  escapeHtml,
  looksLikeMarkdown,
  markdownToHtml,
  plainTextToHtml,
  type LegacyBlock,
} from "./document";

const block = (type: LegacyBlock["type"], text: string, position: number, checked?: boolean): LegacyBlock => ({
  type,
  position,
  content: checked === undefined ? { text } : { text, checked },
});

describe("recognising Markdown", () => {
  it.each([
    ["a heading", "## Updated Confirmation Email"],
    ["bold", "**Subject:** You're in"],
    ["a fence", "```\nflyer copy\n```"],
    ["a quote", "> Hi [First name],"],
    ["a checklist", "- [ ] confirm venue"],
    ["a link", "See [the brief](https://lvbranding.com/brief)"],
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |"],
    ["two list lines", "- one\n- two"],
  ])("recognises %s", (_label, text) => expect(looksLikeMarkdown(text)).toBe(true));

  /**
   * The cost of a false positive is rewriting someone's plain writing, so
   * ordinary text with the odd symbol in it has to be left exactly as typed.
   */
  it.each([
    ["a plain sentence", "Call Ana about the venue on Friday."],
    ["one dash line", "- call Ana"],
    ["a single asterisk", "Budget is 5 * 3 hours"],
    ["a hashtag", "#launch is trending"],
    ["an email", "Write to hello@lvbranding.com"],
    ["a Python name", "Override __init__ in the class"],
    ["empty", ""],
  ])("leaves %s alone", (_label, text) => expect(looksLikeMarkdown(text)).toBe(false));

  /**
   * Taken from a real page: an env file whose comment lines start "# ". Read
   * as Markdown, the comments became headings and every setting ran into one
   * paragraph, which destroyed the file.
   */
  it("leaves a pasted env file alone, comments and all", () => {
    const env = [
      "APP_URL=https://example.test",
      "",
      "# Required local runtime database connection.",
      "DATABASE_URL=postgres://user:password@host/database",
      "",
      "# Optional local-only fallback.",
      "LOCAL_FALLBACK=false",
      "DEFAULT_LOCALE=es",
    ].join("\n");
    expect(looksLikeMarkdown(env)).toBe(false);
  });

  it("does not read a comment sitting on top of a line as a heading", () => {
    expect(looksLikeMarkdown("# set this first\nsomething = 1")).toBe(false);
    expect(looksLikeMarkdown("Intro\n\n# A real heading\n\nBody")).toBe(true);
  });
});

describe("plain text as paragraphs", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(plainTextToHtml("First line\nsecond line\n\nNew paragraph")).toBe(
      "<p>First line<br>second line</p><p>New paragraph</p>",
    );
  });

  it("escapes anything that could become markup", () => {
    expect(plainTextToHtml('<script>alert("x")</script>')).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
  });

  it("returns nothing for whitespace", () => expect(plainTextToHtml("  \n\n ")).toBe(""));
});

describe("Markdown as editor HTML", () => {
  it("turns the literal markers into formatting", async () => {
    const html = await markdownToHtml("## Title\n\n**Front:** text");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>Front:</strong> text");
    expect(html).not.toContain("**");
    expect(html).not.toContain("##");
  });

  /**
   * GFM renders a checklist as disabled checkboxes in an ordinary list. The
   * editor would read that as bullets and throw the ticks away.
   */
  it("keeps checklists as checklists, ticks included", async () => {
    const html = await markdownToHtml("- [ ] open\n- [x] done");
    expect(html).toContain('<ul data-type="taskList">');
    expect(html).toContain('<li data-type="taskItem" data-checked="false">open</li>');
    expect(html).toContain('<li data-type="taskItem" data-checked="true">done</li>');
    expect(html).not.toContain("<input");
  });

  it("keeps tables as tables", async () => {
    const html = await markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("brings deep headings up to the smallest the editor keeps", async () => {
    expect(await markdownToHtml("#### Small")).toBe("<h3>Small</h3>");
  });

  it("escapes raw HTML instead of rendering it", async () => {
    const html = await markdownToHtml("<script>alert(1)</script>\n\n**ok**");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  /**
   * Pasted flyer copy is laid out line by line inside a fence. The newlines are
   * the layout, so losing them puts the whole flyer on one line.
   */
  it("keeps every line of a code fence, which is what holds a flyer's layout", async () => {
    const html = await markdownToHtml("```\n   You Can Bloom With Us.\n\n   Join the waitlist\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("   You Can Bloom With Us.\n\n   Join the waitlist");
  });

  /** A quoted email or a caption written one line at a time must not run together. */
  it("keeps single line breaks instead of joining lines into one sentence", async () => {
    const html = await markdownToHtml("> Hi Ana,\n> You're in the forest.\n\n**Story:**\nLine one\nLine two");
    expect(html).toMatch(/Hi Ana,<br\s*\/?>\s*You/);
    expect(html).toMatch(/Line one<br\s*\/?>\s*Line two/);
  });
});

describe("a page of blocks as one document", () => {
  it("keeps the order blocks were placed in, not the order they arrive in", async () => {
    const html = await blocksToHtml([block("paragraph", "second", 2000), block("paragraph", "first", 1000)]);
    expect(html).toBe("<p>first</p><p>second</p>");
  });

  it("maps every block type to its counterpart", async () => {
    const html = await blocksToHtml([
      block("heading", "Overview", 0),
      block("subheading", "Channels", 1000),
      block("quote", "Definition of done", 2000),
      block("divider", "", 3000),
      block("paragraph", "Body", 4000),
    ]);
    expect(html).toBe(
      "<h1>Overview</h1><h2>Channels</h2><blockquote><p>Definition of done</p></blockquote><hr><p>Body</p>",
    );
  });

  /** One list per run of bullets, not one list per line. */
  it("joins consecutive bullets into a single list", async () => {
    const html = await blocksToHtml([
      block("bullet", "Email", 0),
      block("bullet", "Social", 1000),
      block("paragraph", "then", 2000),
      block("bullet", "Paid", 3000),
    ]);
    expect(html).toBe(
      "<ul><li><p>Email</p></li><li><p>Social</p></li></ul><p>then</p><ul><li><p>Paid</p></li></ul>",
    );
  });

  it("joins consecutive to-dos into one checklist and keeps what was ticked", async () => {
    const html = await blocksToHtml([block("todo", "Confirm owner", 0, true), block("todo", "Book venue", 1000, false)]);
    expect(html).toBe(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="true"><p>Confirm owner</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>Book venue</p></li>' +
        "</ul>",
    );
  });

  it("formats a paragraph block that was pasted AI Markdown", async () => {
    const html = await blocksToHtml([block("paragraph", "## Updated flyer\n\n**Front:** Bloom with us", 0)]);
    expect(html).toContain("<h2>Updated flyer</h2>");
    expect(html).toContain("<strong>Front:</strong>");
  });

  it("keeps empty paragraphs used as spacing, drops the ones at either end", async () => {
    const html = await blocksToHtml([
      block("paragraph", "", 0),
      block("paragraph", "One", 1000),
      block("paragraph", "", 2000),
      block("paragraph", "Two", 3000),
      block("paragraph", "", 4000),
    ]);
    expect(html).toBe("<p>One</p><p></p><p>Two</p>");
  });

  it("gives an empty page an empty document", async () => {
    expect(await blocksToHtml([block("paragraph", "", 0)])).toBe("");
    expect(await blocksToHtml([])).toBe("");
  });

  it("tolerates content that is not the shape it should be", async () => {
    const broken = { type: "paragraph", position: 0, content: null } as LegacyBlock;
    expect(await blocksToHtml([broken, block("paragraph", "fine", 1000)])).toBe("<p>fine</p>");
  });
});

it("escapes the characters that matter in HTML", () => {
  expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});
