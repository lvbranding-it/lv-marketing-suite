import { describe, expect, it } from "vitest";
import {
  canRedoEditorHistory,
  canUndoEditorHistory,
  createEditorHistory,
  pushEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "./motion-palette-history";

describe("Motion Palette undo/redo history", () => {
  it("moves backward and forward through replacements", () => {
    const original = { "#FFFFFF": "#FFFFFF" };
    const changed = { "#FFFFFF": "#CB2039" };
    const history = pushEditorHistory(createEditorHistory(original), changed);

    expect(canUndoEditorHistory(history)).toBe(true);
    const undone = undoEditorHistory(history);
    expect(undone.entries[undone.index]).toEqual(original);
    expect(canRedoEditorHistory(undone)).toBe(true);
    expect(redoEditorHistory(undone).entries[history.index]).toEqual(changed);
  });

  it("drops the redo branch after a new edit and keeps the configured limit", () => {
    const history = pushEditorHistory(
      undoEditorHistory({ entries: [0, 1, 2], index: 2 }),
      9,
      { limit: 3 },
    );
    expect(history).toEqual({ entries: [0, 1, 9], index: 2 });

    const limited = pushEditorHistory(history, 10, { limit: 3 });
    expect(limited).toEqual({ entries: [1, 9, 10], index: 2 });
  });

  it("does not add an equivalent state", () => {
    const initial = { color: "#FFFFFF" };
    const history = createEditorHistory(initial);
    const result = pushEditorHistory(history, { ...initial }, {
      equals: (left, right) => left.color === right.color,
    });
    expect(result).toBe(history);
  });
});
