export interface EditorHistory<T> {
  entries: T[];
  index: number;
}

export function createEditorHistory<T>(initial: T): EditorHistory<T> {
  return { entries: [initial], index: 0 };
}

export function pushEditorHistory<T>(
  history: EditorHistory<T>,
  next: T,
  options: { equals?: (left: T, right: T) => boolean; limit?: number } = {},
): EditorHistory<T> {
  const active = history.entries[history.index];
  if (active !== undefined && (options.equals?.(active, next) ?? Object.is(active, next))) return history;

  const limit = Math.max(1, options.limit ?? 100);
  let entries = [...history.entries.slice(0, history.index + 1), next];
  if (entries.length > limit) entries = entries.slice(entries.length - limit);
  return { entries, index: entries.length - 1 };
}

export function undoEditorHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  return history.index > 0 ? { ...history, index: history.index - 1 } : history;
}

export function redoEditorHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  return history.index < history.entries.length - 1
    ? { ...history, index: history.index + 1 }
    : history;
}

export function canUndoEditorHistory<T>(history: EditorHistory<T>): boolean {
  return history.index > 0;
}

export function canRedoEditorHistory<T>(history: EditorHistory<T>): boolean {
  return history.index >= 0 && history.index < history.entries.length - 1;
}

