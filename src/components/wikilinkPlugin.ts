import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { ResolvedWikilink } from "../editorTypes";

const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

export function wikilinkPlugin(options: {
  resolveWikilink?: (label: string) => ResolvedWikilink;
  onOpenWikilink?: (targetPath: string, label: string) => void;
  onMissingWikilink?: (label: string) => void;
}) {
  function selectionTouches(selectionFrom: number, selectionTo: number, from: number, to: number) {
    if (selectionFrom === selectionTo) {
      return selectionFrom >= from && selectionFrom <= to;
    }
    return selectionFrom <= to && selectionTo >= from;
  }

  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const selectionFrom = view.state.selection.main.from;
    const selectionTo = view.state.selection.main.to;

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;

      wikilinkRegex.lastIndex = 0;
      while ((match = wikilinkRegex.exec(text)) !== null) {
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
          decorations.push(
            Decoration.mark({
              class: "cm-wikilink-syntax-hidden",
            }).range(start, start + 2),
          );
          
          if (hasAlias) {
            // Hide target and pipe: [[Realidades|
            const targetAndPipeEnd = start + 2 + match[1].length + 1; // +1 for the pipe
            decorations.push(
              Decoration.mark({
                class: "cm-wikilink-syntax-hidden",
              }).range(start + 2, targetAndPipeEnd),
            );
            
            // Style the alias part
            const aliasStart = targetAndPipeEnd;
            const aliasEnd = end - 2;
            const baseClass = resolved.status === "missing" ? "cm-wikilink-missing" : "cm-wikilink";
            decorations.push(
              Decoration.mark({
                class: baseClass,
                attributes: {
                  "data-wikilink": rawTarget,
                  "data-wikilink-status": resolved.status,
                },
                inclusive: false,
              }).range(aliasStart, aliasEnd),
            );
          } else {
            // No alias, just hide brackets and style the target
            const contentStart = start + 2;
            const contentEnd = end - 2;
            const baseClass = resolved.status === "missing" ? "cm-wikilink-missing" : "cm-wikilink";
            decorations.push(
              Decoration.mark({
                class: baseClass,
                attributes: {
                  "data-wikilink": rawTarget,
                  "data-wikilink-status": resolved.status,
                },
                inclusive: false,
              }).range(contentStart, contentEnd),
            );
          }
          
          // Closing brackets ]]
          decorations.push(
            Decoration.mark({
              class: "cm-wikilink-syntax-hidden",
            }).range(end - 2, end),
          );
        } else {
          // When editing: show everything with muted syntax
          decorations.push(
            Decoration.mark({
              class: "cm-wikilink-editing",
              attributes: {
                "data-wikilink": rawTarget,
                "data-wikilink-status": resolved.status,
              },
              inclusive: false,
            }).range(start, end),
          );
        }
        
        // Add title/tooltip attributes to the whole range
        decorations.push(
          Decoration.mark({
            attributes: {
              title: resolved.targetPath ? `Cmd/Ctrl-click to open ${resolved.targetPath}` : `Missing wikilink: ${rawTarget}`,
            },
            inclusive: false,
          }).range(start, end),
        );
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
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
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

          wikilinkRegex.lastIndex = 0;
          while ((match = wikilinkRegex.exec(text)) !== null) {
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
