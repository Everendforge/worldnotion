import type { VaultFile, VaultTreeNode } from "../domain";
import { parseMarkdownFrontmatter } from "./markdownFrontmatter";

function dirname(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

export function isHiddenMetadata(path: string): boolean {
  return path.startsWith(".everend/");
}

function isFolderDescriptionFile(file: VaultFile, folderName: string) {
  try {
    const parsed = parseMarkdownFrontmatter(file.content);
    return parsed.data.type === "folder-description" || parsed.data.folder === folderName;
  } catch {
    return false;
  }
}

export function buildTree(
  files: VaultFile[],
  directories: string[] = [],
  includeHiddenMetadata = false,
  hiddenRootFile?: string,
  ignoreFolderDescriptions = false,
): VaultTreeNode[] {
  // Image attachments are first-class explorer items: they can be selected,
  // previewed, moved, and deleted. Other binary file kinds are not indexed.
  const visibleFiles = files;
  const roots: VaultTreeNode[] = [];
  const folders = new Map<string, VaultTreeNode>();
  const descriptionFiles = new Set<string>();
  const folderPaths = new Set<string>();

  directories
    .filter((directory) => includeHiddenMetadata || !isHiddenMetadata(`${directory}/`))
    .forEach((directory) => {
      if (!directory) return;
      folderPaths.add(directory);
      let current = dirname(directory);
      while (current) {
        folderPaths.add(current);
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    });

  visibleFiles.forEach((file) => {
    if (!includeHiddenMetadata && isHiddenMetadata(file.relativePath)) return;
    const parentPath = dirname(file.relativePath);
    if (parentPath) {
      folderPaths.add(parentPath);
      let current = parentPath;
      while (current) {
        folderPaths.add(current);
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
  });

  visibleFiles.forEach((file) => {
    if (!includeHiddenMetadata && isHiddenMetadata(file.relativePath)) return;

    const parentPath = dirname(file.relativePath);
    const fileName = file.relativePath.split("/").pop() ?? "";
    if (fileName.endsWith(".md")) {
      const folderName = fileName.replace(/\.md$/, "");
      const potentialFolderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

      if (
        !ignoreFolderDescriptions &&
        folderPaths.has(potentialFolderPath) &&
        isFolderDescriptionFile(file, folderName)
      ) {
        descriptionFiles.add(file.relativePath);
      }
    }
  });

  function ensureFolder(folderPath: string): VaultTreeNode {
    const existing = folders.get(folderPath);
    if (existing) {
      return existing;
    }

    const name = folderPath.split("/").pop() ?? folderPath;
    const node: VaultTreeNode = { name, path: folderPath, kind: "folder", children: [] };
    folders.set(folderPath, node);
    const parentPath = dirname(folderPath);
    if (parentPath) {
      ensureFolder(parentPath).children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  }

  Array.from(folderPaths)
    .sort((a, b) => a.localeCompare(b))
    .forEach((folderPath) => ensureFolder(folderPath));

  visibleFiles
    .filter(
      (file) =>
        (includeHiddenMetadata || !isHiddenMetadata(file.relativePath)) &&
        file.relativePath !== hiddenRootFile &&
        !descriptionFiles.has(file.relativePath),
    )
    .forEach((file) => {
      const parentPath = dirname(file.relativePath);
      const node: VaultTreeNode = {
        name: file.relativePath.split("/").pop() ?? file.relativePath,
        path: file.relativePath,
        kind: "file",
        children: [],
      };
      if (parentPath) {
        ensureFolder(parentPath).children.push(node);
      } else {
        roots.push(node);
      }
    });

  folders.forEach((folder) => {
    const folderName = folder.name;
    const parentPath = dirname(folder.path);
    const expectedDescPath = parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
    if (descriptionFiles.has(expectedDescPath)) {
      folder.hasDescription = true;
      folder.descriptionPath = expectedDescPath;
    }
  });

  function sort(nodes: VaultTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
  }

  sort(roots);
  return roots;
}
