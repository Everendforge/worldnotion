import type { Entity, VaultIndex } from "../domain";
import type { GraphGroupRule, GraphSettings } from "../editorTypes";

export type GraphNodeKind = "note" | "tag" | "unresolved";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  path?: string;
  degree: number;
  group: string;
  tags: string[];
  aliases: string[];
  kind: GraphNodeKind;
  entity?: Entity;
  color?: string;
  unresolvedTarget?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "wikilink" | "hierarchy" | "tag";
  strength: number;
  label?: string;
  directed?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

type NoteLookup = {
  nodes: GraphNode[];
  byPath: Map<string, GraphNode>;
  targetToNodeId: Map<string, string>;
};

/**
 * Build Obsidian-like graph data from the full vault index.
 * Markdown files are the primary nodes; frontmatter enriches labels, colors and filters.
 */
export function buildGraphData(index: VaultIndex, settings: GraphSettings, activePath?: string): GraphData {
  const lookup = buildNoteLookup(index);
  let nodes = [...lookup.nodes];
  const links: GraphLink[] = [];

  if (settings.showWikilinks) {
    addWikilinkLinks(index, lookup, settings, nodes, links);
  }

  if (settings.showHierarchy) {
    addHierarchyLinks(index, lookup, links);
  }

  if (settings.showTags) {
    nodes = addTagNodes(nodes, links);
  }

  if (settings.showTagRelations) {
    addSharedTagLinks(nodes, links);
  }

  const searchedNodeIds = filterNodeIdsBySearch(nodes, settings.searchQuery);
  if (searchedNodeIds) {
    nodes = nodes.filter((node) => searchedNodeIds.has(node.id));
    pruneLinksToNodes(links, searchedNodeIds);
  }

  if (settings.mode === "local" && activePath) {
    const centerNode = lookup.byPath.get(activePath);
    if (centerNode) {
      const localIds = getLocalGraphNodeIds(centerNode.id, nodes, links, settings.depth);
      nodes = nodes.filter((node) => localIds.has(node.id));
      pruneLinksToNodes(links, localIds);
    }
  }

  if (!settings.showOrphans) {
    const connectedIds = new Set<string>();
    links.forEach((link) => {
      connectedIds.add(link.source);
      connectedIds.add(link.target);
    });
    nodes = nodes.filter((node) => connectedIds.has(node.id));
    pruneLinksToNodes(links, new Set(nodes.map((node) => node.id)));
  }

  const degreeById = calculateDegrees(links);
  nodes = nodes.map((node) => ({
    ...node,
    degree: degreeById.get(node.id) ?? 0,
    color: colorForNode(node, settings.groups),
  }));

  return { nodes, links };
}

function buildNoteLookup(index: VaultIndex): NoteLookup {
  const entityByPath = new Map(index.entities.map((entity) => [entity.path, entity]));
  const byPath = new Map<string, GraphNode>();
  const targetToNodeId = new Map<string, string>();
  const nodes = index.markdownFiles
    .filter((file) => file.relativePath.endsWith(".md") && !file.relativePath.startsWith(".everend/"))
    .map((file) => {
      const entity = entityByPath.get(file.relativePath);
      const basename = fileTitle(file.relativePath);
      const node: GraphNode = {
        id: file.relativePath,
        label: entity?.name ?? basename,
        type: entity?.type ?? "note",
        path: file.relativePath,
        degree: 0,
        group: entity?.type ?? "note",
        tags: entity?.tags ?? [],
        aliases: entity?.aliases ?? [],
        kind: "note",
        entity,
      };
      byPath.set(file.relativePath, node);
      return node;
    });

  nodes.forEach((node) => {
    addLookupValue(targetToNodeId, node.id, node.id);
    addLookupValue(targetToNodeId, node.label, node.id);
    addLookupValue(targetToNodeId, fileTitle(node.id), node.id);
    addLookupValue(targetToNodeId, node.id.replace(/\.md$/i, ""), node.id);
    node.aliases.forEach((alias) => addLookupValue(targetToNodeId, alias, node.id));
    if (node.entity?.id) addLookupValue(targetToNodeId, node.entity.id, node.id);
  });

  return { nodes, byPath, targetToNodeId };
}

