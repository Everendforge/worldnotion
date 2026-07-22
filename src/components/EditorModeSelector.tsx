import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { EditorMode, WritingMode } from "../editorTypes";

type EditorModeSelectorProps = {
  mode: EditorMode;
  writingMode: WritingMode;
  disabled?: boolean;
  labels: { writing: string; processed: string; semi: string; source: string };
  onWritingModeChange: (mode: WritingMode) => void;
  onOpenWriting: () => void;
  onOpenSource: () => void;
};

export function EditorModeSelector({
  mode,
  writingMode,
  disabled = false,
  labels,
  onWritingModeChange,
  onOpenWriting,
  onOpenSource,
}: EditorModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const writingLabel = writingMode === "processed" ? labels.processed : labels.semi;

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const focusOption = useCallback((index: number) => {
    const normalized = (index + optionRefs.current.length) % optionRefs.current.length;
    optionRefs.current[normalized]?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismissWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismissWithKeyboard);
    };
  }, [closeMenu, open]);

  return (
    <div ref={rootRef} className="mode-toggle" aria-label="Editor mode">
      <div className={`writing-mode-selector${mode === "write" ? " active" : ""}`}>
        <button
          ref={triggerRef}
          type="button"
          className="writing-mode-current"
          aria-pressed={mode === "write"}
          onClick={onOpenWriting}
          disabled={disabled}
        >
          {writingLabel}
        </button>
        <button
          type="button"
          className="writing-mode-menu"
          aria-label={`${labels.writing}: ${writingLabel}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => {
              const next = !current;
              if (next) {
                window.requestAnimationFrame(() =>
                  focusOption(writingMode === "processed" ? 0 : 1),
                );
              }
              return next;
            });
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              window.requestAnimationFrame(() => focusOption(event.key === "ArrowUp" ? 1 : 0));
            }
          }}
          disabled={disabled}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {open ? (
          <div
            role="menu"
            className="writing-mode-options"
            aria-label={labels.writing}
            onKeyDown={(event) => {
              const current = optionRefs.current.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusOption(current + 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                focusOption(current - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusOption(0);
              } else if (event.key === "End") {
                event.preventDefault();
                focusOption(optionRefs.current.length - 1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeMenu(true);
              }
            }}
          >
            {(["processed", "semi"] as const).map((nextMode, index) => (
              <button
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                key={nextMode}
                type="button"
                role="menuitemradio"
                aria-checked={writingMode === nextMode}
                onClick={() => {
                  onWritingModeChange(nextMode);
                  closeMenu(true);
                }}
              >
                {nextMode === "processed" ? labels.processed : labels.semi}
                {writingMode === nextMode ? <Check size={13} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={mode === "source" ? "active" : ""}
        aria-pressed={mode === "source"}
        onClick={onOpenSource}
      >
        {labels.source}
      </button>
    </div>
  );
}
