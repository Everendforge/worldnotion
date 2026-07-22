import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentHeaderPlugin } from "./documentHeaderPlugin";

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

function headerView(onDocumentNameChange: (name: string) => Promise<void> | void) {
  const view = new EditorView({
    state: EditorState.create({
      doc: "Body",
      extensions: [
        createDocumentHeaderPlugin({
          documentName: "Old name",
          showProjectName: false,
          onDocumentNameChange,
        }),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  return document.querySelector<HTMLElement>(".document-header-title")!;
}

describe("document header editing", () => {
  it("commits a single-line name with Enter", async () => {
    const rename = vi.fn(async () => undefined);
    const title = headerView(rename);
    title.focus();
    title.textContent = "New name";
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(rename).toHaveBeenCalledWith("New name"));
    expect(title.textContent).toBe("New name");
  });

  it("restores the original name with Escape", () => {
    const rename = vi.fn();
    const title = headerView(rename);
    title.focus();
    title.textContent = "Discard me";
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(title.textContent).toBe("Old name");
    expect(rename).not.toHaveBeenCalled();
  });

  it("keeps the draft and exposes an error when renaming fails", async () => {
    const title = headerView(async () => {
      throw new Error("Name already exists");
    });
    title.focus();
    title.textContent = "Existing";
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(title.dataset.error).toBe("true"));
    expect(title.textContent).toBe("Existing");
    expect(title.title).toBe("Name already exists");
  });
});
