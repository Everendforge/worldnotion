import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import { useWorkspaceState } from "./useWorkspaceState";
import { loadSettings } from "../settings";
import type { AppSettingsV4 } from "../editorTypes";

function createSettingsHarness(initial?: AppSettingsV4) {
  let settings = initial ?? loadSettings();
  const setSettings: Dispatch<SetStateAction<AppSettingsV4>> = vi.fn((update) => {
    settings = typeof update === "function" ? update(settings) : update;
  });
  return { setSettings, current: () => settings };
}

describe("useWorkspaceState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the workspace session when persistTabs is enabled", () => {
    const harness = createSettingsHarness();
    renderHook(() =>
      useWorkspaceState({
        rootPath: "C:/vault",
        persistTabs: true,
        selectedPath: undefined,
        sessions: harness.current().sessions,
        setSettings: harness.setSettings,
      }),
    );
    expect(harness.current().sessions["C:/vault"]).toMatchObject({ rootPath: "C:/vault" });
  });

  it("persists only expanded paths when persistTabs is disabled", () => {
    const harness = createSettingsHarness();
    const { result } = renderHook(() =>
      useWorkspaceState({
        rootPath: "C:/vault",
        persistTabs: false,
        selectedPath: undefined,
        sessions: harness.current().sessions,
        setSettings: harness.setSettings,
      }),
    );
    act(() => {
      result.current.setExpandedPaths(new Set(["Characters"]));
    });
    const session = harness.current().sessions["C:/vault"];
    expect(session?.explorerExpandedPaths).toEqual(["Characters"]);
    expect(session?.tabs).toEqual([]);
  });

  it("restores expanded paths from the session when the universe changes", () => {
    const base = loadSettings();
    const harness = createSettingsHarness({
      ...base,
      sessions: {
        "C:/vault": {
          rootPath: "C:/vault",
          tabs: [],
          explorerExpandedPaths: ["Characters", "Locations"],
        },
      },
    });
    const { result, rerender } = renderHook(
      ({ rootPath }: { rootPath: string | undefined }) =>
        useWorkspaceState({
          rootPath,
          persistTabs: false,
          selectedPath: undefined,
          sessions: harness.current().sessions,
          setSettings: harness.setSettings,
        }),
      { initialProps: { rootPath: undefined as string | undefined } },
    );
    expect(result.current.expandedPaths.size).toBe(0);
    rerender({ rootPath: "C:/vault" });
    expect(result.current.expandedPaths).toEqual(new Set(["Characters", "Locations"]));
  });

  it("expands the ancestors of the selected document", () => {
    const harness = createSettingsHarness();
    const { rerender, result } = renderHook(
      ({ selectedPath }: { selectedPath: string | undefined }) =>
        useWorkspaceState({
          rootPath: "C:/vault",
          persistTabs: false,
          selectedPath,
          sessions: harness.current().sessions,
          setSettings: harness.setSettings,
        }),
      { initialProps: { selectedPath: undefined as string | undefined } },
    );
    rerender({ selectedPath: "Characters/Guild/Mara.md" });
    expect(result.current.expandedPaths.has("Characters")).toBe(true);
    expect(result.current.expandedPaths.has("Characters/Guild")).toBe(true);
  });

  it("does not re-expand a folder when selecting it to collapse it", () => {
    const harness = createSettingsHarness();
    const { rerender, result } = renderHook(
      ({ selectedPath }: { selectedPath: string | undefined }) =>
        useWorkspaceState({
          rootPath: "C:/vault",
          persistTabs: false,
          selectedPath,
          sessions: harness.current().sessions,
          setSettings: harness.setSettings,
        }),
      { initialProps: { selectedPath: "Characters/Guild/Mara.md" as string | undefined } },
    );

    act(() => {
      result.current.setActiveTabPath("Characters/Guild/Mara.md");
      // Simulate the explorer click that removes the parent from the expanded set.
      result.current.setExpandedPaths(new Set(["Characters/Guild"]));
    });
    rerender({ selectedPath: "Characters" });

    expect(result.current.expandedPaths.has("Characters")).toBe(false);
  });

  it("keeps the dock layout free of outline tabs", () => {
    const harness = createSettingsHarness();
    const { result } = renderHook(() =>
      useWorkspaceState({
        rootPath: undefined,
        persistTabs: false,
        selectedPath: undefined,
        sessions: harness.current().sessions,
        setSettings: harness.setSettings,
      }),
    );
    const layoutJson = JSON.stringify(result.current.workspaceLayout);
    expect(layoutJson).not.toContain('"panel:outline"');
  });
});
