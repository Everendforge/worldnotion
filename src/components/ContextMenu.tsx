import { useEffect, useRef } from "react";
import { FileText, FolderPlus } from "lucide-react";
import "../App.css";

export type ContextMenuAction =
  | "newBlankPage"
  | "newPageFromTemplate"
  | "newFolder";

export interface ContextMenuProps {
  x: number;
  y: number;
  targetPath: string;
  targetKind: "file" | "folder";
  templates: string[];
  onAction: (action: ContextMenuAction, templateType?: string) => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  templates,
  onAction,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <button
        type="button"
        onClick={() => {
          onAction("newBlankPage");
          onClose();
        }}
        className="context-menu-item"
      >
        <FileText size={16} />
        <span>New Blank Page</span>
      </button>

      {templates.length > 0 && (
        <>
          <div className="context-menu-separator" />
          <div className="context-menu-group">
            <span className="context-menu-label">New Page from Template</span>
            {templates.map((templateType) => (
              <button
                key={templateType}
                type="button"
                onClick={() => {
                  onAction("newPageFromTemplate", templateType);
                  onClose();
                }}
                className="context-menu-item context-menu-subitem"
              >
                <FileText size={14} />
                <span>{templateType}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="context-menu-separator" />

      <button
        type="button"
        onClick={() => {
          onAction("newFolder");
          onClose();
        }}
        className="context-menu-item"
      >
        <FolderPlus size={16} />
        <span>New Folder</span>
      </button>
    </div>
  );
}
