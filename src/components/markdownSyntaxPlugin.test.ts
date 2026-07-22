import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { afterEach, describe, expect, it } from "vitest";
import { markdownSyntaxPlugin, toggleTaskAt } from "./markdownSyntaxPlugin";

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

function createView(doc: string, anchor: number, presentation: "processed" | "semi" = "semi") {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), markdownSyntaxPlugin(presentation)],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  // The parser may finish after the first decoration pass; re-trigger it.
  view.dispatch({ selection: { anchor } });
  return view;
}

describe("markdownSyntaxPlugin", () => {
  const doc = [
    "# Heading",
    "",
    "plain **bold** text [lbl](https://example.dev) `co**de**`",
    "",
    "- [x] done task",
    "- item",
    "",
    "see [[Page|Alias]] here",
  ].join("\n");

  it("hides markers of elements the cursor is not touching", () => {
    const view = createView(doc, doc.indexOf("plain"));
    const text = view.dom.textContent ?? "";

    expect(text).toContain("Heading");
    expect(text).not.toContain("# Heading");
    expect(text).toContain("bold");
    expect(text).not.toContain("**bold**");
    expect(text).toContain("lbl");
    expect(text).not.toContain("https://example.dev");
    expect(text).toContain("☑");
    expect(text).not.toContain("[x]");
    expect(text).toContain("•");
  });

  it("does not treat markers inside code spans as formatting", () => {
    const view = createView(doc, doc.indexOf("plain"));
    const text = view.dom.textContent ?? "";

    // The inline-code backticks are hidden but its literal content survives.
    expect(text).toContain("co**de**");
  });

  it("reveals muted markers while the selection touches the element", () => {
    const view = createView(doc, doc.indexOf("bold") + 2);
    const text = view.dom.textContent ?? "";

    expect(text).toContain("**bold**");
    expect(view.dom.querySelector(".cm-markdown-syntax-muted")).not.toBeNull();
  });

  it("never reveals markers under the cursor in processed mode", () => {
    const view = createView(doc, doc.indexOf("bold") + 2, "processed");

    expect(view.dom.textContent).not.toContain("**bold**");
    expect(view.dom.querySelector(".cm-markdown-syntax-muted")).toBeNull();
  });

  it("reveals heading syntax when the cursor is on the heading line", () => {
    const view = createView(doc, doc.indexOf("Heading"));
    const text = view.dom.textContent ?? "";

    expect(text).toContain("# Heading");
  });

  it("leaves wikilinks alone for the wikilink plugin", () => {
    const view = createView(doc, doc.indexOf("plain"));
    const text = view.dom.textContent ?? "";

    expect(text).toContain("[[Page|Alias]]");
  });

  it("toggles a task checkbox in the document", () => {
    const view = createView(doc, doc.indexOf("plain"));

    expect(toggleTaskAt(view, doc.indexOf("done task"))).toBe(true);
    expect(view.state.doc.toString()).toContain("- [ ] done task");

    expect(toggleTaskAt(view, view.state.doc.toString().indexOf("done task"))).toBe(true);
    expect(view.state.doc.toString()).toContain("- [x] done task");
  });

  it("renders clickable task markers", () => {
    const view = createView(doc, doc.indexOf("plain"));
    const checkbox = view.dom.querySelector(".cm-list-marker-task");

    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute("role")).toBe("checkbox");

    checkbox?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.doc.toString()).toContain("- [ ] done task");
  });

  it("styles fenced code blocks with muted fences and a copy button", () => {
    const codeDoc = "intro\n\n```js\nconst x = 1;\n```\n";
    const view = createView(codeDoc, codeDoc.indexOf("const"));

    expect(view.dom.querySelector(".cm-md-codeblock-line")).not.toBeNull();
    expect(view.dom.querySelector(".cm-md-code-lang")?.textContent).toBe("js");
    expect(view.dom.querySelector(".cm-code-copy")).not.toBeNull();
    // Fences stay visible (muted), so the content is never ambiguous.
    expect(view.dom.textContent).toContain("```js");
  });
});