function addWikilinkLinks(
  index: VaultIndex,
  lookup: NoteLookup,
  settings: GraphSettings,
  nodes: GraphNode[],
  links: GraphLink[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const unresolvedByTarget = new Map<string, GraphNode>();

  for (const file of index.markdownFiles) {
    if (!file.relativePath.endsWith(".md") || file.relativePath.startsWith(".everend/")) continue;
    if (!nodeIds.has(file.relativePath)) continue;
    const wikilinks = extractWikilinks(file.content);

    for (const rawTarget of wikilinks) {
      const normalizedTarget = normalizeWikilinkTarget(rawTarget);
      if (!normalizedTarget) continue;
      const targetId = lookup.targetToNodeId.get(normalizedTarget.toLowerCase());
      if (targetId && targetId !== file.relativePath && nodeIds.has(targetId)) {
        pushUniqueLink(links, {
          source: file.relativePath,
          target: targetId,
          type: "wikilink",
          strength: 1,
          directed: true,
        });
        continue;
      }

      if (!settings.existingFilesOnly) {
        const unresolvedId = `unresolved:${normalizedTarget.toLowerCase()}`;
        let unresolved = unresolvedByTarget.get(unresolvedId);
        if (!unresolved) {
          unresolved = {
            id: unresolvedId,
            label: normalizedTarget,
            type: "unresolved",
            degree: 0,
            group: "unresolved",
            tags: [],
            aliases: [],
            kind: "unresolved",
            unresolvedTarget: normalizedTarget,
          };
          unresolvedByTarget.set(unresolvedId, unresolved);
          nodes.push(unresolved);
          nodeIds.add(unresolvedId);
        }
        pushUniqueLink(links, {
          source: file.relativePath,
          target: unresolved.id,
          type: "wikilink",
          strength: 1,
          directed: true,
        });
      }
    }
  }
}

function addHierarchyLinks(index: VaultIndex, lookup: NoteLookup, links: GraphLink[]) {
  const entityIdToPath = new Map(index.entities.map((entity) => [entity.id, entity.path]));
  for (const entity of index.entities) {
    if (!entity.parentId) continue;
    const parentPath = entityIdToPath.get(entity.parentId);
    const childNode = lookup.byPath.get(entity.path);
    if (!parentPath || !childNode || !lookup.byPath.has(parentPath)) continue;
    pushUniqueLink(links, {
      source: parentPath,
      target: entity.path,
      type: "hierarchy",
      strength: 0.75,
      directed: true,
    });
  }
}

function addTagNodes(nodes: GraphNode[], links: GraphLink[]): GraphNode[] {
  const nextNodes = [...nodes];
  const tagNodes = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (node.kind !== "note") continue;
    node.tags.forEach((tag) => {
      const tagId = `tag:${tag.toLowerCase()}`;
      if (!tagNodes.has(tagId)) {
        const tagNode: GraphNode = {
          id: tagId,
          label: `#${tag}`,
          type: "tag",
          degree: 0,
          group: "tag",
          tags: [tag],
          aliases: [],
          kind: "tag",
        };
        tagNodes.set(tagId, tagNode);
        nextNodes.push(tagNode);
      }
      pushUniqueLink(links, {
        source: node.id,
        target: tagId,
        type: "tag",
        strength: 0.5,
      });
    });
  }
  return nextNodes;
}

function addSharedTagLinks(nodes: GraphNode[], links: GraphLink[]) {
  const noteNodes = nodes.filter((node) => node.kind === "note" && node.tags.length > 0);
  const processed = new Set<string>();
  for (let i = 0; i < noteNodes.length; i += 1) {
    for (let j = i + 1; j < noteNodes.length; j += 1) {
      const sharedTags = noteNodes[i].tags.filter((tag) => noteNodes[j].tags.includes(tag));
      if (!sharedTags.length) continue;
      const key = [noteNodes[i].id, noteNodes[j].id].sort().join("::");
      if (processed.has(key)) continue;
      processed.add(key);
      pushUniqueLink(links, {
        source: noteNodes[i].id,
        target: noteNodes[j].id,
        type: "tag",
        strength: sharedTags.length,
        label: sharedTags.join(", "),
      });
    }
  }
}

