import { parseImagePresentation, type ImagePresentation } from "./attachments";

export type StructuredElementKind =
  | "wikilink"
  | "link"
  | "image"
  | "footnote"
  | "bold"
  | "italic"
  | "strikethrough"
  | "inline-code"
  | "fenced-code"
  | "heading"
  | "task"
  | "list"
  | "quote"
  | "divider"
  | "table"
  | "font-span"
  | "variant";

export type StructuredElement = {
  kind: StructuredElementKind;
  from: number;
  to: number;
  text: string;
  label: string;
  target?: string;
  imagePresentation?: ImagePresentation;
  alias?: string;
  url?: string;
  checked?: boolean;
  level?: number;
};

const WIKILINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
const IMAGE = /!\[([^\]\n]*)\]\(([^)\s\n]+)(?:\s+"([^"\n]*)")?\)/g;
const LINK = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
const FOOTNOTE = /\[\^([^\]\n]+)\]/g;
const BOLD = /(\*\*|__)([^*_`\n]+?)\1/g;
const ITALIC = /(^|[^*_\w])(\*|_)([^*_`\n]+?)\2(?![*_\w])/g;
const INLINE_CODE = /`([^`\n]+)`/g;
const VARIANT_MARKER = /^\s*<!--\s*everend:variant\s+id=["']([^"']+)["']\s*-->\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function inlineMatchAt(
  lineText: string,
  lineFrom: number,
  position: number,
): StructuredElement | undefined {
  const candidates: StructuredElement[] = [];
  const pushMatches = (
    pattern: RegExp,
    build: (match: RegExpExecArray, from: number, to: number) => StructuredElement,
  ) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lineText)) !== null) {
      const from = lineFrom + match.index;
      const to = from + match[0].length;
      if (position >= from && position <= to) candidates.push(build(match, from, to));
    }
  };

  pushMatches(WIKILINK, (match, from, to) => ({
    kind: "wikilink",
    from,
    to,
    text: match[0],
    target: match[1].trim(),
    alias: match[2]?.trim(),
    label: match[2]?.trim() || match[1].trim(),
  }));
  pushMatches(IMAGE, (match, from, to) => ({
    kind: "image",
    from,
    to,
    text: match[0],
    label: match[1].trim() || match[2].trim(),
    target: match[2].trim(),
    imagePresentation: parseImagePresentation(match[3]),
  }));
  pushMatches(LINK, (match, from, to) => ({
    kind: "link",
    from,
    to,
    text: match[0],
    label: match[1].trim(),
    url: match[2].trim(),
  }));
  pushMatches(FOOTNOTE, (match, from, to) => ({
    kind: "footnote",
    from,
    to,
    text: match[0],
    label: match[1].trim(),
  }));
  pushMatches(BOLD, (match, from, to) => ({
    kind: "bold",
    from,
    to,
    text: match[0],
    label: match[2],
  }));
  pushMatches(ITALIC, (match, from, to) => {
    const prefixLength = match[1].length;
    return {
      kind: "italic",
      from: from + prefixLength,
      to,
      text: match[0].slice(prefixLength),
      label: match[3],
    };
  });
  pushMatches(INLINE_CODE, (match, from, to) => ({
    kind: "inline-code",
    from,
    to,
    text: match[0],
    label: match[1],
  }));

  // A Markdown image contains text that also matches the ordinary link
  // pattern. Its semantic controls must win when both ranges overlap.
  return (
    candidates.find((candidate) => candidate.kind === "image") ??
    candidates.sort((a, b) => a.to - a.from - (b.to - b.from))[0]
  );
}

/** Finds a portable Markdown structure at a CodeMirror document position. */
export function structureAt(
  document: {
    lineAt(position: number): { from: number; to: number; text: string; number: number };
    lines: number;
    line(number: number): { from: number; to: number; text: string };
  },
  position: number,
): StructuredElement | undefined {
  const line = document.lineAt(position);
  const text = line.text;

  const variant = VARIANT_MARKER.exec(text);
  if (variant) {
    return { kind: "variant", from: line.from, to: line.to, text, label: `${variant[1]} variant` };
  }

  const heading = /^(#{1,6})\s+(.*)$/.exec(text);
  if (heading) {
    return {
      kind: "heading",
      from: line.from,
      to: line.to,
      text,
      label: heading[2] || "Heading",
      level: heading[1].length,
    };
  }
  const task = /^(\s*)- \[([ xX])\]\s+(.*)$/.exec(text);
  if (task) {
    return {
      kind: "task",
      from: line.from,
      to: line.to,
      text,
      label: task[3] || "Task",
      checked: /[xX]/.test(task[2]),
    };
  }
  const list = /^(\s*)(?:[-*]|\d+\.)\s+(.*)$/.exec(text);
  if (list) {
    return { kind: "list", from: line.from, to: line.to, text, label: list[2] || "List item" };
  }
  const quote = /^(\s*)>\s?(.*)$/.exec(text);
  if (quote) {
    return { kind: "quote", from: line.from, to: line.to, text, label: quote[2] || "Quote" };
  }

  if (text.includes("|") || TABLE_SEPARATOR.test(text)) {
    let separatorLineNumber =
      line.number < document.lines && TABLE_SEPARATOR.test(document.line(line.number + 1).text)
        ? line.number + 1
        : undefined;
    if (!separatorLineNumber) {
      for (let number = line.number; number >= Math.max(2, line.number - 64); number -= 1) {
        if (TABLE_SEPARATOR.test(document.line(number).text)) {
          separatorLineNumber = number;
          break;
        }
      }
    }
    if (separatorLineNumber) {
      const header = document.line(separatorLineNumber - 1);
      if (header.text.includes("|")) {
        return {
          kind: "table",
          from: header.from,
          to: line.to,
          text: `${header.text}\n${document.line(separatorLineNumber).text}`,
          label: "Markdown table",
        };
      }
    }
  }

  return inlineMatchAt(text, line.from, position);
}

export function wikilinkMarkdown(target: string, alias: string): string {
  const cleanTarget = target.trim();
  const cleanAlias = alias.trim();
  return cleanAlias && cleanAlias !== cleanTarget
    ? `[[${cleanTarget}|${cleanAlias}]]`
    : `[[${cleanTarget}]]`;
}

/** Editable text boundaries for a rendered structure, excluding its portable syntax. */
export function visibleTextRange(element: StructuredElement): { from: number; to: number } {
  const offsetRange = (from: number, to: number) => ({
    from: element.from + from,
    to: element.from + to,
  });

  switch (element.kind) {
    case "wikilink": {
      const pipe = element.text.indexOf("|");
      return pipe >= 0
        ? offsetRange(pipe + 1, element.text.length - 2)
        : offsetRange(2, element.text.length - 2);
    }
    case "link": {
      const labelEnd = element.text.indexOf("](");
      return offsetRange(1, labelEnd >= 0 ? labelEnd : element.text.length);
    }
    case "footnote":
      return offsetRange(2, element.text.length - 1);
    case "bold":
      return offsetRange(2, element.text.length - 2);
    case "italic":
    case "strikethrough":
    case "inline-code":
      return offsetRange(1, element.text.length - 1);
    case "fenced-code":
    case "divider":
    case "font-span":
      return { from: element.from, to: element.to };
    case "heading": {
      const prefix = /^#{1,6}\s+/.exec(element.text)?.[0].length ?? 0;
      return offsetRange(prefix, element.text.length);
    }
    case "task": {
      const prefix = /^(\s*)- \[[ xX]\]\s+/.exec(element.text)?.[0].length ?? 0;
      return offsetRange(prefix, element.text.length);
    }
    case "list": {
      const prefix = /^(\s*)(?:[-*]|\d+\.)\s+/.exec(element.text)?.[0].length ?? 0;
      return offsetRange(prefix, element.text.length);
    }
    case "quote": {
      const prefix = /^(\s*)>\s?/.exec(element.text)?.[0].length ?? 0;
      return offsetRange(prefix, element.text.length);
    }
    case "image":
    case "table":
    case "variant":
      return { from: element.from, to: element.to };
  }
}
