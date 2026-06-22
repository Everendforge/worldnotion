import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  FilePlus,
  FileText,
  FolderInput,
  FolderPlus,
  Palette,
  Star,
  Trash2,
} from "lucide-react";
import "../App.css";

export type ContextMenuAction =
  | "open"
  | "openInNewTab"
  | "newBlankPage"
  | "newPageFromTemplate"
  | "newFolder"
  | "rename"
  | "duplicate"
  | "move"
  | "toggleFavorite"
  | "reveal"
  | "trash"
  | "editFolderDescription"
  | "refresh"
  | "collapseAll"
  | "changeIcon";

export type ContextMenuTargetKind = "file" | "folder" | "empty";

export interface ContextMenuProps {
  x: number;
  y: number;
  targetPath: string;
  targetKind: ContextMenuTargetKind;
  templates: string[];
  isFavorite?: boolean;
  canReveal?: boolean;
  revealLabel?: string;
  revealUniverseLabel?: string;
  trashLabel?: string;
  onAction: (
    action: ContextMenuAction,
    targetPath: string,
    targetKind: ContextMenuTargetKind,
    templateType?: string,
  ) => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  targetPath,
  targetKind,
  templates,
  isFavorite = false,
  canReveal = true,
  revealLabel = "Reveal in Finder",
  revealUniverseLabel = "Reveal Universe",
  trashLabel = "Move to Trash",
  onAction,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });
  const [templatesOpen, setTemplatesOpen] = useState(false);

  useEffect(() => {
    if (!menuRef.current) return;
    
    const rect = menuRef.current.getBoundingClientRect();
    let adjustedX = x;
    let adjustedY = y;
    
    // Ajustar si se sale por derecha
    if (x + rect.width > window.innerWidth) {
      adjustedX = Math.max(10, window.innerWidth - rect.width - 10);
    }
    
    // Ajustar si se sale por abajo
    if (y + rect.height > window.innerHeight) {
      adjustedY = Math.max(10, window.innerHeight - rect.height - 10);
    }
    
    setAdjustedPos({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  function run(action: ContextMenuAction, templateType?: string) {
    onAction(action, targetPath, targetKind, templateType);
    onClose();
  }

  return (
    <div ref={menuRef} className="context-menu" style={{ left: `${adjustedPos.x}px`, top: `${adjustedPos.y}px` }}>
      {targetKind !== "empty" ? (
        <>
          <button type="button" onClick={() => run("open")} className="context-menu-item">
            <FileText size={16} />
            <span>Open</span>
          </button>
          <button type="button" onClick={() => run("openInNewTab")} className="context-menu-item">
            <FilePlus size={16} />
            <span>Open in New Tab</span>
          </button>
          <div className="context-menu-separator" />
        </>
      ) : null}

      <button type="button" onClick={() => run("newBlankPage")} className="context-menu-item">
        <FileText size={16} />
        <span>New Blank Page</span>
      </button>

      {templates.length > 0 ? (
        <>
          <div className="context-menu-separator" />
          <div
            className={`context-menu-submenu ${templatesOpen ? "open" : ""} ${
              adjustedPos.x + 420 > window.innerWidth ? "align-left" : ""
            }`}
            onMouseEnter={() => setTemplatesOpen(true)}
            onMouseLeave={() => setTemplatesOpen(false)}
          >
            <button
              type="button"
              className="context-menu-item context-menu-submenu-trigger"
              aria-haspopup="menu"
              aria-expanded={templatesOpen}
              onClick={(event) => {
                event.preventDefault();
                setTemplatesOpen((current) => !current);
              }}
            >
              <FileText size={16} />
              <span>New Page from Template</span>
              <ChevronRight size={14} className="context-menu-submenu-icon" />
            </button>
            <div className="context-menu-submenu-panel" role="menu">
              {templates.map((templateType) => (
                <button
                  key={templateType}
                  type="button"
                  onClick={() => run("newPageFromTemplate", templateType)}
                  className="context-menu-item"
                  role="menuitem"
                >
                  <FileText size={14} />
                  <span>{templateType}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="context-menu-separator" />

      <button type="button" onClick={() => run("newFolder")} className="context-menu-item">
        <FolderPlus size={16} />
        <span>New Folder</span>
      </button>

      {targetKind !== "empty" ? (
        <>
          <div className="context-menu-separator" />
          <button type="button" onClick={() => run("rename")} className="context-menu-item">
            <Edit3 size={16} />
            <span>Rename</span>
          </button>
          <button type="button" onClick={() => run("duplicate")} className="context-menu-item">
            <Copy size={16} />
            <span>Duplicate</span>
          </button>
          <button type="button" onClick={() => run("move")} className="context-menu-item">
            <FolderInput size={16} />
            <span>Move to Folder</span>
          </button>
          {targetKind === "folder" ? (
            <button type="button" onClick={() => run("editFolderDescription")} className="context-menu-item">
              <FileText size={16} />
              <span>Edit Folder Description</span>
            </button>
          ) : null}
          <button type="button" onClick={() => run("toggleFavorite")} className="context-menu-item">
            <Star size={16} />
            <span>{isFavorite ? "Remove Favorite" : "Add Favorite"}</span>
          </button>
          <button type="button" onClick={() => run("changeIcon")} className="context-menu-item">
            <Palette size={16} />
            <span>Change Icon</span>
          </button>
          <button type="button" onClick={() => run("reveal")} className="context-menu-item" disabled={!canReveal}>
            <ExternalLink size={16} />
            <span>{revealLabel}</span>
          </button>
          <button type="button" onClick={() => run("trash")} className="context-menu-item danger">
            <Trash2 size={16} />
            <span>{trashLabel}</span>
          </button>
        </>
      ) : (
        <>
          <div className="context-menu-separator" />
          <button type="button" onClick={() => run("reveal")} className="context-menu-item" disabled={!canReveal}>
            <ExternalLink size={16} />
            <span>{revealUniverseLabel}</span>
          </button>
          <button type="button" onClick={() => run("refresh")} className="context-menu-item">
            <FileText size={16} />
            <span>Refresh</span>
          </button>
          <button type="button" onClick={() => run("collapseAll")} className="context-menu-item">
            <FolderInput size={16} />
            <span>Collapse All</span>
          </button>
        </>
      )}
    </div>
  );
}
