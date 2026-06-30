export type EditorMode = "write" | "source";
export type SourceViewMode = "raw" | "json";
export type EditorPageStyle = "theme" | "white" | "warm-paper" | "system" | "custom";
export type ThemeId =
  | "worldnotion-light"
  | "worldnotion-dark"
  | "github"
  | "github-dark"
  | "one-light-pro"
  | "one-dark-pro"
  | "dracula-light"
  | "dracula"
  | "light-owl"
  | "night-owl"
  | "material-lighter"
  | "material-palenight";

export type EditorCommandId =
  | "save"
  | "search"
  | "replace"
  | "findNext"
  | "findPrevious"
  | "bold"
  | "italic"
  | "inlineCode"
  | "codeBlock"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "blockquote"
  | "unorderedList"
  | "orderedList"
  | "taskList"
  | "link"
  | "wikilink"
  | "footnote"
  | "horizontalRule"
  | "foldBlock"
  | "commandPalette"
  | "quickSwitcher"
  | "toggleOutline"
  | "collapseExplorerFolders"
  | "switchMode"
  | "closeTab"
  | "nextTab"
  | "previousTab"
  | "spaceBefore"
  | "spaceAfter";

export type EditorCommand = {
  id: EditorCommandId;
  label: string;
  group: "file" | "format" | "insert" | "navigation" | "workspace";
  defaultShortcut?: string;
};

export type Keybinding = {
  commandId: EditorCommandId;
  shortcut: string;
};

export type PluginId =
  | "wikilinks"
  | "footnotes"
  | "code-folding"
  | "markdown-syntax-hiding"
  | "font-family-rendering"
  | "document-header"
  | "unity-adapter"
  | "godot-adapter"
  | "unreal-adapter";

export type PluginCategory = "editor" | "navigation" | "visual" | "runtime-adapter";
export type PluginStatus = "available" | "core" | "planned";
export type PluginRiskLevel = "low" | "medium" | "high";

export type PluginDefinition = {
  id: PluginId;
  name: string;
  description: string;
  category: PluginCategory;
  status: PluginStatus;
  scope: "worldnotion" | "everend-runtime";
  defaultEnabled: boolean;
  configurable: boolean;
  riskLevel: PluginRiskLevel;
};

export type PluginSettings = {
  enabled: Partial<Record<PluginId, boolean>>;
};

export type EditorSettings = {
  lineNumbers: boolean;
  lineWrap: boolean;
  activeLine: boolean;
  fontSize: number;
  tabSize: number;
  defaultMode: EditorMode;
  pageStyle: EditorPageStyle;
  customPageColor: string;
  writeFontFamily: string;
  sourceFontFamily: string;
  hideMarkdownSyntaxInWrite: boolean;
  persistTabs: boolean;
  reuseOpenTabs: boolean;
  dockTabScale: number;
  confirmCloseDirtyTab: boolean;
  showPaperShadow: boolean; // Show paper container with shadow in write mode
  // Navigation & Visualization features (Phase 1 & 2)
  commandPaletteEnabled: boolean;
  quickSwitcherEnabled: boolean;
  searchPanelEnabled: boolean;
  outlineGuideEnabled: boolean;
  outlinePosition: "left" | "right";
  breadcrumbsEnabled: boolean;
  codeFoldingEnabled: boolean;
  floatingToolbarEnabled: boolean;
  // Document header in editor
  documentHeaderEnabled: boolean;
  showProjectNameInHeader: boolean;
};

export type EditorDocumentParts = {
  frontmatterRaw: string;
  bodyMarkdown: string;
};

export type SlashCommandDefinition = {
  id: string;
  label: string;
  keywords: string[];
  group: "block" | "format" | "insert";
};

export type FloatingFormatCommand = {
  id: EditorCommandId;
  label: string;
};

export type ResolvedWikilink = {
  label: string;
  targetPath?: string;
  status: "resolved" | "missing";
};

