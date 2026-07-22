import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { VARIANT_MARKER_CLOSE, VARIANT_MARKER_OPEN } from "../utils/noteVariants";

type VariantBlock = {
  id: string;
  from: number;
  to: number;
  openFrom: number;
  openTo: number;
  contentFrom: number;
  contentTo: number;
  closeFrom: number;
  closeTo: number;
};

function afterLineBreak(text: string, position: number) {
  if (text.startsWith("\r\n", position)) return position + 2;
  return text[position] === "\n" ? position + 1 : position;
}

function variantBlocks(text: string): VariantBlock[] {
  const blocks: VariantBlock[] = [];
  const open = new RegExp(VARIANT_MARKER_OPEN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = open.exec(text))) {
    const closePattern = new RegExp(VARIANT_MARKER_CLOSE.source, "g");
    closePattern.lastIndex = open.lastIndex;
    const close = closePattern.exec(text);
    if (!close) break; // Malformed markers stay visible and editable.
    const rawCloseTo = close.index + close[0].length;
    const openTo = afterLineBreak(text, open.lastIndex);
    const closeTo = afterLineBreak(text, rawCloseTo);
    blocks.push({
      id: match[1] || match[2],
      from: match.index,
      to: closeTo,
      openFrom: match.index,
      openTo,
      contentFrom: openTo,
      contentTo: close.index,
      closeFrom: close.index,
      closeTo,
    });
    open.lastIndex = closeTo;
  }
  return blocks;
}

function addActiveBlockLines(
  builder: RangeSetBuilder<Decoration>,
  text: string,
  from: number,
  to: number,
) {
  let lineStart = from;
  if (text[lineStart] === "\n") lineStart += 1;
  while (lineStart < to) {
    builder.add(lineStart, lineStart, Decoration.line({ class: "cm-variant-block-line" }));
    const nextLine = text.indexOf("\n", lineStart);
    if (nextLine === -1 || nextLine >= to) break;
    lineStart = nextLine + 1;
  }
}

function decorations(text: string, activeVariantId: string) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const block of variantBlocks(text)) {
    if (block.id !== activeVariantId) {
      builder.add(block.from, block.to, Decoration.replace({}));
      continue;
    }
    builder.add(block.openFrom, block.openTo, Decoration.replace({}));
    addActiveBlockLines(builder, text, block.contentFrom, block.contentTo);
    builder.add(block.closeFrom, block.closeTo, Decoration.replace({}));
  }
  return builder.finish();
}

function changeTouches(from: number, to: number, protectedFrom: number, protectedTo: number) {
  return from === to
    ? from > protectedFrom && from < protectedTo
    : from < protectedTo && to > protectedFrom;
}

/**
 * Hides inactive variants, keeps their source immutable, and protects every
 * marker while a note is edited in either Writing presentation.
 */
export function createVariantContentPlugin(
  activeVariantId: string,
  _activeVariantLabel?: string,
): StateField<ReturnType<typeof decorations>> {
  const protection = EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) return transaction;
    const blocks = variantBlocks(transaction.startState.doc.toString());
    let blocked = false;
    transaction.changes.iterChangedRanges((from, to) => {
      for (const block of blocks) {
        const protectedRanges =
          block.id === activeVariantId
            ? [
                { from: block.openFrom, to: block.openTo },
                { from: block.closeFrom, to: block.closeTo },
              ]
            : [{ from: block.from, to: block.to }];
        if (
          protectedRanges.some((candidate) => changeTouches(from, to, candidate.from, candidate.to))
        ) {
          blocked = true;
          return;
        }
      }
    });
    return blocked ? [] : transaction;
  });

  return StateField.define({
    create(state) {
      return decorations(state.doc.toString(), activeVariantId);
    },
    update(value, transaction) {
      return transaction.docChanged
        ? decorations(transaction.state.doc.toString(), activeVariantId)
        : value;
    },
    provide: (source) => [
      EditorView.decorations.from(source),
      EditorView.atomicRanges.of((view) => view.state.field(source)),
      protection,
    ],
  });
}
