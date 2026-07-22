import { describe, expect, it } from "vitest";
import type { OpenTab, WorkspaceSession } from "../editorTypes";
import type { VaultFile, VaultIndex } from "../domain";
import { planUniverseWorkspaceState } from "./universeApply";
import {
  activateDockTab,
  createDefaultWorkspaceLayout,
  documentPathsInLayout,
  panelDockTabId,
} from "./workspaceLayout";

function file(relativePath: string, modifiedMs = 1): VaultFile {
  return {
    relativePath,
    absolutePath: `C:/Vault/${relativePath}`,
    content: `# ${relativePath}`,
    modifiedMs,
  };
}

function index(files: VaultFile[]): VaultIndex {
  return {
    rootPath: "C:/Vault",
    files,
    directories: [],
    markdownFiles: files,
    templates: [],
    universes: [],
    tree: [],
    entities: [],
    findings: [],
    readErrors: [],
    typeCounts: {},
  };
}

function tab(path: string, dirty = false): OpenTab {
  return {
    path,
    title: path.replace(/\.md$/i, ""),
    dirty,
    mode: "write",
    writingMode: "processed",
    isTemplate: false,
    rawMarkdown: dirty ? "unsaved" : "saved",
    savedMarkdown: "saved",
  };
}

describe("universe apply planner", () => {
  it("keeps live tabs for the same vault and applies path changes", () => {
    const plan = planUniverseWorkspaceState({
      nextIndex: index([file("People/Ada.md", 2), file("Notes.md", 3)]),
      readRootPath: "C:/Vault",
      currentRootPath: "C:/Vault",
      tabs: [tab("Characters/Ada.md", true), tab("Notes.md")],
      activeTabPath: "Characters/Ada.md",
      selectedPath: "Characters/Ada.md",
      sessions: {},
      persistTabs: true,
      pathChange: { fromPath: "Characters/Ada.md", toPath: "People/Ada.md", mode: "single" },
    });

    expect(plan.nextPath).toBe("People/Ada.md");
    expect(plan.tabs.map((item) => item.path)).toEqual(["People/Ada.md", "Notes.md"]);
    expect(plan.tabs[0]).toMatchObject({
      dirty: true,
      title: "Ada",
      rawMarkdown: "unsaved",
      absolutePath: "C:/Vault/People/Ada.md",
      modifiedMs: 2,
    });
    expect(plan.tabs[1]).toMatchObject({
      dirty: false,
      rawMarkdown: "# Notes.md",
      absolutePath: "C:/Vault/Notes.md",
      modifiedMs: 3,
    });
    expect(documentPathsInLayout(plan.layout)).toEqual(["People/Ada.md", "Notes.md"]);
  });

  it("restores persisted tabs when there are no live tabs and persistence is enabled", () => {
    const sessions: Record<string, WorkspaceSession> = {
      "C:/Vault": {
        rootPath: "C:/Vault",
        activePath: "Notes.md",
        tabs: [
          { path: "Missing.md", title: "Missing", mode: "write", modifiedMs: 1, isTemplate: false },
          { path: "Notes.md", title: "Notes", mode: "source", modifiedMs: 2, isTemplate: false },
        ],
      },
    };

    const plan = planUniverseWorkspaceState({
      nextIndex: index([file("Notes.md", 4)]),
      readRootPath: "C:/Vault",
      currentRootPath: "Other",
      tabs: [],
      sessions,
      persistTabs: true,
    });

    expect(plan.nextPath).toBe("Notes.md");
    expect(plan.tabs).toHaveLength(1);
    expect(plan.tabs[0]).toMatchObject({
      path: "Notes.md",
      mode: "source",
      rawMarkdown: "# Notes.md",
      modifiedMs: 4,
    });
    expect(documentPathsInLayout(plan.layout)).toEqual(["Notes.md"]);
  });

  it("restores the inspector as the default tool tab for legacy sessions", () => {
    const persistedLayout = activateDockTab(
      createDefaultWorkspaceLayout([tab("Notes.md")]),
      panelDockTabId("ai-advisor"),
    );
    const plan = planUniverseWorkspaceState({
      nextIndex: index([file("Notes.md")]),
      readRootPath: "C:/Vault",
      currentRootPath: undefined,
      tabs: [],
      sessions: {
        "C:/Vault": {
          rootPath: "C:/Vault",
          tabs: [{ path: "Notes.md", title: "Notes", mode: "write", isTemplate: false }],
          layout: persistedLayout,
        },
      },
      persistTabs: true,
    });

    expect(JSON.stringify(plan.layout.root)).toContain(
      `"activeTabId":"${panelDockTabId("inspector")}"`,
    );
  });

  it("prefers explicit preferred paths over active, selected, and session paths", () => {
    const plan = planUniverseWorkspaceState({
      nextIndex: index([
        file("Preferred.md"),
        file("Active.md"),
        file("Selected.md"),
        file("Session.md"),
      ]),
      readRootPath: "C:/Vault",
      currentRootPath: "Other",
      tabs: [],
      activeTabPath: "Active.md",
      selectedPath: "Selected.md",
      sessions: {
        "C:/Vault": {
          rootPath: "C:/Vault",
          activePath: "Session.md",
          tabs: [],
        },
      },
      persistTabs: false,
      preferredPath: "Preferred.md",
    });

    expect(plan.nextPath).toBe("Preferred.md");
    expect(plan.tabs).toEqual([]);
  });

  it("returns no path or tabs when every candidate is missing", () => {
    const plan = planUniverseWorkspaceState({
      nextIndex: index([file("Other.md")]),
      readRootPath: "C:/Vault",
      currentRootPath: "Other",
      tabs: [tab("Missing.md")],
      activeTabPath: "Missing.md",
      selectedPath: "AlsoMissing.md",
      sessions: {
        "C:/Vault": {
          rootPath: "C:/Vault",
          activePath: "Gone.md",
          tabs: [
            { path: "Gone.md", title: "Gone", mode: "write", modifiedMs: 1, isTemplate: false },
          ],
        },
      },
      persistTabs: true,
      preferredPath: "Nope.md",
    });

    expect(plan.tabs).toEqual([]);
    expect(plan.nextPath).toBeUndefined();
    expect(plan.layout.version).toBe(1);
  });
});
