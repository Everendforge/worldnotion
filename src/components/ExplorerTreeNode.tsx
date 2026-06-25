import type { MouseEvent } from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight, FileEdit, FileText, Folder, FolderOpen, Star, Target } from "lucide-react";
import type { VaultTreeNode } from "../domain";
import { getIconComponent } from "./IconPicker";

export type ExplorerTreeNodeProps = {
  node: VaultTreeNode;
  selectedPath?: string;
  openTabPaths: Set<string>;
  dirtyTabPaths: Set<string>;
  favoritePaths: Set<string>;
  focusedFolderPath?: string;
  onSelectPath: (path: string) => void;
  onSelectFolder: (path: string) => void;
  expandedPaths: Set<string>;
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

export function ExplorerTreeNode({
  node,
  selectedPath,
  openTabPaths,
  dirtyTabPaths,
  favoritePaths,
  focusedFolderPath,
  onSelectPath,
  onSelectFolder,
  expandedPaths,
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
}: ExplorerTreeNodeProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "into" | null>(null);
  const isExpanded = expandedPaths.has(node.path) || focusedFolderPath === node.path;
  const hasChildren = node.children.length > 0;
  const isFavorite = favoritePaths.has(node.path);
  const isFocused = focusedFolderPath === node.path;
  const isOpen = openTabPaths.has(node.path);
  const isDirty = dirtyTabPaths.has(node.path);
  const descriptionIsOpen = Boolean(node.descriptionPath && openTabPaths.has(node.descriptionPath));
  const tagColor = entityTagColors?.get(node.path);
  const customIcon = customIcons?.[node.path];
  const IconComponent = customIcon ? getIconComponent(customIcon) : undefined;

  const activateNode = () => {
    if (isPointerClickSuppressed()) return;
    if (node.kind === "folder") {
      onSelectFolder(node.path);
      if (hasChildren) {
        onToggleExpand(node.path);
      }
    } else if (node.kind === "file") {
      onSelectPath(node.path);
    }
  };

  return (
    <div className="tree-node">
      <div
        role="button"
        tabIndex={0}
        draggable={false}
        data-tree-node="true"
        data-tree-drop-path={node.kind === "folder" ? node.path : undefined}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", node.path);
          event.dataTransfer.setData("application/worldnotion-kind", node.kind);
          event.dataTransfer.effectAllowed = "move";
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          onPointerDragStart(node.path, node.kind, event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          const element = event.currentTarget as HTMLElement;
          const rect = element.getBoundingClientRect();
          const y = event.clientY - rect.top;
          const height = rect.height;
          const threshold = height * 0.3; // 30% margin for before/after zones
          
          // Determine drop position based on mouse Y position
          let newDropPosition: "before" | "after" | "into" | null = null;
          
          if (y < threshold) {
            newDropPosition = "before";
          } else if (y > height - threshold) {
            newDropPosition = "after";
          } else if (node.kind === "folder") {
            // Only allow "into" for folders
            newDropPosition = "into";
          } else {
            // For files, default to "after" if in middle zone
            newDropPosition = "after";
          }
          
          setDropPosition(newDropPosition);
          setIsDragOver(true);
          event.dataTransfer.dropEffect = "move";
        }}
        onDragLeave={(event) => {
          // Only clear dragover if leaving the actual element, not child elements
          if ((event.target as HTMLElement) === event.currentTarget) {
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
          const fromKind = event.dataTransfer.getData("application/worldnotion-kind") as "file" | "folder" | "";
          
          if (!fromPath || fromPath === node.path || node.path.startsWith(`${fromPath}/`)) {
            return;
          }
          
          // Handle different drop positions
          if (dropPosition === "into" && node.kind === "folder") {
            // Drop into folder
            onDragMove(fromPath, node.path, fromKind || undefined);
          } else if (dropPosition === "before" || dropPosition === "after") {
            // For before/after positions, we would need to move to the parent folder
            // and potentially reorder siblings. For now, move to parent with position info.
            // This requires extending the API - for now we'll just drop into parent.
            const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));
            if (parentPath || parentPath === "") {
              onDragMove(fromPath, parentPath || "/", fromKind || undefined);
            }
          }
        }}
        className={`tree-button ${selectedPath === node.path ? "active" : ""} ${node.hasDescription ? "has-description" : ""} ${isOpen ? "is-open" : ""} ${isDragOver && dropPosition ? `tree-drop-${dropPosition}` : ""}`}
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
          onContextMenu(event, node.path, node.kind);
        }}
        title={node.path}
      >
        <span className={`tree-chevron ${node.kind === "folder" && hasChildren ? "" : "tree-chevron-placeholder"}`} aria-hidden="true">
          {node.kind === "folder" && hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {tagColor && node.kind === "file" && (
          <span className="tree-tag-indicator" style={{ backgroundColor: tagColor }} title="Tag color" />
        )}
        {IconComponent ? (
          <IconComponent size={14} />
        ) : node.kind === "folder" ? (
          isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
        ) : (
          <FileText size={14} />
        )}
        <span>{node.name}</span>
        {isDirty ? <strong className="tree-dirty">*</strong> : null}
        {isFavorite ? <Star size={12} className="tree-favorite" /> : null}
        <div className="tree-node-buttons">
          {node.kind === "folder" ? (
            <button
              type="button"
              className={`tree-inline-button tree-focus-button ${isFocused ? "active" : "inactive"}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFolderFocus(node.path);
              }}
              title={isFocused ? "Exit folder focus" : "Focus folder"}
            >
              <Target size={12} />
            </button>
          ) : null}
          {node.kind === "folder" ? (
            <button
              type="button"
              className={`tree-inline-button folder-description-button ${descriptionIsOpen ? "active" : node.hasDescription ? "available" : "inactive"}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenFolderDescription(node.path, node.descriptionPath);
              }}
              title={node.hasDescription ? `Open ${node.name} folder note` : `Create ${node.name} folder note`}
            >
              <FileEdit size={12} />
            </button>
          ) : null}
          <button
            type="button"
            className={`tree-inline-button folder-favorite-button ${isFavorite ? "active" : "inactive"}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(node.path, node.kind);
            }}
            title={isFavorite ? "Remove favorite" : "Add favorite"}
          >
            <Star size={12} />
          </button>
        </div>
      </div>
      {node.kind === "folder" && hasChildren && isExpanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <ExplorerTreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              openTabPaths={openTabPaths}
              dirtyTabPaths={dirtyTabPaths}
              favoritePaths={favoritePaths}
              focusedFolderPath={focusedFolderPath}
              onSelectPath={onSelectPath}
              onSelectFolder={onSelectFolder}
              expandedPaths={expandedPaths}
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
        </div>
      )}
    </div>
  );
}
