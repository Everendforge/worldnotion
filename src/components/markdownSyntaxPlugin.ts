import { Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { isStructuralChange, marker, selectionTouches, syntaxMarker } from "./pluginUtils";
import type { WritingMode } from "../editorTypes";

// List configuration - matches Obsidian standard
const LIST_INDENT_WIDTH = 2; // 2 spaces per indent level
const MAX_INDENT_CLASS = 5; // Deepest cm-list-indent-N class defined in App.css

/** Flips the task checkbox on the line containing `pos`. */
export function toggleTaskAt(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos);
  const match = /^(\s*[-*] \[)([ xX])\]/.exec(line.text);
  if (!match) return false;
  const checkboxPos = line.from + match[1].length;
  view.dispatch({
    changes: { from: checkboxPos, to: checkboxPos + 1, insert: match[2] === " " ? "x" : " " },
    userEvent: "input",
  });
  return true;
}

class ListMarkerWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly kind: "bullet" | "ordered" | "task",
  ) {
    super();
  }

  eq(other: ListMarkerWidget) {
    return other.label === this.label && other.kind === this.kind;
  }

  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = `cm-list-marker cm-list-marker-${this.kind}`;
    element.textContent = this.label;
    if (this.kind === "task") {
      element.setAttribute("role", "checkbox");
      element.setAttribute("aria-checked", String(this.label === "☑"));
      element.addEventListener("mousedown", (event) => {
        event.preventDefault();
        toggleTaskAt(view, view.posAtDOM(element));
      });
    } else {
      element.setAttribute("aria-hidden", "true");
    }
    return element;
  }

  ignoreEvent(event: Event) {
    // Task checkboxes own their mouse events so a click toggles instead of
    // moving the cursor; everything else defers to CodeMirror.
    return this.kind === "task" && event.type.startsWith("mouse");
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-md-hr";
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

class CopyCodeWidget extends WidgetType {
  constructor(private readonly code: string) {
    super();
  }

  eq(other: CopyCodeWidget) {
    return other.code === this.code;
  }

  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-code-copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code block");
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      void navigator.clipboard?.writeText(this.code).then(() => {
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      });
    });
    return button;
  }

  ignoreEvent(event: Event) {
    return event.type.startsWith("mouse");
  }
}

class HeaderSpacerWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const element = document.createElement("div");
    element.className = "cm-header-spacer";
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

// Calculate indentation level - handles both spaces and tabs
function calculateIndentLevel(indentStr: string): number {
  let level = 0;
  for (const char of indentStr) {
    if (char === "\t") {
      level += 1; // Each tab = 1 level
    } else if (char === " ") {
      level += 1 / LIST_INDENT_WIDTH; // Spaces: 2 spaces = 1 level
    }
  }
  return Math.floor(level);
}

/**
 * Builds the live-preview decorations for processed Write mode from the Lezer
 * markdown syntax tree (GFM base), so styling always agrees with what the
 * markdown actually parses as — escaped markers, nested emphasis, and code
 * spans never produce false positives.
 *
 * Reveal rule: an element whose range is touched by the selection shows its
 * syntax markers muted instead of hidden, so the characters under the cursor
 * are always visible while editing (Obsidian-style live preview).
 */
