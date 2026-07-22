import type { BrowserDirectoryHandle, BrowserFileHandle } from "./browserVault";

const demoTextModules = import.meta.glob<string>(
  [
    "../../demo-universe/**/*.md",
    "../../demo-universe/**/*.json",
    "../../demo-universe/**/*.yaml",
    "../../demo-universe/**/*.yml",
    "../../demo-universe/.everend/**/*.md",
    "../../demo-universe/.everend/**/*.json",
    "../../demo-universe/.everend/**/*.yaml",
    "../../demo-universe/.everend/**/*.yml",
  ],
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
);

type MemoryFile = {
  kind: "file";
  content: Blob;
  modifiedMs: number;
};

type MemoryDirectory = {
  kind: "directory";
  children: Map<string, MemoryDirectory | MemoryFile>;
};

function createDirectory(): MemoryDirectory {
  return { kind: "directory", children: new Map() };
}

function validateChildName(name: string) {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new DOMException(`Invalid file name: ${name}`, "TypeMismatchError");
  }
}

function blobFromWrite(content: string | Blob | BufferSource): Blob {
  if (typeof content === "string" || content instanceof Blob || content instanceof ArrayBuffer) {
    return new Blob([content]);
  }
  return new Blob([
    new Uint8Array(content.buffer, content.byteOffset, content.byteLength) as BlobPart,
  ]);
}

function fileHandle(name: string, node: MemoryFile): BrowserFileHandle {
  return {
    async getFile() {
      return new File([node.content], name, {
        lastModified: node.modifiedMs,
        type: node.content.type,
      });
    },
    async createWritable() {
      let pending = node.content;
      return {
        async write(content) {
          pending = blobFromWrite(content);
        },
        async close() {
          node.content = pending;
          node.modifiedMs = Date.now();
        },
      };
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
  };
}

function directoryHandle(name: string, node: MemoryDirectory): BrowserDirectoryHandle {
  return {
    name,
    async *entries() {
      for (const [childName, child] of node.children) {
        yield [
          childName,
          child.kind === "directory"
            ? directoryHandle(childName, child)
            : fileHandle(childName, child),
        ];
      }
    },
    async getDirectoryHandle(childName, options) {
      validateChildName(childName);
      const child = node.children.get(childName);
      if (child?.kind === "directory") return directoryHandle(childName, child);
      if (child) throw new DOMException(`${childName} is a file.`, "TypeMismatchError");
      if (!options?.create) throw new DOMException(`${childName} was not found.`, "NotFoundError");
      const created = createDirectory();
      node.children.set(childName, created);
      return directoryHandle(childName, created);
    },
    async getFileHandle(childName, options) {
      validateChildName(childName);
      const child = node.children.get(childName);
      if (child?.kind === "file") return fileHandle(childName, child);
      if (child) throw new DOMException(`${childName} is a directory.`, "TypeMismatchError");
      if (!options?.create) throw new DOMException(`${childName} was not found.`, "NotFoundError");
      const created: MemoryFile = {
        kind: "file",
        content: new Blob(),
        modifiedMs: Date.now(),
      };
      node.children.set(childName, created);
      return fileHandle(childName, created);
    },
    async removeEntry(childName, options) {
      validateChildName(childName);
      const child = node.children.get(childName);
      if (!child) throw new DOMException(`${childName} was not found.`, "NotFoundError");
      if (child.kind === "directory" && child.children.size > 0 && !options?.recursive) {
        throw new DOMException(`${childName} is not empty.`, "InvalidModificationError");
      }
      node.children.delete(childName);
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
  };
}

function relativeDemoPath(modulePath: string): string {
  const marker = "/demo-universe/";
  const markerIndex = modulePath.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error(`Unexpected demo universe path: ${modulePath}`);
  return modulePath.slice(markerIndex + marker.length);
}

/**
 * Creates a writable, in-memory File System Access handle backed by the
 * repository's demo universe. It exercises the same browser vault code as a
 * selected folder without requiring a native directory-picker permission.
 */
export function createDemoBrowserUniverse(): BrowserDirectoryHandle {
  const root = createDirectory();

  for (const [modulePath, content] of Object.entries(demoTextModules)) {
    const parts = relativeDemoPath(modulePath).split("/");
    const fileName = parts.pop();
    if (!fileName) continue;

    let directory = root;
    for (const part of parts) {
      const child = directory.children.get(part);
      if (child?.kind === "file") {
        throw new Error(`Demo universe path conflicts with a file: ${modulePath}`);
      }
      if (child?.kind === "directory") {
        directory = child;
        continue;
      }
      const created = createDirectory();
      directory.children.set(part, created);
      directory = created;
    }

    directory.children.set(fileName, {
      kind: "file",
      content: new Blob([content], { type: "text/plain" }),
      modifiedMs: 0,
    });
  }

  return directoryHandle("demo-universe", root);
}
