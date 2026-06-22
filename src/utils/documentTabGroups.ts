import type { DocumentTabGroup, OpenTab, PersistedOpenTab } from "../editorTypes";
import { pathAfterChanges, pathIsAffectedByChanges, type PathChangeSet } from "./pathUtils";

export const DOCUMENT_TAB_GROUP_COLORS = ["#4f8cff", "#37a779", "#d18b2f", "#b46ad8", "#d85f7a", "#6f7d95"] as const;

export type DocumentTabMoveInput = {
  path: string;
  targetPath?: string;
  targetGroupId?: string | null;
};

export function normalizeDocumentTabGroups(
  groups: DocumentTabGroup[] | undefined,
  tabs: Array<OpenTab | PersistedOpenTab>,
): DocumentTabGroup[] {
  const openPaths = new Set(tabs.map((tab) => tab.path));
  const seen = new Set<string>();
  return (groups ?? [])
    .map((group) => {
      const tabPaths = group.tabPaths.filter((path) => {
        if (!openPaths.has(path) || seen.has(path)) return false;
        seen.add(path);
        return true;
      });
      return { ...group, tabPaths };
    })
    .filter((group) => group.tabPaths.length > 0);
}

export function createGroupFromTab(path: string, existingGroups: DocumentTabGroup[]): DocumentTabGroup {
  return {
    id: `doc-group-${Date.now().toString(36)}-${existingGroups.length + 1}`,
    name: "Group",
    color: DOCUMENT_TAB_GROUP_COLORS[existingGroups.length % DOCUMENT_TAB_GROUP_COLORS.length],
    collapsed: false,
    tabPaths: [path],
  };
}

export function removeTabFromGroups(groups: DocumentTabGroup[], path: string): DocumentTabGroup[] {
  return groups
    .map((group) => ({ ...group, tabPaths: group.tabPaths.filter((candidate) => candidate !== path) }))
    .filter((group) => group.tabPaths.length > 0);
}

export function moveDocumentTabInGroups(
  groups: DocumentTabGroup[],
  input: DocumentTabMoveInput,
): DocumentTabGroup[] {
  const withoutMovingPath = groups
    .map((group) => ({ ...group, tabPaths: group.tabPaths.filter((path) => path !== input.path) }))
    .filter((group) => group.tabPaths.length > 0);

  if (input.targetGroupId === null) {
    return withoutMovingPath;
  }

  if (!input.targetGroupId) {
    return withoutMovingPath;
  }

  return withoutMovingPath.map((group) => {
    if (group.id !== input.targetGroupId) return group;
    const targetIndex = input.targetPath ? group.tabPaths.indexOf(input.targetPath) : group.tabPaths.length;
    const insertIndex = targetIndex === -1 ? group.tabPaths.length : targetIndex;
    return {
      ...group,
      collapsed: false,
      tabPaths: [
        ...group.tabPaths.slice(0, insertIndex),
        input.path,
        ...group.tabPaths.slice(insertIndex),
      ],
    };
  });
}

export function updateGroupsForPathChange(groups: DocumentTabGroup[], change: PathChangeSet): DocumentTabGroup[] {
  return groups.map((group) => ({
    ...group,
    tabPaths: group.tabPaths.map((path) => (pathIsAffectedByChanges(path, change) ? pathAfterChanges(path, change) : path)),
  }));
}

export function renameDocumentTabGroup(groups: DocumentTabGroup[], groupId: string, name: string): DocumentTabGroup[] {
  const trimmed = name.trim();
  if (!trimmed) return groups;
  return groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group));
}

export function setDocumentTabGroupColor(groups: DocumentTabGroup[], groupId: string, color: string): DocumentTabGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, color } : group));
}

export function toggleDocumentTabGroupCollapsed(groups: DocumentTabGroup[], groupId: string): DocumentTabGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group));
}

export function ungroupDocumentTabGroup(groups: DocumentTabGroup[], groupId: string): DocumentTabGroup[] {
  return groups.filter((group) => group.id !== groupId);
}
