import type {
  DockGroupNode,
  DockNode,
  DockPanelKind,
  DockSplitNode,
  DockTabRef,
  OpenTab,
  PersistedOpenTab,
  WorkspaceLayoutV1,
} from "../editorTypes";
import { fileTitle, pathAfterChanges, pathIsAffectedByChanges, type PathChangeSet } from "./pathUtils";

export type DockDropPosition = "center" | "left" | "right" | "top" | "bottom";

export type MoveDockTabInput = {
  tabId: string;
  sourceGroupId: string;
  targetGroupId: string;
  position: DockDropPosition;
  targetTabId?: string;
};

export type ResizeDockSplitInput = {
  splitId: string;
  ratio: number;
};

export type WorkspaceLayoutPreset = "default" | "writing" | "graph" | "focus";

const DOCUMENT_GROUP_ID = "dock-documents";
const EXPLORER_GROUP_ID = "dock-explorer";
const TOOLS_GROUP_ID = "dock-tools";

const PANEL_TITLES: Record<Exclude<DockPanelKind, "document">, string> = {
  explorer: "Explorer",
  graph: "Flow Map",
  outline: "Outline",
  links: "Links",
  backlinks: "Backlinks",
  inspector: "Inspector",
};

export function documentDockTabId(path: string): string {
  return `document:${path}`;
}

export function isDockMoveAllowedAroundDocumentAnchor(input: MoveDockTabInput): boolean {
  if (!input.tabId.startsWith("document:")) return true;
  return (
    input.targetGroupId === DOCUMENT_GROUP_ID &&
    input.position === "center" &&
    (!input.targetTabId || input.targetTabId.startsWith("document:"))
  );
}

export function panelDockTabId(kind: Exclude<DockPanelKind, "document">): string {
  return `panel:${kind}`;
}

export function createDocumentDockTab(path: string, title = fileTitle(path)): DockTabRef {
  return { id: documentDockTabId(path), kind: "document", path, title };
}

export function createPanelDockTab(kind: Exclude<DockPanelKind, "document">): DockTabRef {
  return { id: panelDockTabId(kind), kind, title: PANEL_TITLES[kind] };
}

function createDockGroup(id: string, tabs: DockTabRef[], activeTabId?: string): DockGroupNode {
  return {
    type: "group",
    id,
    tabs,
    activeTabId: activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0]?.id,
  };
}

function createDockSplit(
  id: string,
  direction: DockSplitNode["direction"],
  ratio: number,
  first: DockNode,
  second: DockNode,
): DockSplitNode {
  return { type: "split", id, direction, ratio, first, second };
}

export function createDefaultWorkspaceLayout(
  tabs: Array<OpenTab | PersistedOpenTab> = [],
  options: { activePath?: string; showGraph?: boolean; showInspector?: boolean } = {},
): WorkspaceLayoutV1 {
  const documentTabs = tabs.map((tab) => createDocumentDockTab(tab.path, tab.title));
  const activeDocumentId = options.activePath ? documentDockTabId(options.activePath) : undefined;
  const documentGroup = createDockGroup(DOCUMENT_GROUP_ID, documentTabs, activeDocumentId);
  const explorerGroup = createDockGroup(EXPLORER_GROUP_ID, [createPanelDockTab("explorer")]);
  const toolTabs = [
    ...(options.showInspector === false ? [] : [createPanelDockTab("inspector")]),
    ...(options.showGraph ? [createPanelDockTab("graph")] : []),
  ];

  const centerNode = toolTabs.length
    ? createDockSplit(
        "dock-main-tools",
        "horizontal",
        0.72,
        documentGroup,
        createDockGroup(TOOLS_GROUP_ID, toolTabs, toolTabs[toolTabs.length - 1]?.id),
      )
    : documentGroup;

  return {
    version: 1,
    root: createDockSplit("dock-root", "horizontal", 0.22, explorerGroup, centerNode),
    activeGroupId: DOCUMENT_GROUP_ID,
  };
}

