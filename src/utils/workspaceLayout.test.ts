import { describe, expect, it } from "vitest";
import type { OpenTab } from "../editorTypes";
import {
  activateDockTab,
  addDocumentToLayout,
  addPanelToLayout,
  closeDockTab,
  createDefaultWorkspaceLayout,
  createWorkspaceLayoutPreset,
  documentDockTabId,
  isDockMoveAllowedAroundDocumentAnchor,
  documentPathsInLayout,
  layoutHasPanel,
  moveDockTab,
  orderOpenTabsByLayout,
  panelDockTabId,
  resizeDockSplit,
  syncLayoutWithOpenTabs,
  updateLayoutForPathChange,
} from "./workspaceLayout";

function tab(path: string): OpenTab {
  return {
    path,
    title: path.replace(/\.md$/i, ""),
    dirty: false,
    mode: "write",
    writingMode: "processed",
    isTemplate: false,
    rawMarkdown: "",
    savedMarkdown: "",
  };
}

describe("workspace layout utilities", () => {
  it("creates a Unity-style default layout from persisted document tabs", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md"), tab("B.md")], {
      activePath: "B.md",
      showGraph: true,
    });

    expect(layout.version).toBe(1);
    expect(documentPathsInLayout(layout)).toEqual(["A.md", "B.md"]);
    expect(layoutHasPanel(layout, "explorer")).toBe(true);
    expect(layoutHasPanel(layout, "inspector")).toBe(true);
    expect(layoutHasPanel(layout, "ai-advisor")).toBe(false);
    expect(layoutHasPanel(layout, "graph")).toBe(true);
    const serialized = JSON.stringify(layout.root);
    expect(serialized).toContain(`"activeTabId":"${panelDockTabId("inspector")}"`);
    expect(serialized).not.toContain(panelDockTabId("ai-advisor"));
  });

  it("only includes AI Advisor when the layout explicitly requests it", () => {
    const layout = createDefaultWorkspaceLayout([], { showAiAdvisor: true });

    expect(layoutHasPanel(layout, "ai-advisor")).toBe(true);
  });

  it("reorders document tabs inside a group", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md"), tab("B.md"), tab("C.md")]);
    const next = moveDockTab(layout, {
      tabId: documentDockTabId("C.md"),
      sourceGroupId: "dock-documents",
      targetGroupId: "dock-documents",
      position: "center",
      targetTabId: documentDockTabId("A.md"),
    });

    expect(documentPathsInLayout(next)).toEqual(["C.md", "A.md", "B.md"]);
  });

  it("keeps document tabs in the writing sheet instead of splitting them out", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md"), tab("B.md")]);
    const next = moveDockTab(layout, {
      tabId: documentDockTabId("B.md"),
      sourceGroupId: "dock-documents",
      targetGroupId: "dock-documents",
      position: "right",
    });

    expect(next).toEqual(layout);
    expect(documentPathsInLayout(next)).toEqual(["A.md", "B.md"]);
  });

  it("moves panel tabs into split groups and activates the new panel group", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md")], { showGraph: true });
    const next = moveDockTab(layout, {
      tabId: panelDockTabId("graph"),
      sourceGroupId: "dock-tools",
      targetGroupId: "dock-documents",
      position: "left",
    });

    expect(layoutHasPanel(next, "graph")).toBe(true);
    expect(next.activeGroupId).toBe("dock-documents-panel-graph-group");
    expect(JSON.stringify(next.root)).toContain(panelDockTabId("graph"));
  });

  it("allows panels to dock around the writing sheet but keeps documents centered", () => {
    expect(
      isDockMoveAllowedAroundDocumentAnchor({
        tabId: panelDockTabId("graph"),
        sourceGroupId: "dock-tools",
        targetGroupId: "dock-documents",
        position: "left",
      }),
    ).toBe(true);
    expect(
      isDockMoveAllowedAroundDocumentAnchor({
        tabId: documentDockTabId("A.md"),
        sourceGroupId: "dock-documents",
        targetGroupId: "dock-explorer",
        position: "left",
      }),
    ).toBe(false);
    expect(
      isDockMoveAllowedAroundDocumentAnchor({
        tabId: documentDockTabId("A.md"),
        sourceGroupId: "dock-explorer",
        targetGroupId: "dock-documents",
        position: "center",
      }),
    ).toBe(true);
  });

  it("keeps the moved tab active when moved to the center of another group", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md")], { showGraph: true });
    const next = moveDockTab(layout, {
      tabId: panelDockTabId("graph"),
      sourceGroupId: "dock-tools",
      targetGroupId: "dock-explorer",
      position: "center",
    });

    expect(next.activeGroupId).toBe("dock-explorer");
    expect(next.root).toMatchObject({
      type: "split",
      first: expect.objectContaining({
        type: "group",
        activeTabId: panelDockTabId("graph"),
      }),
    });
  });

  it("closes tabs and collapses empty groups", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md"), tab("B.md")]);
    const split = moveDockTab(layout, {
      tabId: panelDockTabId("inspector"),
      sourceGroupId: "dock-tools",
      targetGroupId: "dock-documents",
      position: "right",
    });
    const closed = closeDockTab(split, panelDockTabId("inspector"));

    expect(documentPathsInLayout(closed)).toEqual(["A.md", "B.md"]);
    expect(JSON.stringify(closed.root)).not.toContain(panelDockTabId("inspector"));
    expect(JSON.stringify(closed.root)).toContain("dock-documents");
  });

  it("keeps the writing sheet visible after the last document tab closes", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md")]);
    const closed = closeDockTab(layout, documentDockTabId("A.md"));

    expect(documentPathsInLayout(closed)).toEqual([]);
    expect(JSON.stringify(closed.root)).toContain("dock-documents");
    expect(closed.activeGroupId).toBe("dock-documents");
  });

  it("adds and activates document and panel tabs without duplicates", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md")]);
    const withDocument = addDocumentToLayout(layout, "B.md", "B");
    const withDuplicateDocument = addDocumentToLayout(withDocument, "B.md", "B");
    const withGraph = addPanelToLayout(withDuplicateDocument, "graph");
    const withDuplicateGraph = addPanelToLayout(withGraph, "graph");

    expect(documentPathsInLayout(withDuplicateDocument)).toEqual(["A.md", "B.md"]);
    expect(layoutHasPanel(withDuplicateGraph, "graph")).toBe(true);
    expect(
      JSON.stringify(withDuplicateGraph.root).match(
        new RegExp(`"id":"${panelDockTabId("graph")}"`, "g"),
      ),
    ).toHaveLength(1);
  });

  it("opens new documents in the active document group", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md"), tab("B.md")]);
    const split = moveDockTab(layout, {
      tabId: documentDockTabId("B.md"),
      sourceGroupId: "dock-documents",
      targetGroupId: "dock-documents",
      position: "right",
    });
    const activatedRightGroup = activateDockTab(split, documentDockTabId("B.md"));
    const withNewDocument = addDocumentToLayout(activatedRightGroup, "C.md", "C");
    const serialized = JSON.stringify(withNewDocument.root);

    expect(serialized.indexOf(documentDockTabId("B.md"))).toBeLessThan(
      serialized.indexOf(documentDockTabId("C.md")),
    );
    expect(documentPathsInLayout(withNewDocument)).toEqual(["A.md", "B.md", "C.md"]);
  });

  it("syncs document tabs with the open tab list and orders open tabs by layout", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md"), tab("B.md")]);
    const reordered = moveDockTab(layout, {
      tabId: documentDockTabId("B.md"),
      sourceGroupId: "dock-documents",
      targetGroupId: "dock-documents",
      position: "center",
      targetTabId: documentDockTabId("A.md"),
    });
    const synced = syncLayoutWithOpenTabs(reordered, [tab("B.md"), tab("C.md")], "C.md");

    expect(documentPathsInLayout(synced)).toEqual(["B.md", "C.md"]);
    expect(
      orderOpenTabsByLayout([tab("C.md"), tab("B.md")], synced).map((item) => item.path),
    ).toEqual(["B.md", "C.md"]);
  });

  it("activates the group containing a tab", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md")]);
    const next = activateDockTab(layout, documentDockTabId("A.md"));

    expect(next.activeGroupId).toBe("dock-documents");
  });

  it("updates document references when paths change", () => {
    const layout = createDefaultWorkspaceLayout([tab("Old/A.md")], { activePath: "Old/A.md" });
    const next = updateLayoutForPathChange(layout, {
      fromPath: "Old",
      toPath: "New",
      mode: "tree",
    });

    expect(documentPathsInLayout(next)).toEqual(["New/A.md"]);
    expect(JSON.stringify(next.root)).toContain(documentDockTabId("New/A.md"));
  });

  it("resizes splits and clamps extreme ratios", () => {
    const layout = createDefaultWorkspaceLayout([tab("A.md")]);
    const widerExplorer = resizeDockSplit(layout, { splitId: "dock-root", ratio: 0.36 });
    const clamped = resizeDockSplit(layout, { splitId: "dock-root", ratio: 0.98 });

    expect(widerExplorer.root).toMatchObject({ type: "split", ratio: 0.36 });
    expect(clamped.root).toMatchObject({ type: "split", ratio: 0.82 });
  });

  it("creates workspace presets without losing open documents", () => {
    const focus = createWorkspaceLayoutPreset("focus", [tab("A.md"), tab("B.md")], {
      activePath: "B.md",
    });
    const graph = createWorkspaceLayoutPreset("graph", [tab("A.md")], { activePath: "A.md" });

    expect(focus.root).toMatchObject({ type: "group" });
    expect(documentPathsInLayout(focus)).toEqual(["A.md", "B.md"]);
    expect(documentPathsInLayout(graph)).toEqual(["A.md"]);
    expect(layoutHasPanel(graph, "graph")).toBe(true);
    expect(graph.activeGroupId).toBe("dock-documents");
  });
});
