import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettingsV4, DocumentTabGroup, OpenTab } from "../editorTypes";
import { serializeWorkspaceSession } from "../utils/tabUtils";
import { normalizeDocumentTabGroups } from "../utils/documentTabGroups";
import { explorerAncestorsForPath } from "../utils/explorerSelectors";
import {
  closeDockTab as closeDockLayoutTab,
  createDefaultWorkspaceLayout,
  layoutHasPanel,
  panelDockTabId,
  syncLayoutWithOpenTabs,
} from "../utils/workspaceLayout";

interface UseWorkspaceStateParams {
  rootPath: string | undefined;
  persistTabs: boolean;
  selectedPath: string | undefined;
  sessions: AppSettingsV4["sessions"];
  setSettings: Dispatch<SetStateAction<AppSettingsV4>>;
}

/**
 * Estado del workspace: tabs abiertos, grupos de tabs, layout de paneles y
 * carpetas expandidas del explorer, junto con los efectos que los mantienen
 * coherentes entre sí y los persisten en la sesión del universo activo.
 *
 * El orden relativo de los efectos reproduce el que tenían en App.tsx; los
 * setters conservan la firma de useState para no cambiar los puntos de uso.
 */
export function useWorkspaceState({
  rootPath,
  persistTabs,
  selectedPath,
  sessions,
  setSettings,
}: UseWorkspaceStateParams) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [documentTabGroups, setDocumentTabGroups] = useState<DocumentTabGroup[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string>();
  const [workspaceLayout, setWorkspaceLayout] = useState(() => createDefaultWorkspaceLayout());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const tabsRef = useRef<OpenTab[]>([]);
  const sessionsRef = useRef(sessions);
  const legacyExpandedPathsLoadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Se sincroniza antes que el efecto de restauración para que este lea la
  // sesión del render actual sin declarar `sessions` como dependencia (lo que
  // re-dispararía la restauración en cada escritura de sesión).
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!rootPath || !persistTabs) return;
    const session = serializeWorkspaceSession(
      rootPath,
      activeTabPath,
      tabs,
      workspaceLayout,
      documentTabGroups,
      Array.from(expandedPaths),
    );
    setSettings((current) => ({
      ...current,
      sessions: { ...current.sessions, [rootPath]: session },
    }));
  }, [
    activeTabPath,
    documentTabGroups,
    expandedPaths,
    rootPath,
    persistTabs,
    tabs,
    workspaceLayout,
    setSettings,
  ]);

  useEffect(() => {
    if (!rootPath || persistTabs) return;
    const nextExpandedPaths = Array.from(expandedPaths);
    setSettings((current) => {
      const session = current.sessions[rootPath] ?? { rootPath, tabs: [] };
      const previousExpandedPaths = session.explorerExpandedPaths ?? [];
      if (
        previousExpandedPaths.length === nextExpandedPaths.length &&
        previousExpandedPaths.every((path, pathIndex) => path === nextExpandedPaths[pathIndex])
      ) {
        return current;
      }
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [rootPath]: {
            ...session,
            explorerExpandedPaths: nextExpandedPaths,
          },
        },
      };
    });
  }, [expandedPaths, rootPath, persistTabs, setSettings]);

  useEffect(() => {
    setWorkspaceLayout((current) => syncLayoutWithOpenTabs(current, tabs, activeTabPath));
  }, [activeTabPath, tabs]);

  useEffect(() => {
    setDocumentTabGroups((current) => normalizeDocumentTabGroups(current, tabs));
  }, [tabs]);

  // El outline se muestra dentro del editor, nunca como tab del dock.
  useEffect(() => {
    if (!layoutHasPanel(workspaceLayout, "outline")) return;
    setWorkspaceLayout((current) => closeDockLayoutTab(current, panelDockTabId("outline")));
  }, [workspaceLayout]);

  useEffect(() => {
    if (!rootPath) return;
    const restored = sessionsRef.current[rootPath]?.explorerExpandedPaths;
    if (restored) {
      setExpandedPaths(new Set(restored));
      return;
    }
    if (legacyExpandedPathsLoadedRef.current.has(rootPath)) {
      setExpandedPaths(new Set());
      return;
    }
    legacyExpandedPathsLoadedRef.current.add(rootPath);
    const stored = localStorage.getItem("worldnotion.expandedPaths");
    try {
      setExpandedPaths(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch {
      setExpandedPaths(new Set());
    }
  }, [rootPath]);

  useEffect(() => {
    // The explorer can select a folder while a document remains open in the
    // editor. In that state, following `activeTabPath` would immediately
    // re-expand the folder the user just collapsed. The selected document is
    // already kept in sync when a tab is activated, so it is the only path
    // that should drive automatic ancestor expansion here.
    const path = selectedPath?.endsWith(".md") ? selectedPath : undefined;
    if (!path) return;
    const ancestors = explorerAncestorsForPath(path);
    if (!ancestors.length) return;
    setExpandedPaths((current) => {
      if (ancestors.every((ancestor) => current.has(ancestor))) return current;
      const next = new Set(current);
      ancestors.forEach((ancestor) => next.add(ancestor));
      return next;
    });
  }, [selectedPath]);

  return {
    tabs,
    setTabs,
    tabsRef,
    documentTabGroups,
    setDocumentTabGroups,
    activeTabPath,
    setActiveTabPath,
    workspaceLayout,
    setWorkspaceLayout,
    expandedPaths,
    setExpandedPaths,
  };
}
