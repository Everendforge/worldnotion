import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type UIEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FileEdit,
  FileText,
  Files,
  Folder,
  FolderOpen,
  Hash,
  Image,
  Plus,
  Search,
  Star,
  Target,
} from "lucide-react";
import type { Entity, VaultIndex } from "../domain";
import type { ExplorerSection, ExplorerFavorite } from "../editorTypes";
import type { VisibleExplorerRow } from "../utils/explorerSelectors";
import { getIconComponent } from "./IconPicker";
import { isImagePath } from "../utils/vaultImages";

export type ExplorerTreeAction =
  "collapseAll" | "expandSelected" | "expandDepth1" | "expandDepth2" | "expandDepth3";

type ExplorerFocusCrumb = {
  label: string;
  path?: string;
};

export type ExplorerPanelProps = {
  index: VaultIndex;
  query: string;
  onQueryChange: (query: string) => void;
  activeSection: ExplorerSection;
  onSectionChange: (section: ExplorerSection) => void;
  focusedFolderPath?: string;
  focusBreadcrumb: ExplorerFocusCrumb[];
  onSetFocusedFolder: (path: string | undefined) => void;
  visibleRows: VisibleExplorerRow[];
  selectedPath?: string;
  openTabPaths: Set<string>;
  dirtyTabPaths: Set<string>;
  favoritePaths: Set<string>;
  favoriteItems: ExplorerFavorite[];
  ecosystemGroups: Map<string, Entity[]>;
  entityTagColors: Map<string, string>;
  folderNotesEnabled: boolean;
  customIcons?: Record<string, string>;
  pointerDragActive: boolean;
  templatesExpanded: boolean;
  onToggleTemplatesExpanded: () => void;
  onCreateTemplate: () => void;
  onSelectPath: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onToggleExpand: (path: string) => void;
  onTreeAction: (action: ExplorerTreeAction) => void;
  onContextMenu: (event: MouseEvent, path: string, kind: "file" | "folder" | "empty") => void;
  onToggleFavorite: (path: string, kind: "file" | "folder") => void;
  onToggleFolderFocus: (path: string) => void;
  onOpenFolderDescription: (folderPath: string, descriptionPath?: string) => void;
  onDragMove: (fromPath: string, toFolderPath: string, kind?: "file" | "folder") => void;
  onPointerDragStart: (path: string, kind: "file" | "folder", x: number, y: number) => void;
  isPointerClickSuppressed: () => boolean;
};

const ROW_HEIGHT = 28;
const VIRTUALIZE_AFTER = 300;
const VIRTUAL_OVERSCAN = 8;

