/**
 * Turning what the workspace already holds into rich documents.
 *
 * Pages used to be lists of plain-text blocks, and much of what the team put in
 * them was pasted AI output: Markdown, whose ** and ## showed up as literal
 * characters. This module converts both shapes into the HTML the document
 * editor understands, and is shared by the one-time conversion of each page and
 * by paste, so text arriving either way ends up formatted the same.
 *
 * It is kept free of the editor and of Supabase so it can be tested on its own.
 */

/** The block shape pages were stored in before they became documents. */
export interface LegacyBlock {
  type: "paragraph" | "heading" | "subheading" | "bullet" | "todo" | "quote" | "divider";
  content: unknown;
  position: number;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function legacyText(block: LegacyBlock): string {
  const content = block.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const text = (content as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

function legacyChecked(block: LegacyBlock): boolean {
  const content = block.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  return (content as { checked?: unknown }).checked === true;
}

/** One line of text, escaped, with its own line breaks kept. */
function inlineHtml(text: string): string {
  return escapeHtml(text.replace(/\r\n?/g, "\n").trim()).replace(/\n/g, "<br>");
}

/**
 * Plain text as paragraphs.
 *
 * A blank line separates paragraphs; a single line break stays a line break
 * inside one. That is how the text was laid out when it was typed, so it is how
 * it should read once it can be formatted.
 */
export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${inlineHtml(paragraph)}</p>`)
    .join("");
}

/**
 * Whether a line is a Markdown heading rather than a comment.
 *
 * "# something" is also how shell, env and config files write comments, and the
 * workspace holds pasted env files. A real heading stands on its own with a
 * blank line on each side, which is how every Markdown writer and every AI
 * lays them out; a comment sits directly on top of the setting it describes.
 */
function hasStandaloneHeading(lines: string[]): boolean {
  return lines.some((line, index) => {
    if (!/^#{1,6}[ \t]+\S/.test(line)) return false;
    const before = index === 0 || !lines[index - 1].trim();
    const after = index === lines.length - 1 || !lines[index + 1].trim();
    return before && after;
  });
}

/** Mostly KEY=value lines: an env or config file, which is never Markdown. */
function looksLikeConfig(lines: string[]): boolean {
  const filled = lines.filter((line) => line.trim());
  if (filled.length < 3) return false;
  const settings = filled.filter((line) => /^\s*[A-Za-z_][\w.-]*\s*=/.test(line));
  return settings.length / filled.length >= 0.4;
}

/**
 * Whether text was written in Markdown.
 *
 * Deliberately conservative, because a false positive rewrites someone's plain
 * writing. Any one structural marker is enough — a standalone heading, bold, a
 * fence, a quote, a checklist, a link or a table — but list lines only count
 * when there are at least two, so a note that happens to start "- call Ana" is
 * left alone. Env and config files are ruled out first: their "# comments" and
 * one-setting-per-line layout would be destroyed by Markdown's rules.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 3) return false;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (looksLikeConfig(lines)) return false;
  if (hasStandaloneHeading(lines)) return true;
  const strong = [
    /\*\*[^*\n]+\*\*/,
    /^\s*```/m,
    /^\s*>\s?\S/m,
    /^\s*[-*+]\s+\[[ xX]\]\s/m,
    /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/,
    /^\s*\|.+\|\s*\n\s*\|?\s*:?-{3,}/m,
  ];
  if (strong.some((pattern) => pattern.test(text))) return true;
  const listLines = text.match(/^\s*(?:[-*+]|\d+[.)])\s+\S/gm) ?? [];
  return listLines.length >= 2;
}

