import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { isStructuralChange, selectionTouches, createSyntaxHiddenDecoration, createStyledDecoration } from "./pluginUtils";

// Compiled once at module load - matches [^1], [^abc], etc. (inline footnote references)
const FOOTNOTE_REF_REGEX = /\[\^([^\]]+)\]/g;

export function footnotePlugin() {
  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const selectionFrom = view.state.selection.main.from;
    const selectionTo = view.state.selection.main.to;

    // Process inline footnote references [^1]
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;

      FOOTNOTE_REF_REGEX.lastIndex = 0;
      while ((match = FOOTNOTE_REF_REGEX.exec(text)) !== null) {
        const refId = match[1];
        const start = from + match.index;
        const end = start + match[0].length;
        const isSelected = selectionTouches(selectionFrom, selectionTo, start, end);

        if (!isSelected) {
          // Show as superscript, hide the brackets
          // Hide opening bracket [
          const openHidden = createSyntaxHiddenDecoration(start, start + 1);
          if (openHidden) decorations.push(openHidden);

          // Hide caret ^
          const caretHidden = createSyntaxHiddenDecoration(start + 1, start + 2);
          if (caretHidden) decorations.push(caretHidden);

          // Style the reference ID as superscript
          const refDecoration = createStyledDecoration(
            start + 2,
            end - 1,
            "cm-footnote-ref",
            { "data-footnote": refId }
          );
          if (refDecoration) decorations.push(refDecoration);

          // Hide closing bracket ]
          const closeHidden = createSyntaxHiddenDecoration(end - 1, end);
          if (closeHidden) decorations.push(closeHidden);
        } else {
          // When editing, show everything normally
          const editDecoration = createStyledDecoration(
            start,
            end,
            "cm-footnote-editing",
            { "data-footnote": refId }
          );
          if (editDecoration) decorations.push(editDecoration);
        }
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
