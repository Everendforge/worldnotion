export type EditorMode = "write" | "source";

export type EditorCommandId =
  | "save"
  | "search"
  | "bold"
  | "italic"
  | "inlineCode"
  | "codeBlock"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "unorderedList"
  | "orderedList"
  | "taskList"
  | "link"
  | "wikilink"
  | "horizontalRule"
  | "foldBlock"
  | "commandPalette"
  | "switchMode"
  | "closeTab"
  | "nextTab"
  | "previousTab";

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

export type EditorSettings = {
  lineNumbers: boolean;
  lineWrap: boolean;
  activeLine: boolean;
  fontSize: number;
  tabSize: number;
  defaultMode: EditorMode;
  persistTabs: boolean;
  reuseOpenTabs: boolean;
  confirmCloseDirtyTab: boolean;
};

export type OpenTab = {
  path: string;
  title: string;
  dirty: boolean;
  mode: EditorMode;
  modifiedMs?: number | null;
  isTemplate: boolean;
  absolutePath?: string;
  rawMarkdown: string;
  savedMarkdown: string;
};

export type PersistedOpenTab = Pick<OpenTab, "path" | "title" | "mode" | "modifiedMs" | "isTemplate">;

export type WorkspaceSession = {
  rootPath: string;
  activePath?: string;
  tabs: PersistedOpenTab[];
};

export type ExplorerFavorite = {
  path: string;
  kind: "file" | "folder";
  label: string;
};

export type ExplorerSection = "allFiles" | "favorites";

export type ExplorerSettings = {
  favorites: ExplorerFavorite[];
  recentFiles: string[];
  activeSection: ExplorerSection;
  confirmDragMove: boolean;
  showHiddenEverend: boolean;
};

export type AppSettingsV4 = {
  theme: "light" | "dark";
  recentUniverse?: string;
  recentUniverses: string[];
  editor: EditorSettings;
  explorer: ExplorerSettings;
  keybindings: Keybinding[];
  sessions: Record<string, WorkspaceSession>;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  lineNumbers: true,
  lineWrap: true,
  activeLine: true,
  fontSize: 14,
  tabSize: 2,
  defaultMode: "write",
  persistTabs: true,
  reuseOpenTabs: true,
  confirmCloseDirtyTab: true,
};

export const DEFAULT_EXPLORER_SETTINGS: ExplorerSettings = {
  favorites: [],
  recentFiles: [],
  activeSection: "allFiles",
  confirmDragMove: true,
  showHiddenEverend: false,
};

export const EDITOR_COMMANDS: EditorCommand[] = [
  { id: "save", label: "Save", group: "file", defaultShortcut: "Mod+S" },
  { id: "search", label: "Search", group: "navigation", defaultShortcut: "Mod+F" },
  { id: "bold", label: "Bold", group: "format", defaultShortcut: "Mod+B" },
  { id: "italic", label: "Italic", group: "format", defaultShortcut: "Mod+I" },
  { id: "inlineCode", label: "Inline Code", group: "format", defaultShortcut: "Mod+E" },
  { id: "codeBlock", label: "Code Block", group: "format", defaultShortcut: "Mod+Shift+C" },
  { id: "heading1", label: "Heading 1", group: "format", defaultShortcut: "Mod+Alt+1" },
  { id: "heading2", label: "Heading 2", group: "format", defaultShortcut: "Mod+Alt+2" },
  { id: "heading3", label: "Heading 3", group: "format", defaultShortcut: "Mod+Alt+3" },
  { id: "blockquote", label: "Blockquote", group: "format", defaultShortcut: "Mod+Shift+." },
  { id: "unorderedList", label: "Unordered List", group: "format", defaultShortcut: "Mod+Shift+8" },
  { id: "orderedList", label: "Ordered List", group: "format", defaultShortcut: "Mod+Shift+7" },
  { id: "taskList", label: "Task List", group: "format", defaultShortcut: "Mod+Shift+9" },
  { id: "link", label: "Link", group: "insert", defaultShortcut: "Mod+K" },
  { id: "wikilink", label: "Wikilink", group: "insert", defaultShortcut: "Mod+Shift+K" },
  { id: "horizontalRule", label: "Horizontal Rule", group: "insert", defaultShortcut: "Mod+Shift+H" },
  { id: "foldBlock", label: "Fold Current Block", group: "navigation", defaultShortcut: "Mod+Alt+[" },
  { id: "commandPalette", label: "Command Palette", group: "workspace", defaultShortcut: "Mod+P" },
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
