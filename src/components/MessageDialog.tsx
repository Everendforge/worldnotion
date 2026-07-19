import { useEffect, useRef } from "react";
import "../App.css";
import { useWorldnotionUi } from "../i18n";

export interface MessageDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  closeLabel?: string;
  onClose: () => void;
}

/**
 * Reemplazo estilizado de window.alert (no-op en algunos webviews de Tauri).
 */
export function MessageDialog({
  isOpen,
  title,
  message,
  closeLabel,
  onClose,
}: MessageDialogProps) {
  const ui = useWorldnotionUi();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title ?? ui.notice}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>{title ?? ui.notice}</h2>
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button ref={closeRef} onClick={onClose} className="modal-button modal-button-confirm">
            {closeLabel ?? ui.close}
          </button>
        </div>
      </div>
    </div>
  );
}
