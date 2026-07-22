import type {
  DocumentTabGroup,
  OpenTab,
  WorkspaceLayoutV1,
  WorkspaceSession,
} from "../editorTypes";
import type { VaultIndex } from "../domain";
import {
  type PathChangeSet,
  fileTitle,
  pathAfterChanges,
  pathIsAffectedByChanges,
} from "./pathUtils";
import { createOpenTabFromFile } from "./tabUtils";
import { normalizeDocumentTabGroups, updateGroupsForPathChange } from "./documentTabGroups";
import {
  activateDockTab,
  createDefaultWorkspaceLayout,
  layoutHasPanel,
  panelDockTabId,
  syncLayoutWithOpenTabs,
  updateLayoutForPathChange,
} from "./workspaceLayout";

export type UniverseWorkspacePlanInput = {
  nextIndex: VaultIndex;
  readRootPath: string;
  currentRootPath?: string;
  tabs: OpenTab[];
  activeTabPath?: string;
  selectedPath?: string;
  workspaceLayout?: WorkspaceLayoutV1;
  documentTabGroups?: DocumentTabGroup[];
  sessions: Record<string, WorkspaceSession>;
  persistTabs: boolean;
  preferredPath?: string;
  pathChange?: PathChangeSet;
};

export type UniverseWorkspacePlan = {
  tabs: OpenTab[];
  nextPath?: string;
  layout: WorkspaceLayoutV1;
  documentTabGroups: DocumentTabGroup[];
};

function pathAfterOptionalChange(
  path: string | undefined,
  change: PathChangeSet | undefined,
): string | undefined {
  if (!path || !change || !pathIsAffectedByChanges(path, change)) {
    return path;
  }
  return pathAfterChanges(path, change);
}

function fileExists(index: VaultIndex, path: string | undefined): path is string {
  return Boolean(path && index.files.some((file) => file.relativePath === path));
}

export function planUniverseWorkspaceState(
  input: UniverseWorkspacePlanInput,
): UniverseWorkspacePlan {
  const {
    nextIndex,
    readRootPath,
    currentRootPath,
    tabs,
    activeTabPath,
    selectedPath,
    workspaceLayout,
    documentTabGroups,
    sessions,
    persistTabs,
    preferredPath,
    pathChange,
  } = input;

  const activePathAfterChange = pathAfterOptionalChange(activeTabPath, pathChange);
  const selectedPathAfterChange = pathAfterOptionalChange(selectedPath, pathChange);

  const liveTabs =
    currentRootPath === readRootPath && tabs.length
      ? tabs
          .map((tab) => {
            const nextTabPath = pathAfterOptionalChange(tab.path, pathChange) ?? tab.path;
            const file = nextIndex.files.find(
              (candidate) => candidate.relativePath === nextTabPath,
            );
            if (!file) return undefined;
            return tab.dirty
              ? {
                  ...tab,
                  path: nextTabPath,
                  title: fileTitle(nextTabPath),
                  absolutePath: file.absolutePath,
                  modifiedMs: file.modifiedMs,
                }
              : createOpenTabFromFile(file, tab.mode, tab.sourceView, tab.writingMode);
          })
          .filter((tab): tab is OpenTab => Boolean(tab))
      : [];

  const restoredSession = sessions[readRootPath];
  const restoredTabs = liveTabs.length
    ? liveTabs
    : persistTabs
      ? (restoredSession?.tabs ?? [])
          .map((tab) => {
            const file = nextIndex.files.find((candidate) => candidate.relativePath === tab.path);
            return file
              ? createOpenTabFromFile(
                  file,
                  tab.mode,
                  tab.sourceView,
                  tab.writingMode ?? "processed",
                )
              : undefined;
          })
          .filter((tab): tab is OpenTab => Boolean(tab))
      : [];

  const nextPath = fileExists(nextIndex, preferredPath)
    ? preferredPath
    : fileExists(nextIndex, activePathAfterChange)
      ? activePathAfterChange
      : fileExists(nextIndex, selectedPathAfterChange)
        ? selectedPathAfterChange
        : fileExists(nextIndex, restoredSession?.activePath)
          ? restoredSession.activePath
          : undefined;

  const restoredLayout =
    currentRootPath !== readRootPath &&
    restoredSession?.layout &&
    layoutHasPanel(restoredSession.layout, "inspector")
      ? activateDockTab(restoredSession.layout, panelDockTabId("inspector"))
      : restoredSession?.layout;

  const baseLayout =
    currentRootPath === readRootPath && workspaceLayout
      ? pathChange
        ? updateLayoutForPathChange(workspaceLayout, pathChange)
        : workspaceLayout
      : (restoredLayout ?? createDefaultWorkspaceLayout(restoredTabs, { activePath: nextPath }));

  const baseGroups =
    currentRootPath === readRootPath && documentTabGroups
      ? pathChange
        ? updateGroupsForPathChange(documentTabGroups, pathChange)
        : documentTabGroups
      : restoredSession?.documentTabGroups;

  return {
    tabs: restoredTabs,
    nextPath,
    layout: syncLayoutWithOpenTabs(baseLayout, restoredTabs, nextPath),
    documentTabGroups: normalizeDocumentTabGroups(baseGroups, restoredTabs),
  };
}
