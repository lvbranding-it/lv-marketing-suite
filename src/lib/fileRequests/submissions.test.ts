import { describe, expect, it } from "vitest";
import { groupByNote } from "./submissions";

const row = (id: string, message: string | null, uploader_name = "", uploader_email = "") => ({
  id,
  message,
  uploader_name,
  uploader_email,
});

describe("notes on received files", () => {
  it("shows a note sent with a batch once, over all of its files", () => {
    const groups = groupByNote([row("a", "Final cut and stills"), row("b", "Final cut and stills"), row("c", "Final cut and stills")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].note).toBe("Final cut and stills");
    expect(groups[0].rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("starts a new group where the note changes", () => {
    const groups = groupByNote([row("a", "Logo"), row("b", null), row("c", "Logo")]);
    expect(groups.map((g) => g.note)).toEqual(["Logo", null, "Logo"]);
  });

  it("keeps two senders apart even when they wrote the same thing", () => {
    const groups = groupByNote([row("a", "Thanks!", "Ana", "ana@x.co"), row("b", "Thanks!", "Luis", "luis@x.co")]);
    expect(groups).toHaveLength(2);
  });

  it("treats a blank note as no note", () => {
    const groups = groupByNote([row("a", "   "), row("b", null)]);
    expect(groups).toEqual([{ note: null, rows: [row("a", "   "), row("b", null)] }]);
  });
});