export type NoteSuggestion = {
  label: string;
  path: string;
  aliases: string[];
  id?: string;
};

export type OpenTab = {
  path: string;
  title: string;
  dirty: boolean;
  mode: EditorMode;
  sourceView?: SourceViewMode;
  modifiedMs?: number | null;
  isTemplate: boolean;
  absolutePath?: string;
  rawMarkdown: string;
  savedMarkdown: string;
};

export type PersistedOpenTab = Pick<OpenTab, "path" | "title" | "mode" | "sourceView" | "modifiedMs" | "isTemplate">;

export type DocumentTabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabPaths: string[];
};

export type DockPanelKind = "document" | "explorer" | "graph" | "outline" | "links" | "backlinks" | "inspector";

export type DockTabRef = {
  id: string;
  kind: DockPanelKind;
  title: string;
  path?: string;
};

export type DockGroupNode = {
  type: "group";
  id: string;
  tabs: DockTabRef[];
  activeTabId?: string;
};

export type DockSplitNode = {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  ratio: number;
  first: DockNode;
  second: DockNode;
};

export type DockNode = DockGroupNode | DockSplitNode;

export type WorkspaceLayoutV1 = {
  version: 1;
  root: DockNode;
  activeGroupId: string;
};

export type FileEditorState = {
  cursorPosition?: { line: number; column: number };
  scrollPosition?: number;
  foldedRanges?: Array<{ from: number; to: number }>;
  selection?: { from: number; to: number };
  lastModified: number;
};

export type FileAccessStats = {
  path: string;
  count: number;
  lastAccessed: number;
};

export type WorkspaceSession = {
  rootPath: string;
  activePath?: string;
  tabs: PersistedOpenTab[];
  layout?: WorkspaceLayoutV1;
  documentTabGroups?: DocumentTabGroup[];
  explorerExpandedPaths?: string[];
  editorState?: Record<string, FileEditorState>;
  fileAccessStats?: FileAccessStats[];
};

export type ExplorerFavorite = {
  path: string;
  kind: "file" | "folder";
  label: string;
};

export type ExplorerSection = "allFiles" | "favorites" | "ecosystem";

export type RecentUniverseProfile = {
  name?: string;
  icon?: {
    type: "preset" | "image";
    value: string;
  };
};

export type ExplorerSettings = {
  favorites: ExplorerFavorite[];
  recentFiles: string[];
  activeSection: ExplorerSection;
  confirmDragMove: boolean;
  showHiddenEverend: boolean;
  ignoreFolderNoteMetadata: boolean;
  customIcons?: Record<string, string>;
  focusedFoldersByUniverse?: Record<string, string>;
};

export type GraphGroupRule = {
  id: string;
  query: string;
  color: string;
  label: string;
};

export type GraphSettings = {
  mode: "global" | "local";
  depth: number;
  searchQuery: string;
  showTags: boolean;
  existingFilesOnly: boolean;
  showOrphans: boolean;
  showWikilinks: boolean;
  showHierarchy: boolean;
  showTagRelations: boolean;
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  linkThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  groups: GraphGroupRule[];
};

export type AppSettingsV4 = {
  theme: ThemeId;
  recentUniverse?: string;
  recentUniverses: string[];
  recentUniverseProfiles: Record<string, RecentUniverseProfile>;
  editor: EditorSettings;
  explorer: ExplorerSettings;
  graph: GraphSettings;
  plugins: PluginSettings;
  keybindings: Keybinding[];
  sessions: Record<string, WorkspaceSession>;
};

export type CommandPaletteMode = "files" | "commands" | "headers" | "tags";

export type CommandPaletteResultBase = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
};

export type FileResult = CommandPaletteResultBase & {
  type: "file";
  path: string;
  tags?: string[];
  lastModified?: number;
  entityType?: string;
  status?: string;
  customProperties?: Record<string, unknown>;
};

export type CommandResult = CommandPaletteResultBase & {
  type: "command";
  commandId: EditorCommandId;
  group: string;
  shortcut?: string;
};

