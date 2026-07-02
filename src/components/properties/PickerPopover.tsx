import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react";
import Fuse, { type IFuseOptions } from "fuse.js";
import { Plus } from "lucide-react";

export type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  /** Extra strings the fuzzy search should match against (aliases, paths…). */
  keywords?: string[];
};

export type PickerPopoverProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  items: PickerItem[];
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  placeholder?: string;
  emptyLabel?: string;
  /** When set, non-matching queries offer a "Create …" action. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  maxResults?: number;
};

const FUSE_OPTIONS: IFuseOptions<PickerItem> = {
  keys: [
    { name: "label", weight: 2 },
    { name: "sublabel", weight: 0.8 },
    { name: "keywords", weight: 1 },
  ],
  threshold: 0.4,
  includeScore: true,
};

/**
 * Anchored popover with a fuzzy-search input and keyboard navigation.
 * Shared by the add-property row and the entity/file/image pickers.
 */
export function PickerPopover({
  open,
  anchorRef,
  items,
  onSelect,
  onClose,
  placeholder = "Search…",
  emptyLabel = "No matches",
  onCreate,
  createLabel,
  maxResults = 50,
}: PickerPopoverProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles } = useFloating({
    open,
    placement: "bottom-start",
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, Math.min(availableHeight, 320))}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(anchorRef.current);
  }, [anchorRef, refs, open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const fuse = useMemo(() => new Fuse(items, FUSE_OPTIONS), [items]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return items.slice(0, maxResults);
    return fuse.search(trimmed, { limit: maxResults }).map((result) => result.item);
  }, [fuse, items, maxResults, query]);

  const trimmedQuery = query.trim();
  const showCreate =
    Boolean(onCreate && trimmedQuery) &&
    !results.some((item) => item.label.toLowerCase() === trimmedQuery.toLowerCase());
  const totalRows = results.length + (showCreate ? 1 : 0);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, totalRows - 1)));
  }, [totalRows]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.floating.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [anchorRef, onClose, open, refs.floating]);

  useEffect(() => {
    const activeElement = listRef.current?.querySelector('[data-active="true"]');
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const activateRow = (index: number) => {
    if (showCreate && index === results.length) {
      onCreate?.(trimmedQuery);
      onClose();
      return;
    }
    const item = results[index];
    if (!item) return;
    onSelect(item);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, totalRows - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateRow(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="picker-popover"
      role="dialog"
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        className="picker-popover-input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <div ref={listRef} className="picker-popover-list" role="listbox">
        {results.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            data-active={index === activeIndex || undefined}
            className={`picker-popover-item ${index === activeIndex ? "active" : ""}`}
            onPointerEnter={() => setActiveIndex(index)}
            onClick={() => activateRow(index)}
          >
            {item.icon ? <span className="picker-popover-icon">{item.icon}</span> : null}
            <span className="picker-popover-label">{item.label}</span>
            {item.sublabel ? (
              <span className="picker-popover-sublabel">{item.sublabel}</span>
            ) : null}
          </button>
        ))}
        {showCreate ? (
          <button
            type="button"
            role="option"
            aria-selected={activeIndex === results.length}
            data-active={activeIndex === results.length || undefined}
            className={`picker-popover-item picker-popover-create ${activeIndex === results.length ? "active" : ""}`}
            onPointerEnter={() => setActiveIndex(results.length)}
            onClick={() => activateRow(results.length)}
          >
            <span className="picker-popover-icon">
              <Plus size={13} />
            </span>
            <span className="picker-popover-label">
              {createLabel ? createLabel(trimmedQuery) : `Create "${trimmedQuery}"`}
            </span>
          </button>
        ) : null}
        {totalRows === 0 ? <div className="picker-popover-empty">{emptyLabel}</div> : null}
      </div>
    </div>
  );
}