function filterNodeIdsBySearch(nodes: GraphNode[], query: string): Set<string> | undefined {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return undefined;
  return new Set(
    nodes
      .filter((node) => {
        const haystack = [node.label, node.path, node.type, ...node.tags.map((tag) => `#${tag}`), ...node.aliases]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .map((node) => node.id),
  );
}

function getLocalGraphNodeIds(centerNodeId: string, nodes: GraphNode[], links: GraphLink[], depth: number): Set<string> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  links.forEach((link) => {
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) return;
    if (!adjacency.has(link.source)) adjacency.set(link.source, new Set());
    if (!adjacency.has(link.target)) adjacency.set(link.target, new Set());
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  });

  const visited = new Set<string>([centerNodeId]);
  const queue: Array<{ id: string; distance: number }> = [{ id: centerNodeId, distance: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.distance >= depth) continue;
    for (const nextId of adjacency.get(current.id) ?? []) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push({ id: nextId, distance: current.distance + 1 });
    }
  }
  return visited;
}

function pruneLinksToNodes(links: GraphLink[], nodeIds: Set<string>) {
  for (let index = links.length - 1; index >= 0; index -= 1) {
    if (!nodeIds.has(links[index].source) || !nodeIds.has(links[index].target)) {
      links.splice(index, 1);
    }
  }
}

function calculateDegrees(links: GraphLink[]): Map<string, number> {
  const degreeById = new Map<string, number>();
  links.forEach((link) => {
    degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
    degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
  });
  return degreeById;
}

function colorForNode(node: GraphNode, groups: GraphGroupRule[]): string {
  const matchedGroup = groups.find((group) => group.query.trim() && nodeMatchesQuery(node, group.query));
  if (matchedGroup) return matchedGroup.color;
  if (node.kind === "unresolved") return "#d29922";
  if (node.kind === "tag") return "#7cc7a2";
  return getNodeColor(node.type);
}

function nodeMatchesQuery(node: GraphNode, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;
  if (normalizedQuery.startsWith("tag:")) {
    const tagQuery = normalizedQuery.slice(4).replace(/^#/, "");
    return node.tags.some((tag) => tag.toLowerCase().includes(tagQuery));
  }
  if (normalizedQuery.startsWith("type:")) {
    return node.type.toLowerCase().includes(normalizedQuery.slice(5));
  }
  const haystack = [node.label, node.path, node.type, ...node.tags, ...node.aliases]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function pushUniqueLink(links: GraphLink[], link: GraphLink) {
  const exists = links.some(
    (candidate) => candidate.source === link.source && candidate.target === link.target && candidate.type === link.type,
  );
  if (!exists) links.push(link);
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const wikilinkPattern = /!?\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wikilinkPattern.exec(content))) {
    links.push(match[1]);
  }
  return links;
}

function normalizeWikilinkTarget(target: string): string {
  return target.split("|")[0].split("#")[0].trim();
}

function addLookupValue(map: Map<string, string>, key: string | undefined, value: string) {
  const normalized = key?.trim().toLowerCase();
  if (!normalized || map.has(normalized)) return;
  map.set(normalized, value);
}

function fileTitle(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.md$/i, "");
}

export function getUniqueTypesFromGraph(nodes: GraphNode[]): string[] {
  return Array.from(new Set(nodes.map((node) => node.type))).sort();
}

export function getUniqueTagsFromGraph(nodes: GraphNode[]): string[] {
  return Array.from(new Set(nodes.flatMap((node) => node.tags))).sort();
}

/**
 * Get color for a given entity type or relationship type.
 */
export function getNodeColor(type: string): string {
  let hash = 0;
  for (let i = 0; i < type.length; i += 1) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

/**
 * Get color for a link based on its type.
 */
export function getLinkColor(linkType: "wikilink" | "hierarchy" | "tag"): string {
  switch (linkType) {
    case "wikilink":
      return "#3f7f64";
    case "hierarchy":
      return "#737b75";
    case "tag":
      return "#7cc7a2";
    default:
      return "#737b75";
  }
}