export function createWorkspaceLayoutPreset(
  preset: WorkspaceLayoutPreset,
  tabs: Array<OpenTab | PersistedOpenTab> = [],
  options: { activePath?: string } = {},
): WorkspaceLayoutV1 {
  const documentTabs = tabs.map((tab) => createDocumentDockTab(tab.path, tab.title));
  const activeDocumentId = options.activePath ? documentDockTabId(options.activePath) : undefined;
  const documents = createDockGroup(DOCUMENT_GROUP_ID, documentTabs, activeDocumentId);

  if (preset === "focus") {
    return { version: 1, root: documents, activeGroupId: DOCUMENT_GROUP_ID };
  }

  const explorer = createDockGroup(EXPLORER_GROUP_ID, [createPanelDockTab("explorer")]);
  if (preset === "writing") {
    return {
      version: 1,
      root: createDockSplit("dock-root", "horizontal", 0.24, explorer, documents),
      activeGroupId: DOCUMENT_GROUP_ID,
    };
  }

  if (preset === "graph") {
    const graphTab = createPanelDockTab("graph");
    return {
      version: 1,
      root: createDockSplit(
        "dock-root",
        "horizontal",
        0.2,
        explorer,
        createDockGroup(DOCUMENT_GROUP_ID, [...documentTabs, graphTab], panelDockTabId("graph")),
      ),
      activeGroupId: DOCUMENT_GROUP_ID,
    };
  }

  return createDefaultWorkspaceLayout(tabs, { activePath: options.activePath, showGraph: false, showInspector: true });
}

export function layoutHasTab(layout: WorkspaceLayoutV1, tabId: string): boolean {
  return Boolean(findTab(layout.root, tabId));
}

export function layoutHasPanel(layout: WorkspaceLayoutV1, kind: Exclude<DockPanelKind, "document">): boolean {
  return layoutHasTab(layout, panelDockTabId(kind));
}

export function documentPathsInLayout(layout: WorkspaceLayoutV1): string[] {
  const paths: string[] = [];
  visitGroups(layout.root, (group) => {
    for (const tab of group.tabs) {
      if (tab.kind === "document" && tab.path) {
        paths.push(tab.path);
      }
    }
  });
  return paths;
}

export function activateDockTab(layout: WorkspaceLayoutV1, tabId: string): WorkspaceLayoutV1 {
  const groupId = findGroupIdForTab(layout.root, tabId);
  if (!groupId) return layout;
  return {
    ...layout,
    root: updateGroup(layout.root, groupId, (group) => ({ ...group, activeTabId: tabId })),
    activeGroupId: groupId,
  };
}

export function addDocumentToLayout(layout: WorkspaceLayoutV1, path: string, title = fileTitle(path)): WorkspaceLayoutV1 {
  const tabId = documentDockTabId(path);
  if (layoutHasTab(layout, tabId)) {
    return activateDockTab(layout, tabId);
  }

  const activeGroup = findGroup(layout.root, layout.activeGroupId);
  const targetGroupId =
    activeGroup && groupCanHostDocument(activeGroup)
      ? activeGroup.id
      : findFirstDocumentGroupId(layout.root) ?? layout.activeGroupId;
  const tab = createDocumentDockTab(path, title);
  return {
    ...layout,
    root: updateGroup(layout.root, targetGroupId, (group) => ({
      ...group,
      tabs: [...group.tabs, tab],
      activeTabId: tab.id,
    })),
    activeGroupId: targetGroupId,
  };
}

