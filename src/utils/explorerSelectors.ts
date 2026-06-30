import type { ExplorerFavorite, TagHierarchyNode } from "../editorTypes";
import type { Entity, VaultIndex, VaultTreeNode } from "../domain";
import { buildTree } from "./treeBuilder";
import { pathName } from "./pathUtils";

export type VisibleExplorerRow = VaultTreeNode & {
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

function collectSearchMatches(
  nodes: VaultTreeNode[],
  normalized: string,
  files: VaultTreeNode[],
  folders: VaultTreeNode[],
) {
  nodes.forEach((node) => {
    const matches = node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized);
    if (matches) {
      if (node.kind === "file") {
        files.push({ ...node, children: [] });
      } else {
        folders.push({ ...node, children: [] });
      }
    }
    collectSearchMatches(node.children, normalized, files, folders);
  });
}

function findTreeNode(nodes: VaultTreeNode[], path: string): VaultTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const child = findTreeNode(node.children, path);
    if (child) return child;
  }
  return undefined;
}

export function selectVisibleTree(
  index: VaultIndex | undefined,
  query: string,
  showHiddenEverend: boolean,
  focusedFolderPath?: string,
  ignoreFolderNoteMetadata = false,
): VaultTreeNode[] {
  if (!index) return [];
  const tree = showHiddenEverend
    ? buildTree(index.files, index.directories, true, `${pathName(index.rootPath)}.md`, ignoreFolderNoteMetadata)
    : index.tree;
  const focusedRoot = focusedFolderPath ? findTreeNode(tree, focusedFolderPath) : undefined;
  const scopedTree = focusedFolderPath ? (focusedRoot ? [focusedRoot] : tree) : tree;
  if (!query.trim()) return scopedTree;

  const normalized = query.toLowerCase();
  const files: VaultTreeNode[] = [];
  const folders: VaultTreeNode[] = [];
  collectSearchMatches(scopedTree, normalized, files, folders);
  return [...files, ...folders];
}

export function flattenVisibleExplorerTree(
  tree: VaultTreeNode[],
  expandedPaths: Set<string>,
  focusedFolderPath?: string,
): VisibleExplorerRow[] {
  const rows: VisibleExplorerRow[] = [];

  function visit(nodes: VaultTreeNode[], depth: number) {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedPaths.has(node.path) || focusedFolderPath === node.path;
      rows.push({
        ...node,
        depth,
        hasChildren,
        isExpanded,
        children: [],
      });
      if (node.kind === "folder" && hasChildren && isExpanded) {
        visit(node.children, depth + 1);
      }
    }
  }

  visit(tree, 0);
  return rows;
}

export function explorerAncestorsForPath(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  const ancestors: string[] = [];
  for (let index = 1; index <= parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors.filter(Boolean);
}

export function expandedPathsToDepth(tree: VaultTreeNode[], maxDepth: number): Set<string> {
  const expanded = new Set<string>();

  function visit(nodes: VaultTreeNode[], depth: number) {
    for (const node of nodes) {
      if (node.kind !== "folder" || node.children.length === 0) continue;
      if (depth < maxDepth) {
        expanded.add(node.path);
        visit(node.children, depth + 1);
      }
    }
  }

  visit(tree, 0);
  return expanded;
}

export function selectFavoriteItems(index: VaultIndex | undefined, favorites: ExplorerFavorite[]): ExplorerFavorite[] {
  if (!index) return [];
  const treePaths = new Set<string>();

  function collectTreePaths(nodes: VaultTreeNode[]) {
    for (const node of nodes) {
      treePaths.add(node.path);
      collectTreePaths(node.children);
    }
  }

  collectTreePaths(index.tree);
  return favorites.filter((favorite) => {
    if (favorite.kind === "folder") {
      return treePaths.has(favorite.path);
    }
    return index.files.some((file) => file.relativePath === favorite.path);
  });
}

function flattenTags(nodes: TagHierarchyNode[], tagMap: Map<string, { color?: string; fullPath: string }>, parentPath = "") {
  nodes.forEach((node) => {
    const fullPath = parentPath ? `${parentPath}/${node.label}` : node.label;
    tagMap.set(node.label, { color: node.color, fullPath });
    tagMap.set(fullPath, { color: node.color, fullPath });
    if (node.children?.length) {
      flattenTags(node.children, tagMap, fullPath);
    }
  });
}

export function selectEcosystemGroups(index: VaultIndex | undefined): Map<string, Entity[]> {
  if (!index?.propertiesConfig) return new Map<string, Entity[]>();

  const groups = new Map<string, Entity[]>();
  const tagMap = new Map<string, { color?: string; fullPath: string }>();
  flattenTags(index.propertiesConfig.tags.rootNodes, tagMap);

  index.entities.forEach((entity) => {
    if (entity.tags.length > 0) {
      const primaryTag = entity.tags[0];
      const tagInfo = tagMap.get(primaryTag);
      const groupKey = tagInfo?.fullPath || primaryTag;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(entity);
    } else {
      if (!groups.has("_untagged")) {
        groups.set("_untagged", []);
      }
      groups.get("_untagged")!.push(entity);
    }
  });

  return groups;
}

function findTagColor(nodes: TagHierarchyNode[], tag: string): string | undefined {
  for (const node of nodes) {
    if (node.label === tag || node.fullPath === tag) {
      return node.color;
    }
    if (node.children?.length) {
      const childColor = findTagColor(node.children, tag);
      if (childColor) return childColor;
    }
  }
  return undefined;
}

export function selectEntityTagColors(index: VaultIndex | undefined): Map<string, string> {
  const colorMap = new Map<string, string>();
  if (!index?.propertiesConfig) return colorMap;

  index.entities.forEach((entity) => {
    if (entity.tags.length > 0) {
      const color = findTagColor(index.propertiesConfig!.tags.rootNodes, entity.tags[0]);
      if (color) {
        colorMap.set(entity.path, color);
      }
    }
  });

  return colorMap;
}