/**
 * Markdown as editor HTML.
 *
 * Rendered through react-markdown, which the app already ships for agent
 * output, so this follows the same GFM rules as everywhere else. Raw HTML in
 * the source is escaped rather than rendered.
 *
 * A single line break is kept as a line break. Standard Markdown joins
 * consecutive lines into one paragraph, but that is not how anyone writes
 * them: a quoted email, a social caption or a flyer laid out line by line
 * would come out as one run-on sentence.
 *
 * Two rewrites fit the output to the editor. GFM checklists come out as
 * disabled checkboxes inside ordinary list items, which the editor would read as
 * plain bullets and drop the ticks from; they become its own checklist markup.
 * Headings below level three become level three, the smallest the editor keeps,
 * instead of silently falling back to body text.
 *
 * The renderer is imported on first use so it stays out of the page's initial
 * bundle — most sessions never paste Markdown or open an unconverted page.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const [
    { renderToStaticMarkup },
    { default: ReactMarkdown },
    { default: remarkGfm },
    { default: remarkBreaks },
    { createElement },
  ] = await Promise.all([
    import("react-dom/server"),
    import("react-markdown"),
    import("remark-gfm"),
    import("remark-breaks"),
    import("react"),
  ]);

  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkBreaks] }, markdown.replace(/\r\n?/g, "\n")),
  );

  return html
    .replace(/<ul class="contains-task-list">/g, '<ul data-type="taskList">')
    .replace(
      /<li class="task-list-item">(\s*<p>)?\s*<input type="checkbox" disabled=""( checked="")?\s*\/>\s*/g,
      (_match, paragraph: string | undefined, checked: string | undefined) =>
        `<li data-type="taskItem" data-checked="${checked ? "true" : "false"}">${paragraph ?? ""}`,
    )
    .replace(/<(\/?)h[456]>/g, "<$1h3>")
    // The renderer puts a newline after most tags. Between blocks it is only
    // formatting and would reach the editor as stray spaces, but inside a code
    // block it is the content itself, so code is left exactly as written.
    .split(/(<pre[\s\S]*?<\/pre>)/)
    .map((part) => (part.startsWith("<pre") ? part : part.replace(/\n/g, "")))
    .join("");
}

/** A paragraph block, which is where pasted AI output lives. */
async function paragraphHtml(text: string): Promise<string> {
  if (!text.trim()) return "<p></p>";
  return looksLikeMarkdown(text) ? markdownToHtml(text) : plainTextToHtml(text);
}

/**
 * A page's blocks as one document.
 *
 * Every block type has a direct counterpart. Consecutive bullets become one
 * list and consecutive to-dos one checklist, rather than a list per line.
 * Empty paragraphs inside the page are kept, because people used them as
 * spacing; the ones at either end are dropped, because they were only ever the
 * empty block a new page started with.
 */
export async function blocksToHtml(blocks: LegacyBlock[]): Promise<string> {
  const ordered = [...blocks].sort((a, b) => a.position - b.position);
  const parts: string[] = [];

  for (let index = 0; index < ordered.length; index++) {
    const block = ordered[index];
    const text = legacyText(block);

    if (block.type === "bullet" || block.type === "todo") {
      const run: LegacyBlock[] = [];
      while (index < ordered.length && ordered[index].type === block.type) run.push(ordered[index++]);
      index--;
      if (block.type === "bullet") {
        parts.push(`<ul>${run.map((item) => `<li><p>${inlineHtml(legacyText(item))}</p></li>`).join("")}</ul>`);
      } else {
        parts.push(
          `<ul data-type="taskList">${run
            .map(
              (item) =>
                `<li data-type="taskItem" data-checked="${legacyChecked(item) ? "true" : "false"}"><p>${inlineHtml(legacyText(item))}</p></li>`,
            )
            .join("")}</ul>`,
        );
      }
      continue;
    }

    switch (block.type) {
      case "heading":
        parts.push(`<h1>${inlineHtml(text)}</h1>`);
        break;
      case "subheading":
        parts.push(`<h2>${inlineHtml(text)}</h2>`);
        break;
      case "quote":
        parts.push(`<blockquote>${plainTextToHtml(text) || "<p></p>"}</blockquote>`);
        break;
      case "divider":
        parts.push("<hr>");
        break;
      default:
        parts.push(await paragraphHtml(text));
    }
  }

  while (parts[0] === "<p></p>") parts.shift();
  while (parts[parts.length - 1] === "<p></p>") parts.pop();
  return parts.join("");
}