export function addPanelToLayout(layout: WorkspaceLayoutV1, kind: Exclude<DockPanelKind, "document">): WorkspaceLayoutV1 {
  const tab = createPanelDockTab(kind);
  if (layoutHasTab(layout, tab.id)) {
    return activateDockTab(layout, tab.id);
  }

  const targetGroupId = findFirstPanelGroupId(layout.root) ?? layout.activeGroupId;
  return {
    ...layout,
    root: updateGroup(layout.root, targetGroupId, (group) => ({
      ...group,
      tabs: [...group.tabs, tab],
      activeTabId: tab.id,
    })),
    activeGroupId: targetGroupId,
  };
}

export function togglePanelInLayout(
  layout: WorkspaceLayoutV1,
  kind: Exclude<DockPanelKind, "document">,
): WorkspaceLayoutV1 {
  const tabId = panelDockTabId(kind);
  return layoutHasTab(layout, tabId) ? closeDockTab(layout, tabId) : addPanelToLayout(layout, kind);
}

export function setPanelInGroup(
  layout: WorkspaceLayoutV1,
  kind: Exclude<DockPanelKind, "document">,
  groupId: string,
  enabled: boolean,
): WorkspaceLayoutV1 {
  const tab = createPanelDockTab(kind);
  if (!enabled) {
    return layoutHasTab(layout, tab.id) ? closeDockTab(layout, tab.id) : layout;
  }
  if (layoutHasTab(layout, tab.id)) {
    return activateDockTab(layout, tab.id);
  }
  return {
    ...layout,
    root: updateGroup(layout.root, groupId, (group) => ({
      ...group,
      tabs: [...group.tabs, tab],
      activeTabId: tab.id,
    })),
    activeGroupId: groupId,
  };
}

export function moveDockTab(layout: WorkspaceLayoutV1, input: MoveDockTabInput): WorkspaceLayoutV1 {
  if (!isDockMoveAllowedAroundDocumentAnchor(input)) {
    return normalizeWorkspaceLayout(layout);
  }

  if (input.position === "center" && input.sourceGroupId === input.targetGroupId) {
    return reorderTabWithinGroup(layout, input);
  }

  const removed = removeTab(layout.root, input.sourceGroupId, input.tabId);
  if (!removed.tab) return layout;

  const targetGroupId =
    input.sourceGroupId === input.targetGroupId && !findGroup(removed.node, input.targetGroupId)
      ? findFirstGroupId(removed.node)
      : input.targetGroupId;

  if (!targetGroupId) {
    return createLayoutForDetachedTab(removed.tab);
  }

  const nextRoot =
    input.position === "center"
      ? insertTabIntoGroup(removed.node, targetGroupId, removed.tab, input.targetTabId)
      : splitGroupWithTab(removed.node, targetGroupId, removed.tab, input.position);

  return normalizeWorkspaceLayout({
    ...layout,
    root: nextRoot,
    activeGroupId: input.position === "center" ? targetGroupId : findGroupIdForTab(nextRoot, input.tabId) ?? targetGroupId,
  });
}

export function resizeDockSplit(layout: WorkspaceLayoutV1, input: ResizeDockSplitInput): WorkspaceLayoutV1 {
  const ratio = clampSplitRatio(input.ratio);
  let changed = false;
  const root = mapNode(layout.root, (node) => {
    if (node.type !== "split" || node.id !== input.splitId) return node;
    if (node.ratio === ratio) return node;
    changed = true;
    return { ...node, ratio };
  });
  return changed ? { ...layout, root } : layout;
}

export function closeDockTab(layout: WorkspaceLayoutV1, tabId: string): WorkspaceLayoutV1 {
  const groupId = findGroupIdForTab(layout.root, tabId);
  if (!groupId) return layout;
  const removed = removeTab(layout.root, groupId, tabId);
  return normalizeWorkspaceLayout({
    ...layout,
    root: removed.node,
    activeGroupId: tabId.startsWith("document:") ? DOCUMENT_GROUP_ID : findFirstGroupId(removed.node) ?? DOCUMENT_GROUP_ID,
  });
}

