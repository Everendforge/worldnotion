import { useEffect, useRef } from "react";
import "../App.css";
import { useWorldnotionUi } from "../i18n";

export interface InputDialogProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => Promise<void>;
  onCancel?: () => void;
}

export function InputDialog({
  isOpen,
  title,
  placeholder,
  defaultValue = "",
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const ui = useWorldnotionUi();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  function handleConfirm() {
    const value = inputRef.current?.value || "";
    onConfirm(value);
  }

  function handleCancel() {
    onCancel?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            handleCancel();
          }
        }}
      >
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder ?? ui.enterValue}
            defaultValue={defaultValue}
            onKeyDown={handleKeyDown}
            className="modal-input"
          />
        </div>
        <div className="modal-footer">
          <button onClick={handleCancel} className="modal-button modal-button-cancel">
            {ui.cancel}
          </button>
          <button onClick={handleConfirm} className="modal-button modal-button-confirm">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
