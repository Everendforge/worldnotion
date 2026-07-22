import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  createStyledDecoration,
  createSyntaxHiddenDecoration,
  isStructuralChange,
  selectionTouches,
} from "./pluginUtils";
import type { WritingMode } from "../editorTypes";

// Match <!--font:FONTNAME-->content<!--/font-->
// Pattern compiled once at module load for font family HTML comments
// Allows font specifications without breaking markdown portability
const FONT_PATTERN = /<!--font:\s*([^\-\n]+?)\s*-->([\s\S]*?)<!--\/font-->/g;

function addFontFamilyMatches(
  view: EditorView,
  text: string,
  from: number,
  presentation: WritingMode,
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
    const selection = view.state.selection.main;
    const active =
      presentation === "semi" && selectionTouches(selection.from, selection.to, fullFrom, fullTo);

    if (active) {
      const decoration = createStyledDecoration(fullFrom, fullTo, "cm-markdown-syntax-muted");
      if (decoration) decorations.push(decoration);
      continue;
    }

    // Hide opening tag
    const openHidden = createSyntaxHiddenDecoration(fullFrom, contentFrom);
    if (openHidden) decorations.push(openHidden);

    // Apply font family to content
    const fontDecoration = Decoration.mark({
      attributes: { style: `font-family: ${fontFamily}` },
    }).range(contentFrom, contentTo);
    decorations.push(fontDecoration);

    // Hide closing tag
    const closeHidden = createSyntaxHiddenDecoration(contentTo, fullTo);
    if (closeHidden) decorations.push(closeHidden);
  }
}

function getDecorations(view: EditorView, presentation: WritingMode): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  // Iterate over visible ranges directly instead of line-by-line
  // This is much more efficient as it processes text in chunks
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    addFontFamilyMatches(view, text, from, presentation, decorations);
  }

  return Decoration.set(decorations, true);
}

export function fontFamilyPlugin(presentation: WritingMode) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = getDecorations(view, presentation);
      }

      update(update: ViewUpdate) {
        if (isStructuralChange(update) || update.selectionSet) {
          this.decorations = getDecorations(update.view, presentation);
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
    },
  );
}
