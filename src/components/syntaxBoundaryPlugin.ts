import { EditorSelection, EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { buildStructuredRangeIndex, type StructuredRange } from "../utils/structuredRangeIndex";
import { wikilinkMarkdown } from "../utils/structuredMarkdown";

function visibleRange(element: StructuredRange) {
  return element.visibleRanges[0];
}

function endpointOutsideSyntax(element: StructuredRange, position: number, assoc: -1 | 1) {
  const syntax = element.syntaxRanges.find(
    (candidate) => position > candidate.from && position < candidate.to,
  );
  if (!syntax) return position;
  const visible = visibleRange(element);
  if (!visible) return assoc < 0 ? element.from : element.to;
  return Math.abs(position - visible.from) <= Math.abs(position - visible.to)
    ? visible.from
    : visible.to;
}

function normalizeSelection(state: EditorState) {
  const index = buildStructuredRangeIndex(state);
  let changed = false;
  const ranges = state.selection.ranges.map((selection) => {
    const anchorElement = index.at(selection.anchor);
    const headElement = index.at(selection.head);
    const anchor = anchorElement
      ? endpointOutsideSyntax(
          anchorElement,
          selection.anchor,
          selection.anchor <= selection.head ? -1 : 1,
        )
      : selection.anchor;
    const head = headElement
      ? endpointOutsideSyntax(
          headElement,
          selection.head,
          selection.head >= selection.anchor ? 1 : -1,
        )
      : selection.head;
    changed ||= anchor !== selection.anchor || head !== selection.head;
    return EditorSelection.range(anchor, head);
  });
  return changed ? EditorSelection.create(ranges, state.selection.mainIndex) : undefined;
}

function semanticWikilinkEditFilter(): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) return transaction;
    const edits: Array<{ from: number; to: number; insert: string }> = [];
    transaction.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => {
      edits.push({ from, to, insert: inserted.toString() });
    });
    if (edits.length !== 1) return transaction;

    const edit = edits[0];
    const index = buildStructuredRangeIndex(transaction.startState);
    const element = index
      .containing(edit.from, edit.to)
      .find((candidate) => candidate.kind === "wikilink" && !candidate.alias);
    const visible = element && visibleRange(element);
    if (!element || !visible || edit.from < visible.from || edit.to > visible.to)
      return transaction;

    const oldLabel = transaction.startState.doc.sliceString(visible.from, visible.to);
    const relativeFrom = edit.from - visible.from;
    const relativeTo = edit.to - visible.from;
    const nextLabel = `${oldLabel.slice(0, relativeFrom)}${edit.insert}${oldLabel.slice(relativeTo)}`;
    const replacement = nextLabel ? wikilinkMarkdown(element.target ?? oldLabel, nextLabel) : "";
    const labelOffset = nextLabel ? 2 + (element.target ?? oldLabel).length + 1 : 0;
    return {
      changes: { from: element.from, to: element.to, insert: replacement },
      selection: { anchor: element.from + labelOffset + nextLabel.length },
      userEvent: "input",
    };
  });
}

/** Keeps Processed-mode selections and cursor navigation out of hidden delimiters. */
export function createSyntaxBoundaryPlugin(): Extension {
  const selectionFilter = EditorState.transactionFilter.of((transaction) => {
    if (!transaction.selection) return transaction;
    const normalized = normalizeSelection(transaction.state);
    return normalized ? [transaction, { selection: normalized, sequential: true }] : transaction;
  });

  const navigation = ViewPlugin.fromClass(
    class {
      constructor(_view: EditorView) {}
    },
    {
      eventHandlers: {
        keydown(event: KeyboardEvent, view: EditorView) {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
          const selection = view.state.selection.main;
          const head = selection.head;
          const element = buildStructuredRangeIndex(view.state).at(head);
          if (!element) return false;
          const visible = visibleRange(element);
          let next: number | undefined;

          if (event.key === "ArrowRight") {
            if (!visible && head === element.from) next = element.to;
            else if (visible && head >= element.from && head < visible.from) next = visible.from;
            else if (visible && head === visible.to) next = element.to;
          } else {
            if (!visible && head === element.to) next = element.from;
            else if (visible && head <= element.to && head > visible.to) next = visible.to;
            else if (visible && head === visible.from) next = element.from;
          }

          if (next === undefined || next === head) return false;
          event.preventDefault();
          view.dispatch({
            selection: event.shiftKey
              ? EditorSelection.range(selection.anchor, next)
              : EditorSelection.cursor(next),
            scrollIntoView: true,
            userEvent: "select",
          });
          return true;
        },
      },
    },
  );

  return Prec.highest([semanticWikilinkEditFilter(), selectionFilter, navigation]);
}
