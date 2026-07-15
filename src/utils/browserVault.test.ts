import { describe, expect, it } from "vitest";
import {
  browserPathParts,
  copyBrowserDirectory,
  readBrowserUniverse,
  validateBrowserPathSegment,
  type BrowserDirectoryHandle,
  type BrowserFileHandle,
} from "./browserVault";

function browserFile(content: string, lastModified = 1): BrowserFileHandle {
  return {
    getFile: async () => ({ content, lastModified, text: async () => content }) as unknown as File,
    createWritable: async () => ({ write: async () => {}, close: async () => {} }),
  };
}

function browserDirectory(
  name: string,
  entries: Array<[string, BrowserDirectoryHandle | BrowserFileHandle]>,
): BrowserDirectoryHandle {
  return {
    name,
    entries: async function* () {
      yield* entries;
    },
    getDirectoryHandle: async () => {
      throw new Error("Not implemented in this test handle.");
    },
    getFileHandle: async () => {
      throw new Error("Not implemented in this test handle.");
    },
  };
}

describe("browser vault path validation", () => {
  it("accepts safe relative vault paths and root when explicitly allowed", () => {
    expect(browserPathParts("World/Characters/Ada.md")).toEqual(["World", "Characters", "Ada.md"]);
    expect(browserPathParts(".everend/universe.json")).toEqual([".everend", "universe.json"]);
    expect(browserPathParts(".everend/.pathbranching/manifest.json")).toEqual([
      ".everend",
      ".pathbranching",
      "manifest.json",
    ]);
    expect(browserPathParts("", { allowRoot: true })).toEqual([]);
  });

  it("rejects absolute, traversal, empty, and backslash paths", () => {
    expect(() => browserPathParts("")).toThrow("Path is required.");
    expect(() => browserPathParts("../outside.md")).toThrow(
      "Browser vault paths cannot contain empty or traversal segments.",
    );
    expect(() => browserPathParts("World//Ada.md")).toThrow(
      "Browser vault paths cannot contain empty or traversal segments.",
    );
    expect(() => browserPathParts("C:/Vault/Ada.md")).toThrow(
      "Browser vault paths must be relative.",
    );
    expect(() => browserPathParts("/Vault/Ada.md")).toThrow(
      "Browser vault paths must be relative.",
    );
    expect(() => browserPathParts("World\\Ada.md")).toThrow(
      "Browser vault paths must use forward slashes.",
    );
  });

  it("allows only the .everend hidden segment", () => {
    expect(() => browserPathParts(".secret/Ada.md")).toThrow(
      "Browser vault paths can only use .everend and .everend/.pathbranching as hidden segments.",
    );
    expect(() => browserPathParts("World/.secret.md")).toThrow(
      "Browser vault paths can only use .everend and .everend/.pathbranching as hidden segments.",
    );
    expect(() => browserPathParts(".pathbranching/manifest.json")).toThrow(
      "Browser vault paths can only use .everend and .everend/.pathbranching as hidden segments.",
    );
    expect(() => browserPathParts(".everend/.other/manifest.json")).toThrow(
      "Browser vault paths can only use .everend and .everend/.pathbranching as hidden segments.",
    );
  });

  it("validates rename segments as single safe names", () => {
    expect(() => validateBrowserPathSegment("Ada.md")).not.toThrow();
    expect(() => validateBrowserPathSegment("Nested/Ada.md")).toThrow(
      "Browser vault path segments cannot contain separators or null bytes.",
    );
    expect(() => validateBrowserPathSegment("..")).toThrow(
      "Browser vault paths cannot contain empty or traversal segments.",
    );
  });
});

describe("readBrowserUniverse", () => {
  it("indexes images without decoding their binary contents as text", async () => {
    const image = browserFile("binary image must not be read", 20);
    image.getFile = async () =>
      ({
        lastModified: 20,
        text: async () => {
          throw new Error("Image binary content was decoded as text.");
        },
      }) as unknown as File;
    const root = browserDirectory("World", [
      ["Mara.md", browserFile("# Mara", 10)],
      ["attachments", browserDirectory("attachments", [["hero.png", image]])],
    ]);

    const result = await readBrowserUniverse(root);

    expect(result.files).toEqual([
      { relativePath: "attachments/hero.png", content: "", binary: true, modifiedMs: 20 },
      { relativePath: "Mara.md", content: "# Mara", binary: undefined, modifiedMs: 10 },
    ]);
  });
});

describe("copyBrowserDirectory", () => {
  it("preserves binary files instead of decoding them as text", async () => {
    const image = {
      lastModified: 20,
      text: async () => {
        throw new Error("Image binary content was decoded as text.");
      },
    } as unknown as File;
    const written: unknown[] = [];
    const source = browserDirectory("attachments", [
      [
        "hero.png",
        {
          getFile: async () => image,
          createWritable: async () => ({ write: async () => {}, close: async () => {} }),
        },
      ],
    ]);
    const target = browserDirectory("copy", []);
    target.getFileHandle = async () => ({
      getFile: async () => image,
      createWritable: async () => ({
        write: async (value) => {
          written.push(value);
        },
        close: async () => {},
      }),
    });

    await copyBrowserDirectory(source, target);

    expect(written).toEqual([image]);
  });
});
