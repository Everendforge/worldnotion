import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  isStructuralChange,
  createSyntaxHiddenDecoration,
  createStyledDecoration,
  selectionTouches,
} from "./pluginUtils";
import type { WritingMode } from "../editorTypes";
import { buildStructuredRangeIndex } from "../utils/structuredRangeIndex";

export function footnotePlugin(options: { presentation: WritingMode }) {
  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    for (const element of buildStructuredRangeIndex(view.state).ranges.filter(
      (item) => item.kind === "footnote",
    )) {
      const refId = element.label;
      const start = element.from;
      const end = element.to;
      const selection = view.state.selection.main;
      const isSelected =
        options.presentation === "semi" &&
        selectionTouches(selection.from, selection.to, start, end);

      if (!isSelected) {
        // Show the semantic superscript while hiding its Markdown wrapper.
        // Hide opening bracket [
        const openHidden = createSyntaxHiddenDecoration(start, start + 1);
        if (openHidden) decorations.push(openHidden);

        // Hide caret ^
        const caretHidden = createSyntaxHiddenDecoration(start + 1, start + 2);
        if (caretHidden) decorations.push(caretHidden);

        // Style the reference ID as superscript
        const refDecoration = createStyledDecoration(start + 2, end - 1, "cm-footnote-ref", {
          "data-footnote": refId,
        });
        if (refDecoration) decorations.push(refDecoration);

        // Hide closing bracket ]
        const closeHidden = createSyntaxHiddenDecoration(end - 1, end);
        if (closeHidden) decorations.push(closeHidden);
      } else {
        const activeDecoration = createStyledDecoration(
          start,
          end,
          "cm-footnote-ref cm-markdown-syntax-muted",
          { "data-footnote": refId },
        );
        if (activeDecoration) decorations.push(activeDecoration);
      }
    }

    return Decoration.set(decorations, true);
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = getDecorations(view);
      }

      update(update: ViewUpdate) {
        // Recalculate on structural changes OR selection changes
        // Selection changes affect syntax visibility (show/hide based on cursor position)
        // This enables instant syntax response when cursor moves (like Obsidian)
        if (isStructuralChange(update) || update.selectionSet) {
          this.decorations = getDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
