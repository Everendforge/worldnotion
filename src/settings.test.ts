import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDINGS } from "./editorTypes";
import { LEGACY_SETTINGS_KEY, SETTINGS_KEY, loadSettings, saveSettings } from "./settings";
import { createDefaultWorkspaceLayout, resizeDockSplit } from "./utils/workspaceLayout";

describe("settings persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads defaults when no settings exist", () => {
    const settings = loadSettings();

    expect(settings.theme).toBe("worldnotion-light");
    expect(settings.keybindings).toEqual(DEFAULT_KEYBINDINGS);
    expect(settings.recentUniverses).toEqual([]);
  });

  it("migrates a legacy recent universe into the recent list", () => {
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({ recentUniverse: "C:/Vault" }));

    expect(loadSettings().recentUniverses).toEqual(["C:/Vault"]);
  });

  it("adds plugin defaults when loading older settings", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "worldnotion-light", recentUniverses: [] }));

    const settings = loadSettings();

    expect(settings.plugins.enabled["markdown-syntax-hiding"]).toBe(true);
    expect(settings.plugins.enabled["unity-adapter"]).toBe(false);
  });

  it("persists simplified session state", () => {
    const settings = loadSettings();
    const layout = resizeDockSplit(
      createDefaultWorkspaceLayout([{ path: "Notes/Mara.md", title: "Mara", mode: "write", modifiedMs: 1, isTemplate: false }]),
      { splitId: "dock-root", ratio: 0.34 },
    );

    saveSettings({
      ...settings,
      sessions: {
        "C:/Vault": {
          rootPath: "C:/Vault",
          activePath: "Notes/Mara.md",
          tabs: [],
          layout,
          explorerExpandedPaths: ["Notes", "Notes/Cast"],
          editorState: {
            "Notes/Mara.md": {
              cursorPosition: { line: 4, column: 2 },
              scrollPosition: 12,
              foldedRanges: [],
              selection: undefined,
              lastModified: 100,
            },
          },
        },
      },
    });

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").sessions["C:/Vault"].editorState["Notes/Mara.md"]).toMatchObject({
      cursorPosition: { line: 4, column: 2 },
      scrollPosition: 12,
    });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").sessions["C:/Vault"].layout).toMatchObject({
      version: 1,
      activeGroupId: "dock-documents",
      root: {
        ratio: 0.34,
      },
    });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").sessions["C:/Vault"].explorerExpandedPaths).toEqual([
      "Notes",
      "Notes/Cast",
    ]);
  });
});
