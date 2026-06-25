import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { isStructuralChange, selectionTouches, createSyntaxHiddenDecoration, createStyledDecoration } from "./pluginUtils";
import type { ResolvedWikilink } from "../editorTypes";

// Compiled once at module load
const WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

export function wikilinkPlugin(options: {
  resolveWikilink?: (label: string) => ResolvedWikilink;
  onOpenWikilink?: (targetPath: string, label: string) => void;
  onMissingWikilink?: (label: string) => void;
}) {
  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const selectionFrom = view.state.selection.main.from;
    const selectionTo = view.state.selection.main.to;

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;

      WIKILINK_REGEX.lastIndex = 0;
      while ((match = WIKILINK_REGEX.exec(text)) !== null) {
        const rawTarget = match[1]?.trim();
        if (!rawTarget) continue;
        const hasAlias = match[2] !== undefined;
        const alias = match[2]?.trim();
        
        const start = from + match.index;
        const end = start + match[0].length;
        const isSelected = selectionTouches(selectionFrom, selectionTo, start, end);
        
        const resolved = options.resolveWikilink?.(rawTarget) ?? { label: (alias || rawTarget), status: "missing" as const };
        
        if (!isSelected) {
          // When not editing: hide syntax and target/pipe, show only alias (or target if no alias)
          // Opening brackets [[
          const openHidden = createSyntaxHiddenDecoration(start, start + 2);
          if (openHidden) decorations.push(openHidden);
          
          if (hasAlias) {
            // Hide target and pipe: [[Realidades|
            const targetAndPipeEnd = start + 2 + match[1].length + 1; // +1 for the pipe
            const targetHidden = createSyntaxHiddenDecoration(start + 2, targetAndPipeEnd);
            if (targetHidden) decorations.push(targetHidden);
            
            // Style the alias part
            const aliasStart = targetAndPipeEnd;
            const aliasEnd = end - 2;
            const baseClass = resolved.status === "missing" ? "cm-wikilink-missing" : "cm-wikilink";
            const aliasDecoration = createStyledDecoration(
              aliasStart,
              aliasEnd,
              baseClass,
              {
                "data-wikilink": rawTarget,
                "data-wikilink-status": resolved.status,
                title: resolved.targetPath ? `Cmd/Ctrl-click to open ${resolved.targetPath}` : `Missing wikilink: ${rawTarget}`,
              }
            );
            if (aliasDecoration) decorations.push(aliasDecoration);
          } else {
            // No alias, just hide brackets and style the target
            const contentStart = start + 2;
            const contentEnd = end - 2;
            const baseClass = resolved.status === "missing" ? "cm-wikilink-missing" : "cm-wikilink";
            const contentDecoration = createStyledDecoration(
              contentStart,
              contentEnd,
              baseClass,
              {
                "data-wikilink": rawTarget,
                "data-wikilink-status": resolved.status,
                title: resolved.targetPath ? `Cmd/Ctrl-click to open ${resolved.targetPath}` : `Missing wikilink: ${rawTarget}`,
              }
            );
            if (contentDecoration) decorations.push(contentDecoration);
          }
          
          // Closing brackets ]]
          const closeHidden = createSyntaxHiddenDecoration(end - 2, end);
          if (closeHidden) decorations.push(closeHidden);
        } else {
          // When editing: show everything with muted syntax
          const editDecoration = createStyledDecoration(
            start,
            end,
            "cm-wikilink-editing",
            {
              "data-wikilink": rawTarget,
              "data-wikilink-status": resolved.status,
            }
          );
          if (editDecoration) decorations.push(editDecoration);
        }
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
          const line = view.state.doc.lineAt(position);
          const text = line.text;
          let match: RegExpExecArray | null;

          WIKILINK_REGEX.lastIndex = 0;
          while ((match = WIKILINK_REGEX.exec(text)) !== null) {
            const from = line.from + match.index;
            const to = from + match[0].length;
            if (position < from || position >= to) continue;

            const rawTarget = match[1]?.trim();
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