export function buildMarkdownDecorations(
  view: EditorView,
  presentation: WritingMode,
): DecorationSet {
  const { state } = view;
  const selection = state.selection.main;
  const tree = syntaxTree(state);
  const decorations: Range<Decoration>[] = [];
  // Lines already claimed by a marker so the continuation pass skips them.
  const listMarkerLines = new Set<number>();
  const quoteLines = new Set<number>();
  const listRanges: Array<{ from: number; to: number }> = [];

  const touches = (from: number, to: number) =>
    presentation === "semi" && selectionTouches(selection.from, selection.to, from, to);

  const hideOrMute = (from: number, to: number, active: boolean) => {
    const decoration = syntaxMarker(from, to, active);
    if (decoration) decorations.push(decoration);
  };

  const extendWithSpace = (to: number) => (state.doc.sliceString(to, to + 1) === " " ? to + 1 : to);

  const styleContent = (from: number, to: number, className: string) => {
    const decoration = marker(from, to, className);
    if (decoration) decorations.push(decoration);
  };

  /** Hides the delimiter pair of an inline element and styles its content. */
  const inlineElement = (
    node: { from: number; to: number },
    delimiters: Array<{ from: number; to: number }>,
    contentClass: string,
  ) => {
    if (delimiters.length < 2) return;
    // Reveal while the cursor touches any part of the element.
    const active = touches(node.from, node.to);
    delimiters.forEach((delimiter) => hideOrMute(delimiter.from, delimiter.to, active));
    styleContent(delimiters[0].to, delimiters[delimiters.length - 1].from, contentClass);
  };

  for (const range of view.visibleRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const name = node.name;

        const atxHeading = /^ATXHeading([1-6])$/.exec(name);
        if (atxHeading) {
          const level = Number(atxHeading[1]);
          const line = state.doc.lineAt(node.from);
          // Block markers reveal when the cursor is anywhere on their line.
          const active = touches(line.from, line.to + 1);
          if (line.number > 1) {
            decorations.push(
              Decoration.widget({ widget: new HeaderSpacerWidget(), side: -1 }).range(line.from),
            );
          }
          decorations.push(
            Decoration.line({ class: `cm-md-heading-line cm-md-heading-${level}` }).range(
              line.from,
            ),
          );
          const headerMark = node.node.getChild("HeaderMark");
          if (headerMark) {
            const markEnd = extendWithSpace(headerMark.to);
            hideOrMute(headerMark.from, markEnd, active);
            styleContent(markEnd, line.to, `cm-md-heading-text cm-md-heading-text-${level}`);
          }
          return;
        }

        if (name === "QuoteMark") {
          const line = state.doc.lineAt(node.from);
          const active = touches(line.from, line.to + 1);
          if (!quoteLines.has(line.from)) {
            quoteLines.add(line.from);
            decorations.push(Decoration.line({ class: "cm-md-quote-line" }).range(line.from));
          }
          hideOrMute(node.from, extendWithSpace(node.to), active);
          return;
        }

        if (name === "BulletList" || name === "OrderedList") {
          listRanges.push({ from: node.from, to: node.to });
          return;
        }

        if (name === "ListMark") {
          const listItem = node.node.parent;
          const line = state.doc.lineAt(node.from);
          listMarkerLines.add(line.from);

          const indentLevel = calculateIndentLevel(line.text.slice(0, node.from - line.from));
          const lineClasses = ["cm-list-line"];
          if (indentLevel > 0) {
            lineClasses.push(`cm-list-indent-${Math.min(indentLevel, MAX_INDENT_CLASS)}`);
          }
          decorations.push(Decoration.line({ class: lineClasses.join(" ") }).range(line.from));

          const taskMarker = listItem?.getChild("Task")?.getChild("TaskMarker");
          const markText = state.doc.sliceString(node.from, node.to);
          const kind = taskMarker ? "task" : /^\d/.test(markText) ? "ordered" : "bullet";
          const label = taskMarker
            ? /x/i.test(state.doc.sliceString(taskMarker.from, taskMarker.to))
              ? "☑"
              : "☐"
            : kind === "ordered"
              ? markText
              : "•";
          const markerEnd = extendWithSpace(taskMarker ? taskMarker.to : node.to);

          const active = touches(line.from, line.to + 1);
          if (active) {
            styleContent(node.from, markerEnd, "cm-list-marker");
          } else {
            decorations.push(
              Decoration.widget({ widget: new ListMarkerWidget(label, kind), side: 1 }).range(
                node.from,
              ),
            );
            hideOrMute(node.from, markerEnd, false);
          }
          return;
        }

        if (name === "StrongEmphasis") {
          inlineElement(node, node.node.getChildren("EmphasisMark"), "cm-md-bold");
          return;
        }

        if (name === "Emphasis") {
          inlineElement(node, node.node.getChildren("EmphasisMark"), "cm-md-italic");
          return;
        }

        if (name === "InlineCode") {
          inlineElement(node, node.node.getChildren("CodeMark"), "cm-md-inline-code");
          return;
        }

        if (name === "Strikethrough") {
          inlineElement(node, node.node.getChildren("StrikethroughMark"), "cm-md-strike");
          return;
        }

        if (name === "Link") {
          const link = node.node;
          const url = link.getChild("URL");
          // Links without a URL are wikilinks or bare [references]; the
          // wikilink plugin owns those and plain brackets stay as typed.
          if (!url) return;
          const active = touches(node.from, node.to);
          const linkMarks = link.getChildren("LinkMark");
          linkMarks.forEach((linkMark) => hideOrMute(linkMark.from, linkMark.to, active));
          hideOrMute(url.from, url.to, active);
          const title = link.getChild("LinkTitle");
          if (title) hideOrMute(title.from, title.to, active);
          if (linkMarks.length >= 2) {
            styleContent(linkMarks[0].to, linkMarks[1].from, "cm-md-link-label");
          }
          return;
        }

        if (name === "HorizontalRule") {
          const line = state.doc.lineAt(node.from);
          const active = touches(line.from, line.to + 1);
          if (!active) {
            decorations.push(
              Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to),
            );
          } else {
            styleContent(node.from, node.to, "cm-markdown-syntax-muted");
          }
          return;
        }

        if (name === "FencedCode") {
          const firstLine = state.doc.lineAt(node.from);
          const lastLine = state.doc.lineAt(node.to);
          const active = touches(node.from, node.to);
          for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
            const line = state.doc.line(lineNumber);
            const classes = ["cm-md-codeblock-line"];
            if (lineNumber === firstLine.number) classes.push("cm-md-codeblock-first");
            if (lineNumber === lastLine.number) classes.push("cm-md-codeblock-last");
            decorations.push(Decoration.line({ class: classes.join(" ") }).range(line.from));
          }
          node.node.getChildren("CodeMark").forEach((codeMark) => {
            hideOrMute(codeMark.from, codeMark.to, active);
          });
          const info = node.node.getChild("CodeInfo");
          if (info) {
            if (active) styleContent(info.from, info.to, "cm-md-code-lang");
            else hideOrMute(info.from, info.to, false);
          }
          const codeText = node.node.getChild("CodeText");
          decorations.push(
            Decoration.widget({
              widget: new CopyCodeWidget(
                codeText ? state.doc.sliceString(codeText.from, codeText.to) : "",
              ),
              side: 1,
            }).range(firstLine.to),
          );
          return false;
        }

        // Images are replaced wholesale by the image plugin; skip their inner
        // Link-like markup so the two plugins never disagree.
        if (name === "Image") return false;
      },
    });

    // Continuation lines: text inside a list that doesn't start its own item.
    for (const listRange of listRanges) {
      const firstLine = state.doc.lineAt(Math.max(listRange.from, range.from));
      const lastLine = state.doc.lineAt(Math.min(listRange.to, range.to));
      for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
        const line = state.doc.line(lineNumber);
        if (listMarkerLines.has(line.from) || !line.text.trim()) continue;
        decorations.push(
          Decoration.line({ class: "cm-list-line cm-list-continuation" }).range(line.from),
        );
      }
    }
    listRanges.length = 0;
  }

  return Decoration.set(decorations, true);
}

export function markdownSyntaxPlugin(presentation: WritingMode) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildMarkdownDecorations(view, presentation);
      }

      update(update: ViewUpdate) {
        if (
          isStructuralChange(update) ||
          update.selectionSet ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          this.decorations = buildMarkdownDecorations(update.view, presentation);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
