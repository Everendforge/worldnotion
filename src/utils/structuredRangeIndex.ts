import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { parseImagePresentation } from "./attachments";
import type { StructuredElement, StructuredElementKind } from "./structuredMarkdown";

export type StructuredTextRange = { from: number; to: number };

export type StructuredRange = StructuredElement & {
  id: string;
  sourceRange: StructuredTextRange;
  visibleRanges: StructuredTextRange[];
  syntaxRanges: StructuredTextRange[];
  parentId?: string;
  childIds: string[];
  valid: true;
  plainText: string;
};

function range(from: number, to: number): StructuredTextRange {
  return { from, to };
}

function createRange(
  element: StructuredElement,
  visibleRanges: StructuredTextRange[],
  syntaxRanges: StructuredTextRange[],
  plainText = element.label,
): StructuredRange {
  return {
    ...element,
    id: `${element.kind}:${element.from}:${element.to}`,
    sourceRange: range(element.from, element.to),
    visibleRanges,
    syntaxRanges: syntaxRanges.filter((candidate) => candidate.from < candidate.to),
    childIds: [],
    valid: true,
    plainText,
  };
}

function tablePlainText(source: string) {
  return source
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
        .join("\t"),
    )
    .join("\n");
}

function addUnique(target: StructuredRange[], candidate: StructuredRange) {
  if (
    target.some(
      (current) =>
        current.kind === candidate.kind &&
        current.from === candidate.from &&
        current.to === candidate.to,
    )
  ) {
    return;
  }
  target.push(candidate);
}

function scanPortableExtensions(text: string, ranges: StructuredRange[]) {
  const scan = (
    pattern: RegExp,
    visit: (match: RegExpExecArray) => StructuredRange | undefined,
  ) => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = visit(match);
      if (candidate) addUnique(ranges, candidate);
    }
  };

  scan(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (match) => {
    const from = match.index;
    const to = from + match[0].length;
    const target = match[1].trim();
    const alias = match[2]?.trim();
    const pipe = match[0].indexOf("|");
    const visibleFrom = pipe >= 0 ? from + pipe + 1 : from + 2;
    const visibleTo = to - 2;
    return createRange(
      { kind: "wikilink", from, to, text: match[0], label: alias || target, target, alias },
      [range(visibleFrom, visibleTo)],
      pipe >= 0
        ? [range(from, visibleFrom), range(visibleTo, to)]
        : [range(from, from + 2), range(to - 2, to)],
      alias || target,
    );
  });

  scan(/!\[([^\]\n]*)\]\(([^)\s\n]+)(?:\s+"([^"\n]*)")?\)/g, (match) => {
    const from = match.index;
    const to = from + match[0].length;
    const alt = match[1].trim();
    const target = match[2].trim();
    return createRange(
      {
        kind: "image",
        from,
        to,
        text: match[0],
        label: alt || target,
        target,
        imagePresentation: parseImagePresentation(match[3]),
      },
      alt ? [range(from + 2, from + 2 + match[1].length)] : [],
      [range(from, from + 2), range(from + 2 + match[1].length, to)],
      alt || target,
    );
  });

  scan(/\[\^([^\]\n]+)\]/g, (match) => {
    const from = match.index;
    const to = from + match[0].length;
    return createRange(
      { kind: "footnote", from, to, text: match[0], label: match[1].trim() },
      [range(from + 2, to - 1)],
      [range(from, from + 2), range(to - 1, to)],
      match[1].trim(),
    );
  });

  scan(/^\s*<!--\s*everend:variant\s+id=["']([^"']+)["']\s*-->\s*$/gm, (match) => {
    const from = match.index;
    const to = from + match[0].length;
    return createRange(
      { kind: "variant", from, to, text: match[0], label: `${match[1]} variant` },
      [],
      [range(from, to)],
      "",
    );
  });

  scan(/<span\s+data-font=["']([^"']+)["']>([^\n]*?)<\/span>/g, (match) => {
    const from = match.index;
    const to = from + match[0].length;
    const openEnd = from + match[0].indexOf(">") + 1;
    const closeFrom = to - "</span>".length;
    return createRange(
      { kind: "font-span", from, to, text: match[0], label: match[2] },
      [range(openEnd, closeFrom)],
      [range(from, openEnd), range(closeFrom, to)],
      match[2],
    );
  });
}

