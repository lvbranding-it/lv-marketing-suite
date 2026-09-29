import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { workspaceExtensions } from "./editorExtensions";
import { documentPlainText } from "./plainText";

const schema = getSchema(workspaceExtensions());
const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (...content: object[]) => ({ type: "paragraph", content });
const doc = (...content: object[]) => schema.nodeFromJSON({ type: "doc", content });

const cell = (type: "tableHeader" | "tableCell", value: string) => ({ type, content: [para(text(value))] });
const table = (...rows: string[][]) => ({
  type: "table",
  content: rows.map((row, index) => ({
    type: "tableRow",
    content: row.map((value) => cell(index === 0 ? "tableHeader" : "tableCell", value)),
  })),
});

describe("a document as plain text", () => {
  it("separates paragraphs with exactly one blank line", () => {
    expect(documentPlainText(doc(para(text("One")), para(text("Two"))))).toBe("One\n\nTwo");
  });

  it("keeps a line break inside a paragraph as a line break", () => {
    const withBreak = doc(para(text("With love,"), { type: "hardBreak" }, text("Andreza")));
    expect(documentPlainText(withBreak)).toBe("With love,\nAndreza");
  });

  it("drops formatting marks rather than spelling them out", () => {
    const bold = doc(para(text("Subject:", [{ type: "bold" }]), text(" You're in")));
    expect(documentPlainText(bold)).toBe("Subject: You're in");
  });

  /**
   * The case that prompted this: with the editor's default, every row and
   * every cell was its own block, and a four-row table pasted as a column of
   * cells with up to eight empty lines between them.
   */
  it("writes a table one line per row, cells side by side", () => {
    const result = documentPlainText(
      doc(
        para(text("Before publishing:")),
        table(["Question", "Why it matters"], ["What does a table include?", "Seats, signage"]),
        para(text("After")),
      ),
    );
    expect(result).toBe(
      "Before publishing:\n\nQuestion | Why it matters\nWhat does a table include? | Seats, signage\n\nAfter",
    );
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("marks bullets, numbers and checklist items so they read as lists anywhere", () => {
    const lists = doc(
      { type: "bulletList", content: [{ type: "listItem", content: [para(text("Email"))] }, { type: "listItem", content: [para(text("Social"))] }] },
      { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [para(text("Brief"))] }, { type: "listItem", content: [para(text("Draft"))] }] },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [para(text("Confirm owner"))] },
          { type: "taskItem", attrs: { checked: false }, content: [para(text("Book venue"))] },
        ],
      },
    );
    expect(documentPlainText(lists)).toBe(
      "• Email\n• Social\n\n1. Brief\n2. Draft\n\n☑ Confirm owner\n☐ Book venue",
    );
  });

  it("indents a nested list under its item", () => {
    const nested = doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            para(text("Channels")),
            { type: "bulletList", content: [{ type: "listItem", content: [para(text("Email"))] }] },
          ],
        },
      ],
    });
    expect(documentPlainText(nested)).toBe("• Channels\n  • Email");
  });

  it("keeps a code block exactly, since its spacing is its layout", () => {
    const flyer = "   You Can Bloom With Us.\n\n\n   Join the waitlist";
    expect(documentPlainText(doc({ type: "codeBlock", content: [text(flyer)] }))).toBe(flyer);
    expect(documentPlainText(doc(para(text("Front:")), { type: "codeBlock", content: [text(`${flyer}\n`)] }, para(text("Back:"))))).toBe(
      `Front:\n\n${flyer}\n\nBack:`,
    );
  });

  it("gives a quote its words without a Markdown marker", () => {
    const quoted = doc({ type: "blockquote", content: [para(text("Hi Ana,")), para(text("You're in."))] });
    expect(documentPlainText(quoted)).toBe("Hi Ana,\n\nYou're in.");
  });

  it("skips empty paragraphs used as spacing", () => {
    expect(documentPlainText(doc(para(text("One")), { type: "paragraph" }, para(text("Two"))))).toBe("One\n\nTwo");
  });

  /** What is actually on the clipboard after a copy is a slice, not a document. */
  it("works on a copied slice as well as a whole document", () => {
    const full = doc(para(text("Keep")), table(["A", "B"], ["1", "2"]));
    const slice = new Slice(full.content, 0, 0);
    expect(documentPlainText(slice.content)).toBe("Keep\n\nA | B\n1 | 2");
  });
});
