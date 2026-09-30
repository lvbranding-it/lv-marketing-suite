import { describe, expect, it } from "vitest";
import {
  cleanText,
  describeItem,
  humanLabel,
  inlineText,
  objectListToMarkdown,
  objectListToText,
  scalarText,
  titleKeyOf,
} from "./snapshotFormat";

// Shapes taken from real snapshots; the values are invented.
const services = [
  { name: "Signature cut", category: "Hair", duration: "60 min", price: 85 },
  { name: "Gloss treatment", category: "Color", duration: "45 min", price: 60 },
];
const removedProspect = {
  reason: "Operates in Mexico, not Colombia",
  company: "Clínica Ejemplo",
  flagged_by: "Client review",
  replaced_by: "Clínica Sustituta",
};
const product = { name: "Tray system", status: "In development", key_features: ["Food-safe", "Stackable"] };

describe("labels and single values", () => {
  it.each([
    ["key_features", "Key features"],
    ["primary_contact", "Primary contact"],
    ["flaggedBy", "Flagged by"],
    ["LATAM", "LATAM"],
    ["URL", "URL"],
  ])("labels %s as %s", (key, label) => expect(humanLabel(key)).toBe(label));

  it("writes flags as words and keeps numbers as they are", () => {
    expect(scalarText(true)).toBe("Yes");
    expect(scalarText(false)).toBe("No");
    expect(scalarText(85)).toBe("85");
    expect(scalarText(null)).toBe("—");
  });

  it("joins a list of words into one line", () => {
    expect(scalarText(["EN", "ES"])).toBe("EN, ES");
  });

  it("says a list or item needs more than one line by returning null", () => {
    expect(scalarText([{ name: "a" }])).toBeNull();
    expect(scalarText({ name: "a" })).toBeNull();
  });

  it("drops the Markdown markers agents leave in values", () => {
    expect(cleanText("**Bold** and `code`")).toBe("Bold and code");
  });
});

describe("naming an item", () => {
  it.each([
    [{ name: "Signature cut", price: 85 }, "name"],
    [{ tier: "Gold", fee: "$500" }, "tier"],
    [{ company: "Acme", reason: "x" }, "company"],
    [{ pais: "Panamá", prioridad: 1 }, "pais"],
    [{ id: "deck-es", label: "Spanish deck" }, "label"],
  ])("takes its title from the field that names it", (item, key) => expect(titleKeyOf(item)).toBe(key));

  it("has no title when nothing names it", () => {
    expect(titleKeyOf({ reason: "x", notes: "y" })).toBeNull();
  });

  /** The record that surfaced this: shown as one line of JSON in a tag. */
  it("turns the removed prospect into a titled item with labelled fields", () => {
    const { title, fields } = describeItem(removedProspect, "Item 1");
    expect(title).toBe("Clínica Ejemplo");
    expect(fields.map(([key]) => key)).toEqual(["reason", "flagged_by", "replaced_by"]);
  });
});

describe("nested values on one line", () => {
  it("writes a nested item as labelled fields, never as JSON", () => {
    const text = inlineText({ city: "Houston", open: true, days: ["Mon", "Tue"] });
    expect(text).toBe("(City: Houston, Open: Yes, Days: Mon, Tue)");
    expect(text).not.toMatch(/[{}"]/);
  });
});

describe("a list of items in an export", () => {
  it("makes a table of flat items, name first", () => {
    expect(objectListToMarkdown(services)).toBe(
      [
        "| Name | Category | Duration | Price |",
        "| --- | --- | --- | --- |",
        "| Signature cut | Hair | 60 min | 85 |",
        "| Gloss treatment | Color | 45 min | 60 |",
      ].join("\n"),
    );
  });

  it("keeps a list of words inside a table cell", () => {
    expect(objectListToMarkdown([product])).toContain("| Tray system | In development | Food-safe, Stackable |");
  });

  it("gives a column to a field only some items have", () => {
    const table = objectListToMarkdown([{ name: "A", price: 1 }, { name: "B", note: "late" }]);
    expect(table.split("\n")[0]).toBe("| Name | Price | Note |");
    expect(table).toContain("| B | — | late |");
  });

  it("stops a cell from opening a new column or a new line", () => {
    const table = objectListToMarkdown([{ name: "Plan A | B", notes: "line one\nline two" }]);
    expect(table).toContain("| Plan A / B | line one line two |");
  });

  it("lists items that are too wide for a table, title in bold", () => {
    const wide = [{ name: "Wide", a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }];
    expect(objectListToMarkdown(wide)).toBe("- **Wide** — A: 1; B: 2; C: 3; D: 4; E: 5; F: 6");
  });

  it("lists items that hold nested items, without JSON", () => {
    const nested = [{ name: "Studio", hours: { weekdays: "9–6", weekends: "Closed" } }];
    const markdown = objectListToMarkdown(nested);
    expect(markdown).toBe("- **Studio** — Hours: (Weekdays: 9–6, Weekends: Closed)");
    expect(markdown).not.toMatch(/[{}"]/);
  });

  it("writes one plain line per item for the text export", () => {
    expect(objectListToText([removedProspect], "  ")).toEqual([
      "  • Clínica Ejemplo — Reason: Operates in Mexico, not Colombia, Flagged by: Client review, Replaced by: Clínica Sustituta",
    ]);
  });
});

describe("through the export pipeline", () => {
  /**
   * The PDF and Word exports turn this Markdown into HTML with the exporter's
   * own converter. A table that converter does not recognise would reach the
   * document as lines of pipes.
   */
  it("comes out of the document exporter as a real table", async () => {
    const { markdownToHtml } = await import("./document-export");
    const html = markdownToHtml(`## Services\n\n${objectListToMarkdown(services)}\n\nAfter the table.`);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<td>Signature cut</td>");
    expect(html).toContain("<td>85</td>");
    expect(html).not.toContain("| --- |");
  });
});