function assignHierarchy(ranges: StructuredRange[]) {
  for (const child of ranges) {
    const parent = ranges
      .filter(
        (candidate) =>
          candidate.id !== child.id &&
          candidate.from <= child.from &&
          candidate.to >= child.to &&
          (candidate.from < child.from || candidate.to > child.to),
      )
      .sort((first, second) => first.to - first.from - (second.to - second.from))[0];
    if (!parent) continue;
    child.parentId = parent.id;
    parent.childIds.push(child.id);
  }
}

export class StructuredRangeIndex {
  readonly ranges: readonly StructuredRange[];
  private readonly byId: Map<string, StructuredRange>;

  constructor(ranges: StructuredRange[]) {
    ranges.sort((first, second) => first.from - second.from || second.to - first.to);
    assignHierarchy(ranges);
    this.ranges = ranges;
    this.byId = new Map(ranges.map((item) => [item.id, item]));
  }

  at(position: number): StructuredRange | undefined {
    return this.ranges
      .filter((item) => position >= item.from && position <= item.to)
      .sort(
        (first, second) =>
          first.to - first.from - (second.to - second.from) ||
          (second.parentId ? 1 : 0) - (first.parentId ? 1 : 0),
      )[0];
  }

  containing(from: number, to = from): StructuredRange[] {
    return this.ranges
      .filter((item) =>
        from === to ? from >= item.from && from <= item.to : from < item.to && to > item.from,
      )
      .sort((first, second) => first.to - first.from - (second.to - second.from));
  }

  get(id: string | undefined) {
    return id ? this.byId.get(id) : undefined;
  }

  parentsOf(item: StructuredRange) {
    const parents: StructuredRange[] = [];
    let current = this.get(item.parentId);
    while (current) {
      parents.push(current);
      current = this.get(current.parentId);
    }
    return parents;
  }
}

const INDEX_CACHE = new WeakMap<EditorState, StructuredRangeIndex>();

