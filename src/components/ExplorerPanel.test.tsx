import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VisibleExplorerRow } from "../utils/explorerSelectors";
import { makeEntity, makeVaultIndex } from "../test/fixtures";
import { ExplorerPanel, type ExplorerPanelProps } from "./ExplorerPanel";

function makeRows(count: number): VisibleExplorerRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Note ${index}.md`,
    path: `Notes/Note ${index}.md`,
    kind: "file" as const,
    children: [],
    depth: 1,
    hasChildren: false,
    isExpanded: false,
  }));
}

function renderPanel(
  rows: VisibleExplorerRow[],
  query = "",
  overrides: Partial<ExplorerPanelProps> = {},
) {
  return render(
    <ExplorerPanel
      index={makeVaultIndex()}
      query={query}
      onQueryChange={vi.fn()}
      activeSection="allFiles"
      onSectionChange={vi.fn()}
      focusBreadcrumb={[]}
      onSetFocusedFolder={vi.fn()}
      visibleRows={rows}
      multiSelectedPaths={new Set()}
      openTabPaths={new Set()}
      dirtyTabPaths={new Set()}
      favoritePaths={new Set()}
      favoriteItems={[]}
      ecosystemGroups={new Map()}
      ecosystemEntityColors={new Map()}
      entityTagColors={new Map()}
      folderNotesEnabled={false}
      pointerDragActive={false}
      templatesExpanded={false}
      onToggleTemplatesExpanded={vi.fn()}
      onCreateTemplate={vi.fn()}
      onSelectPath={vi.fn()}
      onSelectFolder={vi.fn()}
      onToggleMultiSelection={vi.fn()}
      onToggleExpand={vi.fn()}
      onTreeAction={vi.fn()}
      onContextMenu={vi.fn()}
      onToggleFavorite={vi.fn()}
      onToggleFolderFocus={vi.fn()}
      onOpenFolderDescription={vi.fn()}
      onDragMove={vi.fn()}
      onPointerDragStart={vi.fn()}
      isPointerClickSuppressed={() => false}
      {...overrides}
    />,
  );
}

describe("ExplorerPanel virtualization", () => {
  it("offers the Images section after Ecosystem", () => {
    const onSectionChange = vi.fn();
    renderPanel([], "", { onSectionChange });

    fireEvent.click(screen.getByTitle("Images"));

    expect(onSectionChange).toHaveBeenCalledWith("images");
  });

  it("opens the create menu from the explorer surface", () => {
    const onOpenCreateMenu = vi.fn();
    renderPanel([], "", { onOpenCreateMenu });

    fireEvent.click(screen.getByRole("button", { name: "Create a folder or note" }));

    expect(onOpenCreateMenu).toHaveBeenCalledOnce();
    expect(onOpenCreateMenu.mock.calls[0]).toHaveLength(2);
  });

  it("uses the favorite button as the only favorite indicator", () => {
    const row = makeRows(1)[0];
    const { container } = renderPanel([row], "", {
      favoritePaths: new Set([row.path]),
    });

    expect(container.querySelector(".tree-favorite")).toBeNull();
    expect(container.querySelector(".folder-favorite-button.active")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Create a folder or note" })).toBeNull();
  });

  it("renders every row for small trees", () => {
    const { container } = renderPanel(makeRows(50));
    expect(container.querySelectorAll(".tree-node").length).toBe(50);
  });

  it("renders only a window of rows for large trees", () => {
    const { container } = renderPanel(makeRows(10000));
    const rendered = container.querySelectorAll(".tree-node").length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
  });

  it("keeps virtualizing while a search query is active", () => {
    const { container } = renderPanel(makeRows(10000), "note");
    const rendered = container.querySelectorAll(".tree-node").length;
    expect(rendered).toBeLessThan(100);
  });

  it("renders ecosystem groups from entity types instead of tags", () => {
    const mara = makeEntity({ tags: ["cast/main"] });
    const keep = makeEntity({
      id: "iron-keep",
      name: "Iron Keep",
      path: "Places/Iron.md",
      type: "location",
      tags: ["places/fortress"],
    });
    const onSelectPath = vi.fn();
    renderPanel([], "", {
      activeSection: "ecosystem",
      index: makeVaultIndex({
        entities: [mara, keep],
        propertiesConfig: {
          version: "3.0",
          tags: { rootNodes: [], allowCustomTags: true, autoDetectSlashNotation: true },
          entityTypes: {
            definitions: [
              { id: "character", label: "Character", color: "#3b82f6" },
              { id: "location", label: "Location", color: "#10b981" },
            ],
            defaultType: "character",
            allowCustomTypes: true,
          },
          statuses: { definitions: [], defaultStatus: "draft", allowCustomStatuses: true },
          customFields: { definitions: [] },
        },
      }),
      ecosystemGroups: new Map([
        ["character", [mara]],
        ["location", [keep]],
      ]),
      ecosystemEntityColors: new Map([
        [mara.path, "#3b82f6"],
        [keep.path, "#10b981"],
      ]),
      onSelectPath,
    });

    expect(screen.getAllByText("Character").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Location").length).toBeGreaterThan(1);
    expect(screen.getByText("Mara")).toBeInTheDocument();
    expect(screen.getByText("Iron Keep")).toBeInTheDocument();
    expect(screen.queryByText("cast/main")).not.toBeInTheDocument();
    expect(screen.queryByText("places/fortress")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Iron Keep" }));
    expect(onSelectPath).toHaveBeenCalledWith("Places/Iron.md");
  });

  it("filters ecosystem entities and groups them by a property", () => {
    const mara = makeEntity({ tags: ["cast/main"] });
    const keep = makeEntity({
      id: "iron-keep",
      name: "Iron Keep",
      path: "Places/Iron.md",
      type: "location",
    });
    renderPanel([], "", {
      activeSection: "ecosystem",
      index: makeVaultIndex({ entities: [mara, keep] }),
      ecosystemGroups: new Map([
        ["character", [mara]],
        ["location", [keep]],
      ]),
    });

    fireEvent.click(screen.getByRole("button", { name: "Add property filter" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Property filter 1" }), {
      target: { value: "type" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Property value 1" }), {
      target: { value: "location" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Ecosystem group by" }), {
      target: { value: "status" },
    });

    expect(screen.queryByRole("button", { name: "Mara" })).toBeNull();
    expect(screen.getByRole("button", { name: "Iron Keep" })).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("adds an item to the bulk selection with Ctrl-click", () => {
    const onToggleMultiSelection = vi.fn();
    renderPanel(makeRows(1), "", { onToggleMultiSelection });

    fireEvent.click(screen.getByRole("button", { name: "Note 0.md" }), { ctrlKey: true });

    expect(onToggleMultiSelection).toHaveBeenCalledWith("Notes/Note 0.md", "file");
  });

  it("highlights the folder under a pointer drag", () => {
    const folder: VisibleExplorerRow = {
      name: "Archive",
      path: "Archive",
      kind: "folder",
      children: [],
      depth: 0,
      hasChildren: false,
      isExpanded: false,
    };
    const { container } = renderPanel([folder], "", { pointerDragTargetPath: "Archive" });

    expect(container.querySelector(".tree-button")).toHaveClass("tree-drop-into");
  });
});