export type HeaderResult = CommandPaletteResultBase & {
  type: "header";
  level: number;
  line: number;
};

export type TagResult = CommandPaletteResultBase & {
  type: "tag";
  tag: string;
  fileCount: number;
  fullPath?: string;
  depth?: number;
  color?: string;
};

export type CommandPaletteResult = FileResult | CommandResult | HeaderResult | TagResult;

// ============================================================================
// Taxonomy System Types - Hierarchical Tags, Entity Types, Status, Custom Fields
// ============================================================================

export type TagHierarchyNode = {
  id: string; // Unique identifier (e.g., "character-protagonist-main")
  label: string; // Display name (e.g., "Main")
  fullPath: string; // Complete slash path (e.g., "character/protagonist/main")
  children: TagHierarchyNode[]; // Child tags
  color?: string; // Optional color for visualization (hex)
  icon?: string; // Optional icon identifier
  description?: string; // Optional description
  parentId?: string; // Reference to parent node ID
};

export type CustomFieldType = 
  | "text" 
  | "number" 
  | "boolean" 
  | "date" 
  | "select" 
  | "multiselect" 
  | "entity-ref" 
  | "entity-ref-list"
  | "url"
  | "email"
  | "phone"
  | "file"
  | "image"
  | "group";

export type CustomFieldDefinition = {
  id: string; // Unique identifier (e.g., "hp", "alignment")
  label: string; // Display name (e.g., "Hit Points", "Alignment")
  type: CustomFieldType;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  // For select/multiselect types
  options?: Array<{ value: string; label: string; color?: string }>;
  // For entity-ref types
  targetTypes?: string[]; // Which entity types can be referenced
  // Validation
  min?: number; // For number type
  max?: number; // For number type
  pattern?: string; // For text type (regex)
  // Hierarchical properties support (v2.0)
  children?: PropertyDefinition[]; // Child properties for this field
  visibleWhen?: Record<string, string[]>; // Conditional visibility: { parentFieldId: ['value1', 'value2'] }
  group?: string; // Grouping category for UI organization
  order?: number; // Display order within parent or global scope
};

export type ContentTypeDefinition = {
  id: string; // Internal identifier (e.g., "folder-description")
  label: string; // Display name (e.g., "Folder Note")
  description?: string;
  icon?: string; // Icon identifier
  color?: string; // Primary color for this type (hex)
  immutable: true; // Content types are system-defined and cannot be deleted
};

export type EntityTypeDefinition = {
  id: string; // Internal identifier (e.g., "character", "location")
  label: string; // Display name (e.g., "Character", "Location")
  description?: string;
  icon?: string; // Icon identifier
  color?: string; // Primary color for this type (hex)
  // Custom fields specific to this type
  customFields?: string[]; // Array of CustomFieldDefinition IDs
  // Property visibility per entity type
  visibleProperties?: string[]; // Which properties to show (base + custom)
  propertyOrder?: string[]; // Override display order
  hiddenProperties?: string[]; // Explicitly hidden properties
  // Template settings
  defaultTemplate?: string; // Path to template file
  defaultFolder?: string; // Suggested folder for new entities of this type
};

export type StatusDefinition = {
  id: string; // Internal identifier (e.g., "draft", "published")
  label: string; // Display name (e.g., "Draft", "Published")
  description?: string;
  color?: string; // Status color (hex)
  icon?: string; // Optional icon
  order?: number; // Display order
};

