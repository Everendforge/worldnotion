import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bold,
  CheckSquare,
  Code2,
  Copy,
  FileText,
  Hash,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  Quote,
  Square,
  Superscript,
  Type,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import type { StructuredElement } from "../utils/structuredMarkdown";
import type { StructuredRange } from "../utils/structuredRangeIndex";
import { wikilinkMarkdown } from "../utils/structuredMarkdown";
import { imageMarkdown } from "../utils/attachments";
import type { ResolvedWikilink } from "../editorTypes";

export type StructureActionsMenuProps = {
  element: StructuredElement;
  parents?: StructuredRange[];
  x: number;
  y: number;
  onDismiss: () => void;
  onReplace: (element: StructuredElement, replacement: string) => void;
  onSelectElement?: (element: StructuredRange) => void;
  onOpenSource: () => void;
  onOpenWikilink?: (target: string) => void;
  onOpenUrl?: (url: string) => void;
  resolveWikilink?: (label: string) => ResolvedWikilink;
};

const KIND_META: Record<StructuredElement["kind"], { icon: LucideIcon; label: string }> = {
  wikilink: { icon: Link2, label: "Wiki link" },
  link: { icon: Link2, label: "Link" },
  image: { icon: ImageIcon, label: "Image" },
  footnote: { icon: Superscript, label: "Footnote" },
  bold: { icon: Bold, label: "Bold" },
  italic: { icon: Italic, label: "Italic" },
  strikethrough: { icon: Type, label: "Strikethrough" },
  "inline-code": { icon: Code2, label: "Inline code" },
  "fenced-code": { icon: Code2, label: "Code block" },
  heading: { icon: Hash, label: "Heading" },
  task: { icon: CheckSquare, label: "Task" },
  list: { icon: List, label: "List item" },
  quote: { icon: Quote, label: "Quote" },
  divider: { icon: FileText, label: "Divider" },
  table: { icon: FileText, label: "Table" },
  "font-span": { icon: Type, label: "Font span" },
  variant: { icon: FileText, label: "Variant" },
};