export function syncLayoutWithOpenTabs(
  layout: WorkspaceLayoutV1,
  tabs: OpenTab[],
  activePath: string | undefined,
): WorkspaceLayoutV1 {
  const openPaths = new Set(tabs.map((tab) => tab.path));
  const tabByPath = new Map(tabs.map((tab) => [tab.path, tab]));
  let changed = false;

  let root = mapGroups(layout.root, (group) => {
    const nextTabs = group.tabs
      .filter((tab) => tab.kind !== "document" || (tab.path && openPaths.has(tab.path)))
      .map((tab) => {
        if (tab.kind !== "document" || !tab.path) return tab;
        const openTab = tabByPath.get(tab.path);
        if (!openTab || openTab.title === tab.title) return tab;
        changed = true;
        return { ...tab, title: openTab.title };
      });
    if (nextTabs.length !== group.tabs.length) changed = true;
    const activeTabId =
      group.activeTabId && nextTabs.some((tab) => tab.id === group.activeTabId)
        ? group.activeTabId
        : nextTabs[0]?.id;
    if (activeTabId !== group.activeTabId) changed = true;
    return { ...group, tabs: nextTabs, activeTabId };
  });

  const layoutPaths = new Set(documentPathsInLayout({ ...layout, root }));
  for (const tab of tabs) {
    if (!layoutPaths.has(tab.path)) {
      root = updateGroup(root, findFirstDocumentGroupId(root) ?? findFirstGroupId(root) ?? DOCUMENT_GROUP_ID, (group) => ({
        ...group,
        tabs: [...group.tabs, createDocumentDockTab(tab.path, tab.title)],
      }));
      changed = true;
    }
  }

  const activeDocumentId = activePath ? documentDockTabId(activePath) : undefined;
  const activeGroupId = activeDocumentId ? findGroupIdForTab(root, activeDocumentId) : layout.activeGroupId;
  if (activeDocumentId && activeGroupId) {
    root = updateGroup(root, activeGroupId, (group) => ({ ...group, activeTabId: activeDocumentId }));
    changed = true;
  }

  const next = normalizeWorkspaceLayout({
    ...layout,
    root,
    activeGroupId: activeGroupId ?? layout.activeGroupId,
  });

  return changed || next !== layout ? next : layout;
}

export function updateLayoutForPathChange(layout: WorkspaceLayoutV1, change: PathChangeSet): WorkspaceLayoutV1 {
  let changed = false;
  const root = mapGroups(layout.root, (group) => {
    let activeTabId = group.activeTabId;
    const tabs = group.tabs.map((tab) => {
      if (tab.kind !== "document" || !tab.path || !pathIsAffectedByChanges(tab.path, change)) return tab;
      const path = pathAfterChanges(tab.path, change);
      const nextTab = createDocumentDockTab(path);
      if (group.activeTabId === tab.id) {
        activeTabId = nextTab.id;
      }
      changed = true;
      return nextTab;
    });
    return { ...group, tabs, activeTabId };
  });
  return changed ? { ...layout, root } : layout;
}

export function normalizeWorkspaceLayout(layout: WorkspaceLayoutV1): WorkspaceLayoutV1 {
  const root = ensureDocumentAnchor(pruneNode(layout.root) ?? createDockGroup(DOCUMENT_GROUP_ID, []));
  const activeGroupId = findGroup(root, layout.activeGroupId) ? layout.activeGroupId : findFirstGroupId(root) ?? DOCUMENT_GROUP_ID;
  return { ...layout, root, activeGroupId };
}

export function orderOpenTabsByLayout(tabs: OpenTab[], layout: WorkspaceLayoutV1): OpenTab[] {
  const tabByPath = new Map(tabs.map((tab) => [tab.path, tab]));
  const ordered: OpenTab[] = [];
  for (const path of documentPathsInLayout(layout)) {
    const tab = tabByPath.get(path);
    if (tab) {
      ordered.push(tab);
      tabByPath.delete(path);
    }
  }
  return [...ordered, ...tabByPath.values()];
}