export type BasePropertyDefinition = {
  id: string; // System property ID (e.g., "id", "name", "type", "status", "tags")
  label?: string; // Optional custom display name (overrides default)
  description?: string;
  icon?: string; // Optional icon identifier
  hidden?: boolean; // Don't show in editor unless explicitly enabled
  immutable?: boolean; // Cannot be deleted (id, name, type are always immutable)
  readOnly?: boolean; // Cannot be edited by user
  order?: number; // Display order in editor
  type: CustomFieldType; // Property type (same as custom fields)
  // Validation (same as custom fields)
  required?: boolean;
  defaultValue?: unknown;
  options?: Array<{ value: string; label: string; color?: string }>; // For select/multiselect
  targetTypes?: string[]; // For entity-ref types
  min?: number;
  max?: number;
  pattern?: string;
  // Hierarchical properties support (v2.0)
  children?: PropertyDefinition[]; // Child properties for this field
  visibleWhen?: Record<string, string[]>; // Conditional visibility: { parentFieldId: ['value1', 'value2'] }
  group?: string; // Grouping category for UI organization
};

export type PropertyDefinition = BasePropertyDefinition | CustomFieldDefinition;

export type TaxonomyConfig = {
  version: string; // Schema version (e.g., "1.0", "2.0")
  baseProperties?: {
    definitions: BasePropertyDefinition[]; // Configurable base properties
    visibleByDefault?: string[]; // Which properties appear in UI by default
    order?: string[]; // Global display order
  };
  tags: {
    rootNodes: TagHierarchyNode[]; // Top-level tags
    allowCustomTags: boolean; // Allow users to create tags not in hierarchy
    autoDetectSlashNotation: boolean; // Automatically parse "tag/subtag" syntax
  };
  contentTypes?: {
    definitions: ContentTypeDefinition[]; // System content types (immutable)
  };
  entityTypes: {
    definitions: EntityTypeDefinition[];
    defaultType: string; // Default type for new entities
    allowCustomTypes: boolean; // Allow types not in definitions
  };
  statuses: {
    definitions: StatusDefinition[];
    defaultStatus: string; // Default status for new entities
    allowCustomStatuses: boolean; // Allow statuses not in definitions
  };
  customFields: {
    definitions: CustomFieldDefinition[];
    globalFields?: string[]; // Fields available to all entity types
  };
};

export type PropertiesConfig = TaxonomyConfig;

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  lineNumbers: true,
  lineWrap: true,
  activeLine: true,
  fontSize: 14,
  tabSize: 2,
  defaultMode: "write",
  pageStyle: "theme",
  customPageColor: "#ffffff",
  writeFontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  sourceFontFamily: '"SFMono-Regular", Consolas, monospace',
  hideMarkdownSyntaxInWrite: true,
  persistTabs: true,
  reuseOpenTabs: true,
  dockTabScale: 1.25,
  confirmCloseDirtyTab: true,
  showPaperShadow: true, // Paper style enabled by default
  // Navigation & Visualization features (Phase 1 & 2) - enabled by default
  commandPaletteEnabled: true,
  quickSwitcherEnabled: true,
  searchPanelEnabled: true,
  outlineGuideEnabled: true,
  outlinePosition: "right",
  breadcrumbsEnabled: true,
  codeFoldingEnabled: true,
  floatingToolbarEnabled: true,
  // Document header in editor
  documentHeaderEnabled: true,
  showProjectNameInHeader: false,
};

export const DEFAULT_EXPLORER_SETTINGS: ExplorerSettings = {
  favorites: [],
  recentFiles: [],
  activeSection: "allFiles",
  confirmDragMove: true,
  showHiddenEverend: false,
  ignoreFolderNoteMetadata: false,
  customIcons: {},
  focusedFoldersByUniverse: {},
};

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  mode: "global",
  depth: 1,
  searchQuery: "",
  showTags: false,
  existingFilesOnly: true,
  showOrphans: true,
  showWikilinks: true,
  showHierarchy: false,
  showTagRelations: false,
  showArrows: false,
  textFadeThreshold: 0.75,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.08,
  repelForce: 240,
  linkForce: 0.45,
  linkDistance: 110,
  groups: [],
};

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  enabled: {
    wikilinks: true,
    footnotes: true,
    "code-folding": true,
    "markdown-syntax-hiding": true,
    "font-family-rendering": true,
    "document-header": true,
    "unity-adapter": false,
    "godot-adapter": false,
    "unreal-adapter": false,
  },
};