export function ExplorerPanel({
  index,
  query,
  onQueryChange,
  activeSection,
  onSectionChange,
  focusedFolderPath,
  focusBreadcrumb,
  onSetFocusedFolder,
  visibleRows,
  selectedPath,
  openTabPaths,
  dirtyTabPaths,
  favoritePaths,
  favoriteItems,
  ecosystemGroups,
  entityTagColors,
  folderNotesEnabled,
  customIcons,
  pointerDragActive,
  templatesExpanded,
  onToggleTemplatesExpanded,
  onCreateTemplate,
  onSelectPath,
  onSelectFolder,
  onToggleExpand,
  onTreeAction,
  onContextMenu,
  onToggleFavorite,
  onToggleFolderFocus,
  onOpenFolderDescription,
  onDragMove,
  onPointerDragStart,
  isPointerClickSuppressed,
}: ExplorerPanelProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(680);
  const sidebarMainRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number>(undefined);
  const shouldVirtualize = visibleRows.length > VIRTUALIZE_AFTER;

  useEffect(() => {
    const element = sidebarMainRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height) setViewportHeight(height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== undefined) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  const handleSidebarScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!shouldVirtualize) return;
      const top = event.currentTarget.scrollTop;
      if (scrollFrameRef.current !== undefined) cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = undefined;
        setScrollTop(top);
      });
    },
    [shouldVirtualize],
  );

  const virtualWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        rows: visibleRows,
        before: 0,
        after: 0,
      };
    }
    const viewportRows = Math.ceil(viewportHeight / ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const end = Math.min(visibleRows.length, start + viewportRows + VIRTUAL_OVERSCAN * 2);
    return {
      rows: visibleRows.slice(start, end),
      before: start * ROW_HEIGHT,
      after: Math.max(0, (visibleRows.length - end) * ROW_HEIGHT),
    };
  }, [scrollTop, shouldVirtualize, viewportHeight, visibleRows]);

  return (
    <aside className="sidebar dock-panel-body">
      <label className="search-box">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search files"
        />
      </label>

      <nav className="explorer-sections">
        <button
          type="button"
          className={activeSection === "allFiles" ? "active" : ""}
          onClick={() => onSectionChange("allFiles")}
          title="All Files"
        >
          <Files size={16} />
        </button>
        <button
          type="button"
          className={activeSection === "favorites" ? "active" : ""}
          onClick={() => onSectionChange("favorites")}
          title="Favorites"
        >
          <Star size={16} />
        </button>
        <button
          type="button"
          className={activeSection === "ecosystem" ? "active" : ""}
          onClick={() => onSectionChange("ecosystem")}
          title="Ecosystem"
        >
          <Hash size={16} />
        </button>
      </nav>

      <nav className="explorer-tree-actions" aria-label="Explorer expansion actions">
        <button type="button" onClick={() => onTreeAction("collapseAll")}>
          Collapse
        </button>
        <button type="button" onClick={() => onTreeAction("expandSelected")}>
          Selected
        </button>
        <button type="button" onClick={() => onTreeAction("expandDepth1")}>
          D1
        </button>
        <button type="button" onClick={() => onTreeAction("expandDepth2")}>
          D2
        </button>
        <button type="button" onClick={() => onTreeAction("expandDepth3")}>
          D3
        </button>
      </nav>

      {focusedFolderPath && focusBreadcrumb.length ? (
        <nav className="explorer-focus-breadcrumb" aria-label="Focused folder path">
          <Target className="explorer-focus-breadcrumb-icon" size={14} />
          {focusBreadcrumb.map((crumb, crumbIndex) => {
            const isLast = crumbIndex === focusBreadcrumb.length - 1;
            return (
              <span key={crumb.path ?? "root"} className="explorer-focus-crumb">
                <button
                  type="button"
                  className={isLast ? "active" : ""}
                  onClick={() => onSetFocusedFolder(crumb.path)}
                  title={crumb.path ? `Focus ${crumb.path}` : "Exit folder focus"}
                >
                  {crumb.label}
                </button>
                {!isLast ? <ChevronRight size={12} /> : null}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div
        ref={sidebarMainRef}
        className="sidebar-main"
        onContextMenu={(event) => onContextMenu(event, "", "empty")}
        onScroll={handleSidebarScroll}
      >
        {activeSection === "favorites" ? (
          <section className="sidebar-section">
            <h2>Favorites</h2>
            <div className="template-list">
              {favoriteItems.length ? (
                favoriteItems.map((favorite) => (
                  <button
                    key={favorite.path}
                    type="button"
                    className={`template-button ${selectedPath === favorite.path ? "active" : ""}`}
                    onClick={() => favorite.kind === "file" && onSelectPath(favorite.path)}
                    onContextMenu={(event) => onContextMenu(event, favorite.path, favorite.kind)}
                  >
                    {favorite.kind === "folder" ? (
                      <Folder size={14} />
                    ) : isImagePath(favorite.path) ? (
                      <Image size={14} />
                    ) : (
                      <FileText size={14} />
                    )}
                    {favorite.label}
                  </button>
                ))
              ) : (
                <p className="muted">No favorites yet.</p>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "ecosystem" ? (
          <section className="sidebar-section ecosystem-view">
            <h2>Ecosystem</h2>
            <div className="ecosystem-groups">
              {ecosystemGroups.size > 0 ? (
                Array.from(ecosystemGroups.entries())
                  .sort(([a], [b]) => {
                    if (a === "_untagged") return 1;
                    if (b === "_untagged") return -1;
                    return a.localeCompare(b);
                  })
                  .map(([tagPath, entities]) => (
                    <div key={tagPath} className="ecosystem-group">
                      <div className="ecosystem-group-header">
                        <Hash size={14} />
                        <span className="ecosystem-group-name">
                          {tagPath === "_untagged" ? "Sin etiquetas" : tagPath}
                        </span>
                        <span className="ecosystem-group-count">{entities.length}</span>
                      </div>
                      <div className="ecosystem-group-items">
                        {entities.map((entity) => (
                          <button
                            key={entity.path}
                            type="button"
                            className={`ecosystem-item ${selectedPath === entity.path ? "active" : ""}`}
                            onClick={() => onSelectPath(entity.path)}
                            onContextMenu={(event) => onContextMenu(event, entity.path, "file")}
                          >
                            {entityTagColors.get(entity.path) ? (
                              <span
                                className="ecosystem-item-color"
                                style={{ backgroundColor: entityTagColors.get(entity.path) }}
                              />
                            ) : null}
                            <FileText size={14} />
                            <span className="ecosystem-item-name">{entity.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="muted">No entities with tags yet.</p>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "allFiles" ? (
          <section className="sidebar-section">
            <div
              className={`tree-list ${pointerDragActive ? "is-pointer-dragging" : ""}`}
              data-tree-root-drop="true"
              onContextMenu={(event) => onContextMenu(event, "", "empty")}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromPath = event.dataTransfer.getData("text/plain");
                const fromKind = event.dataTransfer.getData("application/worldnotion-kind") as
                  "file" | "folder" | "";
                if (fromPath) onDragMove(fromPath, "", fromKind || undefined);
              }}
            >
              {visibleRows.length ? (
                <>
                  {virtualWindow.before > 0 ? (
                    <div style={{ height: virtualWindow.before }} />
                  ) : null}
                  {virtualWindow.rows.map((row) => (
                    <ExplorerTreeRow
                      key={row.path}
                      row={row}
                      selectedPath={selectedPath}
                      openTabPaths={openTabPaths}
                      dirtyTabPaths={dirtyTabPaths}
                      favoritePaths={favoritePaths}
                      focusedFolderPath={focusedFolderPath}
                      folderNotesEnabled={folderNotesEnabled}
                      onSelectPath={onSelectPath}
                      onSelectFolder={onSelectFolder}
                      onToggleExpand={onToggleExpand}
                      onContextMenu={onContextMenu}
                      onToggleFavorite={onToggleFavorite}
                      onToggleFolderFocus={onToggleFolderFocus}
                      onOpenFolderDescription={onOpenFolderDescription}
                      onDragMove={onDragMove}
                      onPointerDragStart={onPointerDragStart}
                      isPointerClickSuppressed={isPointerClickSuppressed}
                      entityTagColors={entityTagColors}
                      customIcons={customIcons}
                    />
                  ))}
                  {virtualWindow.after > 0 ? <div style={{ height: virtualWindow.after }} /> : null}
                </>
              ) : (
                <p className="muted">No files yet.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>

      <section className={`templates-dock ${templatesExpanded ? "expanded" : ""}`}>
        <div className="templates-dock-header">
          <button
            type="button"
            className="templates-dock-toggle"
            onClick={onToggleTemplatesExpanded}
          >
            {templatesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Templates</span>
            <small>{index.templates.length}</small>
          </button>
          <button
            type="button"
            className="templates-dock-action"
            onClick={onCreateTemplate}
            title="New template"
          >
            <Plus size={13} />
          </button>
        </div>
        {templatesExpanded ? (
          <div
            className="template-list templates-dock-list"
            onContextMenu={(event) => onContextMenu(event, ".everend/templates", "folder")}
          >
            {index.templates.length ? (
              index.templates.map((template) => (
                <button
                  key={template.path}
                  type="button"
                  className={`template-button ${selectedPath === template.path ? "active" : ""}`}
                  onClick={() => onSelectPath(template.path)}
                  onContextMenu={(event) => onContextMenu(event, template.path, "file")}
                >
                  <FileText size={14} />
                  {template.type}
                </button>
              ))
            ) : (
              <p className="muted">No templates in this universe.</p>
            )}
          </div>
        ) : null}
      </section>
    </aside>
  );
}

type ExplorerTreeRowProps = {
  row: VisibleExplorerRow;
  selectedPath?: string;
  openTabPaths: Set<string>;
  dirtyTabPaths: Set<string>;
  favoritePaths: Set<string>;
  focusedFolderPath?: string;
  folderNotesEnabled: boolean;
  onSelectPath: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onToggleExpand: (path: string) => void;
  onContextMenu: (event: MouseEvent, path: string, kind: "file" | "folder" | "empty") => void;
  onToggleFavorite: (path: string, kind: "file" | "folder") => void;
  onToggleFolderFocus: (path: string) => void;
  onOpenFolderDescription: (folderPath: string, descriptionPath?: string) => void;
  onDragMove: (fromPath: string, toFolderPath: string, kind?: "file" | "folder") => void;
  onPointerDragStart: (path: string, kind: "file" | "folder", x: number, y: number) => void;
  isPointerClickSuppressed: () => boolean;
  entityTagColors?: Map<string, string>;
  customIcons?: Record<string, string>;
};

const ExplorerTreeRow = memo(function ExplorerTreeRow({
  row,
  selectedPath,
  openTabPaths,
  dirtyTabPaths,
  favoritePaths,
  focusedFolderPath,
  folderNotesEnabled,
  onSelectPath,
  onSelectFolder,
  onToggleExpand,
  onContextMenu,
  onToggleFavorite,
  onToggleFolderFocus,
  onOpenFolderDescription,
  onDragMove,
  onPointerDragStart,
  isPointerClickSuppressed,
  entityTagColors,
  customIcons,
}: ExplorerTreeRowProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "into" | null>(null);
  const isFavorite = favoritePaths.has(row.path);
  const isFocused = focusedFolderPath === row.path;
  const isOpen = openTabPaths.has(row.path);
  const isDirty = dirtyTabPaths.has(row.path);
  const descriptionIsOpen = Boolean(row.descriptionPath && openTabPaths.has(row.descriptionPath));
  const tagColor = entityTagColors?.get(row.path);
  const customIcon = customIcons?.[row.path];
  const IconComponent = customIcon ? getIconComponent(customIcon) : undefined;

  const activateNode = () => {
    if (isPointerClickSuppressed()) return;
    if (row.kind === "folder") {
      onSelectFolder(row.path);
      if (row.hasChildren) onToggleExpand(row.path);
    } else {
      onSelectPath(row.path);
    }
  };

  return (
    <div className="tree-node">
      <div
        role="button"
        tabIndex={0}
        draggable={false}
        data-tree-node="true"
        data-tree-drop-path={row.kind === "folder" ? row.path : undefined}
        className={`tree-button ${selectedPath === row.path ? "active" : ""} ${row.hasDescription ? "has-description" : ""} ${isOpen ? "is-open" : ""} ${isDragOver && dropPosition ? `tree-drop-${dropPosition}` : ""}`}
        style={{ paddingLeft: `${7 + Math.min(row.depth, 10) * 16}px` }}
        onClick={activateNode}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateNode();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(event, row.path, row.kind);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          onPointerDragStart(row.path, row.kind, event.clientX, event.clientY);
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", row.path);
          event.dataTransfer.setData("application/worldnotion-kind", row.kind);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const y = event.clientY - rect.top;
          const threshold = rect.height * 0.3;
          const nextDropPosition =
            y < threshold
              ? "before"
              : y > rect.height - threshold
                ? "after"
                : row.kind === "folder"
                  ? "into"
                  : "after";
          setDropPosition(nextDropPosition);
          setIsDragOver(true);
          event.dataTransfer.dropEffect = "move";
        }}
        onDragLeave={(event) => {
          if (event.target === event.currentTarget) {
            setIsDragOver(false);
            setDropPosition(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragOver(false);
          setDropPosition(null);
          const fromPath = event.dataTransfer.getData("text/plain");
          const fromKind = event.dataTransfer.getData("application/worldnotion-kind") as
            "file" | "folder" | "";
          if (!fromPath || fromPath === row.path || row.path.startsWith(`${fromPath}/`)) return;
          if (dropPosition === "into" && row.kind === "folder") {
            onDragMove(fromPath, row.path, fromKind || undefined);
          } else if (dropPosition === "before" || dropPosition === "after") {
            const parentPath = row.path.substring(0, row.path.lastIndexOf("/"));
            onDragMove(fromPath, parentPath || "/", fromKind || undefined);
          }
        }}
        title={row.path}
      >
        <span
          className={`tree-chevron ${row.kind === "folder" && row.hasChildren ? "" : "tree-chevron-placeholder"}`}
          aria-hidden="true"
        >
          {row.kind === "folder" && row.hasChildren ? (
            row.isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : null}
        </span>
        {tagColor && row.kind === "file" ? (
          <span
            className="tree-tag-indicator"
            style={{ backgroundColor: tagColor }}
            title="Tag color"
          />
        ) : null}
        {IconComponent ? (
          // getIconComponent returns a module-level lucide component, not one created during render.
          // eslint-disable-next-line react-hooks/static-components
          <IconComponent size={14} />
        ) : row.kind === "folder" ? (
          row.isExpanded ? (
            <FolderOpen size={14} />
          ) : (
            <Folder size={14} />
          )
        ) : isImagePath(row.path) ? (
          <Image size={14} />
        ) : (
          <FileText size={14} />
        )}
        <span className="tree-label">{row.name}</span>
        {isDirty ? <strong className="tree-dirty">*</strong> : null}
        {isFavorite ? <Star size={12} className="tree-favorite" /> : null}
        <div className="tree-node-buttons">
          {row.kind === "folder" ? (
            <button
              type="button"
              className={`tree-inline-button tree-focus-button ${isFocused ? "active" : "inactive"}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFolderFocus(row.path);
              }}
              title={isFocused ? "Exit folder focus" : "Focus folder"}
            >
              <Target size={12} />
            </button>
          ) : null}
          {row.kind === "folder" && folderNotesEnabled ? (
            <button
              type="button"
              className={`tree-inline-button folder-description-button ${descriptionIsOpen ? "active" : row.hasDescription ? "available" : "inactive"}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenFolderDescription(row.path, row.descriptionPath);
              }}
              title={
                row.hasDescription
                  ? `Open ${row.name} folder note`
                  : `Create ${row.name} folder note`
              }
            >
              {row.hasDescription ? <FileEdit size={12} /> : <Plus size={12} />}
            </button>
          ) : null}
          <button
            type="button"
            className={`tree-inline-button folder-favorite-button ${isFavorite ? "active" : "inactive"}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(row.path, row.kind);
            }}
            title={isFavorite ? "Remove favorite" : "Add favorite"}
          >
            <Star size={12} />
          </button>
        </div>
      </div>
    </div>
  );
});