/** Builds the semantic source/visible ranges from the same Lezer tree used by decorations. */
export function buildStructuredRangeIndex(state: EditorState): StructuredRangeIndex {
  const cached = INDEX_CACHE.get(state);
  if (cached) return cached;
  const text = state.doc.toString();
  const ranges: StructuredRange[] = [];
  const claimedListLines = new Set<number>();
  const claimedQuoteLines = new Set<number>();

  syntaxTree(state).iterate({
    enter(node) {
      const source = state.doc.sliceString(node.from, node.to);
      const heading = /^ATXHeading([1-6])$/.exec(node.name);
      if (heading) {
        const line = state.doc.lineAt(node.from);
        const mark = node.node.getChild("HeaderMark");
        if (!mark) return;
        const visibleFrom =
          state.doc.sliceString(mark.to, mark.to + 1) === " " ? mark.to + 1 : mark.to;
        addUnique(
          ranges,
          createRange(
            {
              kind: "heading",
              from: line.from,
              to: line.to,
              text: line.text,
              label: state.doc.sliceString(visibleFrom, line.to),
              level: Number(heading[1]),
            },
            [range(visibleFrom, line.to)],
            [range(line.from, visibleFrom)],
            state.doc.sliceString(visibleFrom, line.to),
          ),
        );
        return;
      }

      const inlineKinds: Partial<Record<string, { kind: StructuredElementKind; mark: string }>> = {
        StrongEmphasis: { kind: "bold", mark: "EmphasisMark" },
        Emphasis: { kind: "italic", mark: "EmphasisMark" },
        InlineCode: { kind: "inline-code", mark: "CodeMark" },
        Strikethrough: { kind: "strikethrough", mark: "StrikethroughMark" },
      };
      const inline = inlineKinds[node.name];
      if (inline) {
        const marks = node.node.getChildren(inline.mark);
        if (marks.length < 2) return;
        const visibleFrom = marks[0].to;
        const visibleTo = marks[marks.length - 1].from;
        addUnique(
          ranges,
          createRange(
            {
              kind: inline.kind,
              from: node.from,
              to: node.to,
              text: source,
              label: state.doc.sliceString(visibleFrom, visibleTo),
            },
            [range(visibleFrom, visibleTo)],
            marks.map((mark) => range(mark.from, mark.to)),
            state.doc.sliceString(visibleFrom, visibleTo),
          ),
        );
        return;
      }

      if (node.name === "Link" && !source.startsWith("![")) {
        const parsed = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/.exec(source);
        if (!parsed) return;
        const labelFrom = node.from + 1;
        const labelTo = labelFrom + parsed[1].length;
        addUnique(
          ranges,
          createRange(
            {
              kind: "link",
              from: node.from,
              to: node.to,
              text: source,
              label: parsed[1],
              url: parsed[2].trim(),
            },
            [range(labelFrom, labelTo)],
            [range(node.from, labelFrom), range(labelTo, node.to)],
            parsed[1],
          ),
        );
        return;
      }

      if (node.name === "ListMark") {
        const line = state.doc.lineAt(node.from);
        if (claimedListLines.has(line.number)) return;
        claimedListLines.add(line.number);
        const task = /^(\s*)[-*]\s+\[([ xX])\]\s+/.exec(line.text);
        const list = /^(\s*)(?:[-*]|\d+\.)\s+/.exec(line.text);
        const prefix = task?.[0] ?? list?.[0];
        if (!prefix) return;
        const visibleFrom = line.from + prefix.length;
        const kind = task ? "task" : "list";
        addUnique(
          ranges,
          createRange(
            {
              kind,
              from: line.from,
              to: line.to,
              text: line.text,
              label: state.doc.sliceString(visibleFrom, line.to),
              checked: task ? /[xX]/.test(task[2]) : undefined,
            },
            [range(visibleFrom, line.to)],
            [range(line.from + (task?.[1].length ?? list?.[1].length ?? 0), visibleFrom)],
            `${task?.[1] ?? list?.[1] ?? ""}${state.doc.sliceString(visibleFrom, line.to)}`,
          ),
        );
        return;
      }

      if (node.name === "QuoteMark") {
        const line = state.doc.lineAt(node.from);
        if (claimedQuoteLines.has(line.number)) return;
        claimedQuoteLines.add(line.number);
        const match = /^(\s*)>\s?/.exec(line.text);
        if (!match) return;
        const visibleFrom = line.from + match[0].length;
        addUnique(
          ranges,
          createRange(
            {
              kind: "quote",
              from: line.from,
              to: line.to,
              text: line.text,
              label: state.doc.sliceString(visibleFrom, line.to),
            },
            [range(visibleFrom, line.to)],
            [range(line.from + match[1].length, visibleFrom)],
            `${match[1]}${state.doc.sliceString(visibleFrom, line.to)}`,
          ),
        );
        return;
      }

      if (node.name === "HorizontalRule") {
        addUnique(
          ranges,
          createRange(
            { kind: "divider", from: node.from, to: node.to, text: source, label: "Divider" },
            [],
            [range(node.from, node.to)],
            "",
          ),
        );
        return;
      }

      if (node.name === "FencedCode") {
        const firstLine = state.doc.lineAt(node.from);
        const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
        const contentFrom = Math.min(state.doc.length, firstLine.to + 1);
        const contentTo = Math.max(
          contentFrom,
          lastLine.from - (lastLine.number === firstLine.number ? 0 : 1),
        );
        const plainText = state.doc.sliceString(contentFrom, contentTo).replace(/\n$/, "");
        addUnique(
          ranges,
          createRange(
            {
              kind: "fenced-code",
              from: node.from,
              to: node.to,
              text: source,
              label: "Code block",
            },
            contentFrom < contentTo ? [range(contentFrom, contentTo)] : [],
            [range(node.from, contentFrom), range(lastLine.from, node.to)],
            plainText,
          ),
        );
        return;
      }

      if (node.name === "Table") {
        addUnique(
          ranges,
          createRange(
            { kind: "table", from: node.from, to: node.to, text: source, label: "Markdown table" },
            [range(node.from, node.to)],
            [],
            tablePlainText(source),
          ),
        );
      }
    },
  });

  scanPortableExtensions(text, ranges);
  // An image's source also parses as an ordinary Link. The image is the
  // semantic owner, so drop the duplicate link with the same closing range.
  const imageRanges = ranges.filter((item) => item.kind === "image");
  const filtered = ranges.filter(
    (item) =>
      item.kind !== "link" ||
      !imageRanges.some((image) => item.from >= image.from && item.to <= image.to),
  );
  const index = new StructuredRangeIndex(filtered);
  INDEX_CACHE.set(state, index);
  return index;
}
