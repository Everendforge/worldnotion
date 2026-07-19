import { useEffect, useRef } from "react";
import "../App.css";
import { useWorldnotionUi } from "../i18n";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reemplazo estilizado de window.confirm: los diálogos nativos son no-ops en
 * algunos webviews de Tauri (macOS) y rompen la coherencia visual.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ui = useWorldnotionUi();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) confirmRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title ?? ui.confirm}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>{title ?? ui.confirm}</h2>
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="modal-button modal-button-cancel">
            {cancelLabel ?? ui.cancel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`modal-button modal-button-confirm${destructive ? " modal-button-destructive" : ""}`}
          >
            {confirmLabel ?? ui.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
