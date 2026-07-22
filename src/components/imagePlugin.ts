import { Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { createStyledDecoration, isStructuralChange, selectionTouches } from "./pluginUtils";
import type { ImagePresentation } from "../utils/attachments";
import type { WritingMode } from "../editorTypes";
import { buildStructuredRangeIndex } from "../utils/structuredRangeIndex";

export type ImageResolver = (rawPath: string) => Promise<string | null>;

/**
 * Renders standard Markdown images inline in the editor (Obsidian-style live
 * preview): the `![alt](path)` markup is replaced by the actual image unless
 * the cursor is on that span, in which case the raw markup stays editable.
 */
class ImageWidget extends WidgetType {
  constructor(
    readonly rawPath: string,
    readonly alt: string,
    readonly presentation: ImagePresentation | undefined,
    private readonly resolve: ImageResolver,
  ) {
    super();
  }

  // Reuse the existing DOM across rebuilds while the source is unchanged, so
  // the image is not reloaded (and does not flicker) on every keystroke.
  eq(other: ImageWidget) {
    return (
      other.rawPath === this.rawPath &&
      other.alt === this.alt &&
      other.presentation?.width === this.presentation?.width &&
      other.presentation?.align === this.presentation?.align
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("span");
    container.className = `cm-image-widget cm-image-loading cm-image-align-${this.presentation?.align ?? "center"}`;
    container.setAttribute("data-image-path", this.rawPath);
    if (this.presentation?.width) {
      container.style.setProperty("--cm-image-width", `${this.presentation.width}%`);
    }

    const img = document.createElement("img");
    img.alt = this.alt || this.rawPath;
    img.addEventListener("load", () => {
      container.classList.remove("cm-image-loading");
      // The image changed the widget height; let CodeMirror re-measure.
      view.requestMeasure();
    });
    img.addEventListener("error", () => {
      container.classList.remove("cm-image-loading");
      container.classList.add("cm-image-error");
      container.textContent = `⚠ Image not found: ${this.rawPath}`;
    });

    this.resolve(this.rawPath)
      .then((url) => {
        if (url) {
          img.src = url;
          container.appendChild(img);
        } else {
          container.classList.remove("cm-image-loading");
          container.classList.add("cm-image-error");
          container.textContent = `⚠ Image not found: ${this.rawPath}`;
        }
      })
      .catch(() => {
        container.classList.remove("cm-image-loading");
        container.classList.add("cm-image-error");
        container.textContent = `⚠ Image not found: ${this.rawPath}`;
      });

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

export function imagePlugin(options: { resolve: ImageResolver; presentation: WritingMode }) {
  function getDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    for (const element of buildStructuredRangeIndex(view.state).ranges.filter(
      (item) => item.kind === "image",
    )) {
      const rawPath = element.target?.trim();
      if (!rawPath) continue;
      const start = element.from;
      const end = element.to;
      const selection = view.state.selection.main;
      if (
        options.presentation === "semi" &&
        selectionTouches(selection.from, selection.to, start, end)
      ) {
        const activeDecoration = createStyledDecoration(start, end, "cm-markdown-syntax-muted");
        if (activeDecoration) decorations.push(activeDecoration);
        continue;
      }

      const alt = element.label;
      const presentation = element.imagePresentation;
      decorations.push(
        Decoration.replace({
          widget: new ImageWidget(rawPath, alt, presentation, options.resolve),
        }).range(start, end),
      );
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
        if (isStructuralChange(update) || update.selectionSet) {
          this.decorations = getDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
