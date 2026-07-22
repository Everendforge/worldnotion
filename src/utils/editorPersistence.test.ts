import { describe, expect, it } from "vitest";
import type { OpenTab } from "../editorTypes";
import { markSavedTabInList, markTabSaved, saveFilePayloadForTab } from "./editorPersistence";

function tab(overrides: Partial<OpenTab> = {}): OpenTab {
  return {
    path: "Notes/Ada.md",
    title: "Ada",
    dirty: true,
    mode: "write",
    writingMode: "processed",
    modifiedMs: 10,
    isTemplate: false,
    absolutePath: "C:/Vault/Notes/Ada.md",
    rawMarkdown: "# Ada\n\nUnsaved",
    savedMarkdown: "# Ada",
    ...overrides,
  };
}

describe("editor persistence helpers", () => {
  it("builds Tauri save_file payloads from writable tabs", () => {
    expect(saveFilePayloadForTab(tab())).toEqual({
      path: "C:/Vault/Notes/Ada.md",
      content: "# Ada\n\nUnsaved",
      expectedModifiedMs: 10,
    });

    expect(saveFilePayloadForTab(tab({ modifiedMs: undefined }))).toMatchObject({
      expectedModifiedMs: null,
    });
  });

  it("rejects tabs without writable absolute paths", () => {
    expect(() => saveFilePayloadForTab(tab({ absolutePath: undefined }))).toThrow(
      "This document does not have a writable path.",
    );
  });

  it("marks tabs as saved using current raw markdown and latest modified timestamp", () => {
    expect(markTabSaved(tab(), 42)).toMatchObject({
      dirty: false,
      savedMarkdown: "# Ada\n\nUnsaved",
      modifiedMs: 42,
    });

    expect(markTabSaved(tab(), null).modifiedMs).toBe(10);
  });

  it("updates only the saved tab in a list", () => {
    const first = tab();
    const second = tab({
      path: "Notes/Bex.md",
      title: "Bex",
      rawMarkdown: "# Bex",
      savedMarkdown: "",
    });

    const next = markSavedTabInList([first, second], "Notes/Bex.md", 99);

    expect(next[0]).toBe(first);
    expect(next[1]).toMatchObject({
      path: "Notes/Bex.md",
      dirty: false,
      savedMarkdown: "# Bex",
      modifiedMs: 99,
    });
  });
});
