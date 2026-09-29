import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * A document, or a copied piece of one, as plain text that reads well.
 *
 * Whenever something pastes as plain text — a chat, a form field, a plain-text
 * email — this is what arrives. The editor's default puts a blank line between
 * every node it meets, and in a table every row and every cell is a node, so a
 * four-row table came out as a column of cells separated by up to eight empty
 * lines. Here a paragraph is separated by one blank line, a table keeps one
 * line per row, and lists keep a marker that reads as a list anywhere without
 * being Markdown: • for bullets, numbers for numbered lists, ☐ and ☑ for a
 * checklist.
 *
 * The same text is stored for search, so what search matches is what a person
 * would read.
 */
export function documentPlainText(content: Fragment | ProseMirrorNode): string {
  const blocks: string[] = [];
  // A whole document and a copied fragment both hand over their top-level
  // blocks through forEach, so either can be passed.
  content.forEach((node) => walk(node, blocks));
  // Each block loses blank lines at its edges only. Trimming spaces would strip
  // the indentation off a code block, and collapsing blank lines everywhere
  // would squash the ones inside it; in a code block both are the layout.
  return blocks
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.length > 0)
    .join("\n\n");
}

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

/** Text of a paragraph or heading, with line breaks kept as line breaks. */
function inlineText(node: ProseMirrorNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.isText) out += child.text ?? "";
    else if (child.type.name === "hardBreak") out += "\n";
    else out += inlineText(child);
  });
  return out;
}

function walk(node: ProseMirrorNode, blocks: string[]) {
  const name = node.type.name;
  if (name === "codeBlock") {
    blocks.push(node.textContent);
  } else if (name === "horizontalRule") {
    blocks.push("———");
  } else if (LISTS.has(name)) {
    blocks.push(listText(node, ""));
  } else if (name === "table") {
    blocks.push(tableText(node));
  } else if (node.isTextblock) {
    const text = inlineText(node);
    if (text.trim()) blocks.push(text);
  } else {
    // Containers such as quotes: their content, without a Markdown marker.
    node.forEach((child) => walk(child, blocks));
  }
}

function listText(list: ProseMirrorNode, indent: string): string {
  const lines: string[] = [];
  let number = typeof list.attrs.start === "number" ? list.attrs.start : 1;

  list.forEach((item) => {
    const marker =
      list.type.name === "orderedList"
        ? `${number++}. `
        : list.type.name === "taskList"
          ? item.attrs.checked ? "☑ " : "☐ "
          : "• ";
    const continuation = indent + " ".repeat(marker.length);
    let first = true;

    item.forEach((child) => {
      if (LISTS.has(child.type.name)) {
        lines.push(listText(child, continuation));
        return;
      }
      const text = child.isTextblock ? inlineText(child) : child.textContent;
      const prefix = first ? indent + marker : continuation;
      lines.push(prefix + text.replace(/\n/g, `\n${continuation}`));
      first = false;
    });
    // An item whose only content was a nested list still needs its marker.
    if (first) lines.push(indent + marker.trimEnd());
  });

  return lines.join("\n");
}

function tableText(table: ProseMirrorNode): string {
  const rows: string[] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      const parts: string[] = [];
      cell.forEach((child) => {
        const text = child.isTextblock ? inlineText(child) : child.textContent;
        if (text.trim()) parts.push(text.replace(/\s*\n\s*/g, " ").trim());
      });
      cells.push(parts.join(" "));
    });
    rows.push(cells.join(" | "));
  });
  return rows.join("\n");
}
