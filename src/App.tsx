import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import type { EditorView } from "@codemirror/view";
import {
  BookOpen,
  Check,
  Circle,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Home,
  Moon,
  Plus,
  Save,
  Search,
  Settings,
  Sun,
  FileEdit,
  AlertTriangle,
  X,
  ExternalLink,
  Files,
  Crown,
} from "lucide-react";
import "./App.css";
import { ContextMenu, type ContextMenuAction } from "./components/ContextMenu";
import { IconPicker, type IconName } from "./components/IconPicker";
import { OutlineGuide } from "./components/OutlineGuide";
import { FontSelector } from "./components/FontSelector";
import { InputDialog } from "./components/InputDialog";
import { useToast } from "./components/ToastProvider";
import { SaveStatusIndicator } from "./components/SaveStatusIndicator";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { ExplorerPanel, type ExplorerTreeAction } from "./components/ExplorerPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { JsonReader } from "./components/JsonReader";
import { LazyPanelFallback } from "./components/LazyPanelFallback";
import { UniverseIconFrame } from "./components/UniverseIconFrame";
import { DockWorkspace, type DockMoveRequest } from "./components/DockWorkspace";
import { buildGraphData, getUniqueTagsFromGraph, getUniqueTypesFromGraph } from "./utils/graphData";
import { useFonts } from "./utils/useFonts";
import {
  AppSettingsV4,
  EditorCommandId,
  FloatingFormatCommand,
  DocumentTabGroup,
  DockPanelKind,
  DockTabRef,
  NoteSuggestion,
  OpenTab,
  ThemeId,
  GraphSettings,
} from "./editorTypes";
import {
  Entity,
  VaultIndex,
  VaultReadResult,
  WriteResult,
  UniverseProfile,
  indexVault,
  joinMarkdown,
  dirname,
  slugify,
  createDefaultTaxonomyConfig,
} from "./domain";
import { isDarkTheme, themeById, themeForStyleCommand, toggledThemeMode } from "./themes";
import { updateFrontmatterProperties } from "./utils/propertiesConfig";
import { addCustomFieldToSchema } from "./utils/propertiesSerializer";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "./utils/propertyTemplates";
import { normalizeCoreBaseProperties } from "./utils/taxonomyConfig";
import { recordFileAccessInSettings } from "./utils/fileAccessStats";
import { loadSettings, saveSettings } from "./settings";
import {
  type BrowserDirectoryHandle,
  copyBrowserPath,
  ensureBrowserWritePermission,
  getBrowserDirectory,
  getBrowserFile,
  moveBrowserPath,
  readBrowserUniverse,
  removeBrowserPath,
  renameBrowserPath,
  writeBrowserFile,
} from "./utils/browserVault";
import { setBrowserVaultRoot } from "./utils/vaultImages";
import {
  buildCommandResults,
  buildFileResults,
  buildHeaderResults,
  buildTagResults,
} from "./utils/commandResults";
import {
  bodyToRawMarkdown,
  contentFromTemplate,
  createEntityFrontmatter,
  folderDescriptionContent,
  folderDescriptionInfo,
  folderDescriptionPath,
  universeNoteContent,
  rawToEditorParts,
} from "./utils/contentTemplates";
import {
  type PathChangeSet,
  activeCreationFolder as getActiveCreationFolder,
  duplicatePathFor,
  fileTitle,
  pathAfterChanges,
  pathExists,
  pathIsAffectedByChanges,
  pathName,
  relativeFromAbsolute,
  selectedAbsolutePath as getSelectedAbsolutePath,
} from "./utils/pathUtils";
import {
  closeOpenTab,
  closeOtherOpenTabs,
  closeSavedOpenTabs,
  closeTabsToRightOf,
  createOpenTabFromFile,
  advancePendingCloseQueue,
  dirtyTabPaths as getDirtyTabPaths,
  nextAdjacentTabPath,
  pendingCloseQueueFromDirtyPaths,
  serializeWorkspaceSession,
  updateOpenTabsForPathChange,
} from "./utils/tabUtils";
import {
  DOCUMENT_TAB_GROUP_COLORS,
  createGroupFromTab,
  moveDocumentTabInGroups,
  normalizeDocumentTabGroups,
  removeTabFromGroups,
  renameDocumentTabGroup,
  setDocumentTabGroupColor,
  toggleDocumentTabGroupCollapsed,
  ungroupDocumentTabGroup,
  updateGroupsForPathChange,
  type DocumentTabMoveInput,
} from "./utils/documentTabGroups";
import {
  entityToFrontmatterRaw,
  fontFamilyInsertion,
  footnoteInsertion,
  headingLine,
  listLine,
  markdownLinkInsertion,
  wikilinkInsertion,
  wrapSelectionText,
} from "./utils/markdownEditing";
import {
  dirtyTabPathsAffectedByTree,
  favoritesOutsideTree,
  movePathChange,
  movePathProblem,
  planFolderDescriptionRename,
  renamePathChange,
} from "./utils/vaultOperations";
import { editorCommandAction, nativeMenuEditorCommand } from "./utils/editorCommandActions";
import { profileForRecent, rememberUniverse, universeDisplayName } from "./utils/universeSession";
import { isTauriRuntime, platformLabels, shortcutMatches } from "./utils/appEnvironment";
import { pickBrowserDirectory } from "./utils/browserDirectoryPicker";
import {
  expandedPathsToDepth,
  explorerAncestorsForPath,
  flattenVisibleExplorerTree,
  selectEcosystemGroups,
  selectEntityTagColors,
  selectFavoriteItems,
  selectVisibleTree,
} from "./utils/explorerSelectors";
import { selectLiveEntity } from "./utils/liveEntity";
import { planUniverseWorkspaceState } from "./utils/universeApply";
import { markSavedTabInList, saveFilePayloadForTab } from "./utils/editorPersistence";
import { resolveWikilinkInIndex } from "./utils/wikilinkResolver";
import {
  currentHeaderForLine,
  editorDisplayValue,
  outlineForTab,
} from "./utils/editorDerivedState";
import {
  frontmatterNormalizationConflict,
  planFrontmatterNormalization,
  type FrontmatterNormalizationItem,
} from "./utils/frontmatterNormalizer";
import {
  activateDockTab,
  addDocumentToLayout,
  closeDockTab as closeDockLayoutTab,
  createDefaultWorkspaceLayout,
  createWorkspaceLayoutPreset,
  documentDockTabId,
  isDockMoveAllowedAroundDocumentAnchor,
  layoutHasPanel,
  moveDockTab,
  orderOpenTabsByLayout,
  panelDockTabId,
  resizeDockSplit,
  setPanelInGroup,
  syncLayoutWithOpenTabs,
  togglePanelInLayout,
  updateLayoutForPathChange,
  type WorkspaceLayoutPreset,
} from "./utils/workspaceLayout";

const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((module) => ({ default: module.CommandPalette })),
);
const CodeMirrorEditor = lazy(() =>
  import("./components/CodeMirrorEditor").then((module) => ({ default: module.CodeMirrorEditor })),
);
const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((module) => ({ default: module.SettingsModal })),
);
const GraphView = lazy(() =>
  import("./components/GraphView").then((module) => ({ default: module.GraphView })),
);
const GraphControls = lazy(() =>
  import("./components/GraphControls").then((module) => ({ default: module.GraphControls })),
);
const LinksPanel = lazy(() =>
  import("./components/LinksPanel").then((module) => ({ default: module.LinksPanel })),
);
const BacklinksPanel = lazy(() =>
  import("./components/BacklinksPanel").then((module) => ({ default: module.BacklinksPanel })),
);

type LoadState = "idle" | "loading" | "ready" | "error";
type AppView = "home" | "workspace";
type ActiveWorkspacePreset = WorkspaceLayoutPreset | "custom";
type PointerDragItem = {
  path: string;
  kind: "file" | "folder";
  startX: number;
  startY: number;
  active: boolean;
};

const FLOATING_FORMAT_COMMANDS: FloatingFormatCommand[] = [
  { id: "bold", label: "B" },
  { id: "italic", label: "I" },
  { id: "inlineCode", label: "<>" },
  { id: "link", label: "Link" },
  { id: "wikilink", label: "[[]]" },
  { id: "unorderedList", label: "List" },
  { id: "blockquote", label: "Quote" },
  { id: "spaceBefore", label: "↑ Espacio" },
  { id: "spaceAfter", label: "Espacio ↓" },
];

const FLOATING_SELECTION_COMMANDS: FloatingFormatCommand[] = [
  { id: "bold", label: "B" },
  { id: "italic", label: "I" },
  { id: "inlineCode", label: "<>" },
  { id: "link", label: "Link" },
  { id: "wikilink", label: "[[]]" },
  { id: "unorderedList", label: "List" },
  { id: "blockquote", label: "Quote" },
];

const FLOATING_HEADING_COMMANDS: FloatingFormatCommand[] = [
  { id: "heading1", label: "H1" },
  { id: "heading2", label: "H2" },
  { id: "heading3", label: "H3" },
  { id: "heading4", label: "H4" },
  { id: "heading5", label: "H5" },
  { id: "heading6", label: "H6" },
];

