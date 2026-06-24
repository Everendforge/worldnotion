import type { EditorCommandId } from "../editorTypes";

export type EditorCommandAction =
  | { type: "save" }
  | { type: "search" }
  | { type: "find"; direction: 1 | -1 }
  | { type: "wrapSelection"; before: string; after?: string; placeholder?: string }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "blockquote" }
  | { type: "list"; kind: "bullet" | "ordered" | "task" }
  | { type: "markdownLink" }
  | { type: "wikilink" }
  | { type: "footnote" }
  | { type: "insert"; markdown: string }
  | { type: "foldBlock" }
  | { type: "openPanel"; panel: "commandPalette" | "quickSwitcher" }
  | { type: "toggleOutline" }
  | { type: "collapseExplorerFolders" }
  | { type: "switchMode" }
  | { type: "closeTab" }
  | { type: "activateAdjacentTab"; direction: 1 | -1 }
  | { type: "paragraphSpacing"; position: "before" | "after" };

export function editorCommandAction(commandId: EditorCommandId): EditorCommandAction {
  switch (commandId) {
    case "save":
      return { type: "save" };
    case "search":
    case "replace":
      return { type: "search" };
    case "findNext":
      return { type: "find", direction: 1 };
    case "findPrevious":
      return { type: "find", direction: -1 };
    case "bold":
      return { type: "wrapSelection", before: "**" };
    case "italic":
      return { type: "wrapSelection", before: "*" };
    case "inlineCode":
      return { type: "wrapSelection", before: "`", after: "`", placeholder: "code" };
    case "codeBlock":
      return { type: "wrapSelection", before: "```\n", after: "\n```", placeholder: "code" };
    case "heading1":
      return { type: "heading", level: 1 };
    case "heading2":
      return { type: "heading", level: 2 };
    case "heading3":
      return { type: "heading", level: 3 };
    case "heading4":
      return { type: "heading", level: 4 };
    case "heading5":
      return { type: "heading", level: 5 };
    case "heading6":
      return { type: "heading", level: 6 };
    case "blockquote":
      return { type: "blockquote" };
    case "unorderedList":
      return { type: "list", kind: "bullet" };
    case "orderedList":
      return { type: "list", kind: "ordered" };
    case "taskList":
      return { type: "list", kind: "task" };
    case "link":
      return { type: "markdownLink" };
    case "wikilink":
      return { type: "wikilink" };
    case "footnote":
      return { type: "footnote" };
    case "horizontalRule":
      return { type: "insert", markdown: "\n\n---\n\n" };
    case "foldBlock":
      return { type: "foldBlock" };
    case "commandPalette":
      return { type: "openPanel", panel: "commandPalette" };
    case "quickSwitcher":
      return { type: "openPanel", panel: "quickSwitcher" };
    case "toggleOutline":
      return { type: "toggleOutline" };
    case "collapseExplorerFolders":
      return { type: "collapseExplorerFolders" };
    case "switchMode":
      return { type: "switchMode" };
    case "closeTab":
      return { type: "closeTab" };
    case "nextTab":
      return { type: "activateAdjacentTab", direction: 1 };
    case "previousTab":
      return { type: "activateAdjacentTab", direction: -1 };
    case "spaceBefore":
      return { type: "paragraphSpacing", position: "before" };
    case "spaceAfter":
      return { type: "paragraphSpacing", position: "after" };
  }
}

export function nativeMenuEditorCommand(commandId: string): EditorCommandId | undefined {
  switch (commandId) {
    case "wn:file:save":
      return "save";
    case "wn:file:close-tab":
      return "closeTab";
    case "wn:edit:find":
      return "search";
    case "wn:edit:replace":
      return "replace";
    case "wn:edit:find-next":
      return "findNext";
    case "wn:edit:find-previous":
      return "findPrevious";
    case "wn:edit:bold":
      return "bold";
    case "wn:edit:italic":
      return "italic";
    case "wn:edit:link":
      return "link";
    case "wn:edit:wikilink":
      return "wikilink";
    case "wn:view:command-palette":
      return "commandPalette";
    case "wn:view:quick-switcher":
      return "quickSwitcher";
    case "wn:view:toggle-outline":
      return "toggleOutline";
    default:
      return undefined;
  }
}
