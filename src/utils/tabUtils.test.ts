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
      isTemplate: false,
    });
  });

  it("serializes only persisted session fields", () => {
    const session = serializeWorkspaceSession("C:/vault", "A.md", [tab("A.md", true)]);

    expect(session).toEqual({
      rootPath: "C:/vault",
      activePath: "A.md",
      tabs: [{ path: "A.md", title: "A", mode: "write", modifiedMs: undefined, isTemplate: false }],
      layout: undefined,
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