function reorderTabWithinGroup(layout: WorkspaceLayoutV1, input: MoveDockTabInput): WorkspaceLayoutV1 {
  return {
    ...layout,
    root: updateGroup(layout.root, input.targetGroupId, (group) => {
      const movingTab = group.tabs.find((tab) => tab.id === input.tabId);
      if (!movingTab) return group;
      const remaining = group.tabs.filter((tab) => tab.id !== input.tabId);
      const targetIndex = input.targetTabId
        ? remaining.findIndex((tab) => tab.id === input.targetTabId)
        : remaining.length;
      const insertIndex = targetIndex === -1 ? remaining.length : targetIndex;
      return {
        ...group,
        tabs: [...remaining.slice(0, insertIndex), movingTab, ...remaining.slice(insertIndex)],
        activeTabId: movingTab.id,
      };
    }),
    activeGroupId: input.targetGroupId,
  };
}

function insertTabIntoGroup(node: DockNode, groupId: string, tab: DockTabRef, targetTabId?: string): DockNode {
  return updateGroup(node, groupId, (group) => {
    const existingTabs = group.tabs.filter((candidate) => candidate.id !== tab.id);
    const targetIndex = targetTabId ? existingTabs.findIndex((candidate) => candidate.id === targetTabId) : existingTabs.length;
    const insertIndex = targetIndex === -1 ? existingTabs.length : targetIndex;
    return {
      ...group,
      tabs: [...existingTabs.slice(0, insertIndex), tab, ...existingTabs.slice(insertIndex)],
      activeTabId: tab.id,
    };
  });
}

function splitGroupWithTab(node: DockNode, groupId: string, tab: DockTabRef, position: DockDropPosition): DockNode {
  return mapNode(node, (candidate) => {
    if (candidate.type !== "group" || candidate.id !== groupId) return candidate;
    const newGroup = createDockGroup(nextGroupId(candidate.id, tab.id), [tab], tab.id);
    const direction = position === "left" || position === "right" ? "horizontal" : "vertical";
    const newFirst = position === "left" || position === "top" ? newGroup : candidate;
    const newSecond = position === "left" || position === "top" ? candidate : newGroup;
    return createDockSplit(nextSplitId(candidate.id, tab.id), direction, 0.5, newFirst, newSecond);
  });
}

function removeTab(node: DockNode, groupId: string, tabId: string): { node: DockNode; tab?: DockTabRef } {
  let removedTab: DockTabRef | undefined;
  const nextNode = updateGroup(node, groupId, (group) => {
    const tab = group.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return group;
    removedTab = tab;
    const tabs = group.tabs.filter((candidate) => candidate.id !== tabId);
    return {
      ...group,
      tabs,
      activeTabId: group.activeTabId === tabId ? tabs[0]?.id : group.activeTabId,
    };
  });
  return { node: pruneNode(nextNode) ?? createDockGroup(DOCUMENT_GROUP_ID, []), tab: removedTab };
}

function pruneNode(node: DockNode): DockNode | undefined {
  if (node.type === "group") {
    if (node.id === DOCUMENT_GROUP_ID) {
      const activeTabId =
        node.activeTabId && node.tabs.some((tab) => tab.id === node.activeTabId) ? node.activeTabId : node.tabs[0]?.id;
      return { ...node, activeTabId };
    }
    return node.tabs.length ? node : undefined;
  }

  const first = pruneNode(node.first);
  const second = pruneNode(node.second);
  if (first && second) return { ...node, first, second };
  return first ?? second;
}

