import { useEffect, useRef } from "react";
import "../App.css";

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
  placeholder = "Enter value",
  defaultValue = "",
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  function handleConfirm() {
    const value = inputRef.current?.value || "";
    console.log(`[InputDialog] Confirming with value: "${value}"`);
    onConfirm(value);
  }

  function handleCancel() {
    console.log(`[InputDialog] Cancelling`);
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
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            defaultValue={defaultValue}
            onKeyDown={handleKeyDown}
            className="modal-input"
          />
        </div>
        <div className="modal-footer">
          <button onClick={handleCancel} className="modal-button modal-button-cancel">
            Cancel
          </button>
          <button onClick={handleConfirm} className="modal-button modal-button-confirm">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