export const EDITOR_COMMANDS: EditorCommand[] = [
  { id: "save", label: "Save", group: "file", defaultShortcut: "Mod+S" },
  { id: "search", label: "Find", group: "navigation", defaultShortcut: "Mod+F" },
  { id: "replace", label: "Find and Replace", group: "navigation", defaultShortcut: "Mod+H" },
  { id: "findNext", label: "Find Next", group: "navigation", defaultShortcut: "F3" },
  { id: "findPrevious", label: "Find Previous", group: "navigation", defaultShortcut: "Shift+F3" },
  { id: "bold", label: "Bold", group: "format", defaultShortcut: "Mod+B" },
  { id: "italic", label: "Italic", group: "format", defaultShortcut: "Mod+I" },
  { id: "inlineCode", label: "Inline Code", group: "format", defaultShortcut: "Mod+E" },
  { id: "codeBlock", label: "Code Block", group: "format", defaultShortcut: "Mod+Shift+C" },
  { id: "heading1", label: "Heading 1", group: "format", defaultShortcut: "Mod+Alt+1" },
  { id: "heading2", label: "Heading 2", group: "format", defaultShortcut: "Mod+Alt+2" },
  { id: "heading3", label: "Heading 3", group: "format", defaultShortcut: "Mod+Alt+3" },
  { id: "heading4", label: "Heading 4", group: "format" },
  { id: "heading5", label: "Heading 5", group: "format" },
  { id: "heading6", label: "Heading 6", group: "format" },
  { id: "blockquote", label: "Blockquote", group: "format", defaultShortcut: "Mod+Shift+." },
  { id: "unorderedList", label: "Unordered List", group: "format", defaultShortcut: "Mod+Shift+8" },
  { id: "orderedList", label: "Ordered List", group: "format", defaultShortcut: "Mod+Shift+7" },
  { id: "taskList", label: "Task List", group: "format", defaultShortcut: "Mod+Shift+9" },
  { id: "link", label: "Link", group: "insert", defaultShortcut: "Mod+K" },
  { id: "wikilink", label: "Wikilink", group: "insert", defaultShortcut: "Mod+Shift+K" },
  { id: "footnote", label: "Footnote", group: "insert", defaultShortcut: "Mod+Alt+F" },
  { id: "horizontalRule", label: "Horizontal Rule", group: "insert", defaultShortcut: "Mod+Shift+H" },
  { id: "foldBlock", label: "Fold Current Block", group: "navigation", defaultShortcut: "Mod+Alt+[" },
  { id: "commandPalette", label: "Command Palette", group: "workspace", defaultShortcut: "Mod+P" },
  { id: "quickSwitcher", label: "Quick Switcher", group: "workspace", defaultShortcut: "Mod+Alt+O" },
  { id: "toggleOutline", label: "Toggle Outline", group: "workspace", defaultShortcut: "Mod+Shift+O" },
  { id: "collapseExplorerFolders", label: "Collapse Explorer Folders", group: "workspace", defaultShortcut: "Mod+Shift+E" },
  { id: "switchMode", label: "Switch Write/Source Mode", group: "workspace", defaultShortcut: "Mod+/" },
  { id: "closeTab", label: "Close Tab", group: "workspace", defaultShortcut: "Mod+W" },
  { id: "nextTab", label: "Next Tab", group: "workspace", defaultShortcut: "Mod+Shift+]" },
  { id: "previousTab", label: "Previous Tab", group: "workspace", defaultShortcut: "Mod+Shift+[" },
];

export const DEFAULT_KEYBINDINGS: Keybinding[] = EDITOR_COMMANDS
  .filter((command) => command.defaultShortcut)
  .map((command) => ({
    commandId: command.id,
    shortcut: command.defaultShortcut ?? "",
  }));

export function shortcutFor(commandId: EditorCommandId, keybindings: Keybinding[]) {
  return keybindings.find((binding) => binding.commandId === commandId)?.shortcut ?? "";
}
