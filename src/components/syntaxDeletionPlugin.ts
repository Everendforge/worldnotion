import { EditorView, ViewPlugin } from "@codemirror/view";
import { buildStructuredRangeIndex, type StructuredRange } from "../utils/structuredRangeIndex";

function deletionTarget(view: EditorView, key: "Backspace" | "Delete") {
  const position = view.state.selection.main.head;
  return buildStructuredRangeIndex(view.state)
    .containing(position)
    .find((element) => {
      const visible = element.visibleRanges[0];
      if (key === "Backspace") {
        return position === element.to || Boolean(visible && position === visible.from);
      }
      return position === element.from || Boolean(visible && position === visible.to);
    });
}

function replacementSelection(element: StructuredRange, key: "Backspace" | "Delete") {
  return key === "Backspace" ? element.from + element.plainText.length : element.from;
}

/** Unwraps a semantic structure before a boundary deletion can damage its hidden syntax. */
export function createSyntaxDeletionPlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor(_view: EditorView) {}
    },
    {
      eventHandlers: {
        keydown(event: KeyboardEvent, view: EditorView) {
          if (event.key !== "Backspace" && event.key !== "Delete") return false;
          const selection = view.state.selection.main;
          if (!selection.empty) return false;
          const key = event.key;
          const element = deletionTarget(view, key);
          if (!element || element.kind === "variant") return false;

          event.preventDefault();
          view.dispatch({
            changes: { from: element.from, to: element.to, insert: element.plainText },
            selection: { anchor: replacementSelection(element, key) },
            userEvent: "delete",
          });
          return true;
        },
      },
    },
  );
}
