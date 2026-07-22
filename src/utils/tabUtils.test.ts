import { describe, expect, it } from "vitest";
import type { OpenTab } from "../editorTypes";
import {
  closeOpenTab,
  closeSavedOpenTabs,
  closeTabsToRightOf,
  createOpenTabFromFile,
  advancePendingCloseQueue,
  dirtyTabPaths,
  nextAdjacentTabPath,
  pendingCloseQueueFromDirtyPaths,
  serializeWorkspaceSession,
  updateOpenTabsForPathChange,
  withTabEditorMode,
} from "./tabUtils";

function tab(path: string, dirty = false): OpenTab {
  return {
    path,
    title: path.replace(/\.md$/, ""),
    absolutePath: `C:/vault/${path}`,
    rawMarkdown: "",
    savedMarkdown: "",
    dirty,
    mode: "write",
    writingMode: "processed",
    isTemplate: false,
  };
}

describe("tab utilities", () => {
  it("creates open tabs from vault files without changing content", () => {
    const openTab = createOpenTabFromFile(
      {
        relativePath: "People/Ada.md",
        absolutePath: "C:/vault/People/Ada.md",
        content: "# Ada",
        modifiedMs: 123,
      },
      "source",
    );

    expect(openTab).toMatchObject({
      path: "People/Ada.md",
      title: "Ada",
      rawMarkdown: "# Ada",
      savedMarkdown: "# Ada",
      modifiedMs: 123,
      dirty: false,
      mode: "source",
      sourceView: "raw",
      isTemplate: false,
    });
  });

  it("opens json files in source mode with the json reader selected", () => {
    const openTab = createOpenTabFromFile(
      {
        relativePath: ".everend/properties.json",
        content: '{"version":"1.0"}',
        modifiedMs: 123,
      },
      "write",
    );

    expect(openTab).toMatchObject({
      path: ".everend/properties.json",
      mode: "source",
      sourceView: "json",
      rawMarkdown: '{"version":"1.0"}',
    });
  });

  it("opens XML files in source mode with the XML reader selected", () => {
    const openTab = createOpenTabFromFile(
      {
        relativePath: "data/world.xml",
        absolutePath: "/vault/data/world.xml",
        content: "<world />",
        modifiedMs: 123,
      },
      "write",
    );

    expect(openTab).toMatchObject({
      path: "data/world.xml",
      mode: "source",
      sourceView: "xml",
    });
  });

  it("switches each tab independently without changing content or dirty state", () => {
    const original = tab("A.md", true);
    const semi = withTabEditorMode(original, "semi");
    const source = withTabEditorMode(semi, "source");
    const restored = withTabEditorMode(source, "write");

    expect(semi).toMatchObject({ mode: "write", writingMode: "semi", dirty: true });
    expect(source).toMatchObject({ mode: "source", writingMode: "semi", dirty: true });
    expect(restored).toMatchObject({ mode: "write", writingMode: "semi", dirty: true });
    expect(restored.rawMarkdown).toBe(original.rawMarkdown);
    expect(original).toMatchObject({ mode: "write", writingMode: "processed" });
  });

  it("serializes only persisted session fields", () => {
    const session = serializeWorkspaceSession("C:/vault", "A.md", [tab("A.md", true)]);

    expect(session).toEqual({
      rootPath: "C:/vault",
      activePath: "A.md",
      tabs: [
        {
          path: "A.md",
          title: "A",
          mode: "write",
          writingMode: "processed",
          sourceView: undefined,
          modifiedMs: undefined,
          isTemplate: false,
        },
      ],
      layout: undefined,
      documentTabGroups: undefined,
      explorerExpandedPaths: undefined,
    });
  });

  it("updates child tab paths when a folder moves", () => {
    const tabs = updateOpenTabsForPathChange(
      [tab("Old/A.md"), tab("Other.md")],
      { fromPath: "Old", toPath: "New", mode: "tree" },
      "C:/vault",
    );

    expect(tabs.map((item) => [item.path, item.title, item.absolutePath])).toEqual([
      ["New/A.md", "A", "C:/vault/New/A.md"],
      ["Other.md", "Other", "C:/vault/Other.md"],
    ]);
  });

  it("selects the previous tab when closing the active tab", () => {
    const result = closeOpenTab([tab("A.md"), tab("B.md"), tab("C.md")], "B.md", "B.md");

    expect(result.tabs.map((item) => item.path)).toEqual(["A.md", "C.md"]);
    expect(result.activePath).toBe("A.md");
  });

  it("clears the active path when closing the only open tab", () => {
    const result = closeOpenTab([tab("Only.md")], "Only.md", "Only.md");

    expect(result.tabs).toEqual([]);
    expect(result.activePath).toBeUndefined();
  });

  it("keeps only dirty tabs when closing saved tabs", () => {
    const result = closeSavedOpenTabs([tab("A.md"), tab("B.md", true), tab("C.md")], "A.md");

    expect(result.tabs.map((item) => item.path)).toEqual(["B.md"]);
    expect(result.activePath).toBe("B.md");
  });

  it("handles bulk close helpers and adjacent navigation", () => {
    const tabs = [tab("A.md"), tab("B.md", true), tab("C.md")];

    expect(closeTabsToRightOf(tabs, "B.md").map((item) => item.path)).toEqual(["A.md", "B.md"]);
    expect(dirtyTabPaths(tabs, true)).toEqual(["B.md"]);
    expect(dirtyTabPaths(tabs, false)).toEqual([]);
    expect(nextAdjacentTabPath(tabs, "A.md", -1)).toBe("C.md");
    expect(nextAdjacentTabPath(tabs, "C.md", 1)).toBe("A.md");
  });

  it("plans and advances pending close queues for dirty tabs", () => {
    expect(pendingCloseQueueFromDirtyPaths([])).toEqual({
      pendingClosePaths: [],
      unsavedDialogPath: null,
    });
    expect(pendingCloseQueueFromDirtyPaths(["A.md", "B.md", "C.md"])).toEqual({
      pendingClosePaths: ["B.md", "C.md"],
      unsavedDialogPath: "A.md",
    });
    expect(advancePendingCloseQueue(["B.md", "C.md"])).toEqual({
      pendingClosePaths: ["C.md"],
      unsavedDialogPath: "C.md",
    });
    expect(advancePendingCloseQueue(["C.md"])).toEqual({
      pendingClosePaths: [],
      unsavedDialogPath: null,
    });
  });
});
