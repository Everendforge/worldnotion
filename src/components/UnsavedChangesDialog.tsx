import { useEffect, useRef } from "react";
import "../App.css";

export interface UnsavedChangesDialogProps {
  isOpen: boolean;
  fileName: string;
  onDiscard: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

export function UnsavedChangesDialog({
  isOpen,
  fileName,
  onDiscard,
  onSave,
  onCancel,
  isSaving = false,
}: UnsavedChangesDialogProps) {
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) saveRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSave() {
    await onSave();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !isSaving) {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog unsaved-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Cambios sin guardar"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>Cambios sin guardar</h2>
        </div>
        <div className="modal-body">
          <p>
            <strong>{fileName}</strong> tiene cambios sin guardar. ¿Qué deseas hacer?
          </p>
        </div>
        <div className="modal-footer">
          <button
            onClick={onCancel}
            className="modal-button modal-button-cancel"
            disabled={isSaving}
            type="button"
          >
            Cancelar
          </button>
          <button
            onClick={onDiscard}
            className="modal-button modal-button-discard"
            disabled={isSaving}
            type="button"
          >
            Descartar
          </button>
          <button
            ref={saveRef}
            onClick={handleSave}
            className="modal-button modal-button-confirm"
            disabled={isSaving}
            type="button"
          >
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
