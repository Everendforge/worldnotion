import { describe, expect, it } from "vitest";
import {
  browserPathParts,
  readBrowserUniverse,
  type BrowserDirectoryHandle,
  type BrowserFileHandle,
} from "./browserVault";

function directory(
  name: string,
  entries: Array<[string, BrowserDirectoryHandle | BrowserFileHandle]>,
): BrowserDirectoryHandle {
  return {
    name,
    async *entries() {
      yield* entries;
    },
    async getDirectoryHandle() {
      throw new Error("not needed");
    },
    async getFileHandle() {
      throw new Error("not needed");
    },
  };
}

describe("browser vault indexing", () => {
  it("allows application metadata folders inside .everend only", () => {
    expect(browserPathParts(".everend/.worldnotion/explorer-icons.json")).toEqual([
      ".everend",
      ".worldnotion",
      "explorer-icons.json",
    ]);
    expect(() => browserPathParts("Notes/.private/note.md")).toThrow(/hidden segments/i);
  });

  it("keeps loading when a nested folder becomes unreadable", async () => {
    const inaccessible = directory("private", []);
    inaccessible.entries = async function* () {
      yield* [];
      throw new DOMException("Permission revoked", "NotAllowedError");
    };
    const note = {
      getFile: async () => new File(["# Note"], "Note.md", { type: "text/markdown" }),
      createWritable: async () => ({
        write: async () => undefined,
        close: async () => undefined,
      }),
    };
    const root = directory("World", [
      ["Note.md", note],
      ["private", inaccessible],
    ]);

    const result = await readBrowserUniverse(root);
    expect(result.files.map((file) => file.relativePath)).toContain("Note.md");
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ relativePath: "private" })]),
    );
  });

  it("returns a recoverable error when the selected root cannot be read", async () => {
    const root = directory("World", []);
    root.entries = async function* () {
      yield* [];
      throw new DOMException("Permission revoked", "NotAllowedError");
    };
    await expect(readBrowserUniverse(root)).rejects.toThrow(/could not read the selected folder/i);
  });
});
