import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import type { EditorView } from "@codemirror/view";
import {
  Check,
  BookOpen,
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
  GitPullRequest,
  SlidersHorizontal,
  Bold,
  Italic,
  Code,
  Strikethrough,
  Link2,
  MessageSquareText,
  Brackets,
  Table,
  List,
  ListOrdered,
  ListTodo,
  TextQuote,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ArrowUpToLine,
  ArrowDownToLine,
  type LucideIcon,
} from "lucide-react";
import "./App.css";
import forgeLogoOnDark from "./assets/everend-forge-logo-on-dark.png";
import forgeLogoOnLight from "./assets/everend-forge-logo-on-light.png";
import worldnotionIcon from "./assets/worldnotion-icon.png";
import { ContextMenu, type ContextMenuAction } from "./components/ContextMenu";
import { CanonChangesDialog } from "./components/CanonChangesDialog";
import { IconPicker, type IconName } from "./components/IconPicker";
import { OutlineGuide } from "./components/OutlineGuide";
import { FontSelector } from "./components/FontSelector";
import { InputDialog } from "./components/InputDialog";
import { InheritAppearanceDialog } from "./components/InheritAppearanceDialog";
import { useToast } from "./components/ToastProvider";
import { useAppDialogs } from "./components/DialogProvider";
import { useDismissableMenu } from "./hooks/useDismissableMenu";
import { useInputDialog } from "./hooks/useInputDialog";
import { useInheritAppearanceDialog } from "./hooks/useInheritAppearanceDialog";
import { useMissingRecentPaths } from "./hooks/useMissingRecentPaths";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { SaveStatusIndicator } from "./components/SaveStatusIndicator";
import { BrandLoadingScreen } from "./components/BrandLoadingScreen";
import { OnboardingGuide, UniverseBasicsCard } from "./components/OnboardingGuide";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { FeedbackModal } from "./components/FeedbackModal";
import { ExplorerPanel, type ExplorerTreeAction } from "./components/ExplorerPanel";
import { ImagePreviewDialog } from "./components/ImagePreviewDialog";
import { InspectorPanel } from "./components/InspectorPanel";
import { JsonReader } from "./components/JsonReader";
import { XmlReader } from "./components/XmlReader";
import { EditorModeSelector } from "./components/EditorModeSelector";
import { LazyPanelFallback } from "./components/LazyPanelFallback";
import { UniverseIconFrame } from "./components/UniverseIconFrame";
import { DockWorkspace, type DockMoveRequest } from "./components/DockWorkspace";
import { buildGraphData, getUniqueTagsFromGraph, getUniqueTypesFromGraph } from "./utils/graphData";
import { useFonts } from "./utils/useFonts";
import {
  AppSettingsV4,
  EditorCommandId,
  FloatingFormatCommand,
  EDITOR_COMMANDS,
  DockPanelKind,
  DockTabRef,
  NoteSuggestion,
  OpenTab,
  ThemeId,
  GraphSettings,
  WritingMode,
} from "./editorTypes";
import {
  Entity,
  VaultIndex,
  VaultReadResult,
  WriteResult,
  UniverseProfile,
  indexVault,
  joinMarkdown,
  splitMarkdown,
  dirname,
  slugify,
  createDefaultTaxonomyConfig,
} from "./domain";
import { isDarkTheme, themeById, themeForStyleCommand, toggledThemeMode } from "./themes";
import {
  frontmatterDataToRaw,
  parseFrontmatterRaw,
  removeFrontmatterProperty,
  updateFrontmatterProperties,
} from "./utils/propertiesConfig";
import { serializePropertiesConfig, validatePropertiesConfig } from "./utils/propertiesSerializer";
import { addCustomFieldToSchema } from "./utils/propertiesSerializer";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "./utils/propertyTemplates";
import { normalizeCoreBaseProperties } from "./utils/taxonomyConfig";
import { recordFileAccessInSettings } from "./utils/fileAccessStats";
import { loadSettings, saveSettings } from "./settings";
import {
  applyInterfaceLocale,
  resolveInterfaceLocale,
  WorldnotionLocaleProvider,
  worldnotionEditorModeCopy,
} from "./i18n";
import type { SuiteChrome } from "./suiteChrome";
import {
  type BrowserDirectoryHandle,
  ensureBrowserWritePermission,
  getBrowserFile,
  readBrowserUniverse,
  writeBrowserBinaryFile,
  writeBrowserFile,
} from "./utils/browserVault";
import { uniqueAttachmentPath } from "./utils/attachments";
import { normalizeLocaleList, normalizeLocaleNames } from "./utils/localization";
import {
  createVaultEntity,
  createVaultFolder,
  duplicateVaultPath,
  moveVaultPath,
  renameVaultPath,
  saveVaultFile,
  trashVaultPath,
  vaultHandleFor,
} from "./utils/vaultFileOps";
import {
  loadExplorerIcons,
  saveExplorerIcons,
  type ExplorerIconsData,
} from "./utils/explorerIconsStorage";
import { isImagePath, resolveNoteImageUrl, setBrowserVaultRoot } from "./utils/vaultImages";
import { normalizeDocumentName, planDocumentRename } from "./utils/documentRename";
import {
  VAULT_APPEARANCE_SETTINGS_PATH,
  applyVaultAppearanceSettings,
  serializeVaultAppearance,
  serializeVaultAppearanceSettings,
} from "./utils/vaultAppearanceSettings";
import { getEntityTypeDefinition, getPresentationRoleValue } from "./utils/entityPresentation";
import {
  BASE_VARIANT_ID,
  deleteVariant,
  insertVariantBlock,
  removeVariantBlocks,
  readNoteVariants,
  resolveVariantFrontmatter,
  resolveVariantId,
  updateVariantsInRawYaml,
} from "./utils/noteVariants";
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
  updateOpenTabsForPathChange,
  isJsonPath,
  isXmlPath,
  withTabEditorMode,
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
  markdownLinkInsertion,
  tableInsertion,
  wikilinkInsertion,
  wrapSelectionText,
} from "./utils/markdownEditing";
import {
  dirtyTabPathsAffectedByTree,
  favoritesOutsideTree,
  folderContents,
  movePathChange,
  movePathProblem,
  planFolderDescriptionMove,
  planFolderDescriptionRename,
  renamePathChange,
} from "./utils/vaultOperations";
import { editorCommandAction, nativeMenuEditorCommand } from "./utils/editorCommandActions";
import {
  activeFormats,
  toggleHeadingLine,
  toggleInlineFormat,
  toggleListLine,
  toggleQuoteLine,
  type ActiveFormats,
} from "./utils/formatCommands";
import { profileForRecent, rememberUniverse, universeDisplayName } from "./utils/universeSession";
import { isTauriRuntime, platformLabels, shortcutMatches } from "./utils/appEnvironment";
import { indexCanonChangeSets, type IndexedCanonChangeSet } from "./utils/canonChangeSets";

const EVEREND_FORGE_GITHUB_URL = "https://github.com/Everendforge/everend-forge";
const BUY_SUITE_URL = "https://everendforge.com/buy-suite";
const WORLDNOTION_ONBOARDING_KEY = "worldnotion.onboarding.v1";

type ExplorerSelection = { path: string; kind: "file" | "folder" };

function ForgeCornerLogo() {
  return (
    <>
      <img
        className="forge-logo forge-logo-on-light"
        src={forgeLogoOnLight}
        alt=""
        aria-hidden="true"
      />
      <img
        className="forge-logo forge-logo-on-dark"
        src={forgeLogoOnDark}
        alt=""
        aria-hidden="true"
      />
    </>
  );
}
import { pickBrowserDirectory } from "./utils/browserDirectoryPicker";
import {
  expandedPathsToDepth,
  explorerAncestorsForPath,
  flattenVisibleExplorerTree,
  selectEcosystemGroups,
  selectEntityTypeColors,
  selectEntityTagColors,
  selectFavoriteItems,
  selectImageTree,
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
} from "./utils/frontmatterNormalizer";
import { planPropertyNormalization } from "./utils/propertyNormalizer";
import {
  planPropertyPathMigration,
  planPropertyStructureMigration,
  type PropertyStructureMigrationPlan,
} from "./utils/propertyStructureMigration";
import { parseFrontmatterDocument } from "./utils/frontmatterDocument";
import {
  activateDockTab,
  addPanelToLayout,
  addDocumentToLayout,
  closeDockTab as closeDockLayoutTab,
  createWorkspaceLayoutPreset,
  documentDockTabId,
  isDockMoveAllowedAroundDocumentAnchor,
  layoutHasPanel,
  moveDockTab,
  orderOpenTabsByLayout,
  panelDockTabId,
  resizeDockSplit,
  setPanelInGroup,
  togglePanelInLayout,
  updateLayoutForPathChange,
  type WorkspaceLayoutPreset,
} from "./utils/workspaceLayout";
import { isPluginEnabled } from "./utils/pluginRegistry";
import { DocumentPresentation } from "./components/DocumentPresentation";
import { paragraphLinePositions, paragraphSpacingEffect } from "./utils/paragraphSpacing";

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
const AiAdvisorPanel = lazy(() =>
  import("./components/AiAdvisorPanel").then((module) => ({ default: module.AiAdvisorPanel })),
);

type LoadState = "idle" | "loading" | "ready" | "error";
type AppView = "home" | "workspace";
type ActiveWorkspacePreset = WorkspaceLayoutPreset | "custom";
type TogglePanelKind = "explorer" | "inspector" | "links" | "backlinks" | "graph" | "ai-advisor";
type PointerDragItem = {
  path: string;
  kind: "file" | "folder";
  startX: number;
  startY: number;
  active: boolean;
};

type ToolbarCommand = FloatingFormatCommand & {
  icon: LucideIcon;
  /** Reads whether the command's format is active at the current selection. */
  isActive?: (formats: ActiveFormats) => boolean;
};

const TOOLBAR_INLINE_COMMANDS: ToolbarCommand[] = [
  { id: "bold", label: "Bold", icon: Bold, isActive: (formats) => formats.bold },
  { id: "italic", label: "Italic", icon: Italic, isActive: (formats) => formats.italic },
  {
    id: "strikethrough",
    label: "Strikethrough",
    icon: Strikethrough,
    isActive: (formats) => formats.strike,
  },
  { id: "inlineCode", label: "Inline code", icon: Code, isActive: (formats) => formats.code },
  { id: "link", label: "Link", icon: Link2 },
  { id: "wikilink", label: "Wikilink", icon: Brackets },
];

const TOOLBAR_BLOCK_COMMANDS: ToolbarCommand[] = [
  {
    id: "unorderedList",
    label: "Bullet list",
    icon: List,
    isActive: (formats) => formats.list === "bullet",
  },
  {
    id: "orderedList",
    label: "Ordered list",
    icon: ListOrdered,
    isActive: (formats) => formats.list === "ordered",
  },
  {
    id: "taskList",
    label: "Task list",
    icon: ListTodo,
    isActive: (formats) => formats.list === "task",
  },
  { id: "blockquote", label: "Quote", icon: TextQuote, isActive: (formats) => formats.quote },
];

const TOOLBAR_FIXED_EXTRA_COMMANDS: ToolbarCommand[] = [
  { id: "table", label: "Table", icon: Table },
  { id: "spaceBefore", label: "Space above", icon: ArrowUpToLine },
  { id: "spaceAfter", label: "Space below", icon: ArrowDownToLine },
];

const TOOLBAR_HEADING_COMMANDS: ToolbarCommand[] = [
  { id: "heading1", label: "Heading 1", icon: Heading1, isActive: (f) => f.headingLevel === 1 },
  { id: "heading2", label: "Heading 2", icon: Heading2, isActive: (f) => f.headingLevel === 2 },
  { id: "heading3", label: "Heading 3", icon: Heading3, isActive: (f) => f.headingLevel === 3 },
  { id: "heading4", label: "Heading 4", icon: Heading4, isActive: (f) => f.headingLevel === 4 },
  { id: "heading5", label: "Heading 5", icon: Heading5, isActive: (f) => f.headingLevel === 5 },
  { id: "heading6", label: "Heading 6", icon: Heading6, isActive: (f) => f.headingLevel === 6 },
];

function shortcutHint(commandId: EditorCommandId): string | undefined {
  const shortcut = EDITOR_COMMANDS.find((command) => command.id === commandId)?.defaultShortcut;
  if (!shortcut) return undefined;
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  return shortcut.replace("Mod", isMac ? "⌘" : "Ctrl").replace("Alt", isMac ? "⌥" : "Alt");
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Opens a native file picker for images. Resolves null on cancel (detected via
// the window regaining focus without a selection).
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      resolve(file);
    };
    input.onchange = () => done(input.files?.[0] ?? null);
    window.addEventListener("focus", () => window.setTimeout(() => done(null), 400), {
      once: true,
    });
    input.click();
  });
}

