import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  isStructuralChange,
  createSyntaxHiddenDecoration,
  createStyledDecoration,
  selectionTouches,
} from "./pluginUtils";
import type { ResolvedWikilink, WritingMode } from "../editorTypes";
import { buildStructuredRangeIndex } from "../utils/structuredRangeIndex";

export function wikilinkPlugin(options: {
  resolveWikilink?: (label: string) => ResolvedWikilink;
  onOpenWikilink?: (targetPath: string, label: string) => void;
  onMissingWikilink?: (label: string) => void;
  presentation: WritingMode;
}) {
  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const index = buildStructuredRangeIndex(view.state);
    for (const element of index.ranges.filter((item) => item.kind === "wikilink")) {
      if (
        !view.visibleRanges.some(
          (visible) => element.from <= visible.to && element.to >= visible.from,
        )
      ) {
        continue;
      }
      const rawTarget = element.target?.trim();
      if (!rawTarget) continue;
      const alias = element.alias?.trim();
      const start = element.from;
      const end = element.to;
      const selection = view.state.selection.main;
      const isSelected =
        options.presentation === "semi" &&
        selectionTouches(selection.from, selection.to, start, end);

      const resolved = options.resolveWikilink?.(rawTarget) ?? {
        label: alias || rawTarget,
        status: "missing" as const,
      };

      if (!isSelected) {
        element.syntaxRanges.forEach((syntax) => {
          const hidden = createSyntaxHiddenDecoration(syntax.from, syntax.to);
          if (hidden) decorations.push(hidden);
        });
        const visible = element.visibleRanges[0];
        if (visible) {
          const baseClass = resolved.status === "missing" ? "cm-wikilink-missing" : "cm-wikilink";
          const labelDecoration = createStyledDecoration(visible.from, visible.to, baseClass, {
            "data-wikilink": rawTarget,
            "data-wikilink-status": resolved.status,
            title: resolved.targetPath
              ? `Cmd/Ctrl-click to open ${resolved.targetPath}`
              : `Missing wikilink: ${rawTarget}`,
          });
          if (labelDecoration) decorations.push(labelDecoration);
        }
      } else {
        const baseClass = resolved.status === "missing" ? "cm-wikilink-missing" : "cm-wikilink";
        const activeDecoration = createStyledDecoration(
          start,
          end,
          `${baseClass} cm-markdown-syntax-muted`,
          {
            "data-wikilink": rawTarget,
            "data-wikilink-status": resolved.status,
          },
        );
        if (activeDecoration) decorations.push(activeDecoration);
      }
    }

    return Decoration.set(decorations, true);
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = getDecorations(view);
      }

      update(update: ViewUpdate) {
        // Recalculate on structural changes OR selection changes
        // Selection changes affect syntax visibility (show/hide based on cursor position)
        // This enables instant syntax response when cursor moves (like Obsidian)
        if (isStructuralChange(update) || update.selectionSet) {
          this.decorations = getDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousedown(event, view) {
          if (!event.metaKey && !event.ctrlKey) return false;
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (position === null) return false;
          const element = buildStructuredRangeIndex(view.state)
            .containing(position)
            .find((candidate) => candidate.kind === "wikilink");
          if (element) {
            const rawTarget = element.target?.trim();
            if (!rawTarget) return false;
            const resolved = options.resolveWikilink?.(rawTarget);
            event.preventDefault();
            if (resolved?.targetPath) {
              options.onOpenWikilink?.(resolved.targetPath, rawTarget);
            } else {
              options.onMissingWikilink?.(rawTarget);
            }
            return true;
          }
          return false;
        },
      },
    },
  );
}
