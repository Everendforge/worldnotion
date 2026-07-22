import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { createSyntaxBoundaryPlugin } from "./syntaxBoundaryPlugin";
import { createSyntaxDeletionPlugin } from "./syntaxDeletionPlugin";

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

function viewFor(doc: string, anchor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [createSyntaxBoundaryPlugin(), createSyntaxDeletionPlugin()],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

function press(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("Processed syntax interactions", () => {
  const doc = "before [[Page|Alias]] after";
  const from = doc.indexOf("[[");
  const to = doc.indexOf("]]", from) + 2;
  const aliasFrom = doc.indexOf("Alias");
  const aliasTo = aliasFrom + "Alias".length;

  it("navigates to visible text instead of hidden delimiters", () => {
    const view = viewFor(doc, from);
    press(view, "ArrowRight");
    expect(view.state.selection.main.from).toBe(aliasFrom);

    view.dispatch({ selection: { anchor: to } });
    press(view, "ArrowLeft");
    expect(view.state.selection.main.from).toBe(aliasTo);
  });

  it("does not delete a whole structure while editing its visible text", () => {
    const view = viewFor(doc, aliasFrom + 2);
    press(view, "Backspace");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("unwraps a semantic structure to visible text from its outside boundary", () => {
    const view = viewFor(doc, to);
    press(view, "Backspace");
    expect(view.state.doc.toString()).toBe("before Alias after");
  });

  it("materializes a wikilink alias when visible text is edited", () => {
    const targetOnly = "before [[Page]] after";
    const targetFrom = targetOnly.indexOf("Page");
    const view = viewFor(targetOnly, targetFrom + 4);
    view.dispatch({ changes: { from: targetFrom, to: targetFrom + 4, insert: "Label" } });
    expect(view.state.doc.toString()).toBe("before [[Page|Label]] after");
  });
});