const STARTUP_LOADER_MIN_MS = 700;

function App({ suiteChrome }: { suiteChrome?: SuiteChrome } = {}) {
  const [settings, setSettings] = useState<AppSettingsV4>(() => loadSettings());
  const interfaceLocale = resolveInterfaceLocale(
    suiteChrome?.suiteSettings?.localePreference ?? settings.localePreference ?? "system",
  );
  const editorModeText = worldnotionEditorModeCopy(interfaceLocale);
  const activeTheme = (suiteChrome?.suiteSettings?.style ?? settings.theme) as ThemeId;
  const activeThemeIsDark = isDarkTheme(activeTheme);
  const [view, setView] = useState<AppView>("home");
  const [index, setIndex] = useState<VaultIndex>();
  const [browserRoot, setBrowserRoot] = useState<BrowserDirectoryHandle>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [selectedExplorerTarget, setSelectedExplorerTarget] = useState<{
    path: string;
    kind: "file" | "folder";
  }>();
  const [explorerSelection, setExplorerSelection] = useState<ExplorerSelection[]>([]);
  const [pointerDragTargetPath, setPointerDragTargetPath] = useState<string>();
  const undoRedo = useUndoRedo();
  const [imagePreviewPath, setImagePreviewPath] = useState<string>();
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [initialReady, setInitialReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const {
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
  } = useWorkspaceState({
    rootPath: index?.rootPath,
    persistTabs: settings.editor.persistTabs,
    selectedPath,
    sessions: settings.sessions,
    setSettings,
  });
  const [activeWorkspacePreset, setActiveWorkspacePreset] =
    useState<ActiveWorkspacePreset>("default");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    applyInterfaceLocale(
      suiteChrome?.suiteSettings?.localePreference ?? settings.localePreference ?? "system",
    );
  }, [settings.localePreference, suiteChrome?.suiteSettings?.localePreference]);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    "overview" | "utils" | "appearance-behavior" | "ai-advisor"
  >("overview");
  const [settingsInitialPropertiesMode, setSettingsInitialPropertiesMode] = useState<
    "template" | "blank"
  >("template");
  const [forgeMenuOpen, setForgeMenuOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const [graphResetSignal, setGraphResetSignal] = useState(0);
  const [appZoom, setAppZoom] = useState(1);
  const [floatingToolbarRect, setFloatingToolbarRect] = useState<DOMRect>();
  const [editorFormats, setEditorFormats] = useState<ActiveFormats>();
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [cursorLine, setCursorLine] = useState(0);
  const [unsavedDialogPath, setUnsavedDialogPath] = useState<string | null>(null);
  const [isSavingBeforeClose, setIsSavingBeforeClose] = useState(false);
  const [, setPendingClosePaths] = useState<string[]>([]);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const forgeMenuRef = useRef<HTMLDivElement | null>(null);
  const inspectorSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const propertiesOnboardingPromptedRef = useRef<Set<string>>(new Set());
  const propertiesSaveFingerprintRef = useRef<string | undefined>(undefined);
  /** Serialized appearance last known to match `.everend/settings.json` on disk for the open universe. */
  const vaultAppearanceOnDiskRef = useRef<string | undefined>(undefined);
  const folderNotesEnabledBootstrappedRef = useRef(false);

  // Font detection hook
  const { fonts } = useFonts();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetPath: string;
    targetKind: "file" | "folder" | "empty";
  } | null>(null);
  const { menu: recentContextMenu, setMenu: setRecentContextMenu } = useDismissableMenu<{
    x: number;
    y: number;
    path: string;
  }>();
  const { menu: tabContextMenu, setMenu: setTabContextMenu } = useDismissableMenu<{
    x: number;
    y: number;
    path: string;
  }>();
  const { menu: dockPanelContextMenu, setMenu: setDockPanelContextMenu } = useDismissableMenu<{
    x: number;
    y: number;
    groupId: string;
  }>();
  const {
    menu: dockPanelMenuOpen,
    setMenu: setDockPanelMenuOpen,
    close: closeDockPanelMenu,
  } = useDismissableMenu<boolean>();
  const { menu: documentGroupContextMenu, setMenu: setDocumentGroupContextMenu } =
    useDismissableMenu<{
      x: number;
      y: number;
      groupId: string;
    }>();
  const [iconPickerState, setIconPickerState] = useState<{
    x: number;
    y: number;
    targetPath: string;
  } | null>(null);
  const { missingRecentPaths, setMissingRecentPaths } = useMissingRecentPaths(
    settings.recentUniverses,
  );
  const { inputDialog, promptUser, closeInputDialog } = useInputDialog();
  const { inheritAppearanceDialog, chooseAppearanceSource, closeInheritAppearanceDialog } =
    useInheritAppearanceDialog();

  const { showToast } = useToast();
  const { confirmDialog } = useAppDialogs();
  const [pointerDragItem, setPointerDragItem] = useState<PointerDragItem>();
  const [showCanonChanges, setShowCanonChanges] = useState(false);
  const [graphControlsPosition, setGraphControlsPosition] = useState({ x: 14, y: 14 });
  const [graphControlsCollapsed, setGraphControlsCollapsed] = useState(true);
  const suppressTreeClickRef = useRef(false);

  useEffect(() => {
    return () => {
      inspectorSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
      inspectorSaveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!forgeMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (forgeMenuRef.current?.contains(event.target as Node)) return;
      setForgeMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setForgeMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [forgeMenuOpen]);

  const activeTab = tabs.find((tab) => tab.path === activeTabPath);
  useEffect(() => {
    const rootPath = index?.rootPath;
    if (!rootPath) {
      setOnboardingDismissed(false);
      return;
    }
    setOnboardingDismissed(
      window.localStorage.getItem(`${WORLDNOTION_ONBOARDING_KEY}:${rootPath}`) === "dismissed",
    );
  }, [index?.rootPath]);

  const worldNotionOnboardingSteps = useMemo(() => {
    // Hidden/system content (e.g. `.everend/`, `.everend/templates/*.md`) ships
    // with every universe scaffold, so it must not count as user-created folders
    // or notes—otherwise the onboarding steps appear complete from the start.
    const isHiddenPath = (path: string) =>
      path.split("/").some((segment) => segment.startsWith("."));
    const directories = (index?.directories ?? []).filter((path) => path && !isHiddenPath(path));
    const markdownFiles = (index?.markdownFiles ?? []).filter(
      (file) => !isHiddenPath(file.relativePath),
    );
    const rootFolderCreated = directories.some((path) => !path.includes("/"));
    const noteInFolderCreated = markdownFiles.some((file) => file.relativePath.includes("/"));
    const nestedFolderCreated = directories.some((path) => path.includes("/"));
    const noteInNestedFolderCreated = markdownFiles.some(
      (file) => file.relativePath.split("/").length >= 3,
    );
    const noteOpened = Boolean(activeTab?.path?.toLowerCase().endsWith(".md"));
    return [
      {
        id: "open-universe",
        title: "Abrir un universo",
        description: "Selecciona una carpeta para comenzar.",
        complete: Boolean(index?.rootPath),
      },
      {
        id: "root-folder",
        title: "Crear una carpeta en la raíz",
        description: "Crea una carpeta desde la pantalla inicial o el Explorer.",
        complete: rootFolderCreated,
      },
      {
        id: "folder-note",
        title: "Crear una nota dentro de la carpeta",
        description: "Selecciona la carpeta y crea una nota allí.",
        complete: noteInFolderCreated,
      },
      {
        id: "nested-folder",
        title: "Crear una carpeta anidada",
        description: "Entra en la carpeta y crea una subcarpeta.",
        complete: nestedFolderCreated,
      },
      {
        id: "nested-note",
        title: "Crear una nota anidada",
        description: "Crea otra nota dentro de la carpeta anidada.",
        complete: noteInNestedFolderCreated,
      },
      {
        id: "edit-note",
        title: "Abrir y editar una nota",
        description: "Abre una nota Markdown para empezar a escribir.",
        complete: noteOpened,
      },
    ];
  }, [activeTab?.path, index]);

  const dismissWorldNotionOnboarding = () => {
    if (index?.rootPath)
      window.localStorage.setItem(`${WORLDNOTION_ONBOARDING_KEY}:${index.rootPath}`, "dismissed");
    setOnboardingDismissed(true);
  };

  const restartWorldNotionOnboarding = () => {
    if (index?.rootPath)
      window.localStorage.removeItem(`${WORLDNOTION_ONBOARDING_KEY}:${index.rootPath}`);
    setOnboardingDismissed(false);
  };
  const activeVariantId = useMemo(() => {
    if (!activeTab || !index?.rootPath) return BASE_VARIANT_ID;
    const requested = settings.sessions[index.rootPath]?.variantSelections?.[activeTab.path];
    return resolveVariantId(
      parseFrontmatterRaw(rawToEditorParts(activeTab.rawMarkdown).frontmatterRaw),
      requested,
    );
  }, [activeTab, index?.rootPath, settings.sessions]);
  const selectActiveVariant = (variantId: string) => {
    if (!activeTab || !index?.rootPath) return;
    setSettings((current) => {
      const session = current.sessions[index.rootPath] ?? { rootPath: index.rootPath, tabs: [] };
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [index.rootPath]: {
            ...session,
            variantSelections: { ...session.variantSelections, [activeTab.path]: variantId },
          },
        },
      };
    });
  };

  function insertActiveVariantBlock() {
    if (!activeTab) return;
    const opening = `\n\n<!-- everend:variant id="${activeVariantId}" -->\n`;
    const block = `${opening}\n<!-- /everend:variant -->`;
    if (editorViewRef.current && activeTab.mode === "write") {
      const position = editorViewRef.current.state.selection.main.head;
      editorViewRef.current.dispatch({
        changes: { from: position, to: position, insert: block },
        selection: { anchor: position + opening.length },
      });
      editorViewRef.current.focus();
      return;
    }
    const parts = rawToEditorParts(activeTab.rawMarkdown);
    const nextRaw = joinMarkdown(
      parts.frontmatterRaw,
      insertVariantBlock(parts.bodyMarkdown, activeVariantId),
    );
    setTabs((current) =>
      current.map((tab) =>
        tab.path === activeTab.path ? { ...tab, rawMarkdown: nextRaw, dirty: true } : tab,
      ),
    );
  }

  function deleteActiveVariant(variantId: string) {
    if (!activeTab) return;
    const parts = rawToEditorParts(activeTab.rawMarkdown);
    const frontmatter = parseFrontmatterRaw(parts.frontmatterRaw);
    const nextYaml = updateVariantsInRawYaml(
      parts.frontmatterRaw,
      deleteVariant(frontmatter, variantId),
      index?.propertiesConfig,
      inspectorEntity?.type,
    );
    const nextRaw = joinMarkdown(nextYaml, removeVariantBlocks(parts.bodyMarkdown, variantId));
    setTabs((current) =>
      current.map((tab) =>
        tab.path === activeTab.path
          ? { ...tab, rawMarkdown: nextRaw, savedMarkdown: nextRaw, dirty: false }
          : tab,
      ),
    );
    scheduleInspectorFrontmatterSave(activeTab.path, nextRaw);
    selectActiveVariant(BASE_VARIANT_ID);
  }
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
  const canonChangeSets = useMemo(() => (index ? indexCanonChangeSets(index.files) : []), [index]);

  useEffect(() => {
    setBrowserVaultRoot(browserRoot ?? null);
    return () => setBrowserVaultRoot(null);
  }, [browserRoot]);

  const isExplorerPanelOpen = layoutHasPanel(workspaceLayout, "explorer");
  const isInspectorPanelOpen = layoutHasPanel(workspaceLayout, "inspector");
  const isLinksPanelOpen = layoutHasPanel(workspaceLayout, "links");
  const isBacklinksPanelOpen = layoutHasPanel(workspaceLayout, "backlinks");
  const isGraphPanelOpen = layoutHasPanel(workspaceLayout, "graph");
  const isAiAdvisorPanelOpen = layoutHasPanel(workspaceLayout, "ai-advisor");
  const aiAdvisorEnabled = isPluginEnabled(settings.plugins, "ai-advisor");

  useEffect(() => {
    if (!index?.rootPath) return;
    setWorkspaceLayout((current) => {
      const tabId = panelDockTabId("ai-advisor");
      if (aiAdvisorEnabled) {
        return layoutHasPanel(current, "ai-advisor")
          ? current
          : addPanelToLayout(current, "ai-advisor");
      }
      return layoutHasPanel(current, "ai-advisor") ? closeDockLayoutTab(current, tabId) : current;
    });
  }, [aiAdvisorEnabled, index?.rootPath, setWorkspaceLayout]);

  useEffect(() => {
    document.documentElement.dataset.theme = suiteChrome?.suiteSettings?.style ?? settings.theme;
    saveSettings(settings);
  }, [settings, suiteChrome?.suiteSettings?.style]);

  useEffect(() => {
    if (!index?.rootPath) return;
    const rootPath = index.rootPath;
    const content = serializeVaultAppearanceSettings(settings);
    if (vaultAppearanceOnDiskRef.current === content) return;
    const timer = setTimeout(() => {
      vaultAppearanceOnDiskRef.current = content;
      void saveVaultFile(
        vaultHandleFor(rootPath, browserRoot),
        VAULT_APPEARANCE_SETTINGS_PATH,
        content,
        "Could not save universe appearance settings.",
      ).catch(() => {
        if (vaultAppearanceOnDiskRef.current === content) {
          vaultAppearanceOnDiskRef.current = undefined;
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [settings, index?.rootPath, browserRoot]);

  useEffect(() => {
    document.body.style.setProperty("zoom", String(appZoom));
  }, [appZoom]);

  // Load explorer icons from persistent storage when vault opens
  useEffect(() => {
    if (!index?.rootPath) return;

    const loadIcons = async () => {
      const vault = vaultHandleFor(index.rootPath, browserRoot);
      try {
        const iconData = await loadExplorerIcons(vault);
        if (Object.keys(iconData).length > 0) {
          updateExplorer({ customIcons: iconData });
        }
      } catch (err) {
        console.warn("Failed to load explorer icons:", err);
      }
    };

    loadIcons();
  }, [index?.rootPath, browserRoot]);

  useEffect(() => {
    if (suiteChrome?.sharedUniversePath) return;

    let cancelled = false;
    let readyTimer: number | undefined;
    const startupStartedAt = Date.now();
    const finishInitialStartup = () => {
      const remaining = Math.max(0, STARTUP_LOADER_MIN_MS - (Date.now() - startupStartedAt));
      readyTimer = window.setTimeout(() => {
        if (!cancelled) setInitialReady(true);
      }, remaining);
    };

    const recent = settings.recentUniverse;
    if (!recent || recent.startsWith("browser:") || !isTauriRuntime()) {
      finishInitialStartup();
      return () => {
        cancelled = true;
        if (readyTimer !== undefined) window.clearTimeout(readyTimer);
      };
    }
    const recentPath = recent;

    async function openLastUniverse() {
      setLoadState("loading");
      try {
        const readResult = await invoke<VaultReadResult>("index_vault", { path: recentPath });
        if (!cancelled) {
          applyUniverse(readResult);
          finishInitialStartup();
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState("error");
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setMissingRecentPaths((current) => new Set(current).add(recentPath));
          finishInitialStartup();
        }
      }
    }

    openLastUniverse();
    return () => {
      cancelled = true;
      if (readyTimer !== undefined) window.clearTimeout(readyTimer);
    };
  }, []);

  useEffect(() => {
    if (!folderNotesEnabledBootstrappedRef.current) {
      folderNotesEnabledBootstrappedRef.current = true;
      return;
    }
    if (!index) return;
    void refreshUniverse();
  }, [settings.explorer.folderNotesEnabled]);

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
    if (activeExplorerSection === "images") {
      return selectImageTree(index, query, focusedFolderPath);
    }
    return selectVisibleTree(
      index,
      query,
      settings.explorer.showHiddenEverend,
      focusedFolderPath,
      settings.explorer.folderNotesEnabled,
      !settings.explorer.showImagesInAllFiles,
    );
  }, [
    activeExplorerSection,
    focusedFolderPath,
    index,
    query,
    settings.explorer.folderNotesEnabled,
    settings.explorer.showHiddenEverend,
    settings.explorer.showImagesInAllFiles,
  ]);
  const visibleExplorerRows = useMemo(
    () => flattenVisibleExplorerTree(visibleTree, expandedPaths, focusedFolderPath),
    [expandedPaths, focusedFolderPath, visibleTree],
  );
  const folderDescriptionPaths = useMemo(() => {
    const paths = new Set<string>();
    if (!index) return paths;
    index.directories.forEach((folderPath) => {
      const descriptionPath = folderDescriptionPath(folderPath);
      if (index.files.some((file) => file.relativePath === descriptionPath))
        paths.add(descriptionPath);
    });
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

  // Group ecosystem entities by their registered type.
  const ecosystemGroups = useMemo(() => {
    return selectEcosystemGroups(index);
  }, [index]);

  const ecosystemEntityColors = useMemo(() => {
    return selectEntityTypeColors(index);
  }, [index]);

  // Get tag color for an entity
  const entityTagColors = useMemo(() => {
    return selectEntityTagColors(index);
  }, [index]);

  useEffect(() => {
    if (!pointerDragItem) return;

    function handlePointerMove(event: PointerEvent) {
      const dragItem = pointerDragItem;
      if (!dragItem) return;
      setPointerDragItem((current) => {
        if (!current || current.active) return current;
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        return distance > 6 ? { ...current, active: true } : current;
      });
      if (Math.hypot(event.clientX - dragItem.startX, event.clientY - dragItem.startY) > 6) {
        const element = document.elementFromPoint(
          event.clientX,
          event.clientY,
        ) as HTMLElement | null;
        setPointerDragTargetPath(
          element?.closest<HTMLElement>("[data-tree-drop-path]")?.dataset.treeDropPath,
        );
      }
    }

    function handlePointerUp(event: PointerEvent) {
      const dragItem = pointerDragItem;
      setPointerDragItem(undefined);
      setPointerDragTargetPath(undefined);
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
      const isMultiDrag =
        explorerSelection.length > 1 &&
        explorerSelection.some((item) => item.path === dragItem.path);
      if (isMultiDrag) {
        void moveExplorerSelection(targetFolder);
      } else {
        void moveExplorerPath(dragItem.path, targetFolder, dragItem.kind);
      }
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [pointerDragItem, explorerSelection]);

  useEffect(() => {
    function handleUndoRedo(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isUndo =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      const isRedo =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && event.shiftKey;

      // Don't prevent default in CodeMirror (handled internally by @codemirror/history)
      if (target?.closest(".cm-content")) {
        return;
      }

      // Only handle explorer-level undo/redo if not in editor
      if (!isUndo && !isRedo) return;

      if (isUndo && undoRedo.canUndo) {
        event.preventDefault();
        performUndo();
      } else if (isRedo && undoRedo.canRedo) {
        event.preventDefault();
        performRedo();
      }
    }

    window.addEventListener("keydown", handleUndoRedo);
    return () => window.removeEventListener("keydown", handleUndoRedo);
  }, [undoRedo.canUndo, undoRedo.canRedo, undoRedo.undoStack, undoRedo.redoStack]);

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

  function handleCreateItemMenu(x: number, y: number) {
    setContextMenu({
      x,
      y,
      targetPath: focusedFolderPath ?? "",
      targetKind: "empty",
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
    const updated = iconName === "default" ? nextIcons : { ...nextIcons, [path]: iconName };
    updateExplorer({ customIcons: updated });

    // Save to persistent storage
    if (index) {
      const vault = vaultHandleFor(index.rootPath, browserRoot);
      saveExplorerIcons(vault, updated).catch((err) => {
        console.warn("Failed to save explorer icons:", err);
      });
    }
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

  function updateTabsForPathChange(
    change: PathChangeSet,
    updateChangedTab?: (tab: OpenTab) => OpenTab,
  ) {
    setTabs((current) => {
      const changed = updateOpenTabsForPathChange(current, change, index?.rootPath);
      return updateChangedTab ? changed.map(updateChangedTab) : changed;
    });
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
        const movePath = (path: string) =>
          pathIsAffectedByChanges(path, change) ? pathAfterChanges(path, change) : path;
        const focusedPath = current.explorer.focusedFoldersByUniverse?.[index.rootPath];
        const focusedFoldersByUniverse =
          focusedPath && pathIsAffectedByChanges(focusedPath, change)
            ? {
                ...(current.explorer.focusedFoldersByUniverse ?? {}),
                [index.rootPath]: movePath(focusedPath),
              }
            : current.explorer.focusedFoldersByUniverse;
        const customIcons = Object.fromEntries(
          Object.entries(current.explorer.customIcons ?? {}).map(([path, icon]) => [
            movePath(path),
            icon,
          ]),
        );

        // Save updated icons to persistent storage
        const vault = vaultHandleFor(index.rootPath, browserRoot);
        saveExplorerIcons(vault, customIcons as ExplorerIconsData).catch((err) => {
          console.warn("Failed to save explorer icons after path change:", err);
        });

        return {
          ...current,
          explorer: {
            ...current.explorer,
            focusedFoldersByUniverse,
            favorites: current.explorer.favorites.map((favorite) => {
              const path = movePath(favorite.path);
              return {
                ...favorite,
                path,
                label: pathName(path).replace(/\.md$/i, ""),
              };
            }),
            recentFiles: current.explorer.recentFiles.map(movePath),
            customIcons,
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
    setImagePreviewPath((current) =>
      current && pathIsAffectedByChanges(current, change)
        ? pathAfterChanges(current, change)
        : current,
    );
    setSelectedExplorerTarget((current) =>
      current && pathIsAffectedByChanges(current.path, change)
        ? { ...current, path: pathAfterChanges(current.path, change) }
        : current,
    );
    setExplorerSelection((current) =>
      current.map((item) =>
        pathIsAffectedByChanges(item.path, change)
          ? { ...item, path: pathAfterChanges(item.path, change) }
          : item,
      ),
    );
  }

  async function renameFolderDescriptionIfNeeded(folderPath: string, newFolderName: string) {
    if (!index) return undefined;
    const plan = planFolderDescriptionRename(index, folderPath, newFolderName);
    if (!plan) return undefined;

    const vault = vaultHandleFor(index.rootPath, browserRoot);
    if (plan.oldDescriptionPath !== plan.newDescriptionPath) {
      await renameVaultPath(vault, plan.oldDescriptionPath, plan.newFileName, "file");
    }
    await saveVaultFile(
      vault,
      plan.newDescriptionPath,
      plan.content,
      "Could not update folder description.",
    );

    return plan.change;
  }

  async function renameDocument(notePath: string, requestedName: string) {
    if (!index) throw new Error("Open a universe before renaming a document.");
    const noteFile = index.files.find((file) => file.relativePath === notePath);
    if (!noteFile) throw new Error(`Document not found: ${notePath}`);
    const openTab = tabs.find((tab) => tab.path === notePath);
    const plan = planDocumentRename(
      index,
      notePath,
      requestedName,
      noteFile.content,
      openTab?.rawMarkdown ?? noteFile.content,
    );
    if (plan.newName === plan.oldName && plan.newNotePath === notePath) return plan;

    const vault = vaultHandleFor(index.rootPath, browserRoot);
    let folderRenamed = false;
    let noteRenamed = false;
    try {
      if (plan.folderPath && plan.newFolderPath && plan.folderPath !== plan.newFolderPath) {
        await renameVaultPath(vault, plan.folderPath, plan.newName, "folder");
        folderRenamed = true;
      }
      if (plan.newNotePath !== plan.oldNotePath) {
        await renameVaultPath(vault, plan.oldNotePath, plan.newFileName, "file");
        noteRenamed = true;
      }
      await saveVaultFile(
        vault,
        plan.newNotePath,
        plan.diskContent,
        "Could not update the renamed document.",
      );
    } catch (error) {
      let rollbackFailed = false;
      if (noteRenamed) {
        try {
          await renameVaultPath(vault, plan.newNotePath, pathName(plan.oldNotePath), "file");
          await saveVaultFile(vault, plan.oldNotePath, noteFile.content);
        } catch {
          rollbackFailed = true;
        }
      }
      if (folderRenamed && plan.folderPath && plan.newFolderPath) {
        try {
          await renameVaultPath(vault, plan.newFolderPath, pathName(plan.folderPath), "folder");
        } catch {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        throw new Error(
          "Rename failed and WorldNotion could not fully restore the original paths.",
          {
            cause: error,
          },
        );
      }
      throw error;
    }

    const changeSet: PathChangeSet = plan.changes;
    updateTabsForPathChange(changeSet, (tab) => {
      if (tab.path !== plan.newNotePath) return tab;
      return {
        ...tab,
        rawMarkdown: plan.liveContent,
        savedMarkdown: plan.diskContent,
        dirty: plan.liveContent !== plan.diskContent,
      };
    });
    await refreshUniverse(plan.newNotePath, changeSet);
    return plan;
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    targetPath: string,
    targetKind: "file" | "folder" | "empty",
    templateType?: string,
  ) {
    if (!index) return;

    const parentPath =
      targetKind === "folder"
        ? targetPath
        : targetKind === "empty"
          ? targetPath
          : targetPath.split("/").slice(0, -1).join("/");

    try {
      if (action === "open") {
        if (targetKind !== "folder" && targetKind !== "empty") {
          selectPath(targetPath);
        }
      } else if (action === "openInNewTab") {
        if (targetKind !== "folder" && targetKind !== "empty") {
          if (isImagePath(targetPath)) {
            selectPath(targetPath);
          } else {
            openDocument(index, targetPath);
          }
        }
      } else if (action === "preview" && targetKind === "file" && isImagePath(targetPath)) {
        selectPath(targetPath);
      } else if (action === "newBlankPage") {
        const name = await promptUser("Enter page name:");
        if (!name || name.trim() === "") {
          return;
        }

        const fileName = name.endsWith(".md") ? name : `${name}.md`;
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        const cleanName = name.replace(/\.md$/i, "");
        const content = `${contentFromTemplate(index, "concept", cleanName)}\n`;

        await saveVaultFile(
          vaultHandleFor(index.rootPath, browserRoot),
          filePath,
          content,
          "Could not create page.",
        );

        undoRedo.recordAction({
          type: "create",
          data: { path: filePath, kind: "file", parentPath },
        });
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

        await createVaultEntity(vaultHandleFor(index.rootPath, browserRoot), {
          parentPath,
          entityType: templateType,
          name,
          browserPath: filePath,
          browserContent: contentFromTemplate(index, templateType, name),
        });

        undoRedo.recordAction({
          type: "create",
          data: { path: filePath, kind: "file", parentPath },
        });
        const nextIndex = await refreshUniverse(filePath);
        selectPathAfterRefresh(filePath, nextIndex);
        showToast(`Created ${templateType}: ${name}`, "success");
      } else if (action === "newFolder") {
        const name = await promptUser("Enter folder name:");
        if (!name || name.trim() === "") {
          return;
        }

        const folderPath = parentPath ? `${parentPath}/${name}` : name;
        const vault = vaultHandleFor(index.rootPath, browserRoot);
        await createVaultFolder(vault, folderPath);
        undoRedo.recordAction({
          type: "create",
          data: { path: folderPath, kind: "folder", parentPath },
        });
        await refreshUniverse();
        setExpandedPaths((prev) => new Set(prev).add(folderPath));
        selectFolder(folderPath);
        showToast(`Created folder: ${name}`, "success");
      } else if (action === "rename" && targetKind !== "empty") {
        const currentName = pathName(targetPath);
        const currentDisplayName =
          targetKind === "file" && targetPath.toLowerCase().endsWith(".md")
            ? currentName.replace(/\.md$/i, "")
            : currentName;
        const newName = await promptUser("New name:", "new name", currentDisplayName);
        if (!newName || normalizeDocumentName(newName) === currentDisplayName) return;
        if (targetKind === "file" && targetPath.toLowerCase().endsWith(".md")) {
          const plan = await renameDocument(targetPath, newName);
          undoRedo.recordAction({
            type: "rename",
            data: { oldPath: targetPath, newPath: plan.newNotePath, kind: "file" },
          });
          showToast(`Renamed ${currentDisplayName} to ${plan.newName}.`, "success");
          return;
        }
        if (targetKind === "folder") {
          planFolderDescriptionRename(index, targetPath, newName);
        }
        const newPath =
          targetKind === "folder"
            ? `${dirname(targetPath)}/${newName}`
            : `${dirname(targetPath)}/${newName}.${targetPath.split(".").pop()}`;
        await renameVaultPath(
          vaultHandleFor(index.rootPath, browserRoot),
          targetPath,
          newName,
          targetKind,
        );
        undoRedo.recordAction({
          type: "rename",
          data: { oldPath: targetPath, newPath, kind: targetKind },
        });
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
        const newPath = duplicatePathFor(index, targetPath, targetKind);
        const nextPath = await duplicateVaultPath(
          vaultHandleFor(index.rootPath, browserRoot),
          targetPath,
          targetKind,
          newPath,
        );
        undoRedo.recordAction({
          type: "duplicate",
          data: { sourcePath: targetPath, newPath: nextPath, kind: targetKind },
        });
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
      } else if (
        action === "editFolderDescription" &&
        targetKind === "folder" &&
        settings.explorer.folderNotesEnabled
      ) {
        const { descriptionPath, hasDescription } = folderDescriptionInfo(index, targetPath);
        if (hasDescription) {
          selectPath(descriptionPath);
        } else {
          await createFolderDescription(targetPath);
        }
      } else if (
        action === "deleteFolderDescription" &&
        targetKind === "folder" &&
        settings.explorer.folderNotesEnabled
      ) {
        await deleteFolderDescription(targetPath);
      } else if (action === "convertFolderDescriptionToNote" && targetKind === "folder") {
        await convertFolderDescriptionToNote(targetPath);
      } else if (action === "convertNoteToFolderDescription" && targetKind === "file") {
        await convertNoteToFolderDescription(targetPath);
      } else if (action === "reveal") {
        await revealExplorerPath(targetKind === "empty" ? undefined : targetPath);
      } else if (action === "trash" && targetKind !== "empty") {
        await trashExplorerPath(targetPath, targetKind);
        undoRedo.recordAction({
          type: "delete",
          data: { path: targetPath, kind: targetKind, canRestore: false },
        });
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
    options: { recordUndo?: boolean; skipConfirmation?: boolean } = {},
  ) {
    if (!index) return;
    const itemKind =
      kind ?? (index.files.some((file) => file.relativePath === fromPath) ? "file" : "folder");
    try {
      const moveProblem = movePathProblem(fromPath, toFolderPath, itemKind);
      if (moveProblem === "Cannot move a folder into itself.") {
        showToast(moveProblem, "warning");
        return;
      }
      if (moveProblem === "already-there") return;

      const folderNoteMove =
        itemKind === "folder"
          ? planFolderDescriptionMove(index, fromPath, toFolderPath)
          : undefined;
      const confirmed =
        !options.skipConfirmation && settings.explorer.confirmDragMove
          ? await confirmDialog(`Move ${pathName(fromPath)} to ${toFolderPath || "root"}?`, {
              title: "Move item",
              confirmLabel: "Move",
            })
          : true;
      if (!confirmed) return;

      const vault = vaultHandleFor(index.rootPath, browserRoot);
      const movedPath = await moveVaultPath(vault, fromPath, toFolderPath, itemKind);
      try {
        if (folderNoteMove) {
          await moveVaultPath(vault, folderNoteMove.oldDescriptionPath, toFolderPath, "file");
        }
      } catch (error) {
        try {
          await moveVaultPath(vault, movedPath, dirname(fromPath), "folder");
        } catch {
          throw new Error(
            "The folder note could not be moved and the folder rollback also failed.",
          );
        }
        throw error;
      }

      const change = movePathChange(fromPath, dirname(movedPath));
      const changes = folderNoteMove ? [change, folderNoteMove.change] : change;
      updateTabsForPathChange(changes);
      await refreshUniverse(undefined, changes);
      const undoMove = { fromPath: movedPath, toFolderPath: dirname(fromPath), kind: itemKind };
      if (options.recordUndo !== false) {
        undoRedo.recordAction({ type: "move", data: undoMove });
      }
      showToast(`Moved ${pathName(fromPath)}.`, "success");
      return undoMove;
    } catch (error) {
      showToast(
        `Could not move ${pathName(fromPath)}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return undefined;
    }
  }

  async function moveExplorerSelection(toFolderPath: string) {
    const targets = explorerSelection
      .slice()
      .sort((left, right) => left.path.length - right.path.length)
      .filter(
        (item, index, all) =>
          !all.slice(0, index).some((parent) => item.path.startsWith(`${parent.path}/`)),
      );
    if (targets.length < 2) return;
    if (settings.explorer.confirmDragMove) {
      const confirmed = await confirmDialog(
        `Move ${targets.length} items to ${toFolderPath || "root"}?`,
        {
          title: "Move items",
          confirmLabel: "Move",
        },
      );
      if (!confirmed) return;
    }
    const completed: Array<{ fromPath: string; toFolderPath: string; kind: "file" | "folder" }> =
      [];
    for (const target of targets) {
      const move = await moveExplorerPath(target.path, toFolderPath, target.kind, {
        recordUndo: false,
        skipConfirmation: true,
      });
      if (!move) {
        for (const completedMove of completed.slice().reverse()) {
          await moveExplorerPath(
            completedMove.fromPath,
            completedMove.toFolderPath,
            completedMove.kind,
            {
              recordUndo: false,
              skipConfirmation: true,
            },
          );
        }
        return;
      }
      completed.push(move);
    }
    // Record moves in undo system
    for (const move of completed) {
      undoRedo.recordAction({ type: "move", data: move });
    }
    setExplorerSelection(completed.map((move) => ({ path: move.fromPath, kind: move.kind })));
    showToast(`Moved ${completed.length} items. Press Ctrl/⌘+Z to undo.`, "success");
  }

  async function performUndo() {
    if (!index || undoRedo.undoStack.length === 0) return;

    const lastAction = undoRedo.undoStack[undoRedo.undoStack.length - 1];
    if (!lastAction) return;

    try {
      switch (lastAction.type) {
        case "move": {
          const { fromPath, toFolderPath, kind } = lastAction.data;
          await moveExplorerPath(fromPath, toFolderPath, kind, {
            recordUndo: false,
            skipConfirmation: true,
          });
          undoRedo.undo();
          showToast(`Undid move.`, "success");
          break;
        }
        case "create": {
          const { path, kind } = lastAction.data;
          await trashExplorerPath(path, kind);
          undoRedo.undo();
          showToast(`Undid ${kind} creation.`, "success");
          break;
        }
        case "delete": {
          // Note: Cannot undo delete if file was permanently deleted
          const { canRestore } = lastAction.data;
          if (!canRestore) {
            showToast("Cannot undo: file was permanently deleted.", "warning");
            undoRedo.undo();
          } else {
            showToast("Cannot restore deleted file (no backup available).", "warning");
          }
          break;
        }
        case "rename": {
          const { oldPath, newPath, kind } = lastAction.data;
          await renameVaultPath(
            vaultHandleFor(index.rootPath, browserRoot),
            newPath,
            pathName(oldPath),
            kind,
          );
          await refreshUniverse(undefined, [renamePathChange(newPath, pathName(oldPath), kind)]);
          undoRedo.undo();
          showToast(`Undid rename.`, "success");
          break;
        }
        case "duplicate": {
          const { newPath, kind } = lastAction.data;
          await trashExplorerPath(newPath, kind);
          undoRedo.undo();
          showToast(`Undid duplication.`, "success");
          break;
        }
      }
    } catch (error) {
      showToast(
        `Could not undo: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }

  async function performRedo() {
    if (!index || undoRedo.redoStack.length === 0) return;

    const nextAction = undoRedo.redoStack[undoRedo.redoStack.length - 1];
    if (!nextAction) return;

    try {
      switch (nextAction.type) {
        case "move": {
          const { fromPath, toFolderPath, kind } = nextAction.data;
          await moveExplorerPath(fromPath, toFolderPath, kind, {
            recordUndo: false,
            skipConfirmation: true,
          });
          undoRedo.redo();
          showToast(`Redid move.`, "success");
          break;
        }
        // Other redo cases would be similar...
      }
    } catch (error) {
      showToast(
        `Could not redo: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
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
    const folderNotePath = kind === "folder" ? folderDescriptionPath(path) : undefined;
    const hasFolderNote = Boolean(
      folderNotePath && index.files.some((file) => file.relativePath === folderNotePath),
    );
    const folderContentsCount = kind === "folder" ? folderContents(index, path).length : 0;
    if (folderContentsCount) {
      showToast(
        `Cannot delete ${pathName(path)}: it contains ${folderContentsCount} item(s). Move or delete its contents first.`,
        "warning",
      );
      return;
    }

    const affectedDirtyTabs = [
      ...new Set([
        ...dirtyTabPathsAffectedByTree(tabs, path),
        ...tabs.filter((tab) => tab.dirty && tab.path === folderNotePath).map((tab) => tab.path),
      ]),
    ];
    if (affectedDirtyTabs.length) {
      const confirmed = await confirmDialog(
        `${affectedDirtyTabs.length} open tab(s) have unsaved changes. ${labels.trashAction} anyway?`,
        { title: labels.trashAction, destructive: true },
      );
      if (!confirmed) return;
    }
    const confirmed = await confirmDialog(
      kind === "folder"
        ? `Delete the empty folder ${pathName(path)}${hasFolderNote ? " and its folder note" : ""}?`
        : browserRoot
          ? `Delete ${pathName(path)} from this browser-opened universe?`
          : `${labels.trashAction} ${pathName(path)}?`,
      { title: labels.trashAction, confirmLabel: labels.trashAction, destructive: true },
    );
    if (!confirmed) return;
    const vault = vaultHandleFor(index.rootPath, browserRoot);
    await trashVaultPath(vault, path, { requireEmpty: kind === "folder" });
    const removedPaths = [path];
    if (folderNotePath && hasFolderNote) {
      try {
        await trashVaultPath(vault, folderNotePath);
        removedPaths.push(folderNotePath);
      } catch (error) {
        showToast(
          `Folder deleted, but its folder note could not be removed: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
      }
    }
    const wasRemoved = (candidate: string | undefined) => {
      if (!candidate) return false;
      return (
        candidate === path || candidate.startsWith(`${path}/`) || removedPaths.includes(candidate)
      );
    };
    setTabs((current) => current.filter((tab) => !wasRemoved(tab.path)));
    if (wasRemoved(selectedPath)) {
      setSelectedPath(undefined);
      setActiveTabPath(undefined);
    }
    if (wasRemoved(activeTabPath)) setActiveTabPath(undefined);
    if (wasRemoved(imagePreviewPath)) {
      setImagePreviewPath(undefined);
    }
    setSelectedExplorerTarget((current) =>
      current && wasRemoved(current.path) ? undefined : current,
    );
    updateExplorer({
      favorites: favoritesOutsideTree(settings.explorer.favorites, path).filter(
        (favorite) => !removedPaths.includes(favorite.path),
      ),
      customIcons: Object.fromEntries(
        Object.entries(settings.explorer.customIcons ?? {}).filter(
          ([iconPath]) => !wasRemoved(iconPath),
        ),
      ),
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
    const content = folderDescriptionContent(folderName);

    try {
      await saveVaultFile(
        vaultHandleFor(index.rootPath, browserRoot),
        descriptionPath,
        content,
        "Could not create folder description.",
      );

      const nextIndex = await refreshUniverse(descriptionPath);
      selectPathAfterRefresh(descriptionPath, nextIndex);
      showToast(`Created folder description: ${folderName}.md`, "success");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteFolderDescription(folderPath: string) {
    if (!index) return;
    const descriptionPath = folderDescriptionPath(folderPath);
    if (!index.files.some((file) => file.relativePath === descriptionPath)) return;

    const dirtyDescriptionTab = tabs.find((tab) => tab.path === descriptionPath && tab.dirty);
    if (dirtyDescriptionTab) {
      const discardChanges = await confirmDialog(
        `${pathName(descriptionPath)} has unsaved changes. Delete the folder note anyway?`,
        { title: "Delete folder note", confirmLabel: "Delete", destructive: true },
      );
      if (!discardChanges) return;
    }

    const confirmed = await confirmDialog(
      `Delete ${pathName(descriptionPath)}? The folder and everything inside it will remain.`,
      { title: "Delete folder note", confirmLabel: "Delete", destructive: true },
    );
    if (!confirmed) return;

    await trashVaultPath(vaultHandleFor(index.rootPath, browserRoot), descriptionPath);
    setTabs((current) => current.filter((tab) => tab.path !== descriptionPath));
    if (selectedPath === descriptionPath) {
      setSelectedPath(folderPath);
      setSelectedExplorerTarget({ path: folderPath, kind: "folder" });
      setActiveTabPath(undefined);
    }
    await refreshUniverse();
    showToast("Folder note deleted. The folder was kept.", "success");
  }

  /** Demotes a folder's note into a plain note living inside that folder. */
  async function convertFolderDescriptionToNote(folderPath: string) {
    if (!index) return;
    const descriptionPath = folderDescriptionPath(folderPath);
    const descriptionFile = index.files.find((file) => file.relativePath === descriptionPath);
    if (!descriptionFile) return;

    const newPath = `${folderPath}/${pathName(descriptionPath)}`;
    if (index.files.some((file) => file.relativePath === newPath)) {
      showToast(`Cannot convert: ${newPath} already exists.`, "warning");
      return;
    }

    const confirmed = await confirmDialog(
      `Convert ${pathName(descriptionPath)} into a normal note inside ${pathName(folderPath)}?`,
      { title: "Convert to normal note", confirmLabel: "Convert" },
    );
    if (!confirmed) return;

    try {
      const vault = vaultHandleFor(index.rootPath, browserRoot);
      const movedPath = await moveVaultPath(vault, descriptionPath, folderPath, "file");
      const { frontmatterRaw, bodyMarkdown } = splitMarkdown(descriptionFile.content);
      const withoutFolder = removeFrontmatterProperty(
        frontmatterRaw,
        "folder",
        index.propertiesConfig,
        "folder-description",
      );
      const demoted = updateFrontmatterProperties(
        withoutFolder,
        { type: "concept" },
        index.propertiesConfig,
        "folder-description",
      );
      await saveVaultFile(
        vault,
        movedPath,
        joinMarkdown(demoted, bodyMarkdown),
        "Could not update the note's frontmatter.",
      );

      const change = movePathChange(descriptionPath, folderPath);
      updateTabsForPathChange(change);
      await refreshUniverse(movedPath, change);
      showToast(`Converted ${pathName(descriptionPath)} to a normal note.`, "success");
    } catch (error) {
      showToast(
        `Could not convert ${pathName(descriptionPath)}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }

  /** Promotes a normal note into the folder note of its immediate parent folder. */
  async function convertNoteToFolderDescription(notePath: string) {
    if (!index) return;
    const parentPath = dirname(notePath);
    if (!parentPath) {
      showToast("This note is already at the top level of the universe.", "warning");
      return;
    }

    const {
      folderName,
      descriptionPath: targetPath,
      hasDescription,
    } = folderDescriptionInfo(index, parentPath);
    if (hasDescription) {
      showToast(`${folderName} already has a folder note.`, "warning");
      return;
    }
    if (
      index.files.some((file) => file.relativePath === targetPath) ||
      index.directories.includes(targetPath)
    ) {
      showToast(`Cannot convert: ${targetPath} already exists.`, "warning");
      return;
    }

    const noteFile = index.files.find((file) => file.relativePath === notePath);
    if (!noteFile) return;

    const confirmed = await confirmDialog(
      `Convert ${pathName(notePath)} into the folder note for "${folderName}"? It will move to ${targetPath}.`,
      { title: "Convert to folder note", confirmLabel: "Convert" },
    );
    if (!confirmed) return;

    try {
      const vault = vaultHandleFor(index.rootPath, browserRoot);
      const newFileName = pathName(targetPath);
      let workingPath = notePath;
      if (pathName(notePath) !== newFileName) {
        await renameVaultPath(vault, notePath, newFileName, "file");
        workingPath = `${parentPath}/${newFileName}`;
      }

      const { frontmatterRaw, bodyMarkdown } = splitMarkdown(noteFile.content);
      const promoted = frontmatterRaw.trim()
        ? updateFrontmatterProperties(
            frontmatterRaw,
            { type: "folder-description", folder: folderName },
            index.propertiesConfig,
            "folder-description",
          )
        : frontmatterDataToRaw({ folder: folderName, type: "folder-description" });
      await saveVaultFile(
        vault,
        workingPath,
        joinMarkdown(promoted, bodyMarkdown),
        "Could not update the note's frontmatter.",
      );

      const movedPath = await moveVaultPath(vault, workingPath, dirname(parentPath), "file");
      const change: PathChangeSet = { fromPath: notePath, toPath: movedPath, mode: "single" };
      updateTabsForPathChange(change);
      await refreshUniverse(movedPath, change);
      showToast(`Converted to the folder note for "${folderName}".`, "success");
    } catch (error) {
      showToast(
        `Could not convert ${pathName(notePath)}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }

  async function openUniverseNote() {
    if (!index) return;
    const universeName = pathName(index.rootPath);
    const relativePath = `${universeName}.md`;
    try {
      if (!index.files.some((file) => file.relativePath === relativePath)) {
        const content = universeNoteContent(universeName);
        await saveVaultFile(
          vaultHandleFor(index.rootPath, browserRoot),
          relativePath,
          content,
          "Could not create universe note.",
        );
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
    const locales = normalizeLocaleList(
      profile.localization?.primaryLocale ?? navigator.language ?? "en",
      profile.localization?.locales ?? [],
    );
    const normalizedProfile: UniverseProfile = {
      name: profile.name?.trim() || undefined,
      icon: profile.icon,
      localization: profile.localization
        ? {
            primaryLocale: locales[0],
            locales,
            localeNames: normalizeLocaleNames(profile.localization.localeNames, locales),
          }
        : undefined,
    };
    const content = `${JSON.stringify(normalizedProfile, null, 2)}\n`;
    try {
      await saveVaultFile(
        vaultHandleFor(index.rootPath, browserRoot),
        ".everend/universe.json",
        content,
        "Could not save universe profile.",
      );
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
    const validation = validatePropertiesConfig(normalizedProperties);
    if (!validation.valid) {
      throw new Error(validation.errors.map((error) => error.message).join(" "));
    }
    const content = `${serializePropertiesConfig(normalizedProperties)}\n`;
    const fingerprint = `${index.rootPath}\0${content}`;
    if (propertiesSaveFingerprintRef.current === fingerprint) return;
    propertiesSaveFingerprintRef.current = fingerprint;
    // The inspector can immediately render a property defined in this save.
    // Keeping the in-memory schema in step prevents its YAML field from being
    // classified as an unknown "extra" while persistence is still in flight.
    const previousProperties = index.propertiesConfig;
    setIndex((current) =>
      current ? { ...current, propertiesConfig: normalizedProperties } : current,
    );
    try {
      await saveVaultFile(
        vaultHandleFor(index.rootPath, browserRoot),
        ".everend/properties.json",
        content,
        "Could not save properties configuration.",
      );
      setIndex((current) =>
        current ? { ...current, propertiesConfig: normalizedProperties } : current,
      );
      await reindexUniverseMetadata();
      showToast("Properties configuration saved.", "success");
    } catch (error) {
      setIndex((current) =>
        current?.propertiesConfig === normalizedProperties
          ? { ...current, propertiesConfig: previousProperties }
          : current,
      );
      if (propertiesSaveFingerprintRef.current === fingerprint) {
        propertiesSaveFingerprintRef.current = undefined;
      }
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

  function scanPropertyNormalization() {
    if (!index?.propertiesConfig) return [];
    return planPropertyNormalization({
      files: index.files,
      propertiesConfig: index.propertiesConfig,
    });
  }

  function scanPropertyStructureMigration() {
    if (!index?.propertiesConfig) return undefined;
    const dirtyPaths = new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.path));
    return planPropertyStructureMigration(index.files, index.propertiesConfig, dirtyPaths);
  }

  async function applyPropertyStructureMigration(plan: PropertyStructureMigrationPlan) {
    if (!index) return { applied: 0, skipped: 0, errors: ["No universe is open."] };
    const blocked = plan.items.filter((item) => item.status !== "ready");
    if (blocked.length) {
      return {
        applied: 0,
        skipped: blocked.length,
        errors: blocked.flatMap((item) =>
          item.conflicts.map((message) => `${item.path}: ${message}`),
        ),
      };
    }

    const readyItems = plan.items.filter(
      (item) => item.status === "ready" && item.copyContent && item.nextContent,
    );
    const errors: string[] = [];
    for (const item of readyItems) {
      try {
        await saveVaultFile(
          vaultHandleFor(index.rootPath, browserRoot),
          item.path,
          item.copyContent!,
          `Could not stage property migration for ${item.path}.`,
          item.modifiedMs ?? null,
        );
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (errors.length) {
      return { applied: 0, skipped: readyItems.length, errors };
    }

    const stagedRead = await readCurrentUniverse();
    const stagedByPath = new Map(
      (stagedRead?.files ?? []).map((file) => [file.relativePath, file]),
    );
    for (const item of readyItems) {
      const stagedFile = stagedByPath.get(item.path);
      const stagedFrontmatter = stagedFile
        ? rawToEditorParts(stagedFile.content).frontmatterRaw
        : undefined;
      const document = stagedFrontmatter ? parseFrontmatterDocument(stagedFrontmatter) : undefined;
      const verified = document
        ? item.moves.every(
            (move) =>
              document.hasIn(move.fromPath) &&
              document.hasIn(move.toPath) &&
              JSON.stringify(document.getIn(move.fromPath)) ===
                JSON.stringify(document.getIn(move.toPath)),
          )
        : false;
      if (!verified) {
        errors.push(`Could not verify staged values in ${item.path}.`);
      }
    }
    if (errors.length) {
      return { applied: 0, skipped: readyItems.length, errors };
    }

    await savePropertiesConfig(plan.upgradedConfig);

    let applied = 0;
    for (const item of readyItems) {
      try {
        await saveVaultFile(
          vaultHandleFor(index.rootPath, browserRoot),
          item.path,
          item.nextContent!,
          `Nested values are canonical, but the old key could not be removed from ${item.path}.`,
          null,
        );
        applied += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    await refreshUniverse(readyItems[0]?.path);
    const isVersionUpgrade = plan.sourceVersion !== "3.0";
    showToast(
      errors.length
        ? "Nested values are canonical; some duplicate legacy keys need cleanup."
        : isVersionUpgrade
          ? "Property structure upgraded to 3.0."
          : "Property paths migrated.",
      errors.length ? "warning" : "success",
    );
    return { applied, skipped: readyItems.length - applied, errors };
  }

  async function requestPropertyPathChange(nextConfig: import("./editorTypes").PropertiesConfig) {
    if (!index?.propertiesConfig) return;
    const dirtyPaths = new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.path));
    const plan = planPropertyPathMigration(
      index.files,
      index.propertiesConfig,
      nextConfig,
      dirtyPaths,
    );
    const blocked = plan.items.filter((item) => item.status !== "ready");
    if (blocked.length) {
      const details = blocked
        .slice(0, 4)
        .map((item) => `${item.path}: ${item.conflicts.join(" ")}`)
        .join("\n");
      await confirmDialog(`The property cannot be moved safely yet.\n\n${details}`, {
        title: "Property migration blocked",
        confirmLabel: "OK",
      });
      return;
    }
    if (!plan.items.length) {
      await savePropertiesConfig(nextConfig);
      return;
    }
    const preview = plan.items
      .slice(0, 8)
      .map(
        (item) =>
          `${item.path}: ${item.moves.map((move) => `${move.fromPath.join(".")} → ${move.toPath.join(".")}`).join(", ")}`,
      )
      .join("\n");
    const confirmed = await confirmDialog(
      `This move changes YAML paths in ${plan.items.length} note${plan.items.length === 1 ? "" : "s"}:\n\n${preview}${plan.items.length > 8 ? "\n…" : ""}`,
      { title: "Preview property migration", confirmLabel: "Move property" },
    );
    if (confirmed) await applyPropertyStructureMigration(plan);
  }

  // Shared writer for both Settings normalization tools (missing frontmatter +
  // property normalization); items only need path/content/mtime to be written safely.
  async function applyFrontmatterNormalization(
    items: Array<{ path: string; nextContent: string; modifiedMs?: number | null }>,
  ) {
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
        {
          await saveVaultFile(
            vaultHandleFor(index.rootPath, browserRoot),
            item.path,
            item.nextContent,
            `Could not normalize ${item.path}.`,
            item.modifiedMs ?? null,
          );
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
    if (suiteChrome?.suiteSettings) {
      suiteChrome.suiteSettings.onToggleStyleMode();
      return;
    }
    setThemeById(toggledThemeMode(settings.theme));
  }

  function applyUniverse(
    readResult: VaultReadResult,
    preferredPath?: string,
    pathChange?: PathChangeSet,
  ) {
    const nextIndex = indexVault(readResult, {
      folderNotesEnabled: settings.explorer.folderNotesEnabled,
    });
    const isSameUniverse = index?.rootPath === readResult.rootPath;
    if (!isSameUniverse) {
      // Track what's on disk for this universe so the appearance-save effect
      // doesn't immediately re-write the file it just loaded, but does seed
      // `.everend/settings.json` the first time a universe without one opens.
      vaultAppearanceOnDiskRef.current = nextIndex.vaultAppearanceSettings
        ? serializeVaultAppearance(nextIndex.vaultAppearanceSettings)
        : undefined;
    }
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setErrorMessage("");
    showToast(
      "Esta carpeta será la raíz de tu universo. Todas las aplicaciones de Everend Forge trabajarán sobre ella.",
      "success",
    );
    setSettings((current) => {
      const remembered = rememberUniverse(
        current,
        readResult.rootPath,
        profileForRecent(nextIndex),
      );
      return isSameUniverse
        ? remembered
        : applyVaultAppearanceSettings(remembered, nextIndex.vaultAppearanceSettings);
    });
    const hasEverendWorkspace = nextIndex.files.some(
      (file) =>
        file.relativePath.startsWith(".everend/") &&
        file.relativePath !== VAULT_APPEARANCE_SETTINGS_PATH,
    );
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

  useEffect(() => {
    const path = suiteChrome?.sharedUniversePath;
    if (!path || index?.rootPath === path) return;

    if (!isTauriRuntime()) {
      setLoadState("error");
      setErrorMessage("A shared desktop universe cannot be opened from the web runtime.");
      suiteChrome?.onReady?.();
      return;
    }

    let disposed = false;
    setLoadState("loading");
    setErrorMessage("");
    setBrowserRoot(undefined);

    void invoke<VaultReadResult>("index_vault", { path })
      .then((readResult) => {
        if (!disposed) {
          applyUniverse(readResult);
          suiteChrome?.onReady?.();
        }
      })
      .catch((error) => {
        if (!disposed) {
          setLoadState("error");
          setErrorMessage(error instanceof Error ? error.message : String(error));
          suiteChrome?.onReady?.();
        }
      });

    return () => {
      disposed = true;
    };
  }, [index?.rootPath, suiteChrome?.onReady, suiteChrome?.sharedUniversePath]);

  async function readCurrentUniverse() {
    if (!index) return undefined;
    if (browserRoot) return readBrowserUniverse(browserRoot);
    if (!isTauriRuntime()) {
      throw new Error("Folder access expired. Reopen this universe from the Home screen.");
    }
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
      folderNotesEnabled: settings.explorer.folderNotesEnabled,
    });
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setSettings((current) =>
      rememberUniverse(current, readResult.rootPath, profileForRecent(nextIndex)),
    );
  }

  async function writeCanonChangeSet(
    change: IndexedCanonChangeSet,
    updates: Partial<IndexedCanonChangeSet>,
  ) {
    if (!index) return;
    const next = { ...change, ...updates, updatedAt: new Date().toISOString() };
    const { path, modifiedMs, ...portable } = next;
    await saveVaultFile(
      vaultHandleFor(index.rootPath, browserRoot),
      path,
      `${JSON.stringify(portable, null, 2)}\n`,
      "Could not save Canon change set.",
      modifiedMs ?? null,
    );
  }

  async function applyCanonChangeSet(change: IndexedCanonChangeSet) {
    if (!index || !canWrite) return;
    if (!window.confirm(`Apply the proposal from ${change.sourceApp} to ${change.target.path}?`))
      return;
    const target = index.files.find((file) => file.relativePath === change.target.path);
    try {
      if (
        !target ||
        (change.base.modifiedMs !== undefined && target.modifiedMs !== change.base.modifiedMs)
      ) {
        await writeCanonChangeSet(change, { status: "conflicted" });
        await reindexUniverseMetadata();
        showToast(
          "The Canon source changed or is missing; the proposal is now conflicted.",
          "warning",
        );
        return;
      }
      await saveVaultFile(
        vaultHandleFor(index.rootPath, browserRoot),
        change.target.path,
        change.proposed.content,
        "Could not apply Canon change.",
        target.modifiedMs ?? null,
      );
      await writeCanonChangeSet(change, {
        status: "applied",
        appliedAt: new Date().toISOString(),
        appliedBy: "worldnotion",
      });
      await reindexUniverseMetadata();
      showToast("Applied Canon change set.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not apply Canon change set.",
        "error",
      );
    }
  }

  async function dismissCanonChangeSet(change: IndexedCanonChangeSet) {
    try {
      await writeCanonChangeSet(change, { status: "dismissed" });
      await reindexUniverseMetadata();
      showToast("Dismissed Canon change set.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not update Canon change set.",
        "error",
      );
    }
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

  // Persists a pasted/dropped/picked image into the attachments folder and
  // returns its vault-relative path (or null on failure).
  async function persistImageFile(file: File): Promise<string | null> {
    if (!index) return null;
    try {
      const target = uniqueAttachmentPath(
        index.files.map((entry) => entry.relativePath),
        file.name,
      );
      if (browserRoot) {
        await writeBrowserBinaryFile(browserRoot, target, file);
      } else {
        const base64Content = await fileToBase64(file);
        const result = await invoke<WriteResult>("save_binary_file", {
          vaultPath: index.rootPath,
          relativePath: target,
          base64Content,
        });
        if (!result.ok) throw new Error(result.message ?? "Could not save image.");
      }
      await refreshUniverse();
      showToast(`Inserted image: ${target}`, "success");
      return target;
    } catch (error) {
      console.error("[persistImageFile] Error:", error);
      showToast(error instanceof Error ? error.message : "Could not insert image.", "error");
      return null;
    }
  }

  async function requestImageInsertion(): Promise<{ path: string; alt?: string } | null> {
    const file = await pickImageFile();
    if (!file) return null;
    const path = await persistImageFile(file);
    return path ? { path, alt: file.name.replace(/\.[^.]+$/, "") } : null;
  }

  async function createTemplate() {
    if (!index) return;
    const type = await promptUser("New template type", "Template type");
    if (!type) return;
    const templateType = slugify(type);
    if (!templateType) return;
    const relativePath = `.everend/templates/${templateType}.md`;
    const content = `---\nid: {{id}}\ntype: ${templateType}\nname: {{name}}\nstatus: {{status}}\ntags: []\naliases: []\n---\n\n# {{name}}\n`;
    try {
      await saveVaultFile(
        vaultHandleFor(index.rootPath, browserRoot),
        relativePath,
        content,
        "Could not create template.",
      );
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
    setExplorerSelection([{ path, kind: "file" }]);
    if (isImagePath(path)) {
      setSelectedPath(path);
      setImagePreviewPath(path);
      return;
    }
    openOrCreateTab(path, index);
  }

  function selectPathAfterRefresh(path: string, nextIndex = index) {
    if (!nextIndex) return;
    const file = nextIndex.files.find((f) => f.relativePath === path);
    if (!file) return;
    setSelectedExplorerTarget({ path, kind: "file" });
    setExplorerSelection([{ path, kind: "file" }]);
    openOrCreateTab(path, nextIndex);
  }

  function selectFolder(path: string) {
    setSelectedExplorerTarget({ path, kind: "folder" });
    setExplorerSelection([{ path, kind: "folder" }]);
    setSelectedPath(path);
  }

  function toggleExplorerMultiSelection(path: string, kind: "file" | "folder") {
    setExplorerSelection((current) => {
      const base = current.length
        ? current
        : selectedExplorerTarget
          ? [selectedExplorerTarget]
          : [];
      return base.some((item) => item.path === path)
        ? base.filter((item) => item.path !== path)
        : [...base, { path, kind }];
    });
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
      const universeData = await readBrowserUniverse(root);
      setBrowserRoot(root);
      applyUniverse(universeData);
    } catch (error) {
      console.error("[openUniverse] Error:", error);
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function openDemoUniverse() {
    setLoadState("loading");
    setErrorMessage("");
    try {
      const { createDemoBrowserUniverse } = await import("./utils/demoBrowserUniverse");
      const root = createDemoBrowserUniverse();
      const universeData = await readBrowserUniverse(root);
      setBrowserRoot(root);
      applyUniverse(universeData, "demo-universe.md");
    } catch (error) {
      console.error("[openDemoUniverse] Error:", error);
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

      const inheritCandidates = settings.recentUniverses.filter(
        (path) => !path.startsWith("browser:") && !missingRecentPaths.has(path),
      );
      let inheritFrom: string | undefined;
      if (inheritCandidates.length) {
        const choice = await chooseAppearanceSource(
          inheritCandidates.map((path) => ({
            path,
            profile: settings.recentUniverseProfiles[path],
          })),
        );
        if (!choice) {
          setLoadState(index ? "ready" : "idle");
          return;
        }
        if (choice.type === "inherit") inheritFrom = choice.path;
      }

      setLoadState("loading");
      const result = await invoke<WriteResult>("create_universe", { vaultPath: parent, name });
      if (!result.ok) throw new Error(result.message ?? "Could not create universe.");

      if (inheritFrom) {
        try {
          const sourceRead = await invoke<VaultReadResult>("index_vault", { path: inheritFrom });
          const sourceAppearance = sourceRead.files.find(
            (file) => file.relativePath === VAULT_APPEARANCE_SETTINGS_PATH,
          );
          if (sourceAppearance) {
            await saveVaultFile(
              vaultHandleFor(result.path, undefined),
              VAULT_APPEARANCE_SETTINGS_PATH,
              sourceAppearance.content,
              "Could not copy universe appearance.",
            );
          }
        } catch {
          // Best-effort: the new universe still opens fine with the default appearance.
        }
      }

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
      current.map((tab) => (tab.path === path ? withTabEditorMode(tab, mode) : tab)),
    );
  }

  function setTabWritingMode(path: string, writingMode: WritingMode) {
    setTabs((current) =>
      current.map((tab) => (tab.path === path ? withTabEditorMode(tab, writingMode) : tab)),
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
          // The inspector writes its changes asynchronously. Keep the tab dirty
          // until that write succeeds so a note is never presented as saved
          // before its property change has reached disk.
          dirty: nextRawMarkdown !== tab.savedMarkdown,
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

  function insertTableAtSelection() {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const insertion = tableInsertion(view.state.sliceDoc(selection.from, selection.to));
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

  function renderToolbarButton(command: ToolbarCommand) {
    const Icon = command.icon;
    const active = Boolean(editorFormats && command.isActive?.(editorFormats));
    const hint = shortcutHint(command.id);
    return (
      <button
        key={command.id}
        type="button"
        className={active ? "active" : undefined}
        title={hint ? `${command.label} (${hint})` : command.label}
        aria-label={command.label}
        aria-pressed={active}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => executeCommand(command.id)}
      >
        <Icon size={14} />
      </button>
    );
  }

  function applyHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    replaceCurrentLines((line) => toggleHeadingLine(line, level));
  }

  function applyList(kind: "bullet" | "ordered" | "task") {
    replaceCurrentLines((line, index) => toggleListLine(line, index, kind));
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
      await saveVaultFile(
        vaultHandleFor(index.rootPath, browserRoot),
        relativePath,
        content,
        "Could not create note.",
      );
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
      case "inlineFormat":
        if (editorViewRef.current) toggleInlineFormat(editorViewRef.current, action.format);
        break;
      case "wrapSelection":
        replaceSelection(action.before, action.after, action.placeholder);
        break;
      case "heading":
        applyHeading(action.level);
        break;
      case "blockquote": {
        const view = editorViewRef.current;
        if (!view) break;
        const selection = view.state.selection.main;
        const startLine = view.state.doc.lineAt(selection.from).number;
        const endLine = view.state.doc.lineAt(selection.to).number;
        let removing = true;
        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
          if (!/^\s*>\s?/.test(view.state.doc.line(lineNumber).text)) {
            removing = false;
            break;
          }
        }
        replaceCurrentLines((line) => toggleQuoteLine(line, removing));
        break;
      }
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
      case "table":
        if (!isPluginEnabled(settings.plugins, "table-tools")) {
          showToast("Enable Table Tools in Settings to insert a table.", "error");
          break;
        }
        insertTableAtSelection();
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
                ? withTabEditorMode(tab, tab.mode === "write" ? "source" : "write")
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
        if (editorViewRef.current) {
          const view = editorViewRef.current;
          const position = paragraphLinePositions(view.state.doc, view.state.selection.main.head);
          if (position) {
            view.dispatch({
              effects: paragraphSpacingEffect.of({
                position: position[action.position],
                spacing: action.position,
              }),
            });
            view.focus();
          }
        }
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
    if (suiteChrome && !suiteChrome.active) return;

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
    if (suiteChrome && !suiteChrome.active) return;

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
    suiteChrome,
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
        onCancel={inputDialog.onCancel ?? closeInputDialog}
      />

      <InheritAppearanceDialog
        isOpen={inheritAppearanceDialog.isOpen}
        options={inheritAppearanceDialog.options}
        onConfirm={inheritAppearanceDialog.onConfirm ?? (() => {})}
        onCancel={inheritAppearanceDialog.onCancel ?? closeInheritAppearanceDialog}
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

  if (!suiteChrome && !initialReady) {
    return (
      <BrandLoadingScreen
        message={loadState === "loading" ? "Opening your universe…" : "Preparing your workspace…"}
      />
    );
  }

  if (view === "home" || !index) {
    return (
      <>
        <main className="home-shell">
          <header className="home-topbar">
            <div className="brand">
              <img className="app-brand-icon" src={worldnotionIcon} alt="" aria-hidden="true" />
              <div>
                <h1>Worldnotion</h1>
                <p>Universe-first Markdown workspace</p>
              </div>
            </div>
            <div className="home-topbar-actions">
              <button
                type="button"
                onClick={() => setShowFeedback(true)}
                title="Enviar feedback"
                aria-label="Enviar feedback"
              >
                <MessageSquareText size={15} />
              </button>
              <button
                type="button"
                onClick={toggleBuiltinTheme}
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {activeThemeIsDark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </header>

          <section className="home-panel">
            <div className="home-hero">
              <div className="home-copy">
                <p className="eyebrow">Home</p>
                <h2>Choose a universe</h2>
                <p>
                  Open any local folder as a universe. Markdown stays readable, `.everend` keeps the
                  portable metadata, and Worldnotion remembers where you were working.
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
              <button
                type="button"
                className="primary-action"
                data-onboarding-target="worldnotion.open-universe"
                onClick={openUniverse}
              >
                <FolderOpen size={16} />
                Open Universe
              </button>
              <button
                type="button"
                data-onboarding-target="worldnotion.create-universe"
                onClick={createUniverseFromHome}
              >
                <Plus size={16} />
                Create Universe
              </button>
              <button type="button" onClick={() => void openDemoUniverse()}>
                <BookOpen size={16} />
                Explore demo universe
              </button>
              {settings.recentUniverse && !settings.recentUniverse.startsWith("browser:") ? (
                <button type="button" onClick={() => openRecentUniverse()}>
                  <Home size={16} />
                  Open Recent
                </button>
              ) : null}
            </div>

            {!index ? (
              <UniverseBasicsCard onCreate={createUniverseFromHome} onOpen={openUniverse} />
            ) : null}

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
      multiSelectedPaths={new Set(explorerSelection.map((item) => item.path))}
      pointerDragTargetPath={pointerDragTargetPath}
      openTabPaths={openTabPaths}
      dirtyTabPaths={dirtyTabPaths}
      favoritePaths={favoritePaths}
      favoriteItems={favoriteItems}
      ecosystemGroups={ecosystemGroups}
      ecosystemEntityColors={ecosystemEntityColors}
      entityTagColors={entityTagColors}
      folderNotesEnabled={settings.explorer.folderNotesEnabled}
      customIcons={settings.explorer.customIcons}
      pointerDragActive={Boolean(pointerDragItem?.active)}
      templatesExpanded={templatesExpanded}
      expandedPaths={expandedPaths}
      onToggleTemplatesExpanded={() => setTemplatesExpanded((expanded) => !expanded)}
      onCreateTemplate={createTemplate}
      onSelectPath={selectPath}
      onSelectFolder={selectFolder}
      onToggleMultiSelection={toggleExplorerMultiSelection}
      onToggleExpand={toggleExpand}
      onTreeAction={handleExplorerTreeAction}
      onContextMenu={handleContextMenu}
      onOpenCreateMenu={handleCreateItemMenu}
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
    const isJsonDocument = isJsonPath(documentTab.path);
    const isXmlDocument = isXmlPath(documentTab.path);
    const sourceView =
      documentTab.sourceView ?? (isJsonDocument ? "json" : isXmlDocument ? "xml" : "raw");
    const activeVariantLabel =
      documentTab.path === activeTabPath
        ? readNoteVariants(
            parseFrontmatterRaw(rawToEditorParts(documentTab.rawMarkdown).frontmatterRaw),
          )[activeVariantId]?.label
        : undefined;

    return (
      <section
        className="editor-shell dock-panel-body"
        ref={documentTab.path === activeTabPath ? editorShellRef : undefined}
        onMouseDownCapture={() => {
          if (documentTab.path !== activeTabPath) activateTab(documentTab.path);
        }}
      >
        <div className="floating-control-panel">
          <EditorModeSelector
            mode={documentTab.mode}
            writingMode={documentTab.writingMode}
            disabled={isJsonDocument || isXmlDocument}
            labels={editorModeText}
            onWritingModeChange={(writingMode) => setTabWritingMode(documentTab.path, writingMode)}
            onOpenWriting={() => setTabMode(documentTab.path, "write")}
            onOpenSource={() => setTabMode(documentTab.path, "source")}
          />
          {documentTab.mode === "source" ? (
            <label className="source-view-select-wrap">
              <span className="sr-only">Source view</span>
              <select
                className="source-view-select"
                aria-label="Source view"
                value={sourceView}
                onChange={(event) =>
                  setTabSourceView(
                    documentTab.path,
                    event.target.value as NonNullable<OpenTab["sourceView"]>,
                  )
                }
              >
                <option value="raw">Raw</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
              </select>
            </label>
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
            {[
              ...TOOLBAR_INLINE_COMMANDS,
              ...TOOLBAR_BLOCK_COMMANDS,
              ...TOOLBAR_FIXED_EXTRA_COMMANDS,
            ]
              .filter(
                (command) =>
                  command.id !== "table" || isPluginEnabled(settings.plugins, "table-tools"),
              )
              .map((command) => renderToolbarButton(command))}
            <details className="floating-format-group">
              <summary title="Headings">
                <Heading size={14} />
              </summary>
              <div>{TOOLBAR_HEADING_COMMANDS.map((command) => renderToolbarButton(command))}</div>
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
            {[...TOOLBAR_INLINE_COMMANDS, ...TOOLBAR_BLOCK_COMMANDS].map((command) =>
              renderToolbarButton(command),
            )}
            <details className="floating-format-group">
              <summary title="Headings">
                <Heading size={14} />
              </summary>
              <div>{TOOLBAR_HEADING_COMMANDS.map((command) => renderToolbarButton(command))}</div>
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
          ) : documentTab.mode === "source" && sourceView === "xml" ? (
            <XmlReader value={documentTab.rawMarkdown} />
          ) : (
            <Suspense fallback={<LazyPanelFallback label="Loading editor..." />}>
              {(() => {
                const entity = selectLiveEntity(index, documentTab.path, tabs);
                const type =
                  entity && getEntityTypeDefinition(index?.propertiesConfig, entity.type);
                // Use live frontmatter from editor if available, not from stale index
                const editorParts = rawToEditorParts(documentTab.rawMarkdown);
                const liveFrontmatter = parseFrontmatterRaw(editorParts.frontmatterRaw);
                const frontmatter =
                  Object.keys(liveFrontmatter).length > 0
                    ? liveFrontmatter
                    : entity?.customProperties
                      ? { ...entity.customProperties, type: entity.type, name: entity.name }
                      : {};
                const effectiveFrontmatter = resolveVariantFrontmatter(
                  frontmatter,
                  activeVariantId,
                );
                const portraitPath = entity
                  ? getPresentationRoleValue(
                      index?.propertiesConfig,
                      entity.type,
                      effectiveFrontmatter,
                      "portrait",
                    )
                  : undefined;
                const coverPath = entity
                  ? getPresentationRoleValue(
                      index?.propertiesConfig,
                      entity.type,
                      effectiveFrontmatter,
                      "cover",
                    )
                  : undefined;
                return documentTab.mode === "write" && index && entity && type ? (
                  <DocumentPresentation
                    vaultIndex={index}
                    name={
                      typeof effectiveFrontmatter.name === "string"
                        ? effectiveFrontmatter.name
                        : entity.name
                    }
                    typeLabel={type.label}
                    portraitPath={portraitPath}
                    coverPath={coverPath}
                  />
                ) : null;
              })()}
              <CodeMirrorEditor
                value={editorDisplayValue(documentTab)}
                onChange={(value) => updateRawMarkdownForPath(documentTab.path, value)}
                activeVariantId={
                  documentTab.path === activeTabPath ? activeVariantId : BASE_VARIANT_ID
                }
                activeVariantLabel={
                  documentTab.path === activeTabPath ? activeVariantLabel : undefined
                }
                theme={settings.theme}
                mode={documentTab.mode}
                writingMode={documentTab.writingMode}
                settings={settings.editor}
                pluginSettings={settings.plugins}
                documentName={documentTab.title}
                showDocumentHeader={
                  !(() => {
                    const entity = selectLiveEntity(index, documentTab.path, tabs);
                    if (documentTab.mode !== "write" || !entity || !index) return true;
                    const frontmatter = {
                      ...entity.customProperties,
                      type: entity.type,
                      name: entity.name,
                    };
                    const effectiveFrontmatter = resolveVariantFrontmatter(
                      frontmatter,
                      activeVariantId,
                    );
                    return Boolean(
                      getPresentationRoleValue(
                        index.propertiesConfig,
                        entity.type,
                        effectiveFrontmatter,
                        "portrait",
                      ) ||
                      getPresentationRoleValue(
                        index.propertiesConfig,
                        entity.type,
                        effectiveFrontmatter,
                        "cover",
                      ),
                    );
                  })()
                }
                projectName={
                  index?.universeProfile?.name ??
                  (index?.rootPath ? pathName(index.rootPath) : undefined)
                }
                readOnly={!canWrite}
                resolveWikilink={resolveWikilink}
                resolveImage={(rawPath) =>
                  index
                    ? resolveNoteImageUrl(index, documentTab.path, rawPath)
                    : Promise.resolve(null)
                }
                onInsertImageFile={persistImageFile}
                onRequestImage={requestImageInsertion}
                noteSuggestions={noteSuggestions}
                onOpenWikilink={(targetPath) => openOrCreateTab(targetPath)}
                onMissingWikilink={(label) => showToast(`Missing wikilink: ${label}`, "warning")}
                onOpenUrl={(url) => {
                  void openUrl(url);
                }}
                onRequestUrl={() => promptUser("Insert link", "https://example.com", "https://")}
                onOpenSource={() => setTabMode(documentTab.path, "source")}
                onDocumentNameChange={async (newName) => {
                  if (newName === documentTab.title || !index) return;
                  try {
                    const plan = await renameDocument(documentTab.path, newName);
                    showToast(
                      plan.folderPath
                        ? `Renamed folder note and folder to "${plan.newName}".`
                        : `Renamed to "${plan.newName}".`,
                      "success",
                    );
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    showToast(
                      `Could not rename "${documentTab.title}" to "${newName}": ${message}`,
                      "warning",
                    );
                    throw error;
                  }
                }}
                onCursorMove={() => {
                  if (documentTab.path !== activeTabPath) return;
                  if (editorViewRef.current) {
                    const pos = editorViewRef.current.state.selection.main.head;
                    const line = editorViewRef.current.state.doc.lineAt(pos);
                    setCursorLine(line.number - 1);
                    setEditorFormats(activeFormats(editorViewRef.current.state));
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
            if (!settings.explorer.folderNotesEnabled) return null;
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
          <button
            type="button"
            data-onboarding-target="worldnotion.create-note"
            onClick={createNoteFromTabButton}
          >
            <Plus size={15} />
            New note
          </button>
          <button
            type="button"
            data-onboarding-target="worldnotion.create-folder"
            onClick={() => void handleContextMenuAction("newFolder", "", "empty")}
          >
            <FolderOpen size={15} />
            New folder
          </button>
          <button
            type="button"
            data-onboarding-target="worldnotion.open-universe"
            onClick={() => void openUniverse()}
          >
            <FolderOpen size={15} />
            Open universe
          </button>
          <button
            type="button"
            data-onboarding-target="worldnotion.search-files-action"
            onClick={() => setShowCommandPalette(true)}
          >
            <Search size={15} />
            Search files
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
      onRequestPropertyPathChange={requestPropertyPathChange}
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
      onRequestImage={requestImageInsertion}
      activeVariantId={activeVariantId}
      onSelectVariant={selectActiveVariant}
      onInsertVariantBlock={insertActiveVariantBlock}
      onDeleteVariant={deleteActiveVariant}
      explorerSelection={explorerSelection}
      onMoveExplorerSelection={moveExplorerSelection}
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
          className={`graph-floating-controls ${graphControlsCollapsed ? "collapsed" : ""}`}
          style={{
            transform: `translate(${graphControlsPosition.x}px, ${graphControlsPosition.y}px)`,
          }}
        >
          <div
            className="graph-floating-controls-handle"
            onPointerDown={handleGraphControlsPointerDown}
          >
            <span>Graph Controls</span>
            <button
              type="button"
              className="graph-floating-controls-toggle"
              aria-label={graphControlsCollapsed ? "Show graph controls" : "Hide graph controls"}
              aria-expanded={!graphControlsCollapsed}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setGraphControlsCollapsed((current) => !current)}
            >
              {graphControlsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          {!graphControlsCollapsed ? (
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
          ) : null}
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
    if (tab.kind === "ai-advisor") {
      return (
        <Suspense fallback={<LazyPanelFallback label="Loading AI Advisor..." />}>
          <AiAdvisorPanel
            settings={settings.aiAdvisor}
            onChange={(aiAdvisor) => setSettings((current) => ({ ...current, aiAdvisor }))}
          />
        </Suspense>
      );
    }
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

  function toggleDockPanel(kind: TogglePanelKind | "outline") {
    if (kind === "ai-advisor" && !aiAdvisorEnabled) return;
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) => togglePanelInLayout(current, kind));
  }

  const panelMenuItems: Array<{ kind: TogglePanelKind; label: string; open: boolean }> = [
    { kind: "explorer", label: "Explorer", open: isExplorerPanelOpen },
    { kind: "inspector", label: "Inspector", open: isInspectorPanelOpen },
    { kind: "links", label: "Links", open: isLinksPanelOpen },
    { kind: "backlinks", label: "Backlinks", open: isBacklinksPanelOpen },
    { kind: "graph", label: "Flow Map", open: isGraphPanelOpen },
    ...(aiAdvisorEnabled
      ? [{ kind: "ai-advisor" as const, label: "AI Advisor", open: isAiAdvisorPanelOpen }]
      : []),
  ];
  const openPanelCount = panelMenuItems.filter((item) => item.open).length;

  function setDockPanelInContextGroup(kind: Exclude<DockPanelKind, "document" | "outline">) {
    if (!dockPanelContextMenu) return;
    if (kind === "ai-advisor" && !aiAdvisorEnabled) {
      setDockPanelContextMenu(null);
      return;
    }
    const enabled = !layoutHasPanel(workspaceLayout, kind);
    setActiveWorkspacePreset("custom");
    setWorkspaceLayout((current) =>
      setPanelInGroup(current, kind, dockPanelContextMenu.groupId, enabled),
    );
    setDockPanelContextMenu(null);
  }

  function openSettingsAt(
    section: "overview" | "utils" | "appearance-behavior" | "ai-advisor",
    propertiesMode: "template" | "blank" = "template",
  ) {
    setSettingsInitialSection(section);
    setSettingsInitialPropertiesMode(propertiesMode);
    setShowSettings(true);
  }

  return (
    <WorldnotionLocaleProvider value={interfaceLocale}>
      <main
        className="app-shell dock-app-shell"
        style={{ "--dock-tab-scale": settings.editor.dockTabScale } as CSSProperties}
      >
        <div className="dock-top-bar" aria-label="Workspace controls">
          {suiteChrome ? (
            suiteChrome.renderAppSwitcher()
          ) : (
            <div ref={forgeMenuRef} className={`forge-corner-menu ${forgeMenuOpen ? "open" : ""}`}>
              <div className="forge-orbit-panel" aria-label="Everend menu">
                <button
                  type="button"
                  onClick={() =>
                    void openUrl(EVEREND_FORGE_GITHUB_URL).then(() => setForgeMenuOpen(false))
                  }
                >
                  Github
                </button>
                <button
                  type="button"
                  onClick={() => void openUrl(BUY_SUITE_URL).then(() => setForgeMenuOpen(false))}
                >
                  Buy Suite
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForgeMenuOpen(false);
                    setShowFeedback(true);
                  }}
                >
                  Enviar feedback
                </button>
              </div>
              <button
                type="button"
                className="forge-corner-button"
                onClick={() => setForgeMenuOpen((open) => !open)}
                aria-expanded={forgeMenuOpen}
                aria-label="Open Everend menu"
                title="Everend menu"
              >
                <ForgeCornerLogo />
              </button>
            </div>
          )}

          <div className="dock-top-left">
            <button
              type="button"
              className="dock-icon-button"
              onClick={suiteChrome?.onHome ?? (() => setView("home"))}
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
              onClick={() => openSettingsAt("appearance-behavior")}
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

            <div className="dock-panel-menu-anchor">
              <button
                type="button"
                className={`topbar-menu-trigger dock-panel-menu-toggle ${dockPanelMenuOpen ? "active" : ""}`}
                onClick={() => setDockPanelMenuOpen((current) => !current)}
                aria-haspopup="dialog"
                aria-expanded={Boolean(dockPanelMenuOpen)}
                title="Show workspace panels"
              >
                <SlidersHorizontal size={14} />
                <span>View</span>
                <small>{openPanelCount}</small>
              </button>
              {dockPanelMenuOpen ? (
                <div
                  className="topbar-menu-popover dock-panel-menu"
                  role="dialog"
                  aria-label="View workspace panels"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="dock-panel-menu-header">
                    <strong>View</strong>
                    <button
                      type="button"
                      className="dock-panel-menu-close"
                      aria-label="Close workspace panels"
                      onClick={closeDockPanelMenu}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="dock-panel-menu-options" role="group" aria-label="Toggle panels">
                    {panelMenuItems.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        className={`dock-panel-menu-option ${item.open ? "active" : ""}`}
                        aria-pressed={item.open}
                        onClick={() => toggleDockPanel(item.kind)}
                      >
                        <span className="dock-panel-menu-check">
                          {item.open ? <Check size={12} /> : null}
                        </span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="dock-panel-menu-divider" />
                  <button
                    type="button"
                    className={`dock-panel-menu-option dock-panel-menu-action ${showCanonChanges ? "active" : ""}`}
                    onClick={() => {
                      setShowCanonChanges(true);
                      closeDockPanelMenu();
                    }}
                  >
                    <GitPullRequest size={14} />
                    <span>Review changes</span>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="dock-icon-button"
              onClick={() => setShowFeedback(true)}
              title="Enviar feedback"
              aria-label="Enviar feedback"
            >
              <MessageSquareText size={15} />
            </button>
            <button
              type="button"
              className="dock-icon-button"
              onClick={toggleBuiltinTheme}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {activeThemeIsDark ? <Sun size={15} /> : <Moon size={15} />}
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
        {!onboardingDismissed ? (
          <OnboardingGuide
            steps={worldNotionOnboardingSteps}
            onDismiss={dismissWorldNotionOnboarding}
            onRestart={restartWorldNotionOnboarding}
          />
        ) : null}
        <CanonChangesDialog
          open={showCanonChanges}
          changes={canonChangeSets}
          onApply={(change) => void applyCanonChangeSet(change)}
          onDismiss={(change) => void dismissCanonChangeSet(change)}
          onRefresh={() => void reindexUniverseMetadata()}
          onClose={() => setShowCanonChanges(false)}
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
              ...(aiAdvisorEnabled ? [["ai-advisor", "AI Advisor", isAiAdvisorPanelOpen]] : []),
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
              onScanPropertyNormalization={scanPropertyNormalization}
              onApplyPropertyNormalization={applyFrontmatterNormalization}
              onScanPropertyStructureMigration={scanPropertyStructureMigration}
              onApplyPropertyStructureMigration={applyPropertyStructureMigration}
              onClose={() => setShowSettings(false)}
              onRevealUniverse={() => {
                void revealExplorerPath();
              }}
              onOpenUniverseNote={openUniverseNote}
              onResetOnboarding={restartWorldNotionOnboarding}
              revealUniverseLabel={labels.revealUniverse}
              suiteSettings={suiteChrome?.suiteSettings}
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
            isImage={isImagePath(contextMenu.targetPath)}
            canReveal={!browserRoot}
            revealLabel={labels.revealItem}
            revealUniverseLabel={labels.revealUniverse}
            trashLabel={browserRoot ? "Delete" : labels.trashAction}
            hasFolderDescription={
              contextMenu.targetKind === "folder" && index
                ? folderDescriptionInfo(index, contextMenu.targetPath).hasDescription
                : false
            }
            folderNotesEnabled={settings.explorer.folderNotesEnabled}
            canPromoteToFolderNote={
              contextMenu.targetKind === "file" && index && dirname(contextMenu.targetPath)
                ? !folderDescriptionInfo(index, dirname(contextMenu.targetPath)).hasDescription
                : false
            }
            onAction={handleContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        )}

        {imagePreviewPath && index ? (
          <ImagePreviewDialog
            index={index}
            path={imagePreviewPath}
            onClose={() => setImagePreviewPath(undefined)}
          />
        ) : null}

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
        {showFeedback ? (
          <FeedbackModal
            screen="workspace"
            onClose={() => setShowFeedback(false)}
            onOpenExternal={openExternalUrl}
          />
        ) : null}
      </main>
    </WorldnotionLocaleProvider>
  );
}

export default App;