function plainBlockText(element: StructuredElement): string {
  switch (element.kind) {
    case "heading":
      return element.text.replace(/^#{1,6}\s+/, "");
    case "task":
      return element.text.replace(/^(\s*)- \[[ xX]\]\s+/, "$1");
    case "list":
      return element.text.replace(/^(\s*)(?:[-*]|\d+\.)\s+/, "$1");
    case "quote":
      return element.text.replace(/^(\s*)>\s?/, "$1");
    default:
      return element.label;
  }
}

/** A compact icon + label button used across every element's action row. */
function ActionChip({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`format-panel-chip${tone === "danger" ? " danger" : ""}`}
      onClick={onClick}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

export function StructureActionsMenu({
  element,
  parents = [],
  x,
  y,
  onDismiss,
  onReplace,
  onSelectElement,
  onOpenSource,
  onOpenWikilink,
  onOpenUrl,
  resolveWikilink,
}: StructureActionsMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState(element.target ?? "");
  const [alias, setAlias] = useState(element.alias ?? "");
  const [url, setUrl] = useState(element.url ?? "");
  const [linkLabel, setLinkLabel] = useState(element.label ?? "");
  const [altText, setAltText] = useState(element.label ?? "");
  const [imageWidth, setImageWidth] = useState(element.imagePresentation?.width ?? 100);
  const [imageAlign, setImageAlign] = useState(element.imagePresentation?.align ?? "center");

  const meta = KIND_META[element.kind];

  /** Rebuilds the element's Markdown from the panel's live fields. */
  const buildMarkdown = (): string | undefined => {
    if (element.kind === "wikilink") {
      return target.trim() ? wikilinkMarkdown(target, alias || target) : undefined;
    }
    if (element.kind === "link") {
      return url.trim() ? `[${linkLabel.trim() || url.trim()}](${url.trim()})` : undefined;
    }
    if (element.kind === "image" && element.target) {
      let path = element.target;
      try {
        path = decodeURI(path);
      } catch {
        // Keep a malformed path intact; Source remains available for repair.
      }
      return imageMarkdown(path, altText, { width: imageWidth, align: imageAlign });
    }
    return undefined;
  };

  const hasFieldEdits =
    (element.kind === "wikilink" &&
      (target !== (element.target ?? "") || alias !== (element.alias ?? ""))) ||
    (element.kind === "link" &&
      (url !== (element.url ?? "") || linkLabel !== (element.label ?? ""))) ||
    (element.kind === "image" &&
      (altText !== (element.label ?? "") ||
        imageWidth !== (element.imagePresentation?.width ?? 100) ||
        imageAlign !== (element.imagePresentation?.align ?? "center")));

  const commitAndDismiss = () => {
    if (hasFieldEdits) {
      const markdown = buildMarkdown();
      if (markdown) onReplace(element, markdown);
    }
    onDismiss();
  };

  // Outside click commits pending field edits (Notion-style), Escape cancels.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) commitAndDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  });

  const replace = (text: string) => {
    onReplace(element, text);
    onDismiss();
  };

  const copyReference = async () => {
    await navigator.clipboard?.writeText(buildMarkdown() ?? element.text);
    onDismiss();
  };

  const resolved = useMemo(
    () => (element.kind === "wikilink" ? resolveWikilink?.(target.trim()) : undefined),
    [element.kind, resolveWikilink, target],
  );

  return (
    <div
      ref={rootRef}
      className="format-panel"
      role="menu"
      aria-label={`${meta.label} options`}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header className="format-panel-head">
        <meta.icon size={14} />
        <span className="format-panel-kind">{meta.label}</span>
        {element.kind === "wikilink" && resolved ? (
          <span
            className={`format-panel-status ${
              resolved.status === "resolved" ? "is-found" : "is-new"
            }`}
          >
            {resolved.status === "resolved" ? "Note" : "New page"}
          </span>
        ) : null}
      </header>

      {parents.length ? (
        <nav className="format-panel-parents" aria-label="Containing structures">
          {parents.map((parent) => (
            <button
              key={`${parent.kind}:${parent.from}:${parent.to}`}
              type="button"
              onClick={() => onSelectElement?.(parent)}
            >
              {KIND_META[parent.kind].label}
            </button>
          ))}
        </nav>
      ) : null}

      {element.kind === "wikilink" ? (
        <div className="format-panel-fields">
          <label>
            <span>Destination</span>
            <input
              autoFocus
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && commitAndDismiss()}
              placeholder="Note name"
            />
          </label>
          <label>
            <span>Visible text</span>
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && commitAndDismiss()}
              placeholder={target || "Same as destination"}
            />
          </label>
        </div>
      ) : null}

      {element.kind === "link" ? (
        <div className="format-panel-fields">
          <label>
            <span>URL</span>
            <input
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && commitAndDismiss()}
              placeholder="https://example.com"
            />
          </label>
          <label>
            <span>Visible text</span>
            <input
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && commitAndDismiss()}
              placeholder={url || "Link text"}
            />
          </label>
        </div>
      ) : null}

      {element.kind === "image" ? (
        <div className="format-panel-fields">
          <label>
            <span>Caption</span>
            <input
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && commitAndDismiss()}
              placeholder="Describe the image"
            />
          </label>
          <label className="format-panel-slider">
            <span>Width</span>
            <output>{imageWidth}%</output>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={imageWidth}
              onChange={(event) => setImageWidth(Number(event.target.value))}
            />
          </label>
          <div className="format-panel-segmented" role="group" aria-label="Image alignment">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                className={imageAlign === align ? "active" : ""}
                aria-pressed={imageAlign === align}
                onClick={() => setImageAlign(align)}
              >
                {align[0].toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="format-panel-actions">
        {element.kind === "wikilink" ? (
          <>
            {resolved?.status === "resolved" ? (
              <ActionChip
                icon={ArrowUpRight}
                label="Open note"
                onClick={() => element.target && onOpenWikilink?.(element.target)}
              />
            ) : null}
            <ActionChip icon={Copy} label="Copy" onClick={() => void copyReference()} />
            <ActionChip
              icon={Unlink}
              label="Unlink"
              tone="danger"
              onClick={() => replace(element.label)}
            />
          </>
        ) : null}

        {element.kind === "link" ? (
          <>
            <ActionChip
              icon={ArrowUpRight}
              label="Open link"
              onClick={() => (url.trim() ? onOpenUrl?.(url.trim()) : undefined)}
            />
            <ActionChip icon={Copy} label="Copy" onClick={() => void copyReference()} />
            <ActionChip
              icon={Unlink}
              label="Remove link"
              tone="danger"
              onClick={() => replace(linkLabel.trim() || element.label)}
            />
          </>
        ) : null}

        {element.kind === "footnote" ? (
          <ActionChip icon={Copy} label="Copy" onClick={() => void copyReference()} />
        ) : null}

        {element.kind === "bold" ||
        element.kind === "italic" ||
        element.kind === "strikethrough" ||
        element.kind === "inline-code" ||
        element.kind === "font-span" ? (
          <ActionChip
            icon={Type}
            label="Remove formatting"
            onClick={() => replace(element.label)}
          />
        ) : null}

        {element.kind === "heading" ? (
          <>
            <div className="format-panel-segmented" role="group" aria-label="Heading level">
              {([1, 2, 3] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={element.level === level ? "active" : ""}
                  aria-pressed={element.level === level}
                  onClick={() => replace(`${"#".repeat(level)} ${plainBlockText(element)}`)}
                >
                  H{level}
                </button>
              ))}
            </div>
            <ActionChip
              icon={Type}
              label="Turn into text"
              onClick={() => replace(plainBlockText(element))}
            />
          </>
        ) : null}

        {element.kind === "task" ? (
          <ActionChip
            icon={element.checked ? Square : CheckSquare}
            label={element.checked ? "Mark incomplete" : "Mark complete"}
            onClick={() =>
              replace(element.text.replace(/\[([ xX])\]/, element.checked ? "[ ]" : "[x]"))
            }
          />
        ) : null}

        {element.kind === "list" || element.kind === "quote" ? (
          <ActionChip
            icon={Type}
            label="Turn into text"
            onClick={() => replace(plainBlockText(element))}
          />
        ) : null}

        {element.kind === "fenced-code" || element.kind === "table" ? (
          <ActionChip
            icon={Type}
            label="Turn into text"
            onClick={() =>
              replace("plainText" in element ? String(element.plainText) : element.label)
            }
          />
        ) : null}

        <ActionChip
          icon={FileText}
          label="Open in Source"
          onClick={() => {
            if (hasFieldEdits) {
              const markdown = buildMarkdown();
              if (markdown) onReplace(element, markdown);
            }
            onOpenSource();
          }}
        />
      </div>
    </div>
  );
}
