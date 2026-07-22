import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { buildStructuredRangeIndex } from "./structuredRangeIndex";

function indexFor(doc: string) {
  return buildStructuredRangeIndex(
    EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) }),
  );
}

describe("StructuredRangeIndex", () => {
  it("indexes standard and portable structures from one semantic model", () => {
    const index = indexFor(
      [
        "# Heading",
        "- [ ] Task",
        "> Quote",
        "**bold** ~~strike~~ `code` [label](https://example.com) [[Page|Alias]]",
        "---",
        "```ts",
        "const value = 1;",
        "```",
      ].join("\n"),
    );
    expect(index.ranges.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "heading",
        "task",
        "quote",
        "bold",
        "strikethrough",
        "inline-code",
        "link",
        "wikilink",
        "divider",
        "fenced-code",
      ]),
    );
  });

  it("chooses the innermost nested structure and exposes its parents", () => {
    const doc = "[**bold**](https://example.com)";
    const index = indexFor(doc);
    const inner = index.at(doc.indexOf("bold") + 1);
    expect(inner?.kind).toBe("bold");
    expect(index.parentsOf(inner!).map((item) => item.kind)).toContain("link");
  });

  it("does not hide malformed portable syntax", () => {
    const index = indexFor("Broken [[link and **bold");
    expect(index.ranges.some((item) => item.kind === "wikilink")).toBe(false);
    expect(index.ranges.some((item) => item.kind === "bold")).toBe(false);
  });
});
