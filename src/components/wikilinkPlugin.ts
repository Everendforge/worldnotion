import { Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { ResolvedWikilink } from "../editorTypes";

const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

function linkLabel(rawTarget: string, alias?: string) {
  return (alias || rawTarget).trim();
}

export function wikilinkPlugin(options: {
  resolveWikilink?: (label: string) => ResolvedWikilink;
  onOpenWikilink?: (targetPath: string, label: string) => void;
  onMissingWikilink?: (label: string) => void;
}) {
  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let match: RegExpExecArray | null;

      wikilinkRegex.lastIndex = 0;
      while ((match = wikilinkRegex.exec(text)) !== null) {
        const rawTarget = match[1]?.trim();
        if (!rawTarget) continue;
        const label = linkLabel(rawTarget, match[2]);
        const resolved = options.resolveWikilink?.(rawTarget) ?? { label, status: "missing" as const };
        
        const matchStart = from + match.index;
        const matchEnd = matchStart + match[0].length;
        
        decorations.push(
          Decoration.mark({
            class: `cm-wikilink cm-wikilink-${resolved.status}${match[2] ? " cm-wikilink-aliased" : ""}`,
            attributes: {
              "data-wikilink": rawTarget,
              title: resolved.targetPath ? `Cmd/Ctrl-click to open ${resolved.targetPath}` : `Missing wikilink: ${rawTarget}`,
            },
          }).range(matchStart, matchEnd),
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
        if (update.docChanged || update.viewportChanged) {
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
