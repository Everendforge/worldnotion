import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Range } from "@codemirror/state";

const wikilinkRegex = /\[\[([^\]]+)\]\]/g;

const wikilinkDecoration = Decoration.mark({
  class: "cm-wikilink",
  attributes: { "data-wikilink": "true" },
});

function getWikilinkDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    
    while ((match = wikilinkRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      decorations.push(wikilinkDecoration.range(start, end));
    }
  }
  
  return Decoration.set(decorations, true);
}

export const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getWikilinkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getWikilinkDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  }
);

// CSS styles to be added to App.css:
// .cm-wikilink {
//   color: var(--wn-accent);
//   text-decoration: underline;
//   cursor: pointer;
// }