function createLayoutForDetachedTab(tab: DockTabRef): WorkspaceLayoutV1 {
  if (tab.kind !== "document") {
    return {
      version: 1,
      root: createDockSplit(
        "dock-root-anchor",
        "horizontal",
        0.72,
        createDockGroup(DOCUMENT_GROUP_ID, []),
        createDockGroup(nextGroupId(DOCUMENT_GROUP_ID, tab.id), [tab], tab.id),
      ),
      activeGroupId: nextGroupId(DOCUMENT_GROUP_ID, tab.id),
    };
  }

  return {
    version: 1,
    root: createDockGroup(DOCUMENT_GROUP_ID, [tab], tab.id),
    activeGroupId: DOCUMENT_GROUP_ID,
  };
}

function ensureDocumentAnchor(node: DockNode): DockNode {
  if (findGroup(node, DOCUMENT_GROUP_ID)) return node;
  return createDockSplit("dock-root-anchor", "horizontal", 0.72, createDockGroup(DOCUMENT_GROUP_ID, []), node);
}

function updateGroup(node: DockNode, groupId: string, updater: (group: DockGroupNode) => DockGroupNode): DockNode {
  return mapNode(node, (candidate) => {
    if (candidate.type !== "group" || candidate.id !== groupId) return candidate;
    return updater(candidate);
  });
}

function mapGroups(node: DockNode, mapper: (group: DockGroupNode) => DockGroupNode): DockNode {
  return mapNode(node, (candidate) => (candidate.type === "group" ? mapper(candidate) : candidate));
}

function mapNode(node: DockNode, mapper: (node: DockNode) => DockNode): DockNode {
  if (node.type === "group") return mapper(node);
  const mapped: DockSplitNode = {
    ...node,
    first: mapNode(node.first, mapper),
    second: mapNode(node.second, mapper),
  };
  return mapper(mapped);
}

function visitGroups(node: DockNode, visitor: (group: DockGroupNode) => void) {
  if (node.type === "group") {
    visitor(node);
    return;
  }
  visitGroups(node.first, visitor);
  visitGroups(node.second, visitor);
}

function findGroup(node: DockNode, groupId: string): DockGroupNode | undefined {
  if (node.type === "group") return node.id === groupId ? node : undefined;
  return findGroup(node.first, groupId) ?? findGroup(node.second, groupId);
}

function findTab(node: DockNode, tabId: string): DockTabRef | undefined {
  if (node.type === "group") return node.tabs.find((tab) => tab.id === tabId);
  return findTab(node.first, tabId) ?? findTab(node.second, tabId);
}

function findGroupIdForTab(node: DockNode, tabId: string): string | undefined {
  if (node.type === "group") {
    return node.tabs.some((tab) => tab.id === tabId) ? node.id : undefined;
  }
  return findGroupIdForTab(node.first, tabId) ?? findGroupIdForTab(node.second, tabId);
}

function findFirstGroupId(node: DockNode): string | undefined {
  if (node.type === "group") return node.id;
  return findFirstGroupId(node.first) ?? findFirstGroupId(node.second);
}

function findFirstDocumentGroupId(node: DockNode): string | undefined {
  if (node.type === "group") {
    return node.tabs.some((tab) => tab.kind === "document") || node.id === DOCUMENT_GROUP_ID ? node.id : undefined;
  }
  return findFirstDocumentGroupId(node.first) ?? findFirstDocumentGroupId(node.second);
}

function findFirstPanelGroupId(node: DockNode): string | undefined {
  if (node.type === "group") {
    return node.tabs.some((tab) => tab.kind !== "document") ? node.id : undefined;
  }
  return findFirstPanelGroupId(node.first) ?? findFirstPanelGroupId(node.second);
}

function groupCanHostDocument(group: DockGroupNode): boolean {
  return !group.tabs.length || group.tabs.some((tab) => tab.kind === "document");
}

function nextGroupId(groupId: string, tabId: string): string {
  return `${groupId}-${sanitizeId(tabId)}-group`;
}

function nextSplitId(groupId: string, tabId: string): string {
  return `${groupId}-${sanitizeId(tabId)}-split`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "tab";
}

function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(0.82, Math.max(0.18, Number(ratio.toFixed(4))));
}
