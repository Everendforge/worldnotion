import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { isStructuralChange } from "./pluginUtils";

// Match <!--font:FONTNAME-->content<!--/font-->
// Pattern compiled once at module load for font family HTML comments
// Allows font specifications without breaking markdown portability
const FONT_PATTERN = /<!--font:\s*([^-]+?)\s*-->([\s\S]*?)<!--\/font-->/g;

function addFontFamilyMatches(
  text: string,
  from: number,
  decorations: Range<Decoration>[],
) {
  let match: RegExpExecArray | null;
  
  FONT_PATTERN.lastIndex = 0;
  while ((match = FONT_PATTERN.exec(text)) !== null) {
    const fullFrom = from + match.index;
    const fullTo = fullFrom + match[0].length;
    const fontFamily = match[1];
    const content = match[2];
    
    // Find where the content starts and ends
    const openTagLen = `<!--font:${fontFamily}-->`.length;
    const contentFrom = fullFrom + openTagLen;
    const contentTo = contentFrom + content.length;
    
    // Hide opening tag
    const openHidden = Decoration.mark({ class: "cm-markdown-syntax-hidden" }).range(fullFrom, contentFrom);
    decorations.push(openHidden);
    
    // Apply font family to content
    const fontDecoration = Decoration.mark({
      attributes: { style: `font-family: ${fontFamily}` },
    }).range(contentFrom, contentTo);
    decorations.push(fontDecoration);
    
    // Hide closing tag
    const closeHidden = Decoration.mark({ class: "cm-markdown-syntax-hidden" }).range(contentTo, fullTo);
    decorations.push(closeHidden);
  }
}

function getDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  // Iterate over visible ranges directly instead of line-by-line
  // This is much more efficient as it processes text in chunks
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    addFontFamilyMatches(text, from, decorations);
  }

  return Decoration.set(decorations, true);
}

export const fontFamilyPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getDecorations(view);
    }

    update(update: ViewUpdate) {
      // Only recalculate decorations on structural changes (doc/viewport)
      // Skip on selection-only changes to improve performance during typing
      if (isStructuralChange(update)) {
        this.decorations = getDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
);
