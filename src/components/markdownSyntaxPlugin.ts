import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { isStructuralChange, selectionTouches as sharedSelectionTouches, marker as sharedMarker, syntaxMarker as sharedSyntaxMarker } from "./pluginUtils";

// List configuration - matches Obsidian standard
const LIST_INDENT_WIDTH = 2; // 2 spaces per indent level
const LIST_MARKER_REGEX = /^(\s*)([-*]|\d+\.)\s/; // Bullet, asterisk, or numbered list
const TASK_CHECKBOX_REGEX = /^(\s*)- \[[ xX]\]\s/; // Task list

// Inline style patterns - compiled once at module load
const BOLD_PATTERN = /(\*\*|__)([^*_`\n]+?)\1/g;
const ITALIC_PATTERN = /(^|[^*_\w])(\*|_)([^*_`\n]+?)\2(?![*_\w])/g;
const CODE_PATTERN = /`([^`\n]+?)`/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

// Limit matches per visible range to prevent performance issues on huge documents
const MAX_INLINE_MATCHES_PER_RANGE = 50;

class ListMarkerWidget extends WidgetType {
  constructor(private readonly label: string, private readonly kind: "bullet" | "ordered" | "task") {
    super();
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = `cm-list-marker cm-list-marker-${this.kind}`;
    element.textContent = this.label;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

class HeaderSpacerWidget extends WidgetType {
  constructor() {
    super();
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

// Local utility functions
function lineClass(className: string, from: number) {
  return Decoration.line({ class: className }).range(from);
}

// Use shared utilities from pluginUtils
const marker = sharedMarker;
const syntaxMarker = sharedSyntaxMarker;
const selectionTouches = sharedSelectionTouches;

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

// List-specific functions
interface ListItemInfo {
  indentLevel: number;
  markerStart: number;
  markerEnd: number;
  kind: "bullet" | "ordered" | "task";
  marker: string;
}

function parseListItem(text: string, lineStart: number): ListItemInfo | null {
  const taskMatch = TASK_CHECKBOX_REGEX.exec(text);
  if (taskMatch) {
    return {
      indentLevel: calculateIndentLevel(taskMatch[1]),
      markerStart: lineStart + taskMatch[1].length,
      markerEnd: lineStart + taskMatch[0].length,
      kind: "task",
      marker: /[xX]/.test(text) ? "☑" : "☐",
    };
  }

  const listMatch = LIST_MARKER_REGEX.exec(text);
  if (listMatch) {
    const indent = listMatch[1];
    const markerText = listMatch[2];
    const isOrdered = /^\d+\./.test(markerText);
    
    return {
      indentLevel: calculateIndentLevel(indent),
      markerStart: lineStart + indent.length,
      markerEnd: lineStart + listMatch[0].length,
      kind: isOrdered ? "ordered" : "bullet",
      marker: isOrdered ? markerText : "•",
    };
  }

  return null;
}

function isListContinuation(text: string, prevListLevel: number): boolean {
  // A line is a continuation if it's indented more than list marker indentation
  // but doesn't start with a list marker
  if (LIST_MARKER_REGEX.test(text)) return false;
  
  const indentMatch = /^\s*/.exec(text);
  if (!indentMatch) return false;
  
  const indentStr = indentMatch[0];
  const currentLevel = calculateIndentLevel(indentStr);
  const expectedMinLevel = prevListLevel + 1;
  
  return currentLevel >= expectedMinLevel && text.trim().length > 0;
}

function addInlineMatches(
  text: string,
  from: number,
  selectionFrom: number,
  selectionTo: number,
  decorations: Range<Decoration>[],
) {
  let matchCount = 0;
  
  let boldMatch: RegExpExecArray | null;
  BOLD_PATTERN.lastIndex = 0;
  while ((boldMatch = BOLD_PATTERN.exec(text)) !== null && matchCount < MAX_INLINE_MATCHES_PER_RANGE) {
    matchCount++;
    const openFrom = from + boldMatch.index;
    const contentFrom = openFrom + boldMatch[1].length;
    const contentTo = contentFrom + boldMatch[2].length;
    const active = selectionTouches(selectionFrom, selectionTo, openFrom, contentTo + boldMatch[1].length);
    const m1 = syntaxMarker(openFrom, contentFrom, active);
    if (m1) decorations.push(m1);
    const m2 = marker(contentFrom, contentTo, "cm-md-bold");
    if (m2) decorations.push(m2);
    const m3 = syntaxMarker(contentTo, contentTo + boldMatch[1].length, active);
    if (m3) decorations.push(m3);
  }

  let italicMatch: RegExpExecArray | null;
  ITALIC_PATTERN.lastIndex = 0;
  while ((italicMatch = ITALIC_PATTERN.exec(text)) !== null && matchCount < MAX_INLINE_MATCHES_PER_RANGE) {
    matchCount++;
    const openFrom = from + italicMatch.index + italicMatch[1].length;
    const contentFrom = openFrom + italicMatch[2].length;
    const contentTo = contentFrom + italicMatch[3].length;
    const active = selectionTouches(selectionFrom, selectionTo, openFrom, contentTo + italicMatch[2].length);
    const m1 = syntaxMarker(openFrom, contentFrom, active);
    if (m1) decorations.push(m1);
    const m2 = marker(contentFrom, contentTo, "cm-md-italic");
    if (m2) decorations.push(m2);
    const m3 = syntaxMarker(contentTo, contentTo + italicMatch[2].length, active);
    if (m3) decorations.push(m3);
  }

  let codeMatch: RegExpExecArray | null;
  CODE_PATTERN.lastIndex = 0;
  while ((codeMatch = CODE_PATTERN.exec(text)) !== null && matchCount < MAX_INLINE_MATCHES_PER_RANGE) {
    matchCount++;
    const openFrom = from + codeMatch.index;
    const contentFrom = openFrom + 1;
    const contentTo = contentFrom + codeMatch[1].length;
    const active = selectionTouches(selectionFrom, selectionTo, openFrom, contentTo + 1);
    const m1 = syntaxMarker(openFrom, contentFrom, active);
    if (m1) decorations.push(m1);
    const m2 = marker(contentFrom, contentTo, "cm-md-inline-code");
    if (m2) decorations.push(m2);
    const m3 = syntaxMarker(contentTo, contentTo + 1, active);
    if (m3) decorations.push(m3);
  }

  let linkMatch: RegExpExecArray | null;
  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  while ((linkMatch = MARKDOWN_LINK_PATTERN.exec(text)) !== null && matchCount < MAX_INLINE_MATCHES_PER_RANGE) {
    matchCount++;
    const linkFrom = from + linkMatch.index;
    const linkTo = linkFrom + linkMatch[0].length;
    const active = selectionTouches(selectionFrom, selectionTo, linkFrom, linkTo);
    const m1 = syntaxMarker(linkFrom, linkFrom + 1, active);
    if (m1) decorations.push(m1);
    const m2 = marker(from + linkMatch.index + 1, from + linkMatch.index + 1 + linkMatch[1].length, "cm-md-link-label");
    if (m2) decorations.push(m2);
    const labelEnd = from + linkMatch.index + 1 + linkMatch[1].length;
    const m3 = syntaxMarker(labelEnd, linkTo, active);
    if (m3) decorations.push(m3);
  }
}

function getDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const selectionFrom = view.state.selection.main.from;
  const selectionTo = view.state.selection.main.to;

  for (const { from, to } of view.visibleRanges) {
    let position = from;
    let lastListLevel = -1;

    while (position <= to) {
      const line = view.state.doc.lineAt(position);
      const text = line.text;

      // Handle headings
      const heading = /^(#{1,6})\s/.exec(text);
      if (heading) {
        lastListLevel = -1;
        const level = Math.min(heading[1].length, 6);
        const markerFrom = line.from;
        const markerTo = line.from + heading[0].length;
        const markerActive = selectionTouches(selectionFrom, selectionTo, markerFrom, markerTo);

        if (line.number > 1) {
          decorations.push(
            Decoration.widget({
              widget: new HeaderSpacerWidget(),
              side: -1,
            }).range(line.from),
          );
        }

        decorations.push(lineClass(`cm-md-heading-line cm-md-heading-${level}`, line.from));
        const m1 = syntaxMarker(markerFrom, markerTo, markerActive);
        if (m1) decorations.push(m1);
        const m2 = marker(markerTo, line.to, `cm-md-heading-text cm-md-heading-text-${level}`);
        if (m2) decorations.push(m2);
      } else {
        // Handle list items
        const listItem = parseListItem(text, line.from);
        if (listItem) {
          lastListLevel = listItem.indentLevel;
          const lineClasses = ["cm-list-line"];
          if (listItem.indentLevel > 0) {
            lineClasses.push(`cm-list-indent-${listItem.indentLevel}`);
          }

          decorations.push(lineClass(lineClasses.join(" "), line.from));

          // Only show syntax when cursor is in the marker itself
          const cursorInMarker = selectionFrom > listItem.markerStart && selectionFrom <= listItem.markerEnd;

          if (!cursorInMarker) {
            decorations.push(
              Decoration.widget({
                widget: new ListMarkerWidget(listItem.marker, listItem.kind),
                side: 1,
              }).range(listItem.markerStart),
            );
          }

          const m1 = cursorInMarker
            ? marker(listItem.markerStart, listItem.markerEnd, "cm-list-marker")
            : syntaxMarker(listItem.markerStart, listItem.markerEnd, false);
          if (m1) decorations.push(m1);
        } else if (lastListLevel >= 0 && isListContinuation(text, lastListLevel)) {
          // This is a continuation of a list item
          decorations.push(lineClass("cm-list-line cm-list-continuation", line.from));
        } else {
          lastListLevel = -1;
        }
      }

      // Handle block quotes
      const quote = /^>\s/.exec(text);
      if (quote) {
        lastListLevel = -1;
        // Show syntax while cursor is in the marker (>) only, hide when writing content
        const markerActive = selectionFrom >= line.from && selectionFrom <= line.from + 1;
        decorations.push(lineClass("cm-md-quote-line", line.from));
        const m1 = syntaxMarker(line.from, line.from + quote[0].length, markerActive);
        if (m1) decorations.push(m1);
      }

      addInlineMatches(text, line.from, selectionFrom, selectionTo, decorations);
      if (line.to + 1 > to) break;
      position = line.to + 1;
    }
  }

  return Decoration.set(decorations, true);
}

export const markdownSyntaxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getDecorations(view);
    }

    update(update: ViewUpdate) {
      // Recalculate on structural changes OR selection changes
      // Selection changes affect syntax visibility (show/hide based on cursor position)
      // This enables instant syntax response when cursor moves (like Obsidian)
      if (isStructuralChange(update) || update.selectionSet) {
        this.decorations = getDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