function App() {
  const [settings, setSettings] = useState<AppSettingsV4>(() => loadSettings());
  const [view, setView] = useState<AppView>("home");
  const [index, setIndex] = useState<VaultIndex>();
  const [browserRoot, setBrowserRoot] = useState<BrowserDirectoryHandle>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [selectedExplorerTarget, setSelectedExplorerTarget] = useState<{
    path: string;
    kind: "file" | "folder";
  }>();
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [documentTabGroups, setDocumentTabGroups] = useState<DocumentTabGroup[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string>();
  const [workspaceLayout, setWorkspaceLayout] = useState(() => createDefaultWorkspaceLayout());
  const [activeWorkspacePreset, setActiveWorkspacePreset] =
    useState<ActiveWorkspacePreset>("default");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    "overview" | "tags" | "utils" | "editor"
  >("overview");
  const [settingsInitialPropertiesMode, setSettingsInitialPropertiesMode] = useState<
    "template" | "blank"
  >("template");
  const [forgeMenuOpen, setForgeMenuOpen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);

  const [graphResetSignal, setGraphResetSignal] = useState(0);
  const [appZoom, setAppZoom] = useState(1);
  const [floatingToolbarRect, setFloatingToolbarRect] = useState<DOMRect>();
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [cursorLine, setCursorLine] = useState(0);
  const [unsavedDialogPath, setUnsavedDialogPath] = useState<string | null>(null);
  const [isSavingBeforeClose, setIsSavingBeforeClose] = useState(false);
  const [, setPendingClosePaths] = useState<string[]>([]);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<OpenTab[]>([]);
  const inspectorSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const propertiesOnboardingPromptedRef = useRef<Set<string>>(new Set());
  const ignoreFolderNoteMetadataBootstrappedRef = useRef(false);

  // Font detection hook
  const { fonts } = useFonts();

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const legacyExpandedPathsLoadedRef = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetPath: string;
    targetKind: "file" | "folder" | "empty";
  } | null>(null);
  const [recentContextMenu, setRecentContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const [dockPanelContextMenu, setDockPanelContextMenu] = useState<{
    x: number;
    y: number;
    groupId: string;
  } | null>(null);
  const [documentGroupContextMenu, setDocumentGroupContextMenu] = useState<{
    x: number;
    y: number;
    groupId: string;
  } | null>(null);
  const [iconPickerState, setIconPickerState] = useState<{
    x: number;
    y: number;
    targetPath: string;
  } | null>(null);
  const [missingRecentPaths, setMissingRecentPaths] = useState<Set<string>>(new Set());
  const [inputDialog, setInputDialog] = useState<{
    isOpen: boolean;
    title: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm?: (value: string) => Promise<void>;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
  });

  const { showToast } = useToast();
  const [pointerDragItem, setPointerDragItem] = useState<PointerDragItem>();
  const [graphControlsPosition, setGraphControlsPosition] = useState({ x: 14, y: 14 });
  const suppressTreeClickRef = useRef(false);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    return () => {
      inspectorSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
      inspectorSaveTimersRef.current.clear();
    };
  }, []);

  const activeTab = tabs.find((tab) => tab.path === activeTabPath);
  const openTabPaths = useMemo(() => new Set(tabs.map((tab) => tab.path)), [tabs]);
  const dirtyTabPaths = useMemo(
    () => new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.path)),
    [tabs],
  );
  const favoritePaths = useMemo(
    () => new Set(settings.explorer.favorites.map((favorite) => favorite.path)),
    [settings.explorer.favorites],
  );
  const noteSuggestions = useMemo<NoteSuggestion[]>(() => {
    if (!index) return [];
    return index.markdownFiles
      .filter((file) => file.relativePath.endsWith(".md"))
      .map((file) => {
        const entity = index.entities.find((candidate) => candidate.path === file.relativePath);
        return {
          label: entity?.name ?? fileTitle(file.relativePath),
          path: file.relativePath,
          aliases: entity?.aliases ?? [],
          id: entity?.id,
        };
      });
  }, [index]);
  const labels = useMemo(() => platformLabels(), []);

  useEffect(() => {
    setBrowserVaultRoot(browserRoot ?? null);
    return () => setBrowserVaultRoot(null);
  }, [browserRoot]);

  const isExplorerPanelOpen = layoutHasPanel(workspaceLayout, "explorer");
  const isInspectorPanelOpen = layoutHasPanel(workspaceLayout, "inspector");
  const isLinksPanelOpen = layoutHasPanel(workspaceLayout, "links");
  const isBacklinksPanelOpen = layoutHasPanel(workspaceLayout, "backlinks");
  const isGraphPanelOpen = layoutHasPanel(workspaceLayout, "graph");

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.body.style.setProperty("zoom", String(appZoom));
  }, [appZoom]);

  useEffect(() => {
    if (!index || !settings.editor.persistTabs) return;
    const session = serializeWorkspaceSession(
      index.rootPath,
      activeTabPath,
      tabs,
      workspaceLayout,
      documentTabGroups,
      Array.from(expandedPaths),
    );
    setSettings((current) => ({
      ...current,
      sessions: { ...current.sessions, [index.rootPath]: session },
    }));
  }, [
    activeTabPath,
    documentTabGroups,
    expandedPaths,
    index?.rootPath,
    settings.editor.persistTabs,
    tabs,
    workspaceLayout,
  ]);

  useEffect(() => {
    if (!index || settings.editor.persistTabs) return;
    const nextExpandedPaths = Array.from(expandedPaths);
    setSettings((current) => {
      const session = current.sessions[index.rootPath] ?? { rootPath: index.rootPath, tabs: [] };
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
          [index.rootPath]: {
            ...session,
            explorerExpandedPaths: nextExpandedPaths,
          },
        },
      };
    });
  }, [expandedPaths, index?.rootPath, settings.editor.persistTabs]);

  useEffect(() => {
    setWorkspaceLayout((current) => syncLayoutWithOpenTabs(current, tabs, activeTabPath));
  }, [activeTabPath, tabs]);

  useEffect(() => {
    setDocumentTabGroups((current) => normalizeDocumentTabGroups(current, tabs));
  }, [tabs]);

  useEffect(() => {
    const recent = settings.recentUniverse;
    if (!recent || recent.startsWith("browser:") || !isTauriRuntime()) return;
    const recentPath = recent;

    let cancelled = false;
    async function openLastUniverse() {
      setLoadState("loading");
      try {
        const readResult = await invoke<VaultReadResult>("index_vault", { path: recentPath });
        if (!cancelled) applyUniverse(readResult);
      } catch (error) {
        if (!cancelled) {
          setLoadState("error");
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setMissingRecentPaths((current) => new Set(current).add(recentPath));
        }
      }
    }

    openLastUniverse();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const recentPaths = settings.recentUniverses.filter((path) => !path.startsWith("browser:"));
    if (!recentPaths.length || !isTauriRuntime()) {
      setMissingRecentPaths(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(
      recentPaths.map(async (path) => {
        const exists = await invoke<boolean>("path_exists", { path }).catch(() => false);
        return [path, exists] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      setMissingRecentPaths(new Set(results.filter(([, exists]) => !exists).map(([path]) => path)));
    });

    return () => {
      cancelled = true;
    };
  }, [settings.recentUniverses.join("|")]);

  useEffect(() => {
    if (!recentContextMenu) return;

    function closeRecentMenu() {
      setRecentContextMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeRecentMenu();
    }

    document.addEventListener("mousedown", closeRecentMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeRecentMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [recentContextMenu]);

  useEffect(() => {
    if (!tabContextMenu) return;

    function closeTabMenu() {
      setTabContextMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeTabMenu();
    }

    document.addEventListener("mousedown", closeTabMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeTabMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tabContextMenu]);

  useEffect(() => {
    if (!dockPanelContextMenu) return;

    function closeDockPanelMenu() {
      setDockPanelContextMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeDockPanelMenu();
    }

    document.addEventListener("mousedown", closeDockPanelMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDockPanelMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dockPanelContextMenu]);

  useEffect(() => {
    if (!documentGroupContextMenu) return;

    function closeDocumentGroupMenu() {
      setDocumentGroupContextMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeDocumentGroupMenu();
    }

    document.addEventListener("mousedown", closeDocumentGroupMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDocumentGroupMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [documentGroupContextMenu]);

  useEffect(() => {
    if (!layoutHasPanel(workspaceLayout, "outline")) return;
    setWorkspaceLayout((current) => closeDockLayoutTab(current, panelDockTabId("outline")));
  }, [workspaceLayout]);

  useEffect(() => {
    if (!ignoreFolderNoteMetadataBootstrappedRef.current) {
      ignoreFolderNoteMetadataBootstrappedRef.current = true;
      return;
    }
    if (!index) return;
    void refreshUniverse();
  }, [settings.explorer.ignoreFolderNoteMetadata]);

  const selectedEntity = useMemo(() => {
    return selectLiveEntity(index, selectedPath, tabs);
  }, [index, selectedPath, tabs]);
  const inspectorEntity = useMemo(() => {
    return selectLiveEntity(index, activeTabPath, tabs);
  }, [activeTabPath, index, tabs]);

  const inspectorTemplate = activeTab?.isTemplate
    ? index?.templates.find((template) => template.path === activeTab.path)
    : undefined;
  const canWrite = Boolean(index);

  const graphSettings = settings.graph;
  const activeGraphPath =
    activeTabPath ?? (selectedPath?.endsWith(".md") ? selectedPath : undefined);

  const graphData = useMemo(() => {
    if (!index) return { nodes: [], links: [] };
    return buildGraphData(index, graphSettings, activeGraphPath);
  }, [activeGraphPath, graphSettings, index]);

  const availableTypes = useMemo(() => {
    return getUniqueTypesFromGraph(graphData.nodes);
  }, [graphData.nodes]);

  const availableTags = useMemo(() => {
    return getUniqueTagsFromGraph(graphData.nodes);
  }, [graphData.nodes]);

  const activeExplorerSection = settings.explorer.activeSection;
  const focusedFolderPath = index
    ? settings.explorer.focusedFoldersByUniverse?.[index.rootPath]
    : undefined;
  const visibleTree = useMemo(() => {
    return selectVisibleTree(
      index,
      query,
      settings.explorer.showHiddenEverend,
      focusedFolderPath,
      settings.explorer.ignoreFolderNoteMetadata,
    );
  }, [
    focusedFolderPath,
    index,
    query,
    settings.explorer.ignoreFolderNoteMetadata,
    settings.explorer.showHiddenEverend,
  ]);
  const visibleExplorerRows = useMemo(
    () => flattenVisibleExplorerTree(visibleTree, expandedPaths, focusedFolderPath),
    [expandedPaths, focusedFolderPath, visibleTree],
  );
  const folderDescriptionPaths = useMemo(() => {
    const paths = new Set<string>();
    function collect(nodes: VaultIndex["tree"]) {
      nodes.forEach((node) => {
        if (node.descriptionPath) paths.add(node.descriptionPath);
        if (node.children.length) collect(node.children);
      });
    }
    if (index) collect(index.tree);
    return paths;
  }, [index]);
  const explorerFocusBreadcrumb = useMemo(() => {
    if (!index || !focusedFolderPath) return [];
    const parts = focusedFolderPath.split("/").filter(Boolean);
    const crumbs = [{ label: pathName(index.rootPath), path: undefined as string | undefined }];
    parts.forEach((part, partIndex) => {
      crumbs.push({
        label: part,
        path: parts.slice(0, partIndex + 1).join("/"),
      });
    });
    return crumbs;
  }, [focusedFolderPath, index]);

  useEffect(() => {
    if (!index || !focusedFolderPath) return;
    if (pathExists(index, focusedFolderPath, "folder")) return;
    setFocusedFolder(undefined);
  }, [focusedFolderPath, index]);
  const universeSettings = useMemo(() => {
    if (!index) return undefined;
    return {
      name: universeDisplayName(index),
      rootPath: index.rootPath,
      profile: index.universeProfile,
      fileCount: index.markdownFiles.length,
      entityCount: index.entities.length,
      templateCount: index.templates.length,
      hasEverendWorkspace:
        index.directories.includes(".everend") ||
        index.files.some((file) => file.relativePath.startsWith(".everend/")),
      propertiesConfig: index.propertiesConfig,
    };
  }, [index]);
  const favoriteItems = useMemo(() => {
    return selectFavoriteItems(index, settings.explorer.favorites);
  }, [index, settings.explorer.favorites]);

  // Group entities by their ecosystem tags
  const ecosystemGroups = useMemo(() => {
    return selectEcosystemGroups(index);
  }, [index]);

  // Get tag color for an entity
  const entityTagColors = useMemo(() => {
    return selectEntityTagColors(index);
  }, [index]);

  useEffect(() => {
    if (!index) return;
    const restored = settings.sessions[index.rootPath]?.explorerExpandedPaths;
    if (restored) {
      setExpandedPaths(new Set(restored));
      return;
    }
    if (legacyExpandedPathsLoadedRef.current.has(index.rootPath)) {
      setExpandedPaths(new Set());
      return;
    }
    legacyExpandedPathsLoadedRef.current.add(index.rootPath);
    const stored = localStorage.getItem("worldnotion.expandedPaths");
    try {
      setExpandedPaths(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch {
      setExpandedPaths(new Set());
    }
  }, [index?.rootPath]);

  useEffect(() => {
    const path = activeTabPath ?? (selectedPath?.endsWith(".md") ? selectedPath : undefined);
    if (!path) return;
    const ancestors = explorerAncestorsForPath(path);
    if (!ancestors.length) return;
    setExpandedPaths((current) => {
      if (ancestors.every((ancestor) => current.has(ancestor))) return current;
      const next = new Set(current);
      ancestors.forEach((ancestor) => next.add(ancestor));
      return next;
    });
  }, [activeTabPath, selectedPath]);

  useEffect(() => {
    if (!pointerDragItem) return;

    function handlePointerMove(event: PointerEvent) {
      setPointerDragItem((current) => {
        if (!current || current.active) return current;
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        return distance > 6 ? { ...current, active: true } : current;
      });
    }

    function handlePointerUp(event: PointerEvent) {
      const dragItem = pointerDragItem;
      setPointerDragItem(undefined);
      if (!dragItem) return;
      if (!dragItem.active) return;

      suppressTreeClickRef.current = true;
      window.setTimeout(() => {
        suppressTreeClickRef.current = false;
      }, 0);

      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const folderTarget = element?.closest<HTMLElement>("[data-tree-drop-path]");
      const nodeTarget = element?.closest<HTMLElement>("[data-tree-node]");
      const rootTarget = element?.closest<HTMLElement>("[data-tree-root-drop]");
      if (nodeTarget && !folderTarget) return;
      const targetFolder = folderTarget?.dataset.treeDropPath ?? (rootTarget ? "" : undefined);
      if (targetFolder === undefined) return;
      if (targetFolder === dragItem.path || targetFolder.startsWith(`${dragItem.path}/`)) return;
      void moveExplorerPath(dragItem.path, targetFolder, dragItem.kind);
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [pointerDragItem]);

  function toggleExpand(path: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function handleExplorerTreeAction(action: ExplorerTreeAction) {
    if (action === "collapseAll") {
      setExpandedPaths(new Set());
      return;
    }

    if (action === "expandSelected") {
      const targetPath =
        selectedExplorerTarget?.kind === "folder"
          ? selectedExplorerTarget.path
          : dirname(selectedPath ?? "");
      const paths = explorerAncestorsForPath(`${targetPath}/placeholder.md`);
      if (targetPath) paths.push(targetPath);
      setExpandedPaths((current) => new Set([...current, ...paths.filter(Boolean)]));
      return;
    }

    const depth = action === "expandDepth1" ? 1 : action === "expandDepth2" ? 2 : 3;
    setExpandedPaths(expandedPathsToDepth(visibleTree, depth));
  }

  function handleContextMenu(
    event: React.MouseEvent,
    targetPath: string,
    targetKind: "file" | "folder" | "empty",
  ) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      targetPath,
      targetKind,
    });
  }

  function handleRecentContextMenu(event: React.MouseEvent, path: string) {
    event.preventDefault();
    event.stopPropagation();
    setRecentContextMenu({
      x: event.clientX,
      y: event.clientY,
      path,
    });
  }

  function removeRecentUniverse(path: string) {
    setSettings((current) => {
      const recentUniverses = current.recentUniverses.filter((candidate) => candidate !== path);
      const { [path]: _removedProfile, ...recentUniverseProfiles } = current.recentUniverseProfiles;
      return {
        ...current,
        recentUniverse:
          current.recentUniverse === path ? recentUniverses[0] : current.recentUniverse,
        recentUniverses,
        recentUniverseProfiles,
      };
    });
    setMissingRecentPaths((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
    setRecentContextMenu(null);
    showToast("Removed from dashboard.", "success");
  }

  function updateExplorer(next: Partial<AppSettingsV4["explorer"]>) {
    setSettings((current) => ({ ...current, explorer: { ...current.explorer, ...next } }));
  }

  function setCustomIcon(path: string, iconName: IconName) {
    const nextIcons = { ...settings.explorer.customIcons };
    delete nextIcons[path];
    updateExplorer({
      customIcons: iconName === "default" ? nextIcons : { ...nextIcons, [path]: iconName },
    });
  }

  function setFocusedFolder(path: string | undefined) {
    if (!index) return;
    const focusedFoldersByUniverse = { ...(settings.explorer.focusedFoldersByUniverse ?? {}) };
    if (path) {
      focusedFoldersByUniverse[index.rootPath] = path;
    } else {
      delete focusedFoldersByUniverse[index.rootPath];
    }
    updateExplorer({ focusedFoldersByUniverse });
  }

  function toggleFolderFocus(path: string) {
    setFocusedFolder(focusedFolderPath === path ? undefined : path);
  }

  function toggleFavorite(path: string, kind: "file" | "folder") {
    const exists = settings.explorer.favorites.some((favorite) => favorite.path === path);
    const favorites = exists
      ? settings.explorer.favorites.filter((favorite) => favorite.path !== path)
      : [
          ...settings.explorer.favorites,
          { path, kind, label: pathName(path).replace(/\.md$/i, "") },
        ];
    updateExplorer({ favorites });
  }

  function rememberRecentFile(path: string) {
    updateExplorer({
      recentFiles: [
        path,
        ...settings.explorer.recentFiles.filter((candidate) => candidate !== path),
      ].slice(0, 12),
    });
  }

  function updateTabsForPathChange(change: PathChangeSet) {
    setTabs((current) => updateOpenTabsForPathChange(current, change, index?.rootPath));
    setWorkspaceLayout((current) => updateLayoutForPathChange(current, change));
    setDocumentTabGroups((current) => updateGroupsForPathChange(current, change));
    setExpandedPaths((current) => {
      const next = new Set<string>();
      current.forEach((path) => {
        next.add(pathIsAffectedByChanges(path, change) ? pathAfterChanges(path, change) : path);
      });
      return next;
    });
    if (index) {
      setSettings((current) => {
        const focusedPath = current.explorer.focusedFoldersByUniverse?.[index.rootPath];
        if (!focusedPath || !pathIsAffectedByChanges(focusedPath, change)) return current;
        return {
          ...current,
          explorer: {
            ...current.explorer,
            focusedFoldersByUniverse: {
              ...(current.explorer.focusedFoldersByUniverse ?? {}),
              [index.rootPath]: pathAfterChanges(focusedPath, change),
            },
          },
        };
      });
    }
    if (pathIsAffectedByChanges(activeTabPath, change) && activeTabPath) {
      setActiveTabPath(pathAfterChanges(activeTabPath, change));
    }
    if (pathIsAffectedByChanges(selectedPath, change) && selectedPath) {
      setSelectedPath(pathAfterChanges(selectedPath, change));
    }
    setSelectedExplorerTarget((current) =>
      current && pathIsAffectedByChanges(current.path, change)
        ? { ...current, path: pathAfterChanges(current.path, change) }
        : current,
    );
  }

  async function renameFolderDescriptionIfNeeded(folderPath: string, newFolderName: string) {
    if (!index) return undefined;
    const plan = planFolderDescriptionRename(index, folderPath, newFolderName);
    if (!plan) return undefined;

    if (browserRoot) {
      if (plan.oldDescriptionPath !== plan.newDescriptionPath) {
        await renameBrowserPath(browserRoot, plan.oldDescriptionPath, plan.newFileName, "file");
      }
      await writeBrowserFile(browserRoot, plan.newDescriptionPath, plan.content);
    } else {
      if (plan.oldDescriptionPath !== plan.newDescriptionPath) {
        const renameResult = await invoke<WriteResult>("rename_path", {
          vaultPath: index.rootPath,
          relativePath: plan.oldDescriptionPath,
          newName: plan.newFileName,
        });
        if (!renameResult.ok) {
          throw new Error(renameResult.message ?? "Could not rename folder description.");
        }
      }
      const saveResult = await invoke<WriteResult>("save_file", {
        path: `${index.rootPath}/${plan.newDescriptionPath}`,
        content: plan.content,
        expectedModifiedMs: null,
      });
      if (!saveResult.ok) {
        throw new Error(saveResult.message ?? "Could not update folder description.");
      }
    }

    return plan.change;
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    targetPath: string,
    targetKind: "file" | "folder" | "empty",
    templateType?: string,
  ) {
    if (!index) return;

    const parentPath =
      targetKind === "folder" ? targetPath : targetPath.split("/").slice(0, -1).join("/");

    try {
      if (action === "open") {
        if (targetKind !== "folder" && targetKind !== "empty") {
          selectPath(targetPath);
        }
      } else if (action === "openInNewTab") {
        if (targetKind !== "folder" && targetKind !== "empty") {
          openDocument(index, targetPath);
        }
      } else if (action === "newBlankPage") {
        const name = await promptUser("Enter page name:");
        if (!name || name.trim() === "") {
          return;
        }

        const fileName = name.endsWith(".md") ? name : `${name}.md`;
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        const cleanName = name.replace(/\.md$/i, "");
        const content = `${contentFromTemplate(index, "concept", cleanName)}\n`;

        if (browserRoot) {
          await writeBrowserFile(browserRoot, filePath, content);
        } else {
          const result = await invoke<WriteResult>("save_file", {
            path: `${index.rootPath}/${filePath}`,
            content,
            expectedModifiedMs: null,
          });
          if (!result.ok) {
            throw new Error(result.message ?? "Could not create page.");
          }
        }

        const nextIndex = await refreshUniverse(filePath);
        selectPathAfterRefresh(filePath, nextIndex);
        showToast(`Created blank page: ${fileName}`, "success");
      } else if (action === "newPageFromTemplate" && templateType) {
        const name = await promptUser(`Enter ${templateType} name:`);
        if (!name || name.trim() === "") {
          return;
        }

        const slug = slugify(name);
        const filePath = parentPath ? `${parentPath}/${slug}.md` : `${slug}.md`;

        if (browserRoot) {
          await writeBrowserFile(
            browserRoot,
            filePath,
            contentFromTemplate(index, templateType, name),
          );
        } else {
          const result = await invoke<WriteResult>("create_entity", {
            vaultPath: index.rootPath,
            universePath: "",
            folderPath: parentPath,
            entityType: templateType,
            name,
          });
          if (!result.ok) {
            throw new Error(result.message ?? "Could not create entity.");
          }
        }

        const nextIndex = await refreshUniverse(filePath);
        selectPathAfterRefresh(filePath, nextIndex);
        showToast(`Created ${templateType}: ${name}`, "success");
      } else if (action === "newFolder") {
        const name = await promptUser("Enter folder name:");
        if (!name || name.trim() === "") {
          return;
        }

        const folderPath = parentPath ? `${parentPath}/${name}` : name;
        const descriptionPath = parentPath ? `${parentPath}/${name}.md` : `${name}.md`;
        const descriptionContent = folderDescriptionContent(name);

        if (browserRoot) {
          await ensureBrowserWritePermission(browserRoot);
          await getBrowserDirectory(browserRoot, folderPath, true);
          await writeBrowserFile(browserRoot, descriptionPath, descriptionContent);
        } else {
          const folderResult = await invoke<WriteResult>("create_folder", {
            vaultPath: index.rootPath,
            relativePath: folderPath,
          });
          if (!folderResult.ok) {
            throw new Error(folderResult.message ?? "Could not create folder.");
          }
          const descriptionResult = await invoke<WriteResult>("save_file", {
            path: `${index.rootPath}/${descriptionPath}`,
            content: descriptionContent,
            expectedModifiedMs: null,
          });
          if (!descriptionResult.ok) {
            throw new Error(descriptionResult.message ?? "Could not create folder description.");
          }
        }

        const nextIndex = await refreshUniverse(descriptionPath);
        setExpandedPaths((prev) => new Set(prev).add(folderPath));
        selectPathAfterRefresh(descriptionPath, nextIndex);
        showToast(`Created folder: ${name}`, "success");
      } else if (action === "rename" && targetKind !== "empty") {
        const currentName = pathName(targetPath);
        const newName = await promptUser("New name:", "new name", currentName);
        if (!newName || newName === currentName) return;
        if (targetKind === "folder") {
          planFolderDescriptionRename(index, targetPath, newName);
        }
        if (browserRoot) {
          await renameBrowserPath(browserRoot, targetPath, newName, targetKind);
        } else {
          const result = await invoke<WriteResult>("rename_path", {
            vaultPath: index.rootPath,
            relativePath: targetPath,
            newName,
          });
          if (!result.ok) throw new Error(result.message ?? "Could not rename item.");
        }
        const folderDescriptionChange =
          targetKind === "folder"
            ? await renameFolderDescriptionIfNeeded(targetPath, newName)
            : undefined;
        const change = renamePathChange(targetPath, newName, targetKind);
        const changes = folderDescriptionChange ? [change, folderDescriptionChange] : [change];
        updateTabsForPathChange(changes);
        await refreshUniverse(undefined, changes);
        showToast(`Renamed ${currentName}.`, "success");
      } else if (action === "duplicate" && targetKind !== "empty") {
        let nextPath: string;
        if (browserRoot) {
          nextPath = duplicatePathFor(index, targetPath, targetKind);
          await copyBrowserPath(browserRoot, targetPath, nextPath, targetKind);
        } else {
          const result = await invoke<WriteResult>("duplicate_path", {
            vaultPath: index.rootPath,
            relativePath: targetPath,
            targetName: null,
          });
          if (!result.ok) throw new Error(result.message ?? "Could not duplicate item.");
          nextPath = relativeFromAbsolute(index.rootPath, result.path);
        }
        await refreshUniverse(nextPath);
        showToast("Duplicated item.", "success");
      } else if (action === "move" && targetKind !== "empty") {
        // window.prompt es poco fiable en los webviews de Tauri (no-op en macOS).
        const targetFolder = await promptUser(
          "Move to folder path:",
          "folder path",
          dirname(targetPath),
        );
        if (targetFolder === null) return;
        await moveExplorerPath(targetPath, targetFolder, targetKind);
      } else if (action === "toggleFavorite" && targetKind !== "empty") {
        toggleFavorite(targetPath, targetKind);
      } else if (action === "changeIcon" && targetKind !== "empty") {
        // Show icon picker modal
        if (contextMenu) {
          setIconPickerState({
            x: contextMenu.x,
            y: contextMenu.y,
            targetPath,
          });
          setContextMenu(null);
        }
      } else if (action === "editFolderDescription" && targetKind === "folder") {
        await createFolderDescription(targetPath);
      } else if (action === "reveal") {
        await revealExplorerPath(targetKind === "empty" ? undefined : targetPath);
      } else if (action === "trash" && targetKind !== "empty") {
        await trashExplorerPath(targetPath, targetKind);
      } else if (action === "refresh") {
        await refreshUniverse();
      } else if (action === "collapseAll") {
        handleExplorerTreeAction("collapseAll");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setLoadState("error");
      setErrorMessage(`[${action}] ${errorMsg}`);
    } finally {
      setContextMenu(null);
    }
  }

  async function moveExplorerPath(
    fromPath: string,
    toFolderPath: string,
    kind?: "file" | "folder",
  ) {
    if (!index) return;
    const itemKind =
      kind ?? (index.files.some((file) => file.relativePath === fromPath) ? "file" : "folder");
    const moveProblem = movePathProblem(fromPath, toFolderPath, itemKind);
    if (moveProblem === "Cannot move a folder into itself.") {
      showToast(moveProblem, "warning");
      return;
    }
    if (moveProblem === "already-there") {
      return;
    }
    const confirmed = settings.explorer.confirmDragMove
      ? window.confirm(`Move ${pathName(fromPath)} to ${toFolderPath || "root"}?`)
      : true;
    if (!confirmed) return;
    let movedPath: string;
    if (browserRoot) {
      movedPath = await moveBrowserPath(browserRoot, fromPath, toFolderPath, itemKind);
    } else {
      const result = await invoke<WriteResult>("move_path", {
        vaultPath: index.rootPath,
        fromRelativePath: fromPath,
        toFolderRelativePath: toFolderPath,
      });
      if (!result.ok) throw new Error(result.message ?? "Could not move item.");
      movedPath = relativeFromAbsolute(index.rootPath, result.path);
    }
    const change = movePathChange(fromPath, dirname(movedPath));
    updateTabsForPathChange(change);
    await refreshUniverse(undefined, change);
    showToast(`Moved ${pathName(fromPath)}.`, "success");
  }

  async function revealExplorerPath(path?: string) {
    if (!index) return;
    if (browserRoot) {
      throw new Error(`${labels.revealItem} is only available in the desktop app.`);
    }
    const absolutePath = path ? getSelectedAbsolutePath(index, path) : index.rootPath;
    if (!path) {
      await invoke<WriteResult>("reveal_vault", { vaultPath: index.rootPath });
    } else {
      await invoke<WriteResult>("reveal_path", { path: absolutePath });
    }
  }

  async function trashExplorerPath(path: string, kind: "file" | "folder") {
    if (!index) return;
    const affectedDirtyTabs = dirtyTabPathsAffectedByTree(tabs, path);
    if (affectedDirtyTabs.length) {
      const confirmed = window.confirm(
        `${affectedDirtyTabs.length} open tab(s) have unsaved changes. ${labels.trashAction} anyway?`,
      );
      if (!confirmed) return;
    }
    const confirmed = window.confirm(
      browserRoot
        ? `Delete ${pathName(path)} from this browser-opened universe?`
        : `${labels.trashAction} ${pathName(path)}?`,
    );
    if (!confirmed) return;
    if (browserRoot) {
      await removeBrowserPath(browserRoot, path, true);
      // Also delete folder note if trashing a folder
      if (kind === "folder") {
        const folderNotePath = folderDescriptionPath(path);
        if (index.files.some((file) => file.relativePath === folderNotePath)) {
          try {
            await removeBrowserPath(browserRoot, folderNotePath, true);
          } catch {
            // Ignore error if folder note doesn't exist
          }
        }
      }
    } else {
      const result = await invoke<WriteResult>("trash_path", {
        vaultPath: index.rootPath,
        relativePath: path,
      });
      if (!result.ok) throw new Error(result.message ?? "Could not move item to Trash.");
      // Also trash folder note if trashing a folder
      if (kind === "folder") {
        const folderNotePath = folderDescriptionPath(path);
        if (index.files.some((file) => file.relativePath === folderNotePath)) {
          try {
            await invoke<WriteResult>("trash_path", {
              vaultPath: index.rootPath,
              relativePath: folderNotePath,
            });
          } catch {
            // Ignore error if folder note doesn't exist
          }
        }
      }
    }
    setTabs((current) =>
      current.filter((tab) => !(tab.path === path || tab.path.startsWith(`${path}/`))),
    );
    if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
      setSelectedPath(undefined);
      setActiveTabPath(undefined);
    }
    updateExplorer({
      favorites: favoritesOutsideTree(settings.explorer.favorites, path),
      focusedFoldersByUniverse:
        index &&
        focusedFolderPath &&
        (focusedFolderPath === path || focusedFolderPath.startsWith(`${path}/`))
          ? Object.fromEntries(
              Object.entries(settings.explorer.focusedFoldersByUniverse ?? {}).filter(
                ([rootPath]) => rootPath !== index.rootPath,
              ),
            )
          : settings.explorer.focusedFoldersByUniverse,
    });
    await refreshUniverse();
    showToast(
      `${kind === "folder" ? "Folder" : "File"} ${labels.trashDone.toLowerCase()}`,
      "success",
    );
  }

  async function createFolderDescription(folderPath: string) {
    if (!index) return;

    const folderName = folderPath.split("/").pop() ?? folderPath;
    const parentPath = dirname(folderPath);
    const descriptionPath = parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
    const fullPath = `${index.rootPath}/${descriptionPath}`;
    const content = folderDescriptionContent(folderName);

    try {
      if (browserRoot) {
        await writeBrowserFile(browserRoot, descriptionPath, content);
      } else {
        const result = await invoke<WriteResult>("save_file", {
          path: fullPath,
          content,
          expectedModifiedMs: null,
        });
        if (!result.ok) throw new Error(result.message ?? "Could not create folder description.");
      }

      const nextIndex = await refreshUniverse(descriptionPath);
      selectPathAfterRefresh(descriptionPath, nextIndex);
      showToast(`Created folder description: ${folderName}.md`, "success");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function openUniverseNote() {
    if (!index) return;
    const universeName = pathName(index.rootPath);
    const relativePath = `${universeName}.md`;
    try {
      if (!index.files.some((file) => file.relativePath === relativePath)) {
        const content = universeNoteContent(universeName);
        if (browserRoot) {
          await writeBrowserFile(browserRoot, relativePath, content);
        } else {
          const result = await invoke<WriteResult>("save_file", {
            path: `${index.rootPath}/${relativePath}`,
            content,
            expectedModifiedMs: null,
          });
          if (!result.ok) throw new Error(result.message ?? "Could not create universe note.");
        }
      }

      const nextIndex = await refreshUniverse(relativePath);
      selectPathAfterRefresh(relativePath, nextIndex);
      setShowSettings(false);
      showToast(`Opened universe note: ${relativePath}`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveUniverseProfile(profile: UniverseProfile) {
    if (!index) return;
    const normalizedProfile: UniverseProfile = {
      name: profile.name?.trim() || undefined,
      icon: profile.icon,
    };
    const content = `${JSON.stringify(normalizedProfile, null, 2)}\n`;
    try {
      if (browserRoot) {
        await writeBrowserFile(browserRoot, ".everend/universe.json", content);
      } else {
        const result = await invoke<WriteResult>("save_file", {
          path: `${index.rootPath}/.everend/universe.json`,
          content,
          expectedModifiedMs: null,
        });
        if (!result.ok) throw new Error(result.message ?? "Could not save universe profile.");
      }
      setIndex((current) =>
        current ? { ...current, universeProfile: normalizedProfile } : current,
      );
      await reindexUniverseMetadata();
      showToast("Universe profile updated.", "success");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  function setThemeById(theme: ThemeId) {
    setSettings((current) => ({ ...current, theme }));
    showToast(`Style: ${themeById(theme).label}`);
  }

  async function savePropertiesConfig(properties: import("./editorTypes.js").PropertiesConfig) {
    if (!index) return;
    const normalizedProperties = normalizeCoreBaseProperties(properties);
    const content = `${JSON.stringify(normalizedProperties, null, 2)}\n`;
    try {
      if (browserRoot) {
        await writeBrowserFile(browserRoot, ".everend/properties.json", content);
      } else {
        const result = await invoke<WriteResult>("save_file", {
          path: `${index.rootPath}/.everend/properties.json`,
          content,
          expectedModifiedMs: null,
        });
        if (!result.ok)
          throw new Error(result.message ?? "Could not save properties configuration.");
      }
      setIndex((current) =>
        current ? { ...current, propertiesConfig: normalizedProperties } : current,
      );
      await reindexUniverseMetadata();
      showToast("Properties configuration saved.", "success");
    } catch (error) {
      console.error("[savePropertiesConfig] Error:", error);
      showToast(
        error instanceof Error ? error.message : "Could not save properties configuration.",
        "error",
      );
      throw error;
    }
  }

  async function initializeUniverseProperties(
    properties: import("./editorTypes.js").PropertiesConfig,
  ) {
    if (!index) return;
    try {
      const profile = index.universeProfile ?? {
        name: universeDisplayName(index),
        icon: { type: "preset" as const, value: "book" },
      };
      if (!index.universeProfile) {
        await saveUniverseProfile(profile);
      }
      await savePropertiesConfig(properties);
      await refreshUniverse();
      showToast("Universe properties initialized.", "success");
    } catch (error) {
      console.error("[initializeUniverseProperties] Error:", error);
      showToast(
        error instanceof Error ? error.message : "Could not initialize universe properties.",
        "error",
      );
      throw error;
    }
  }

  async function handleConserveField(fieldName: string, value: unknown) {
    const currentConfig =
      index?.propertiesConfig ??
      applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    // Infer type from value
    let inferredType = "text";
    if (typeof value === "boolean") inferredType = "boolean";
    else if (typeof value === "number") inferredType = "number";
    else if (Array.isArray(value)) inferredType = "multiselect";

    const nextConfig = addCustomFieldToSchema(currentConfig, fieldName, inferredType);
    await savePropertiesConfig(nextConfig);
    showToast(`Field "${fieldName}" added to universe properties.`, "success");
  }

  function handleDeleteField(_fieldName: string) {
    // Field deletion is handled by MetadataEditor (removes from YAML)
    // This handler is here for future extensibility (e.g., logging)
  }

  function scanFrontmatterNormalization() {
    if (!index) return [];
    return planFrontmatterNormalization({
      rootPath: index.rootPath,
      files: index.files,
      directories: index.directories,
      defaultType: "concept",
    });
  }

  async function applyFrontmatterNormalization(items: FrontmatterNormalizationItem[]) {
    if (!index || items.length === 0) {
      return { applied: 0, skipped: 0, errors: [] };
    }

    const dirtyPaths = new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.path));
    const currentRead = await readCurrentUniverse();
    const currentFiles = new Map(
      (currentRead?.files ?? index.files).map((file) => [file.relativePath, file]),
    );
    const errors: string[] = [];
    const appliedPaths: string[] = [];
    let applied = 0;
    let skipped = 0;

    for (const item of items) {
      if (dirtyPaths.has(item.path)) {
        skipped += 1;
        errors.push(`Save or close unsaved edits before normalizing: ${item.path}`);
        continue;
      }

      const conflict = frontmatterNormalizationConflict(item, currentFiles.get(item.path));
      if (conflict) {
        skipped += 1;
        errors.push(conflict);
        continue;
      }

      try {
        if (browserRoot) {
          await writeBrowserFile(browserRoot, item.path, item.nextContent);
        } else {
          const result = await invoke<WriteResult>("save_file", {
            path: `${index.rootPath}/${item.path}`,
            content: item.nextContent,
            expectedModifiedMs: item.modifiedMs ?? null,
          });
          if (!result.ok) {
            throw new Error(result.message ?? `Could not normalize ${item.path}.`);
          }
        }
        applied += 1;
        appliedPaths.push(item.path);
      } catch (error) {
        skipped += 1;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (applied > 0) {
      await refreshUniverse(appliedPaths[0]);
      showToast(`Normalized ${applied} note${applied === 1 ? "" : "s"}.`, "success");
    }

    if (errors.length > 0) {
      showToast(
        `Skipped ${skipped} note${skipped === 1 ? "" : "s"} during normalization.`,
        "warning",
      );
    }

    return { applied, skipped, errors };
  }

  function toggleBuiltinTheme() {
    setThemeById(toggledThemeMode(settings.theme));
  }

  function applyUniverse(
    readResult: VaultReadResult,
    preferredPath?: string,
    pathChange?: PathChangeSet,
  ) {
    const nextIndex = indexVault(readResult, {
      ignoreFolderNoteMetadata: settings.explorer.ignoreFolderNoteMetadata,
    });
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setErrorMessage("");
    setSettings((current) =>
      rememberUniverse(current, readResult.rootPath, profileForRecent(nextIndex)),
    );
    const hasEverendWorkspace =
      nextIndex.directories.includes(".everend") ||
      nextIndex.files.some((file) => file.relativePath.startsWith(".everend/"));
    const needsPropertiesOnboarding = !nextIndex.propertiesConfig && !hasEverendWorkspace;
    if (
      needsPropertiesOnboarding &&
      !propertiesOnboardingPromptedRef.current.has(readResult.rootPath)
    ) {
      propertiesOnboardingPromptedRef.current.add(readResult.rootPath);
      setSettingsInitialSection("overview");
      setShowSettings(true);
    }

    const workspacePlan = planUniverseWorkspaceState({
      nextIndex,
      readRootPath: readResult.rootPath,
      currentRootPath: index?.rootPath,
      tabs,
      activeTabPath,
      selectedPath,
      workspaceLayout,
      documentTabGroups,
      sessions: settings.sessions,
      persistTabs: settings.editor.persistTabs,
      preferredPath,
      pathChange,
    });

    setWorkspaceLayout(workspacePlan.layout);
    setDocumentTabGroups(workspacePlan.documentTabGroups);
    setActiveWorkspacePreset("custom");
    if (workspacePlan.tabs.length) {
      setTabs(workspacePlan.tabs);
      setActiveTabPath(workspacePlan.nextPath);
      setSelectedPath(workspacePlan.nextPath);
    } else if (workspacePlan.nextPath) {
      openDocument(nextIndex, workspacePlan.nextPath);
    } else {
      setSelectedPath(undefined);
      setActiveTabPath(undefined);
      setTabs([]);
    }
    return nextIndex;
  }

  async function readCurrentUniverse() {
    if (!index) return undefined;
    if (browserRoot) return readBrowserUniverse(browserRoot);
    return invoke<VaultReadResult>("index_vault", { path: index.rootPath });
  }

  async function refreshUniverse(preferredPath?: string, pathChange?: PathChangeSet) {
    const readResult = await readCurrentUniverse();
    if (!readResult) return undefined;
    return applyUniverse(readResult, preferredPath, pathChange);
  }

  async function reindexUniverseMetadata() {
    const readResult = await readCurrentUniverse();
    if (!readResult) return;
    const nextIndex = indexVault(readResult, {
      ignoreFolderNoteMetadata: settings.explorer.ignoreFolderNoteMetadata,
    });
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setSettings((current) =>
      rememberUniverse(current, readResult.rootPath, profileForRecent(nextIndex)),
    );
  }

  function openDocument(nextIndex: VaultIndex, path: string) {
    const file = nextIndex.files.find((candidate) => candidate.relativePath === path);
    if (!file) return;
    setSelectedPath(path);
    rememberRecentFile(path);
    setTabs((current) => {
      if (settings.editor.reuseOpenTabs && current.some((tab) => tab.path === path)) {
        return current;
      }
      return [...current, createOpenTabFromFile(file, settings.editor.defaultMode)];
    });
    setActiveTabPath(path);
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) => addDocumentToLayout(current, path, fileTitle(path)));
  }

  function activateTab(path: string) {
    setActiveTabPath(path);
    setSelectedPath(path);
    rememberRecentFile(path);
    setWorkspaceLayout((current) => activateDockTab(current, documentDockTabId(path)));
  }

  function openOrCreateTab(path: string, nextIndex = index) {
    if (!nextIndex) return;
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      activateTab(path);
      setSettings((current) => recordFileAccessInSettings(current, nextIndex.rootPath, path));
      return;
    }
    openDocument(nextIndex, path);
    setSettings((current) => recordFileAccessInSettings(current, nextIndex.rootPath, path));
  }

  const resolveWikilink = (label: string) => resolveWikilinkInIndex(index, label);

  async function createTemplate() {
    if (!index) return;
    const type = await promptUser("New template type", "Template type");
    if (!type) return;
    const templateType = slugify(type);
    if (!templateType) return;
    const relativePath = `.everend/templates/${templateType}.md`;
    const content = `---\nid: {{id}}\ntype: ${templateType}\nname: {{name}}\nstatus: {{status}}\ntags: []\naliases: []\n---\n\n# {{name}}\n`;
    try {
      if (browserRoot) {
        await writeBrowserFile(browserRoot, relativePath, content);
      } else {
        const result = await invoke<WriteResult>("save_file", {
          path: `${index.rootPath}/${relativePath}`,
          content,
          expectedModifiedMs: null,
        });
        if (!result.ok) throw new Error(result.message ?? "Could not create template.");
      }
      const nextIndex = await refreshUniverse(relativePath);
      selectPathAfterRefresh(relativePath, nextIndex);
      setTemplatesExpanded(true);
      showToast(`Created template: ${templateType}.`, "success");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function selectPath(path: string) {
    if (!index) return;
    setSelectedExplorerTarget({ path, kind: "file" });
    openOrCreateTab(path, index);
  }

  async function promptUser(
    title: string,
    placeholder: string = "Enter value",
    defaultValue: string = "",
  ): Promise<string | null> {
    return new Promise((resolve) => {
      setInputDialog({
        isOpen: true,
        title,
        placeholder,
        defaultValue,
        onConfirm: async (value: string) => {
          setInputDialog({ isOpen: false, title: "" });
          resolve(value);
        },
        onCancel: () => {
          setInputDialog({ isOpen: false, title: "" });
          resolve(null);
        },
      });
    });
  }

  function selectPathAfterRefresh(path: string, nextIndex = index) {
    if (!nextIndex) return;
    const file = nextIndex.files.find((f) => f.relativePath === path);
    if (!file) return;
    setSelectedExplorerTarget({ path, kind: "file" });
    openOrCreateTab(path, nextIndex);
  }

  function selectFolder(path: string) {
    setSelectedExplorerTarget({ path, kind: "folder" });
    setSelectedPath(path);
  }

  async function openUniverse() {
    setLoadState("loading");
    setErrorMessage("");
    try {
      if (isTauriRuntime()) {
        const path = await invoke<string | null>("open_vault_dialog");
        if (!path) {
          setLoadState(index ? "ready" : "idle");
          return;
        }
        setBrowserRoot(undefined);
        applyUniverse(await invoke<VaultReadResult>("index_vault", { path }));
        return;
      }

      const picked = await pickBrowserDirectory();
      if (picked.status === "cancelled") {
        setLoadState(index ? "ready" : "idle");
        return;
      }
      const root = picked.root;

      await ensureBrowserWritePermission(root);
      setBrowserRoot(root);
      const universeData = await readBrowserUniverse(root);
      applyUniverse(universeData);
    } catch (error) {
      console.error("[openUniverse] Error:", error);
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createUniverseFromHome() {
    setErrorMessage("");
    try {
      if (!isTauriRuntime()) {
        await openUniverse();
        return;
      }

      const parent = await invoke<string | null>("open_vault_dialog");
      if (!parent) {
        setLoadState(index ? "ready" : "idle");
        return;
      }

      const name = await promptUser("Create universe", "Universe folder name");
      if (!name?.trim()) {
        setLoadState(index ? "ready" : "idle");
        return;
      }

      setLoadState("loading");
      const result = await invoke<WriteResult>("create_universe", { vaultPath: parent, name });
      if (!result.ok) throw new Error(result.message ?? "Could not create universe.");
      setBrowserRoot(undefined);
      const createdUniverseName = pathName(result.path);
      applyUniverse(
        await invoke<VaultReadResult>("index_vault", { path: result.path }),
        `${createdUniverseName}.md`,
      );
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function openRecentUniverse(path = settings.recentUniverse) {
    if (!path || path.startsWith("browser:")) return;
    setLoadState("loading");
    try {
      setBrowserRoot(undefined);
      applyUniverse(await invoke<VaultReadResult>("index_vault", { path }));
      setMissingRecentPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    } catch (error) {
      setLoadState("error");
      setMissingRecentPaths((current) => new Set(current).add(path));
      setErrorMessage(
        `Recent universe was not found: ${path}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function updateRawMarkdownForPath(path: string, rawMarkdown: string) {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.path !== path) return tab;
        const nextRawMarkdown =
          tab.mode === "write" ? bodyToRawMarkdown(tab, rawMarkdown) : rawMarkdown;
        return {
          ...tab,
          rawMarkdown: nextRawMarkdown,
          dirty: nextRawMarkdown !== tab.savedMarkdown,
        };
      }),
    );
  }

  function setTabMode(path: string, mode: OpenTab["mode"]) {
    setTabs((current) =>
      current.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              mode: tab.path.toLowerCase().endsWith(".json") ? "source" : mode,
              sourceView:
                mode === "source"
                  ? (tab.sourceView ?? (tab.path.toLowerCase().endsWith(".json") ? "json" : "raw"))
                  : tab.sourceView,
            }
          : tab,
      ),
    );
  }

  function setTabSourceView(path: string, sourceView: NonNullable<OpenTab["sourceView"]>) {
    setTabs((current) =>
      current.map((tab) => (tab.path === path ? { ...tab, mode: "source", sourceView } : tab)),
    );
  }

  async function persistInspectorFrontmatter(path: string, content: string) {
    const tab = tabsRef.current.find((candidate) => candidate.path === path);
    if (!tab || tab.rawMarkdown !== content) return;

    try {
      if (browserRoot) {
        if (tab.modifiedMs) {
          const handle = await getBrowserFile(browserRoot, tab.path);
          const currentFile = await handle.getFile();
          if (currentFile.lastModified !== tab.modifiedMs) {
            throw new Error("File changed externally. Reload before saving metadata.");
          }
        }
        const modifiedMs = await writeBrowserFile(browserRoot, tab.path, content);
        setTabs((current) =>
          current.map((candidate) =>
            candidate.path === path && candidate.rawMarkdown === content
              ? { ...candidate, savedMarkdown: content, dirty: false, modifiedMs }
              : candidate,
          ),
        );
        return;
      }

      if (!tab.absolutePath) return;
      const result = await invoke<WriteResult>("save_file", {
        path: tab.absolutePath,
        content,
        expectedModifiedMs: tab.modifiedMs ?? null,
      });
      if (!result.ok) throw new Error(result.message ?? "Could not save metadata.");
      setTabs((current) =>
        current.map((candidate) =>
          candidate.path === path && candidate.rawMarkdown === content
            ? { ...candidate, savedMarkdown: content, dirty: false, modifiedMs: result.modifiedMs }
            : candidate,
        ),
      );
    } catch (error) {
      setTabs((current) =>
        current.map((candidate) =>
          candidate.path === path && candidate.rawMarkdown === content
            ? { ...candidate, dirty: true }
            : candidate,
        ),
      );
      showToast(error instanceof Error ? error.message : String(error), "error");
    }
  }

  function scheduleInspectorFrontmatterSave(path: string, content: string) {
    const existing = inspectorSaveTimersRef.current.get(path);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      inspectorSaveTimersRef.current.delete(path);
      void persistInspectorFrontmatter(path, content);
    }, 300);
    inspectorSaveTimersRef.current.set(path, timer);
  }

  function updateActiveFrontmatter(frontmatterRaw: string, options?: { persist?: boolean }) {
    if (!activeTabPath) return;
    let nextContent: string | undefined;
    setTabs((current) =>
      current.map((tab) => {
        if (tab.path !== activeTabPath) return tab;
        const parts = rawToEditorParts(tab.rawMarkdown);
        const nextRawMarkdown = joinMarkdown(frontmatterRaw, parts.bodyMarkdown);
        nextContent = nextRawMarkdown;
        return {
          ...tab,
          rawMarkdown: nextRawMarkdown,
          savedMarkdown: nextRawMarkdown,
          dirty: false,
        };
      }),
    );
    if (options?.persist && nextContent) {
      scheduleInspectorFrontmatterSave(activeTabPath, nextContent);
    }
  }

  function updateEntityMetadata(updates: Partial<Entity>) {
    if (!activeTabPath || !activeTab) return;

    const currentEntity = inspectorEntity;
    if (!currentEntity) return;

    const updatedEntity = { ...currentEntity, ...updates };
    const parts = rawToEditorParts(activeTab.rawMarkdown);
    if (!parts.frontmatterRaw) {
      updateActiveFrontmatter(entityToFrontmatterRaw(updatedEntity), { persist: true });
      return;
    }

    const frontmatterUpdates: Record<string, unknown> = {};
    if ("id" in updates) frontmatterUpdates.id = updatedEntity.id;
    if ("name" in updates) frontmatterUpdates.name = updatedEntity.name;
    if ("type" in updates) frontmatterUpdates.type = updatedEntity.type;
    if ("status" in updates) frontmatterUpdates.status = updatedEntity.status;
    if ("tags" in updates) frontmatterUpdates.tags = updatedEntity.tags;
    if ("aliases" in updates) frontmatterUpdates.aliases = updatedEntity.aliases;
    if ("parentId" in updates) frontmatterUpdates.parentId = updatedEntity.parentId || undefined;
    if ("childrenIds" in updates) frontmatterUpdates.childrenIds = updatedEntity.childrenIds;
    if ("customProperties" in updates) {
      Object.entries(updatedEntity.customProperties).forEach(([key, value]) => {
        if (key === "folder") return;
        frontmatterUpdates[key] = value;
      });
    }

    updateActiveFrontmatter(
      updateFrontmatterProperties(
        parts.frontmatterRaw,
        frontmatterUpdates,
        index?.propertiesConfig,
        updatedEntity.type,
      ),
      { persist: true },
    );
  }

  function addFrontmatterToActiveTab() {
    if (!activeTabPath || !activeTab) return;

    let frontmatterRaw: string;
    if (inspectorEntity) {
      // If we have an indexed entity, use its metadata
      frontmatterRaw = entityToFrontmatterRaw(inspectorEntity);
    } else {
      // If no entity (note without frontmatter), generate basic frontmatter
      const fileName = activeTab.path.split("/").pop()?.replace(/\.md$/, "") || "untitled";
      const slug = slugify(fileName);
      frontmatterRaw = createEntityFrontmatter({
        id: slug,
        type: "concept",
        name: fileName,
        propertiesConfig: index?.propertiesConfig,
      });
    }
    updateActiveFrontmatter(frontmatterRaw, { persist: true });
  }

  async function saveEditor() {
    if (!activeTabPath) return;
    await saveTab(activeTabPath);
  }

  async function saveTab(path: string) {
    const tabToSave = tabs.find((tab) => tab.path === path);
    if (!tabToSave) return;
    if (!tabToSave.dirty) return;
    setErrorMessage("");
    try {
      if (browserRoot) {
        if (tabToSave.modifiedMs) {
          const handle = await getBrowserFile(browserRoot, tabToSave.path);
          const currentFile = await handle.getFile();
          if (currentFile.lastModified !== tabToSave.modifiedMs) {
            showToast("File changed externally. Reload before saving.", "error");
            return;
          }
        }
        const modifiedMs = await writeBrowserFile(
          browserRoot,
          tabToSave.path,
          tabToSave.rawMarkdown,
        );
        setTabs((current) => markSavedTabInList(current, tabToSave.path, modifiedMs));
        showToast("Saved.", "success");
        await reindexUniverseMetadata();
        return;
      }

      const result = await invoke<WriteResult>("save_file", saveFilePayloadForTab(tabToSave));
      if (!result.ok) {
        showToast(result.message ?? "Save failed.", "error");
        return;
      }
      setTabs((current) => markSavedTabInList(current, tabToSave.path, result.modifiedMs));
      showToast("Saved.", "success");
      await reindexUniverseMetadata();
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function replaceSelection(before: string, after = before, placeholder = "text") {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const insertion = wrapSelectionText(selected, before, after, placeholder);
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertion.text },
      selection: {
        anchor: selection.from + insertion.anchorOffset,
        head: selection.from + (insertion.headOffset ?? insertion.anchorOffset),
      },
    });
    view.focus();
  }

  function applyFontFamily(fontFamily: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const insertion = fontFamilyInsertion(
      view.state.sliceDoc(selection.from, selection.to),
      fontFamily,
    );
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertion.text },
      selection: {
        anchor: selection.from + insertion.anchorOffset,
        head: selection.from + (insertion.headOffset ?? insertion.anchorOffset),
      },
    });
    view.focus();
  }

  function insertWikilinkAtSelection() {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const insertion = wikilinkInsertion(view.state.sliceDoc(selection.from, selection.to));
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertion.text },
      selection: {
        anchor: selection.from + insertion.anchorOffset,
        head: selection.from + (insertion.headOffset ?? insertion.anchorOffset),
      },
    });
    view.focus();
  }

  function insertFootnoteAtSelection() {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const fullText = view.state.doc.toString();
    const insertion = footnoteInsertion(fullText);

    // Extract footnote number from insertion text: "[^1]" -> "1"
    const footnoteMatch = insertion.text.match(/\[\^(\d+)\]/);
    const footnoteNum = footnoteMatch ? footnoteMatch[1] : "1";

    // Add the footnote definition at the end of the document
    const docLength = view.state.doc.length;
    const footnoteDefinition = `\n\n[^${footnoteNum}]: `;

    view.dispatch({
      changes: [
        { from: selection.from, to: selection.to, insert: insertion.text },
        { from: docLength, to: docLength, insert: footnoteDefinition },
      ],
      selection: {
        anchor: docLength + footnoteDefinition.length,
        head: docLength + footnoteDefinition.length,
      },
    });
    view.focus();
  }

  async function insertMarkdownLinkAtSelection() {
    const view = editorViewRef.current;
    if (!view) return;
    const url = await promptUser("Insert link", "https://example.com", "https://");
    if (!url?.trim()) return;
    const selection = view.state.selection.main;
    const insertion = markdownLinkInsertion(view.state.sliceDoc(selection.from, selection.to), url);
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertion.text },
      selection: {
        anchor: selection.from + insertion.anchorOffset,
        head: selection.from + (insertion.headOffset ?? insertion.anchorOffset),
      },
    });
    view.focus();
  }

  async function openUrl(url: string) {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      if (isTauriRuntime()) {
        await openExternalUrl(normalized);
      } else {
        window.open(normalized, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Could not open ${normalized}`, "error");
    }
  }

  function replaceCurrentLines(transform: (line: string, index: number) => string) {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const startLine = view.state.doc.lineAt(selection.from);
    const endLine = view.state.doc.lineAt(selection.to);
    const selectedLines = view.state.doc.sliceString(startLine.from, endLine.to).split("\n");
    const replacement = selectedLines.map(transform).join("\n");
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert: replacement },
      selection: { anchor: startLine.from, head: startLine.from + replacement.length },
    });
    view.focus();
  }

  function applyHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    replaceCurrentLines((line) => headingLine(line, level));
  }

  function applyList(kind: "bullet" | "ordered" | "task") {
    replaceCurrentLines((line, index) => listLine(line, index, kind));
  }

  function insertAtCursor(markdown: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: markdown },
      selection: { anchor: selection.from + markdown.length },
    });
    view.focus();
  }

  async function scrollEditorTo(pos: number) {
    const view = editorViewRef.current;
    if (!view) return;
    const { EditorView } = await import("@codemirror/view");
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    view.focus();
  }

  // Helper to actually close a tab without confirmation
  function doCloseTab(path: string) {
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) => closeDockLayoutTab(current, documentDockTabId(path)));
    setDocumentTabGroups((current) => removeTabFromGroups(current, path));
    setTabs((current) => {
      const result = closeOpenTab(current, activeTabPath, path);
      if (result.activePath !== activeTabPath) {
        setActiveTabPath(result.activePath);
        setSelectedPath(result.activePath);
        setFloatingToolbarRect(undefined);
      }
      return result.tabs;
    });
  }

  async function closeTab(path = activeTabPath) {
    if (!path) return;
    const target = tabs.find((tab) => tab.path === path);
    if (!target) return;
    if (target.dirty && settings.editor.confirmCloseDirtyTab) {
      setUnsavedDialogPath(path);
      return;
    }

    doCloseTab(path);
  }

  function handleUnsavedDialogDiscard() {
    if (!unsavedDialogPath) return;
    doCloseTab(unsavedDialogPath);
    setPendingClosePaths((current) => {
      const next = advancePendingCloseQueue(current);
      setUnsavedDialogPath(next.unsavedDialogPath);
      return next.pendingClosePaths;
    });
  }

  async function handleUnsavedDialogSave() {
    if (!unsavedDialogPath) return;
    setIsSavingBeforeClose(true);
    try {
      // Activate the tab temporarily to save it
      setActiveTabPath(unsavedDialogPath);
      // Give a moment for state to update
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The saveEditor function uses activeTab, so we need to ensure it's set
      const tabToSave = tabs.find((tab) => tab.path === unsavedDialogPath);
      if (tabToSave && tabToSave.absolutePath) {
        const result = await invoke<WriteResult>("save_file", saveFilePayloadForTab(tabToSave));
        if (result.ok) {
          setTabs((current) => markSavedTabInList(current, unsavedDialogPath, result.modifiedMs));
        }
      }
      doCloseTab(unsavedDialogPath);
      setPendingClosePaths((current) => {
        const next = advancePendingCloseQueue(current);
        setUnsavedDialogPath(next.unsavedDialogPath);
        return next.pendingClosePaths;
      });
    } catch (error) {
      console.error("Error saving file:", error);
      showToast("Save failed.", "error");
    } finally {
      setIsSavingBeforeClose(false);
    }
  }

  function handleUnsavedDialogCancel() {
    // Cancel entire sequence
    setUnsavedDialogPath(null);
    setPendingClosePaths([]);
  }

  async function closeAllTabs() {
    if (tabs.length === 0) return;

    // Get all dirty tabs
    const dirtyPaths = getDirtyTabPaths(tabs, settings.editor.confirmCloseDirtyTab);

    if (dirtyPaths.length > 0) {
      const queue = pendingCloseQueueFromDirtyPaths(dirtyPaths);
      setPendingClosePaths(queue.pendingClosePaths);
      setUnsavedDialogPath(queue.unsavedDialogPath);
      return;
    }

    // No dirty tabs, close all
    setTabs([]);
    setActiveTabPath(undefined);
    setSelectedPath(undefined);
    setTabContextMenu(null);
  }

  async function closeOtherTabs(path: string) {
    const tabsToClose = tabs.filter((tab) => tab.path !== path);

    // Get dirty tabs that need confirmation
    const dirtyPaths = getDirtyTabPaths(tabsToClose, settings.editor.confirmCloseDirtyTab);

    if (dirtyPaths.length > 0) {
      const queue = pendingCloseQueueFromDirtyPaths(dirtyPaths);
      setPendingClosePaths(queue.pendingClosePaths);
      setUnsavedDialogPath(queue.unsavedDialogPath);
      return;
    }

    // Close all non-dirty tabs
    setTabs((current) => closeOtherOpenTabs(current, path));
    activateTab(path);
    setTabContextMenu(null);
  }

  async function closeTabsToRight(path: string) {
    const indexOfTab = tabs.findIndex((tab) => tab.path === path);
    if (indexOfTab === -1) return;
    const rightTabs = tabs.slice(indexOfTab + 1);

    // Get dirty tabs that need confirmation
    const dirtyPaths = getDirtyTabPaths(rightTabs, settings.editor.confirmCloseDirtyTab);

    if (dirtyPaths.length > 0) {
      const queue = pendingCloseQueueFromDirtyPaths(dirtyPaths);
      setPendingClosePaths(queue.pendingClosePaths);
      setUnsavedDialogPath(queue.unsavedDialogPath);
      return;
    }

    // Close all clean tabs to the right
    setTabs((current) => closeTabsToRightOf(current, path));
    setTabContextMenu(null);
  }

  function closeSavedTabs() {
    setTabs((current) => {
      const result = closeSavedOpenTabs(current, activeTabPath);
      if (result.activePath !== activeTabPath) {
        setActiveTabPath(result.activePath);
        setSelectedPath(result.activePath);
      }
      return result.tabs;
    });
    setTabContextMenu(null);
  }

  function reorderedTabsForDocumentMove(current: OpenTab[], input: DocumentTabMoveInput) {
    const movingTab = current.find((tab) => tab.path === input.path);
    if (!movingTab) return current;
    const remaining = current.filter((tab) => tab.path !== input.path);
    const targetIndex = input.targetPath
      ? remaining.findIndex((tab) => tab.path === input.targetPath)
      : remaining.length;
    const insertIndex = targetIndex === -1 ? remaining.length : targetIndex;
    return [...remaining.slice(0, insertIndex), movingTab, ...remaining.slice(insertIndex)];
  }

  function moveDocumentTab(input: DocumentTabMoveInput) {
    setActiveWorkspacePreset("custom");
    setTabs((current) => {
      const nextTabs = reorderedTabsForDocumentMove(current, input);
      setDocumentTabGroups((currentGroups) =>
        normalizeDocumentTabGroups(moveDocumentTabInGroups(currentGroups, input), nextTabs),
      );
      return nextTabs;
    });
    setWorkspaceLayout((current) =>
      moveDockTab(current, {
        tabId: documentDockTabId(input.path),
        sourceGroupId: "dock-documents",
        targetGroupId: "dock-documents",
        position: "center",
        targetTabId: input.targetPath ? documentDockTabId(input.targetPath) : undefined,
      }),
    );
  }

  function createDocumentGroup(path: string) {
    setDocumentTabGroups((current) =>
      normalizeDocumentTabGroups(
        [...removeTabFromGroups(current, path), createGroupFromTab(path, current)],
        tabs,
      ),
    );
    setTabContextMenu(null);
  }

  function addTabToDocumentGroup(path: string, groupId: string) {
    moveDocumentTab({ path, targetGroupId: groupId });
    setTabContextMenu(null);
  }

  function removeTabFromDocumentGroup(path: string) {
    setDocumentTabGroups((current) => removeTabFromGroups(current, path));
    setTabContextMenu(null);
  }

  async function renameDocumentGroup(groupId: string) {
    const group = documentTabGroups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const name = await promptUser("Rename tab group", "Group name", group.name);
    if (!name) return;
    setDocumentTabGroups((current) => renameDocumentTabGroup(current, groupId, name));
    setDocumentGroupContextMenu(null);
  }

  function cycleDocumentGroupColor(groupId: string) {
    const group = documentTabGroups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const colorIndex = DOCUMENT_TAB_GROUP_COLORS.indexOf(
      group.color as (typeof DOCUMENT_TAB_GROUP_COLORS)[number],
    );
    const nextColor =
      DOCUMENT_TAB_GROUP_COLORS[(colorIndex + 1) % DOCUMENT_TAB_GROUP_COLORS.length];
    setDocumentTabGroups((current) => setDocumentTabGroupColor(current, groupId, nextColor));
    setDocumentGroupContextMenu(null);
  }

  function toggleDocumentGroup(groupId: string) {
    setDocumentTabGroups((current) => toggleDocumentTabGroupCollapsed(current, groupId));
    setDocumentGroupContextMenu(null);
  }

  function ungroupDocumentGroup(groupId: string) {
    setDocumentTabGroups((current) => ungroupDocumentTabGroup(current, groupId));
    setDocumentGroupContextMenu(null);
  }

  function closeDocumentGroupTabs(groupId: string) {
    const group = documentTabGroups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const pathSet = new Set(group.tabPaths);
    const tabsToClose = tabs.filter((tab) => pathSet.has(tab.path));
    const dirtyPaths = getDirtyTabPaths(tabsToClose, settings.editor.confirmCloseDirtyTab);
    if (dirtyPaths.length > 0) {
      const queue = pendingCloseQueueFromDirtyPaths(dirtyPaths);
      setPendingClosePaths(queue.pendingClosePaths);
      setUnsavedDialogPath(queue.unsavedDialogPath);
      setDocumentGroupContextMenu(null);
      return;
    }
    setTabs((current) => current.filter((tab) => !pathSet.has(tab.path)));
    setDocumentTabGroups((current) => current.filter((candidate) => candidate.id !== groupId));
    if (activeTabPath && pathSet.has(activeTabPath)) {
      const next = tabs.find((tab) => !pathSet.has(tab.path));
      setActiveTabPath(next?.path);
      setSelectedPath(next?.path);
    }
    setDocumentGroupContextMenu(null);
  }

  function activateAdjacentTab(direction: 1 | -1) {
    const nextPath = nextAdjacentTabPath(tabs, activeTabPath, direction);
    if (!nextPath) return;
    setActiveTabPath(nextPath);
    setSelectedPath(nextPath);
  }

  async function createNoteFromTabButton() {
    if (!index) return;
    const name = await promptUser("New note", "Note name");
    if (!name) return;
    const folderPath = getActiveCreationFolder(selectedExplorerTarget, selectedPath);
    const slug = slugify(name);
    const relativePath = folderPath ? `${folderPath}/${slug}.md` : `${slug}.md`;
    const content = `${contentFromTemplate(index, "concept", name)}\n`;

    try {
      if (browserRoot) {
        await writeBrowserFile(browserRoot, relativePath, content);
      } else {
        const result = await invoke<WriteResult>("save_file", {
          path: `${index.rootPath}/${relativePath}`,
          content,
          expectedModifiedMs: null,
        });
        if (!result.ok) throw new Error(result.message ?? "Could not create note.");
      }
      const nextIndex = await refreshUniverse(relativePath);
      selectPathAfterRefresh(relativePath, nextIndex);
      showToast(`Created ${name}.`, "success");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function executeCommand(commandId: EditorCommandId) {
    const action = editorCommandAction(commandId);
    switch (action.type) {
      case "save":
        await saveEditor();
        break;
      case "search":
        if (editorViewRef.current) {
          const { openSearchPanel } = await import("@codemirror/search");
          openSearchPanel(editorViewRef.current);
        }
        break;
      case "find":
        if (editorViewRef.current) {
          const { findNext, findPrevious } = await import("@codemirror/search");
          const command = action.direction === 1 ? findNext : findPrevious;
          command(editorViewRef.current);
        }
        break;
      case "wrapSelection":
        replaceSelection(action.before, action.after, action.placeholder);
        break;
      case "heading":
        applyHeading(action.level);
        break;
      case "blockquote":
        replaceCurrentLines((line) => `> ${line.replace(/^>\s?/, "")}`);
        break;
      case "list":
        applyList(action.kind);
        break;
      case "markdownLink":
        await insertMarkdownLinkAtSelection();
        break;
      case "wikilink":
        insertWikilinkAtSelection();
        break;
      case "footnote":
        insertFootnoteAtSelection();
        break;
      case "insert":
        insertAtCursor(action.markdown);
        break;
      case "foldBlock":
        if (editorViewRef.current) {
          const { foldCode } = await import("@codemirror/language");
          foldCode(editorViewRef.current);
        }
        break;
      case "openPanel":
        if (action.panel === "commandPalette") setShowCommandPalette(true);
        if (action.panel === "quickSwitcher") setShowQuickSwitcher(true);
        break;
      case "toggleOutline":
        setSettings((current) => ({
          ...current,
          editor: {
            ...current.editor,
            outlineGuideEnabled: !current.editor.outlineGuideEnabled,
          },
        }));
        break;
      case "collapseExplorerFolders":
        setExpandedPaths(new Set());
        break;
      case "switchMode":
        if (activeTabPath) {
          setTabs((current) =>
            current.map((tab) =>
              tab.path === activeTabPath
                ? { ...tab, mode: tab.mode === "write" ? "source" : "write" }
                : tab,
            ),
          );
        }
        break;
      case "closeTab":
        await closeTab();
        break;
      case "activateAdjacentTab":
        activateAdjacentTab(action.direction);
        break;
      case "paragraphSpacing":
        // Visual spacing only - no actual content modification
        // The spacing is handled through editor visual separation
        break;
    }
  }

  async function handleNativeMenuCommand(commandId: string) {
    if (commandId.startsWith("wn:window:style:")) {
      setThemeById(themeForStyleCommand(commandId.replace("wn:window:style:", ""), settings.theme));
      return;
    }

    const editorCommand = nativeMenuEditorCommand(commandId);
    if (editorCommand) {
      await executeCommand(editorCommand);
      return;
    }

    switch (commandId) {
      case "wn:file:new-note":
        if (!index) {
          showToast("Open a universe before creating notes.", "warning");
          return;
        }
        await createNoteFromTabButton();
        break;
      case "wn:file:new-folder":
        if (!index) {
          showToast("Open a universe before creating folders.", "warning");
          return;
        }
        await handleContextMenuAction("newFolder", "", "empty");
        break;
      case "wn:file:open-universe":
        await openUniverse();
        break;
      case "wn:file:open-recent":
        if (!settings.recentUniverse) {
          showToast("No recent universe yet.", "warning");
          return;
        }
        await openRecentUniverse();
        break;
      case "wn:file:reveal-universe":
      case "wn:help:open-project-folder":
        if (!index) {
          showToast("Open a universe first.", "warning");
          return;
        }
        await revealExplorerPath();
        break;
      case "wn:view:toggle-sidebar":
        setActiveWorkspacePreset("custom");
        setWorkspaceLayout((current) => togglePanelInLayout(current, "explorer"));
        break;
      case "wn:view:toggle-inspector":
        setActiveWorkspacePreset("custom");
        setWorkspaceLayout((current) => togglePanelInLayout(current, "inspector"));
        break;
      case "wn:view:toggle-light-dark":
        toggleBuiltinTheme();
        break;
      case "wn:view:reload":
        window.location.reload();
        break;
      case "wn:view:zoom-in":
        setAppZoom((current) => Math.min(1.4, Number((current + 0.1).toFixed(2))));
        break;
      case "wn:view:zoom-out":
        setAppZoom((current) => Math.max(0.8, Number((current - 0.1).toFixed(2))));
        break;
      case "wn:view:zoom-reset":
        setAppZoom(1);
        break;
      case "wn:help:about":
        showToast("WorldNotion v0.1");
        break;
      case "wn:help:docs":
        showToast("Documentation is coming soon.");
        break;
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (showSettings) return;
      const binding = settings.keybindings.find((candidate) =>
        shortcutMatches(event, candidate.shortcut),
      );
      if (!binding) return;
      event.preventDefault();
      void executeCommand(binding.commandId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabPath, settings.keybindings, showSettings, tabs]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<string>("worldnotion-menu", (event) => {
      void handleNativeMenuCommand(event.payload);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    activeTabPath,
    activeTab?.path,
    index?.rootPath,
    settings.recentUniverse,
    settings.theme,
    tabs,
  ]);

  const currentSession = index?.rootPath ? settings.sessions[index.rootPath] : undefined;

  const inputOverlays = (
    <>
      <InputDialog
        isOpen={inputDialog.isOpen}
        title={inputDialog.title}
        placeholder={inputDialog.placeholder}
        defaultValue={inputDialog.defaultValue}
        onConfirm={inputDialog.onConfirm || (async () => {})}
        onCancel={
          inputDialog.onCancel ??
          (() => {
            setInputDialog({ isOpen: false, title: "" });
          })
        }
      />

      <UnsavedChangesDialog
        isOpen={unsavedDialogPath !== null}
        fileName={unsavedDialogPath ? fileTitle(unsavedDialogPath) : ""}
        onDiscard={handleUnsavedDialogDiscard}
        onSave={handleUnsavedDialogSave}
        onCancel={handleUnsavedDialogCancel}
        isSaving={isSavingBeforeClose}
      />
    </>
  );

  if (view === "home" || !index) {
    return (
      <>
        <main className="home-shell">
          <header className="home-topbar">
            <div className="brand">
              <BookOpen size={22} />
              <div>
                <h1>WorldNotion</h1>
                <p>Universe-first Markdown workspace</p>
              </div>
            </div>
            <button type="button" onClick={toggleBuiltinTheme} title="Toggle theme">
              {isDarkTheme(settings.theme) ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </header>

          <section className="home-panel">
            <div className="home-hero">
              <div className="home-copy">
                <p className="eyebrow">Home</p>
                <h2>Choose a universe</h2>
                <p>
                  Open any local folder as a universe. Markdown stays readable, `.everend` keeps the
                  portable metadata, and WorldNotion remembers where you were working.
                </p>
              </div>

              {index ? (
                <button
                  type="button"
                  className="active-universe-card"
                  onClick={() => setView("workspace")}
                >
                  <UniverseIconFrame profile={index.universeProfile} size={48} />
                  <span>
                    <strong>{universeDisplayName(index)}</strong>
                    <small>{pathName(index.rootPath)}</small>
                  </span>
                  <FileText size={16} />
                </button>
              ) : null}
            </div>

            <div className="home-actions">
              <button type="button" className="primary-action" onClick={openUniverse}>
                <FolderOpen size={16} />
                Open Universe
              </button>
              <button type="button" onClick={createUniverseFromHome}>
                <Plus size={16} />
                Create Universe
              </button>
              {settings.recentUniverse && !settings.recentUniverse.startsWith("browser:") ? (
                <button type="button" onClick={() => openRecentUniverse()}>
                  <Home size={16} />
                  Open Recent
                </button>
              ) : null}
            </div>

            <div className="home-metrics">
              <div>
                <strong>
                  {settings.recentUniverses.filter((path) => !path.startsWith("browser:")).length}
                </strong>
                <span>Recent</span>
              </div>
              <div>
                <strong>{index?.entities.length ?? 0}</strong>
                <span>Loaded entities</span>
              </div>
              <div>
                <strong>{index?.templates.length ?? 0}</strong>
                <span>Templates</span>
              </div>
            </div>

            {loadState === "error" ? <div className="error-banner">{errorMessage}</div> : null}
            {loadState === "loading" ? (
              <div className="loading-banner">Loading universe...</div>
            ) : null}

            {settings.recentUniverses.filter((path) => !path.startsWith("browser:")).length ? (
              <section className="recent-section">
                <h3>Recent universes</h3>
                <div className="recent-list">
                  {settings.recentUniverses
                    .filter((path) => !path.startsWith("browser:"))
                    .map((path, itemIndex) => {
                      const recentProfile = settings.recentUniverseProfiles[path];
                      const missing = missingRecentPaths.has(path);
                      return (
                        <button
                          key={path}
                          type="button"
                          className={missing ? "missing" : ""}
                          style={{ animationDelay: `${120 + itemIndex * 45}ms` }}
                          onClick={() => openRecentUniverse(path)}
                          onContextMenu={(event) => handleRecentContextMenu(event, path)}
                        >
                          <UniverseIconFrame profile={recentProfile} size={34} />
                          <span>
                            <strong>{recentProfile?.name ?? pathName(path)}</strong>
                            <small>{missing ? "Missing folder" : path}</small>
                          </span>
                          {missing ? <AlertTriangle size={15} /> : <ChevronRight size={14} />}
                        </button>
                      );
                    })}
                </div>
              </section>
            ) : null}
          </section>
        </main>
        {recentContextMenu ? (
          <div
            className="context-menu recent-context-menu"
            style={{ left: `${recentContextMenu.x}px`, top: `${recentContextMenu.y}px` }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                const path = recentContextMenu.path;
                setRecentContextMenu(null);
                void openRecentUniverse(path);
              }}
            >
              <FolderOpen size={16} />
              <span>Open</span>
            </button>
            <button
              type="button"
              className="context-menu-item danger"
              onClick={() => removeRecentUniverse(recentContextMenu.path)}
            >
              <X size={16} />
              <span>Remove from Dashboard</span>
            </button>
          </div>
        ) : null}
        {inputOverlays}
      </>
    );
  }

  const explorerPanel = (
    <ExplorerPanel
      index={index}
      query={query}
      onQueryChange={setQuery}
      activeSection={activeExplorerSection}
      onSectionChange={(section) => updateExplorer({ activeSection: section })}
      focusedFolderPath={focusedFolderPath}
      focusBreadcrumb={explorerFocusBreadcrumb}
      onSetFocusedFolder={setFocusedFolder}
      visibleRows={visibleExplorerRows}
      selectedPath={selectedPath}
      openTabPaths={openTabPaths}
      dirtyTabPaths={dirtyTabPaths}
      favoritePaths={favoritePaths}
      favoriteItems={favoriteItems}
      ecosystemGroups={ecosystemGroups}
      entityTagColors={entityTagColors}
      folderNotesEnabled={!settings.explorer.ignoreFolderNoteMetadata}
      customIcons={settings.explorer.customIcons}
      pointerDragActive={Boolean(pointerDragItem?.active)}
      templatesExpanded={templatesExpanded}
      onToggleTemplatesExpanded={() => setTemplatesExpanded((expanded) => !expanded)}
      onCreateTemplate={createTemplate}
      onSelectPath={selectPath}
      onSelectFolder={selectFolder}
      onToggleExpand={toggleExpand}
      onTreeAction={handleExplorerTreeAction}
      onContextMenu={handleContextMenu}
      onToggleFavorite={toggleFavorite}
      onToggleFolderFocus={toggleFolderFocus}
      onOpenFolderDescription={(folderPath, descriptionPath) => {
        if (descriptionPath) {
          selectPath(descriptionPath);
        } else {
          void createFolderDescription(folderPath);
        }
      }}
      onDragMove={moveExplorerPath}
      onPointerDragStart={(path, kind, startX, startY) =>
        setPointerDragItem({ path, kind, startX, startY, active: false })
      }
      isPointerClickSuppressed={() => suppressTreeClickRef.current}
    />
  );

  function renderDocumentPanel(tabRef: DockTabRef) {
    const documentTab = tabRef.path ? tabs.find((tab) => tab.path === tabRef.path) : undefined;
    if (!documentTab) {
      return (
        <section className="empty-editor">
          <FileText size={42} />
          <h2>Document is not open</h2>
          <button type="button" onClick={() => tabRef.path && openOrCreateTab(tabRef.path)}>
            <Plus size={15} />
            Reopen
          </button>
        </section>
      );
    }

    const documentOutline = outlineForTab(documentTab);
    const documentCurrentHeader =
      documentTab.path === activeTabPath ? currentHeaderForLine(documentTab, cursorLine) : null;
    const isJsonDocument = documentTab.path.toLowerCase().endsWith(".json");
    const sourceView = documentTab.sourceView ?? (isJsonDocument ? "json" : "raw");

    return (
      <section
        className="editor-shell dock-panel-body"
        ref={documentTab.path === activeTabPath ? editorShellRef : undefined}
        onMouseDownCapture={() => {
          if (documentTab.path !== activeTabPath) activateTab(documentTab.path);
        }}
      >
        <div className="floating-control-panel">
          <div className="mode-toggle" aria-label="Editor mode">
            <button
              type="button"
              className={documentTab.mode === "write" ? "active" : ""}
              onClick={() => setTabMode(documentTab.path, "write")}
              disabled={!documentTab || isJsonDocument}
            >
              Write
            </button>
            <button
              type="button"
              className={documentTab.mode === "source" ? "active" : ""}
              onClick={() => setTabMode(documentTab.path, "source")}
              disabled={!documentTab}
            >
              Source
            </button>
          </div>
          {documentTab.mode === "source" ? (
            <div className="source-view-toggle" aria-label="Source view">
              <button
                type="button"
                className={sourceView === "raw" ? "active" : ""}
                onClick={() => setTabSourceView(documentTab.path, "raw")}
              >
                Raw
              </button>
              <button
                type="button"
                className={sourceView === "json" ? "active" : ""}
                onClick={() => setTabSourceView(documentTab.path, "json")}
              >
                JSON
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => saveTab(documentTab.path)}
            disabled={!canWrite}
            title="Save"
          >
            <Save size={15} />
          </button>
        </div>

        {documentTab.mode === "write" &&
        documentTab.path === activeTabPath &&
        settings.editor.floatingToolbarEnabled ? (
          <div className="floating-format-toolbar-fixed">
            <FontSelector availableFonts={fonts} onSelectFont={applyFontFamily} />
            {FLOATING_FORMAT_COMMANDS.map((command) => (
              <button
                key={command.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => executeCommand(command.id)}
              >
                {command.label}
              </button>
            ))}
            <details className="floating-format-group">
              <summary>H</summary>
              <div>
                {FLOATING_HEADING_COMMANDS.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => executeCommand(command.id)}
                  >
                    {command.label}
                  </button>
                ))}
              </div>
            </details>
          </div>
        ) : null}

        {floatingToolbarRect &&
        documentTab.mode === "write" &&
        documentTab.path === activeTabPath ? (
          <div
            className="floating-format-toolbar-selection"
            style={(() => {
              const shellRect = editorShellRef.current?.getBoundingClientRect();
              const shellLeft = shellRect?.left ?? 0;
              const shellTop = shellRect?.top ?? 0;
              return {
                left: Math.max(12, floatingToolbarRect.left - shellLeft),
                top: Math.max(36, floatingToolbarRect.top - shellTop - 44),
              };
            })()}
          >
            {FLOATING_SELECTION_COMMANDS.map((command) => (
              <button
                key={command.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => executeCommand(command.id)}
              >
                {command.label}
              </button>
            ))}
            <details className="floating-format-group">
              <summary>H</summary>
              <div>
                {FLOATING_HEADING_COMMANDS.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => executeCommand(command.id)}
                  >
                    {command.label}
                  </button>
                ))}
              </div>
            </details>
          </div>
        ) : null}

        {loadState === "error" ? <div className="error-banner">{errorMessage}</div> : null}
        {loadState === "loading" ? <div className="loading-banner">Loading universe...</div> : null}
        <div
          className={`editor-surface page-style-${settings.editor.pageStyle} mode-${documentTab.mode}${
            settings.editor.showPaperShadow && documentTab.mode === "write" ? " paper-shadow" : ""
          }`}
          style={
            settings.editor.pageStyle === "custom"
              ? ({ "--wn-custom-page": settings.editor.customPageColor } as CSSProperties)
              : undefined
          }
        >
          {documentTab.mode === "source" && sourceView === "json" ? (
            <JsonReader value={documentTab.rawMarkdown} />
          ) : (
            <Suspense fallback={<LazyPanelFallback label="Loading editor..." />}>
              <CodeMirrorEditor
                value={editorDisplayValue(documentTab)}
                onChange={(value) => updateRawMarkdownForPath(documentTab.path, value)}
                theme={settings.theme}
                mode={documentTab.mode}
                settings={settings.editor}
                pluginSettings={settings.plugins}
                documentName={documentTab.title}
                projectName={
                  index?.universeProfile?.name ??
                  (index?.rootPath ? pathName(index.rootPath) : undefined)
                }
                readOnly={!canWrite}
                resolveWikilink={resolveWikilink}
                noteSuggestions={noteSuggestions}
                onOpenWikilink={(targetPath) => openOrCreateTab(targetPath)}
                onMissingWikilink={(label) => showToast(`Missing wikilink: ${label}`, "warning")}
                onOpenUrl={(url) => {
                  void openUrl(url);
                }}
                onRequestUrl={() => promptUser("Insert link", "https://example.com", "https://")}
                onCursorMove={() => {
                  if (documentTab.path !== activeTabPath) return;
                  if (editorViewRef.current) {
                    const pos = editorViewRef.current.state.selection.main.head;
                    const line = editorViewRef.current.state.doc.lineAt(pos);
                    setCursorLine(line.number - 1);
                  }
                }}
                onSelectionChange={(rect) => {
                  if (documentTab.path === activeTabPath) setFloatingToolbarRect(rect);
                }}
                onEditorReady={(view) => {
                  if (documentTab.path === activeTabPath) editorViewRef.current = view;
                }}
              />
            </Suspense>
          )}

          {settings.editor.outlineGuideEnabled ? (
            <OutlineGuide
              outline={documentOutline}
              currentHeader={documentCurrentHeader}
              position={settings.editor.outlinePosition}
              onNavigate={(line) => {
                if (editorViewRef.current) {
                  const pos = editorViewRef.current.state.doc.line(line + 1).from;
                  void scrollEditorTo(pos);
                  setCursorLine(line);
                }
              }}
            />
          ) : null}
        </div>
      </section>
    );
  }

  const emptyDocumentPanel = (
    <section className="empty-editor dock-panel-body">
      <FileText size={42} />
      {selectedExplorerTarget?.kind === "folder" ? (
        <>
          <h2>Folder: {pathName(selectedExplorerTarget.path) || "Root"}</h2>
          <p>View or create a note to describe this folder's contents.</p>
          {(() => {
            const { descriptionPath, hasDescription } = folderDescriptionInfo(
              index,
              selectedExplorerTarget.path,
            );
            return hasDescription ? (
              <button type="button" onClick={() => selectPath(descriptionPath)}>
                <FileEdit size={15} />
                Edit folder note
              </button>
            ) : (
              <button
                type="button"
                onClick={() => createFolderDescription(selectedExplorerTarget.path)}
              >
                <Plus size={15} />
                Create folder note
              </button>
            );
          })()}
        </>
      ) : (
        <>
          <h2>No document selected</h2>
          <p>Select a file from the explorer or start a new note.</p>
          <button type="button" onClick={createNoteFromTabButton}>
            <Plus size={15} />
            New note
          </button>
        </>
      )}
    </section>
  );

  const inspectorPanel = (
    <InspectorPanel
      entity={inspectorEntity}
      template={inspectorTemplate}
      index={index}
      activeTab={activeTab}
      onChangeFrontmatter={(frontmatterRaw) =>
        updateActiveFrontmatter(frontmatterRaw, { persist: true })
      }
      onUpdateEntity={updateEntityMetadata}
      onAddFrontmatter={addFrontmatterToActiveTab}
      onUpdatePropertiesConfig={savePropertiesConfig}
      onApplyPropertiesTemplate={() =>
        initializeUniverseProperties(
          applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE),
        )
      }
      onOpenPropertiesSettings={() => {
        openSettingsAt("utils", "blank");
      }}
      onOpenEntity={(path) => {
        openOrCreateTab(path);
        setSelectedPath(path);
      }}
      onConserveField={handleConserveField}
      onDeleteField={handleDeleteField}
    />
  );

  const linksPanel = (
    <aside className="inspector dock-panel-body">
      <Suspense fallback={<LazyPanelFallback label="Loading links..." />}>
        <LinksPanel
          entity={selectedEntity}
          index={index}
          onOpenEntity={(path) => {
            openOrCreateTab(path);
            setSelectedPath(path);
          }}
        />
      </Suspense>
    </aside>
  );

  const backlinksPanel = (
    <aside className="inspector dock-panel-body">
      <Suspense fallback={<LazyPanelFallback label="Loading backlinks..." />}>
        <BacklinksPanel
          entity={selectedEntity}
          allEntities={index?.entities ?? []}
          onOpenEntity={(path) => {
            openOrCreateTab(path);
            setSelectedPath(path);
          }}
        />
      </Suspense>
    </aside>
  );

  function handleGraphControlsPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const panel = event.currentTarget.closest<HTMLElement>(".graph-panel");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const handleElement = event.currentTarget;
    const offsetX = event.clientX - rect.left - graphControlsPosition.x;
    const offsetY = event.clientY - rect.top - graphControlsPosition.y;
    handleElement.setPointerCapture(event.pointerId);
    event.preventDefault();

    function handlePointerMove(moveEvent: PointerEvent) {
      const maxX = Math.max(0, rect.width - 280);
      const maxY = Math.max(0, rect.height - 180);
      setGraphControlsPosition({
        x: Math.min(maxX, Math.max(0, moveEvent.clientX - rect.left - offsetX)),
        y: Math.min(maxY, Math.max(0, moveEvent.clientY - rect.top - offsetY)),
      });
    }

    function handlePointerUp(upEvent: PointerEvent) {
      if (handleElement.hasPointerCapture(upEvent.pointerId)) {
        handleElement.releasePointerCapture(upEvent.pointerId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function setGraphSettings(nextGraphSettings: GraphSettings) {
    setSettings((current) => ({
      ...current,
      graph: nextGraphSettings,
    }));
  }

  const graphPanel = (
    <aside className="inspector graph-panel dock-panel-body">
      <Suspense fallback={<LazyPanelFallback label="Loading graph..." />}>
        <div className="graph-panel-view">
          <GraphView
            graphData={graphData}
            settings={graphSettings}
            activeNodeId={activeGraphPath}
            resetSignal={graphResetSignal}
            onNodeClick={(path) => {
              openOrCreateTab(path);
              setSelectedPath(path);
            }}
            onOpenLocalGraph={(path) => {
              openOrCreateTab(path);
              setSelectedPath(path);
              setGraphSettings({ ...graphSettings, mode: "local" });
            }}
            onRevealNode={(path) => {
              setSelectedExplorerTarget({ path, kind: "file" });
              void revealExplorerPath(path).catch((error) => {
                showToast(error instanceof Error ? error.message : String(error), "error");
              });
            }}
          />
        </div>
        <div
          className="graph-floating-controls"
          style={{
            transform: `translate(${graphControlsPosition.x}px, ${graphControlsPosition.y}px)`,
          }}
        >
          <div
            className="graph-floating-controls-handle"
            onPointerDown={handleGraphControlsPointerDown}
          >
            <span>Graph Controls</span>
          </div>
          <GraphControls
            settings={graphSettings}
            availableTypes={availableTypes}
            availableTags={availableTags}
            nodeCount={graphData.nodes.length}
            linkCount={graphData.links.length}
            hasActiveNote={Boolean(activeGraphPath)}
            onSettingsChange={setGraphSettings}
            onResetView={() => setGraphResetSignal((current) => current + 1)}
          />
        </div>
      </Suspense>
    </aside>
  );

  function renderDockTab(tab: DockTabRef) {
    if (tab.kind === "document") return tab.path ? renderDocumentPanel(tab) : emptyDocumentPanel;
    if (tab.kind === "explorer") return explorerPanel;
    if (tab.kind === "inspector") return inspectorPanel;
    if (tab.kind === "links") return linksPanel;
    if (tab.kind === "backlinks") return backlinksPanel;
    if (tab.kind === "graph") return graphPanel;
    return emptyDocumentPanel;
  }

  function handleDockSelect(tab: DockTabRef) {
    setWorkspaceLayout((current) => activateDockTab(current, tab.id));
    if (tab.kind === "document" && tab.path) {
      activateTab(tab.path);
    }
  }

  function handleDockClose(tab: DockTabRef) {
    setActiveWorkspacePreset("custom");
    if (tab.kind === "document" && tab.path) {
      void closeTab(tab.path);
      return;
    }
    setWorkspaceLayout((current) => closeDockLayoutTab(current, tab.id));
  }

  function handleDockMove(request: DockMoveRequest) {
    if (!isDockMoveAllowedAroundDocumentAnchor(request)) return;
    if (request.tabId.startsWith("document:")) {
      const path = request.tabId.slice("document:".length);
      const targetPath = request.targetTabId?.startsWith("document:")
        ? request.targetTabId.slice("document:".length)
        : undefined;
      const targetGroup = targetPath
        ? documentTabGroups.find((group) => group.tabPaths.includes(targetPath))
        : undefined;
      moveDocumentTab({
        path,
        targetPath,
        targetGroupId: targetGroup?.id ?? null,
      });
      return;
    }
    setActiveWorkspacePreset("custom");
    const nextLayout = moveDockTab(workspaceLayout, request);
    setWorkspaceLayout(nextLayout);
    setTabs((current) => orderOpenTabsByLayout(current, nextLayout));
  }

  function handleDockResize(splitId: string, ratio: number) {
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) => resizeDockSplit(current, { splitId, ratio }));
  }

  function applyDockPreset(preset: WorkspaceLayoutPreset) {
    setActiveWorkspacePreset(preset);
    setWorkspaceLayout(createWorkspaceLayoutPreset(preset, tabs, { activePath: activeTabPath }));
  }

  function layoutPresetLabel(preset: ActiveWorkspacePreset) {
    if (preset === "default") return "Default";
    if (preset === "writing") return "Writing";
    if (preset === "graph") return "Flow Map";
    if (preset === "focus") return "Focus";
    return "Custom";
  }

  function toggleDockPanel(
    kind: "explorer" | "inspector" | "links" | "backlinks" | "graph" | "outline",
  ) {
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) => togglePanelInLayout(current, kind));
  }

  function setDockPanelInContextGroup(kind: Exclude<DockPanelKind, "document" | "outline">) {
    if (!dockPanelContextMenu) return;
    const enabled = !layoutHasPanel(workspaceLayout, kind);
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) =>
      setPanelInGroup(current, kind, dockPanelContextMenu.groupId, enabled),
    );
    setDockPanelContextMenu(null);
  }

  function openSettingsAt(
    section: "overview" | "tags" | "utils" | "editor",
    propertiesMode: "template" | "blank" = "template",
  ) {
    setSettingsInitialSection(section);
    setSettingsInitialPropertiesMode(propertiesMode);
    setShowSettings(true);
  }

  return (
    <main
      className="app-shell dock-app-shell"
      style={{ "--dock-tab-scale": settings.editor.dockTabScale } as CSSProperties}
    >
      <div className="dock-top-bar" aria-label="Workspace controls">
        <div className={`forge-corner-menu ${forgeMenuOpen ? "open" : ""}`}>
          <div className="forge-orbit-panel" aria-label="Everend Forge app selector">
            <button type="button">Worldnotion</button>
            <button type="button">Pathbranching</button>
          </div>
          <button
            type="button"
            className="forge-corner-button"
            onClick={() => setForgeMenuOpen((open) => !open)}
            aria-expanded={forgeMenuOpen}
            title="Everend Forge"
          >
            <Crown size={16} />
          </button>
        </div>

        <div className="dock-top-left">
          <button
            type="button"
            className="dock-icon-button"
            onClick={() => setView("home")}
            title="Home"
          >
            <Home size={15} />
          </button>

          <div className="dock-top-divider" />

          <button
            type="button"
            className="dock-universe-button"
            onClick={() => openSettingsAt("overview")}
            title="Universe settings"
          >
            <UniverseIconFrame profile={index.universeProfile} size={28} />
            <span className="dock-universe-copy">
              <strong>{universeDisplayName(index)}</strong>
              <span>{pathName(index.rootPath)}</span>
            </span>
          </button>
          <button
            type="button"
            className="dock-icon-button dock-settings-button"
            onClick={() => openSettingsAt("editor")}
            title="Application settings"
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            className="dock-icon-button"
            onClick={() => revealExplorerPath()}
            title={browserRoot ? "Reveal is available in the desktop app" : labels.revealUniverse}
            disabled={Boolean(browserRoot)}
          >
            <ExternalLink size={14} />
          </button>
        </div>

        <div className="dock-top-right">
          <SaveStatusIndicator path={activeTab?.path} dirty={Boolean(activeTab?.dirty)} />
          <label className="dock-layout-select" title="Workspace layout">
            <span>{layoutPresetLabel(activeWorkspacePreset)}</span>
            <select
              aria-label="Workspace layout"
              value={activeWorkspacePreset === "custom" ? "custom" : activeWorkspacePreset}
              onChange={(event) => {
                const preset = event.target.value as ActiveWorkspacePreset;
                if (preset !== "custom") applyDockPreset(preset);
              }}
            >
              {activeWorkspacePreset === "custom" ? <option value="custom">Custom</option> : null}
              <option value="default">Default</option>
              <option value="writing">Writing</option>
              <option value="graph">Flow Map</option>
              <option value="focus">Focus</option>
            </select>
            <ChevronDown size={13} />
          </label>

          <div className="dock-command-group dock-panel-toggle-group" aria-label="Panels">
            <button
              type="button"
              className={isExplorerPanelOpen ? "active" : ""}
              onClick={() => toggleDockPanel("explorer")}
              title="Toggle Explorer"
            >
              Explorer
            </button>
            <button
              type="button"
              className={isInspectorPanelOpen ? "active" : ""}
              onClick={() => toggleDockPanel("inspector")}
              title="Toggle Inspector"
            >
              Inspector
            </button>
            <button
              type="button"
              className={isLinksPanelOpen ? "active" : ""}
              onClick={() => toggleDockPanel("links")}
              title="Toggle Links"
            >
              Links
            </button>
            <button
              type="button"
              className={isBacklinksPanelOpen ? "active" : ""}
              onClick={() => toggleDockPanel("backlinks")}
              title="Toggle Backlinks"
            >
              Backlinks
            </button>
            <button
              type="button"
              className={isGraphPanelOpen ? "active" : ""}
              onClick={() => toggleDockPanel("graph")}
              title="Toggle Flow Map"
            >
              Flow Map
            </button>
          </div>

          <button
            type="button"
            className="dock-icon-button"
            onClick={toggleBuiltinTheme}
            title="Toggle theme"
          >
            {isDarkTheme(settings.theme) ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
      <DockWorkspace
        layout={workspaceLayout}
        renderTab={renderDockTab}
        dirtyDocumentPaths={dirtyTabPaths}
        folderDescriptionPaths={folderDescriptionPaths}
        documentTabGroups={documentTabGroups}
        onSelectTab={handleDockSelect}
        onCloseTab={handleDockClose}
        onTabContextMenu={(tab, x, y) => {
          if (tab.kind === "document" && tab.path) {
            setTabContextMenu({ x, y, path: tab.path });
          }
        }}
        onGroupContextMenu={(groupId, x, y) => setDockPanelContextMenu({ groupId, x, y })}
        onMoveTab={handleDockMove}
        onDocumentGroupToggle={(group) => toggleDocumentGroup(group.id)}
        onDocumentGroupContextMenu={(group, x, y) =>
          setDocumentGroupContextMenu({ groupId: group.id, x, y })
        }
        onResizeSplit={handleDockResize}
        onOpenDocument={() => setShowCommandPalette(true)}
        renderEmptyDocuments={() => (
          <div className="writing-empty-widget">
            <FileText size={28} />
            <strong>Explore {universeDisplayName(index)}</strong>
            <button
              type="button"
              onClick={() => setShowCommandPalette(true)}
              title="Open Command Palette"
            >
              <Search size={14} />
              Search
            </button>
          </div>
        )}
      />
      {dockPanelContextMenu ? (
        <div
          className="context-menu dock-panel-context-menu"
          style={{ left: `${dockPanelContextMenu.x}px`, top: `${dockPanelContextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {[
            ["explorer", "Explorer", isExplorerPanelOpen],
            ["graph", "Flow Map", isGraphPanelOpen],
            ["inspector", "Inspector", isInspectorPanelOpen],
            ["links", "Links", isLinksPanelOpen],
            ["backlinks", "Backlinks", isBacklinksPanelOpen],
          ].map(([kind, label, checked]) => (
            <button
              key={kind as string}
              type="button"
              className="context-menu-item"
              onClick={() =>
                setDockPanelInContextGroup(kind as Exclude<DockPanelKind, "document" | "outline">)
              }
            >
              <span className="dock-panel-check">{checked ? <Check size={12} /> : null}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {documentGroupContextMenu ? (
        <div
          className="context-menu document-group-context-menu"
          style={{
            left: `${documentGroupContextMenu.x}px`,
            top: `${documentGroupContextMenu.y}px`,
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void renameDocumentGroup(documentGroupContextMenu.groupId)}
          >
            <FileEdit size={16} />
            <span>Rename group</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => cycleDocumentGroupColor(documentGroupContextMenu.groupId)}
          >
            <Circle size={16} />
            <span>Change color</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => toggleDocumentGroup(documentGroupContextMenu.groupId)}
          >
            <ChevronRight size={16} />
            <span>Collapse / Expand</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => ungroupDocumentGroup(documentGroupContextMenu.groupId)}
          >
            <Files size={16} />
            <span>Ungroup tabs</span>
          </button>
          <button
            type="button"
            className="context-menu-item danger"
            onClick={() => closeDocumentGroupTabs(documentGroupContextMenu.groupId)}
          >
            <X size={16} />
            <span>Close group tabs</span>
          </button>
        </div>
      ) : null}
      {showSettings ? (
        <Suspense fallback={<LazyPanelFallback label="Loading settings..." />}>
          <SettingsModal
            settings={settings}
            universe={universeSettings}
            initialSection={settingsInitialSection}
            initialPropertiesMode={settingsInitialPropertiesMode}
            onChange={setSettings}
            onSaveUniverseProfile={saveUniverseProfile}
            onSavePropertiesConfig={savePropertiesConfig}
            onInitializePropertiesWorkspace={initializeUniverseProperties}
            onScanFrontmatterNormalization={scanFrontmatterNormalization}
            onApplyFrontmatterNormalization={applyFrontmatterNormalization}
            onClose={() => setShowSettings(false)}
            onRevealUniverse={() => {
              void revealExplorerPath();
            }}
            onOpenUniverseNote={openUniverseNote}
            revealUniverseLabel={labels.revealUniverse}
          />
        </Suspense>
      ) : null}

      {showCommandPalette ? (
        <Suspense fallback={<LazyPanelFallback label="Loading command palette..." />}>
          <CommandPalette
            isOpen={showCommandPalette}
            onClose={() => setShowCommandPalette(false)}
            fileResults={buildFileResults(index)}
            commandResults={buildCommandResults(settings.keybindings)}
            headerResults={buildHeaderResults(activeTab?.rawMarkdown || "")}
            tagResults={buildTagResults(index)}
            recentFiles={settings.explorer.recentFiles}
            favorites={settings.explorer.favorites.map((f) => f.path)}
            fileAccessStats={currentSession?.fileAccessStats}
            taxonomyConfig={index?.propertiesConfig}
            onSelectFile={(path) => {
              openOrCreateTab(path);
              setShowCommandPalette(false);
            }}
            onSelectCommand={(commandId) => {
              setShowCommandPalette(false);
              void executeCommand(commandId);
            }}
            onSelectHeader={(line) => {
              if (editorViewRef.current) {
                const state = editorViewRef.current.state;
                const lineInfo = state.doc.line(line);
                void scrollEditorTo(lineInfo.from);
              }
              setShowCommandPalette(false);
            }}
            onSelectTag={(tag) => {
              setQuery(tag);
              setShowCommandPalette(false);
            }}
          />
        </Suspense>
      ) : null}

      {showQuickSwitcher ? (
        <Suspense fallback={<LazyPanelFallback label="Loading quick switcher..." />}>
          <CommandPalette
            isOpen={showQuickSwitcher}
            onClose={() => setShowQuickSwitcher(false)}
            fileResults={buildFileResults(index)}
            commandResults={[]}
            headerResults={[]}
            tagResults={[]}
            fileAccessStats={currentSession?.fileAccessStats}
            quickSwitcherMode={true}
            taxonomyConfig={index?.propertiesConfig}
            onSelectFile={(path) => {
              openOrCreateTab(path);
              setShowQuickSwitcher(false);
            }}
            onSelectCommand={() => {}}
            onSelectHeader={() => {}}
            onSelectTag={() => {}}
          />
        </Suspense>
      ) : null}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetPath={contextMenu.targetPath}
          targetKind={contextMenu.targetKind}
          templates={index?.templates.map((t) => t.type) || []}
          isFavorite={favoritePaths.has(contextMenu.targetPath)}
          canReveal={!browserRoot}
          revealLabel={labels.revealItem}
          revealUniverseLabel={labels.revealUniverse}
          trashLabel={browserRoot ? "Delete" : labels.trashAction}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {iconPickerState && (
        <IconPicker
          x={iconPickerState.x}
          y={iconPickerState.y}
          onSelect={(iconName) => {
            setCustomIcon(iconPickerState.targetPath, iconName);
            showToast(`Icon changed to ${iconName}`, "success");
          }}
          onClose={() => setIconPickerState(null)}
        />
      )}

      {tabContextMenu ? (
        <div
          className="context-menu tab-context-menu"
          style={{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => createDocumentGroup(tabContextMenu.path)}
          >
            <Files size={16} />
            <span>New group from tab</span>
          </button>
          {documentTabGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="context-menu-item"
              onClick={() => addTabToDocumentGroup(tabContextMenu.path, group.id)}
            >
              <Circle size={16} style={{ color: group.color }} />
              <span>Add to {group.name}</span>
            </button>
          ))}
          {documentTabGroups.some((group) => group.tabPaths.includes(tabContextMenu.path)) ? (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => removeTabFromDocumentGroup(tabContextMenu.path)}
            >
              <Files size={16} />
              <span>Remove from group</span>
            </button>
          ) : null}
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              const path = tabContextMenu.path;
              setTabContextMenu(null);
              void closeTab(path);
            }}
          >
            <X size={16} />
            <span>Close tab</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              closeOtherTabs(tabContextMenu.path);
              setTabContextMenu(null);
            }}
          >
            <X size={16} />
            <span>Close others</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              closeTabsToRight(tabContextMenu.path);
              setTabContextMenu(null);
            }}
          >
            <X size={16} />
            <span>Close tabs to right</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              void closeAllTabs();
              setTabContextMenu(null);
            }}
          >
            <X size={16} />
            <span>Close all tabs</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              closeSavedTabs();
              setTabContextMenu(null);
            }}
          >
            <X size={16} />
            <span>Close saved tabs</span>
          </button>
        </div>
      ) : null}

      {inputOverlays}
    </main>
  );
}

export default App;
