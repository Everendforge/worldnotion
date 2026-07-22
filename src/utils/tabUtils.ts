import type { VaultFile } from "../domain";
import type {
  DocumentTabGroup,
  DefaultEditorMode,
  EditorMode,
  OpenTab,
  SourceViewMode,
  WritingMode,
  WorkspaceLayoutV1,
  WorkspaceSession,
} from "../editorTypes";
import {
  fileTitle,
  pathAfterChanges,
  pathIsAffectedByChanges,
  type PathChangeSet,
} from "./pathUtils";

export function isJsonPath(path: string) {
  return path.toLowerCase().endsWith(".json");
}

export function isXmlPath(path: string) {
  return path.toLowerCase().endsWith(".xml");
}

function defaultSourceView(path: string): SourceViewMode {
  if (isJsonPath(path)) return "json";
  if (isXmlPath(path)) return "xml";
  return "raw";
}

export function createOpenTabFromFile(
  file: VaultFile,
  requestedMode: DefaultEditorMode | EditorMode,
  sourceView?: SourceViewMode,
  retainedWritingMode: WritingMode = "processed",
): OpenTab {
  const opensAsStructuredSource = isJsonPath(file.relativePath) || isXmlPath(file.relativePath);
  const mode = requestedMode === "source" ? "source" : "write";
  const writingMode =
    requestedMode === "processed" || requestedMode === "semi" ? requestedMode : retainedWritingMode;
  return {
    path: file.relativePath,
    title: fileTitle(file.relativePath),
    absolutePath: file.absolutePath,
    rawMarkdown: file.content,
    savedMarkdown: file.content,
    modifiedMs: file.modifiedMs,
    dirty: false,
    mode: opensAsStructuredSource ? "source" : mode,
    writingMode,
    sourceView: sourceView ?? defaultSourceView(file.relativePath),
    isTemplate: file.relativePath.startsWith(".everend/templates/"),
  };
}

/** Changes only editor presentation; content, save metadata, and dirty state stay untouched. */
export function withTabEditorMode(tab: OpenTab, requestedMode: EditorMode | WritingMode): OpenTab {
  if (isJsonPath(tab.path) || isXmlPath(tab.path)) {
    return {
      ...tab,
      mode: "source",
      sourceView: tab.sourceView ?? defaultSourceView(tab.path),
    };
  }
  if (requestedMode === "processed" || requestedMode === "semi") {
    return { ...tab, mode: "write", writingMode: requestedMode };
  }
  return {
    ...tab,
    mode: requestedMode,
    sourceView:
      requestedMode === "source" ? (tab.sourceView ?? defaultSourceView(tab.path)) : tab.sourceView,
  };
}

export function serializeWorkspaceSession(
  rootPath: string,
  activePath: string | undefined,
  tabs: OpenTab[],
  layout?: WorkspaceLayoutV1,
  documentTabGroups?: DocumentTabGroup[],
  explorerExpandedPaths?: string[],
): WorkspaceSession {
  return {
    rootPath,
    activePath,
    tabs: tabs.map((tab) => ({
      path: tab.path,
      title: tab.title,
      mode: tab.mode,
      writingMode: tab.writingMode,
      sourceView: tab.sourceView,
      modifiedMs: tab.modifiedMs,
      isTemplate: tab.isTemplate,
    })),
    layout,
    documentTabGroups,
    explorerExpandedPaths,
  };
}

export function updateOpenTabsForPathChange(
  tabs: OpenTab[],
  change: PathChangeSet,
  rootPath?: string,
): OpenTab[] {
  return tabs.map((tab) => {
    if (!pathIsAffectedByChanges(tab.path, change)) return tab;
    const path = pathAfterChanges(tab.path, change);
    return {
      ...tab,
      path,
      title: fileTitle(path),
      absolutePath: rootPath ? `${rootPath}/${path}` : tab.absolutePath,
    };
  });
}

export function closeOpenTab(
  tabs: OpenTab[],
  activePath: string | undefined,
  path: string,
): { tabs: OpenTab[]; activePath: string | undefined } {
  const nextTabs = tabs.filter((tab) => tab.path !== path);
  if (activePath !== path) {
    return { tabs: nextTabs, activePath };
  }

  const currentIndex = tabs.findIndex((tab) => tab.path === path);
  const replacement = nextTabs[Math.max(0, currentIndex - 1)] ?? nextTabs[0];
  return { tabs: nextTabs, activePath: replacement?.path };
}

export function closeSavedOpenTabs(
  tabs: OpenTab[],
  activePath: string | undefined,
): { tabs: OpenTab[]; activePath: string | undefined } {
  const nextTabs = tabs.filter((tab) => tab.dirty);
  if (!activePath || nextTabs.some((tab) => tab.path === activePath)) {
    return { tabs: nextTabs, activePath };
  }
  return { tabs: nextTabs, activePath: nextTabs[0]?.path };
}

export function closeOtherOpenTabs(tabs: OpenTab[], path: string): OpenTab[] {
  return tabs.filter((tab) => tab.path === path);
}

export function closeTabsToRightOf(tabs: OpenTab[], path: string): OpenTab[] {
  const index = tabs.findIndex((tab) => tab.path === path);
  return index === -1 ? tabs : tabs.filter((_, tabIndex) => tabIndex <= index);
}

export function dirtyTabPaths(tabs: OpenTab[], confirmCloseDirtyTab: boolean): string[] {
  return confirmCloseDirtyTab ? tabs.filter((tab) => tab.dirty).map((tab) => tab.path) : [];
}

export type PendingCloseQueueState = {
  pendingClosePaths: string[];
  unsavedDialogPath: string | null;
};

export function pendingCloseQueueFromDirtyPaths(dirtyPaths: string[]): PendingCloseQueueState {
  return {
    pendingClosePaths: dirtyPaths.slice(1),
    unsavedDialogPath: dirtyPaths[0] ?? null,
  };
}

export function advancePendingCloseQueue(pendingClosePaths: string[]): PendingCloseQueueState {
  const next = pendingClosePaths.slice(1);
  return {
    pendingClosePaths: next,
    unsavedDialogPath: next[0] ?? null,
  };
}

export function nextAdjacentTabPath(
  tabs: OpenTab[],
  activePath: string | undefined,
  direction: 1 | -1,
): string | undefined {
  if (!activePath || !tabs.length) return undefined;
  const currentIndex = tabs.findIndex((tab) => tab.path === activePath);
  if (currentIndex === -1) return undefined;
  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
  return tabs[nextIndex]?.path;
}
