import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

// Matches [^1], [^abc], etc. (inline footnote references)
const footnoteRefRegex = /\[\^([^\]]+)\]/g;

export function footnotePlugin() {
  function selectionTouches(selectionFrom: number, selectionTo: number, from: number, to: number) {
    if (selectionFrom === selectionTo) {
      return selectionFrom >= from && selectionFrom <= to;
    }
    return selectionFrom <= to && selectionTo >= from;
  }

  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const selectionFrom = view.state.selection.main.from;
    const selectionTo = view.state.selection.main.to;

    // Process inline footnote references [^1]
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;

      footnoteRefRegex.lastIndex = 0;
      while ((match = footnoteRefRegex.exec(text)) !== null) {
        const refId = match[1];
        const start = from + match.index;
        const end = start + match[0].length;
        const isSelected = selectionTouches(selectionFrom, selectionTo, start, end);

        if (!isSelected) {
          // Show as superscript, hide the brackets
          // Hide opening bracket [
          decorations.push(
            Decoration.mark({
              class: "cm-footnote-syntax-hidden",
            }).range(start, start + 1),
          );

          // Hide caret ^
          decorations.push(
            Decoration.mark({
              class: "cm-footnote-syntax-hidden",
            }).range(start + 1, start + 2),
          );

          // Style the reference ID as superscript
          decorations.push(
            Decoration.mark({
              class: "cm-footnote-ref",
              attributes: {
                "data-footnote": refId,
              },
              inclusive: false,
            }).range(start + 2, end - 1),
          );

          // Hide closing bracket ]
          decorations.push(
            Decoration.mark({
              class: "cm-footnote-syntax-hidden",
            }).range(end - 1, end),
          );
        } else {
          // When editing, show everything normally
          decorations.push(
            Decoration.mark({
              class: "cm-footnote-editing",
              attributes: {
                "data-footnote": refId,
              },
              inclusive: false,
            }).range(start, end),
          );
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
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = getDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
