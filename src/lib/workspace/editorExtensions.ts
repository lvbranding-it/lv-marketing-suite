import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle, Color, BackgroundColor, FontSize } from "@tiptap/extension-text-style";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";

/**
 * Everything a workspace document can contain.
 *
 * Kept apart from the editor component so the tests build documents from
 * exactly the schema people type into — a test on a hand-made schema would
 * pass while the real one behaved differently.
 */
export function workspaceExtensions(placeholder = "Start writing, or paste anything — formatting comes with it.") {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // StarterKit v3 bundles these; they are configured separately below.
      link: false,
      underline: false,
    }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    TextStyle,
    Color,
    BackgroundColor,
    FontSize,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
  ];
}
