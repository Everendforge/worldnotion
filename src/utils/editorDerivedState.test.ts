import { describe, expect, it } from "vitest";
import type { OpenTab } from "../editorTypes";
import { currentHeaderForLine, editorDisplayValue, outlineForTab } from "./editorDerivedState";

function tab(mode: OpenTab["mode"], rawMarkdown: string): OpenTab {
  return {
    path: "Notes/Ada.md",
    title: "Ada",
    dirty: false,
    mode,
    writingMode: "processed",
    isTemplate: false,
    rawMarkdown,
    savedMarkdown: rawMarkdown,
  };
}

describe("editor derived state", () => {
  it("returns empty editor state without an active tab", () => {
    expect(editorDisplayValue(undefined)).toBe("");
    expect(outlineForTab(undefined)).toEqual([]);
    expect(currentHeaderForLine(undefined, 0)).toBeNull();
  });

  it("uses body markdown as the displayed value in write mode", () => {
    const activeTab = tab("write", "---\nid: ada\n---\n\n# Ada\n\n## Notes");

    expect(editorDisplayValue(activeTab)).toBe("# Ada\n\n## Notes");
    expect(
      outlineForTab(activeTab).map((header) => [header.level, header.text, header.line]),
    ).toEqual([[1, "Ada", 0]]);
    expect(
      outlineForTab(activeTab)[0].children.map((header) => [
        header.level,
        header.text,
        header.line,
      ]),
    ).toEqual([[2, "Notes", 2]]);
  });

  it("uses full raw markdown as the displayed value in source mode", () => {
    const activeTab = tab("source", "---\nid: ada\n---\n\n# Ada");

    expect(editorDisplayValue(activeTab)).toBe("---\nid: ada\n---\n\n# Ada");
    expect(outlineForTab(activeTab)[0]).toMatchObject({ text: "Ada", line: 4 });
  });

  it("finds the current header for the displayed editor line", () => {
    const activeTab = tab("write", "---\nid: ada\n---\n\n# Ada\n\n## Notes\nBody\n## Later");

    expect(currentHeaderForLine(activeTab, 0)?.text).toBe("Ada");
    expect(currentHeaderForLine(activeTab, 3)?.text).toBe("Notes");
    expect(currentHeaderForLine(activeTab, 4)?.text).toBe("Later");
  });
});
