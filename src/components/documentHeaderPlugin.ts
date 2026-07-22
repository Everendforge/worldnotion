import { Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { isStructuralChange } from "./pluginUtils";

export type DocumentHeaderConfig = {
  documentName?: string;
  projectName?: string;
  showProjectName: boolean;
  onDocumentNameChange?: (newName: string) => Promise<void> | void;
};

function insertPlainTextAtSelection(element: HTMLElement, text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    element.append(document.createTextNode(text));
    return;
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

class DocumentHeaderWidget extends WidgetType {
  constructor(
    readonly documentName: string,
    readonly projectName: string | undefined,
    readonly showProjectName: boolean,
    readonly onDocumentNameChange?: (newName: string) => Promise<void> | void,
  ) {
    super();
  }

  toDOM() {
    const header = document.createElement("div");
    header.className = "document-header";

    const titleEl = document.createElement("span");
    titleEl.className = "document-header-title";
    titleEl.textContent = this.documentName;
    titleEl.contentEditable = "true";
    titleEl.spellcheck = false;
    titleEl.setAttribute("role", "textbox");
    titleEl.setAttribute("aria-label", "Document name");
    let originalValue = this.documentName;
    let composing = false;
    let saving = false;
    let ignoreNextBlur = false;

    const finishEditing = async () => {
      if (composing || saving) return false;
      const newName = (titleEl.textContent ?? "").replace(/[\r\n]+/g, " ").trim();
      titleEl.textContent = newName;
      if (!newName) {
        titleEl.dataset.error = "true";
        titleEl.title = "Document name cannot be empty.";
        window.requestAnimationFrame(() => titleEl.focus());
        return false;
      }
      if (newName === originalValue || !this.onDocumentNameChange) return true;

      saving = true;
      titleEl.setAttribute("aria-busy", "true");
      delete titleEl.dataset.error;
      titleEl.removeAttribute("title");
      try {
        await this.onDocumentNameChange(newName);
        originalValue = newName;
        titleEl.textContent = newName;
        return true;
      } catch (error) {
        titleEl.dataset.error = "true";
        titleEl.title = error instanceof Error ? error.message : String(error);
        window.requestAnimationFrame(() => titleEl.focus());
        return false;
      } finally {
        saving = false;
        titleEl.removeAttribute("aria-busy");
      }
    };

    titleEl.addEventListener("focus", () => {
      originalValue = titleEl.textContent || this.documentName;
    });

    titleEl.addEventListener("compositionstart", () => {
      composing = true;
    });
    titleEl.addEventListener("compositionend", () => {
      composing = false;
    });

    titleEl.addEventListener("blur", () => {
      if (ignoreNextBlur) {
        ignoreNextBlur = false;
        return;
      }
      void finishEditing();
    });

    titleEl.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    titleEl.addEventListener("dragstart", (e) => {
      e.preventDefault();
    });

    titleEl.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain").replace(/[\r\n]+/g, " ");
      if (text) {
        insertPlainTextAtSelection(titleEl, text);
      }
    });

    titleEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        titleEl.textContent = originalValue;
        delete titleEl.dataset.error;
        titleEl.removeAttribute("title");
        ignoreNextBlur = true;
        titleEl.blur();
      } else if (e.key === "Enter" && !composing) {
        e.preventDefault();
        void finishEditing().then((saved) => {
          if (!saved) return;
          ignoreNextBlur = true;
          titleEl.blur();
        });
      }
    });

    header.appendChild(titleEl);

    if (this.showProjectName && this.projectName) {
      const separator = document.createElement("span");
      separator.textContent = " • ";
      header.appendChild(separator);

      const projectEl = document.createElement("span");
      projectEl.className = "document-header-project";
      projectEl.textContent = this.projectName;
      header.appendChild(projectEl);
    }

    return header;
  }

  ignoreEvent() {
    return false;
  }
}

function createDecorations(config: DocumentHeaderConfig) {
  if (!config.documentName) {
    return Decoration.set([]);
  }

  const widget = new DocumentHeaderWidget(
    config.documentName,
    config.projectName,
    config.showProjectName,
    config.onDocumentNameChange,
  );

  return Decoration.set([
    Decoration.widget({
      widget,
      side: -1,
    }).range(0),
  ]);
}

export function createDocumentHeaderPlugin(config: DocumentHeaderConfig): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      config: DocumentHeaderConfig;

      constructor() {
        this.config = config;
        this.decorations = createDecorations(config);
      }

      update(update: ViewUpdate) {
        // Only recalculate on structural changes (doc/viewport)
        // Header widget doesn't need to change on selection-only updates
        if (isStructuralChange(update)) {
          this.decorations = createDecorations(this.config);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}
