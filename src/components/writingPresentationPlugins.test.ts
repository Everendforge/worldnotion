import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import type { WritingMode } from "../editorTypes";
import { footnotePlugin } from "./footnotePlugin";
import { imagePlugin } from "./imagePlugin";
import { tablePlugin } from "./tablePlugin";
import { wikilinkPlugin } from "./wikilinkPlugin";

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

function inlineView(doc: string, anchor: number, presentation: WritingMode) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [
        markdown({ base: markdownLanguage }),
        wikilinkPlugin({ presentation }),
        footnotePlugin({ presentation }),
        imagePlugin({ presentation, resolve: async () => "data:image/png;base64,AA==" }),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

describe("Writing presentation plugins", () => {
  const doc = "See [[People/Ada|Ada]] [^1] and ![Hero](hero.png).";

  it("keeps semantic syntax hidden under the cursor in Processed mode", () => {
    const view = inlineView(doc, doc.indexOf("Ada]]"), "processed");

    expect(view.dom.textContent).toContain("Ada");
    expect(view.dom.textContent).not.toContain("People/Ada");
    expect(view.dom.textContent).not.toContain("[[");
    expect(view.dom.textContent).not.toContain("[^1]");
    expect(view.dom.querySelector(".cm-image-widget")).not.toBeNull();
  });

  it("reveals only the active semantic structure in Semi-processed mode", () => {
    const view = inlineView(doc, doc.indexOf("Ada]]"), "semi");

    expect(view.dom.textContent).toContain("[[People/Ada|Ada]]");
    expect(view.dom.textContent).not.toContain("[^1]");
    expect(view.dom.querySelector(".cm-image-widget")).not.toBeNull();

    view.dispatch({ selection: { anchor: doc.indexOf("^1") } });
    expect(view.dom.textContent).not.toContain("People/Ada");
    expect(view.dom.textContent).toContain("[^1]");

    view.dispatch({ selection: { anchor: doc.indexOf("Hero") } });
    expect(view.dom.textContent).toContain("![Hero](hero.png)");
    expect(view.dom.querySelector(".cm-image-widget")).toBeNull();
  });

  it("turns an active Semi-processed table back into editable Markdown", () => {
    const table = "| Name | Role |\n| --- | --- |\n| Ada | Mage |";
    const view = new EditorView({
      state: EditorState.create({
        doc: `Intro\n\n${table}`,
        extensions: [tablePlugin("semi")],
      }),
      parent: document.body,
    });
    views.push(view);

    expect(view.dom.querySelector(".cm-table-widget")).not.toBeNull();
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("Ada") } });
    expect(view.dom.querySelector(".cm-table-widget")).toBeNull();
    expect(view.dom.textContent).toContain("| Ada | Mage |");
  });
});
