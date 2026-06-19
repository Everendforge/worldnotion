import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { foldCode } from "@codemirror/language";
import {
  BookOpen,
  Castle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Globe2,
  Home,
  Moon,
  Plus,
  Save,
  Search,
  Settings,
  Star,
  StarOff,
  Sun,
  FileEdit,
  AlertTriangle,
  X,
  ExternalLink,
  RefreshCw,
  ChevronsDownUp,
  Sparkles,
} from "lucide-react";
import "./App.css";
import { ContextMenu, CodeMirrorEditor, SettingsModal, CommandPalette } from "./components";
import { OutlineGuide } from "./components/OutlineGuide";
import { FontSelector } from "./components/FontSelector";
import { InputDialog } from "./components/InputDialog";
import { Toast } from "./components/Toast";
import { extractOutline, findCurrentHeader } from "./utils/outlineExtractor";
import type { ContextMenuAction } from "./components";
import { useFonts } from "./utils/useFonts";
import {
  AppSettingsV4,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_KEYBINDINGS,
  EDITOR_COMMANDS,
  EditorCommandId,
  EditorDocumentParts,
  ExplorerSection,
  FloatingFormatCommand,
  NoteSuggestion,
  OpenTab,
  RecentUniverseProfile,
  ResolvedWikilink,
  ThemeId,
  WorkspaceSession,
  shortcutFor,
  FileResult,
  CommandResult,
  HeaderResult,
  TagResult,
} from "./editorTypes";
import {
  Entity,
  EntityTemplate,
  ValidationFinding,
  VaultFile,
  VaultIndex,
  VaultReadResult,
  VaultTreeNode,
  WriteResult,
  UniverseProfile,
  buildTree,
  indexVault,
  joinMarkdown,
  splitMarkdown,
  dirname,
  slugify,
} from "./domain";
import { isDarkTheme, normalizeThemeId, themeById, themeForStyleCommand, toggledThemeMode } from "./themes";
import { incrementFileAccess } from "./utils/fileAccessStats";

type LoadState = "idle" | "loading" | "ready" | "error";
type AppView = "home" | "workspace";
type PathChange = {
  fromPath: string;
  toPath: string;
  mode: "single" | "tree";
};
type PathChangeSet = PathChange | PathChange[];
type PointerDragItem = {
  path: string;
  kind: "file" | "folder";
  startX: number;
  startY: number;
  active: boolean;
};

type BrowserFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }>;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

type BrowserDirectoryHandle = {
  name: string;
  entries: () => AsyncIterableIterator<[string, BrowserDirectoryHandle | BrowserFileHandle]>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserFileHandle>;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

const SETTINGS_KEY = "worldnotion.settings.v4";
const LEGACY_SETTINGS_KEY = "worldnotion.settings.v3";

function loadSettings(): AppSettingsV4 {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "{}";
    const parsed = JSON.parse(stored) as Partial<AppSettingsV4>;
    const recentUniverses = Array.isArray(parsed.recentUniverses)
      ? parsed.recentUniverses.filter((item): item is string => typeof item === "string")
      : parsed.recentUniverse
        ? [parsed.recentUniverse]
        : [];
    const parsedExplorer: Partial<AppSettingsV4["explorer"]> = parsed.explorer ?? {};
    const activeSection = parsedExplorer.activeSection === "favorites" ? "favorites" : "allFiles";
    
    // Merge keybindings: keep user customizations but add new defaults
    const mergedKeybindings = (() => {
      if (!parsed.keybindings?.length) return DEFAULT_KEYBINDINGS;
      
      const userBindings = new Map(parsed.keybindings.map(kb => [kb.commandId, kb.shortcut]));
      return DEFAULT_KEYBINDINGS.map(defaultKb => ({
        commandId: defaultKb.commandId,
        shortcut: userBindings.get(defaultKb.commandId) ?? defaultKb.shortcut,
      }));
    })();
    
    return {
      theme: normalizeThemeId(parsed.theme),
      recentUniverse: parsed.recentUniverse,
      recentUniverses,
      recentUniverseProfiles: parsed.recentUniverseProfiles ?? {},
      editor: { ...DEFAULT_EDITOR_SETTINGS, ...(parsed.editor ?? {}) },
      explorer: { ...DEFAULT_EXPLORER_SETTINGS, ...parsedExplorer, activeSection },
      keybindings: mergedKeybindings,
      sessions: parsed.sessions ?? {},
    };
  } catch {
    return {
      theme: "worldnotion-light",
      recentUniverses: [],
      recentUniverseProfiles: {},
      editor: DEFAULT_EDITOR_SETTINGS,
      explorer: DEFAULT_EXPLORER_SETTINGS,
      keybindings: DEFAULT_KEYBINDINGS,
      sessions: {},
    };
  }
}

function saveSettings(settings: AppSettingsV4) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function canUseBrowserDirectoryPicker() {
  return "showDirectoryPicker" in window;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function pathName(path: string): string {
  return path.replace(/^browser:/, "").split(/[\\/]/).pop() ?? path;
}

function platformLabels() {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = platform.includes("mac");
  const isWindows = platform.includes("win") || userAgent.includes("windows");
  return {
    revealItem: isWindows ? "Reveal in Explorer" : isMac ? "Reveal in Finder" : "Reveal in Files",
    revealUniverse: isWindows ? "Reveal universe folder in Explorer" : isMac ? "Reveal universe folder in Finder" : "Reveal universe folder",
    trashAction: isWindows ? "Move to Recycle Bin" : "Move to Trash",
    trashDone: isWindows ? "Moved to Recycle Bin." : "Moved to Trash.",
  };
}

function profileForRecent(index: VaultIndex): RecentUniverseProfile {
  return {
    name: universeDisplayName(index),
    icon: index.universeProfile?.icon ?? { type: "preset", value: "book" },
  };
}

function rememberUniverse(
  settings: AppSettingsV4,
  rootPath: string,
  profile?: RecentUniverseProfile,
): AppSettingsV4 {
  const recentUniverses = [
    rootPath,
    ...settings.recentUniverses.filter((candidate) => candidate !== rootPath),
  ].slice(0, 8);
  return {
    ...settings,
    recentUniverse: rootPath,
    recentUniverses,
    recentUniverseProfiles: profile
      ? { ...settings.recentUniverseProfiles, [rootPath]: profile }
      : settings.recentUniverseProfiles,
  };
}

function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  if (!shortcut) return false;
  const parts = shortcut.split("+");
  const needsMod = parts.includes("Mod");
  const needsAlt = parts.includes("Alt");
  const needsShift = parts.includes("Shift");
  const key = parts.find((part) => !["Mod", "Alt", "Shift"].includes(part));
  const eventKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;

  return (
    (event.metaKey || event.ctrlKey) === needsMod &&
    event.altKey === needsAlt &&
    event.shiftKey === needsShift &&
    (!key || eventKey === key)
  );
}

function fileTitle(path: string) {
  return pathName(path).replace(/\.md$/i, "");
}

function relativeFromAbsolute(rootPath: string, absolutePath: string) {
  return absolutePath.startsWith(rootPath)
    ? absolutePath.slice(rootPath.length).replace(/^[\\/]+/, "")
    : absolutePath;
}

function childPathAfterMove(path: string, fromPath: string, toFolderPath: string) {
  const name = path.split("/").pop() ?? path;
  if (path === fromPath) {
    return toFolderPath ? `${toFolderPath}/${name}` : name;
  }
  if (path.startsWith(`${fromPath}/`)) {
    const movedRoot = toFolderPath ? `${toFolderPath}/${name}` : name;
    return `${movedRoot}/${path.slice(fromPath.length + 1)}`;
  }
  return path;
}

function pathIsAffectedByChange(path: string | undefined, change: PathChange) {
  if (!path) return false;
  return change.mode === "tree" ? path === change.fromPath || path.startsWith(`${change.fromPath}/`) : path === change.fromPath;
}

function pathAfterChange(path: string, change: PathChange) {
  return change.mode === "tree" ? childPathAfterMove(path, change.fromPath, dirname(change.toPath)) : change.toPath;
}

function normalizePathChanges(changes?: PathChangeSet) {
  return Array.isArray(changes) ? changes : changes ? [changes] : [];
}

function pathAfterChanges(path: string, changes?: PathChangeSet) {
  return normalizePathChanges(changes).reduce(
    (current, change) => (pathIsAffectedByChange(current, change) ? pathAfterChange(current, change) : current),
    path,
  );
}

function pathIsAffectedByChanges(path: string | undefined, changes?: PathChangeSet) {
  if (!path) return false;
  return normalizePathChanges(changes).some((change) => pathIsAffectedByChange(path, change));
}

async function readBrowserUniverse(root: BrowserDirectoryHandle): Promise<VaultReadResult> {
  const files: VaultFile[] = [];
  const directories: string[] = [];
  const errors: VaultReadResult["errors"] = [];

  async function walk(directory: BrowserDirectoryHandle, prefix: string) {
    for await (const [name, handle] of directory.entries()) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const maybeDirectory = handle as BrowserDirectoryHandle;
      const maybeFile = handle as BrowserFileHandle;

      if ("entries" in maybeDirectory) {
        if (name.startsWith(".") && name !== ".everend") continue;
        directories.push(relativePath);
        await walk(maybeDirectory, relativePath);
        continue;
      }

      if (!relativePath.endsWith(".md") && !relativePath.endsWith(".yaml") && !relativePath.endsWith(".json")) continue;

      try {
        const file = await maybeFile.getFile();
        files.push({
          relativePath,
          content: await file.text(),
          modifiedMs: file.lastModified,
        });
      } catch (error) {
        errors.push({
          relativePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await walk(root, "");
  directories.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { rootPath: `browser:${root.name}`, files, directories, errors };
}

async function getBrowserDirectory(root: BrowserDirectoryHandle, relativePath: string, create = false) {
  const parts = relativePath.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

async function ensureBrowserWritePermission(root: BrowserDirectoryHandle) {
  if (!root.queryPermission || !root.requestPermission) return;
  const descriptor = { mode: "readwrite" as const };
  const current = await root.queryPermission(descriptor);
  if (current === "granted") return;
  const requested = await root.requestPermission(descriptor);
  if (requested !== "granted") {
    throw new Error("WorldNotion needs write permission for this universe folder before saving.");
  }
}

async function getBrowserFile(root: BrowserDirectoryHandle, relativePath: string, create = false) {
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts.pop();
  if (!filename) throw new Error("File path is required.");
  const directory = await getBrowserDirectory(root, parts.join("/"), create);
  return directory.getFileHandle(filename, { create });
}

async function getBrowserParent(root: BrowserDirectoryHandle, relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error("Path is required.");
  return {
    directory: await getBrowserDirectory(root, parts.join("/")),
    name,
  };
}

async function writeBrowserFile(root: BrowserDirectoryHandle, relativePath: string, content: string) {
  await ensureBrowserWritePermission(root);
  const fileHandle = await getBrowserFile(root, relativePath, true);
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  const file = await fileHandle.getFile();
  return file.lastModified;
}

async function removeBrowserPath(root: BrowserDirectoryHandle, relativePath: string, recursive = true) {
  await ensureBrowserWritePermission(root);
  const { directory, name } = await getBrowserParent(root, relativePath);
  if (!directory.removeEntry) {
    throw new Error("This browser does not support deleting files from a selected folder.");
  }
  await directory.removeEntry(name, { recursive });
}

async function copyBrowserDirectory(source: BrowserDirectoryHandle, target: BrowserDirectoryHandle) {
  await ensureBrowserWritePermission(target);
  for await (const [name, handle] of source.entries()) {
    const maybeDirectory = handle as BrowserDirectoryHandle;
    const maybeFile = handle as BrowserFileHandle;
    if ("entries" in maybeDirectory) {
      const nextTarget = await target.getDirectoryHandle(name, { create: true });
      await copyBrowserDirectory(maybeDirectory, nextTarget);
    } else {
      const file = await maybeFile.getFile();
      const targetFile = await target.getFileHandle(name, { create: true });
      const writable = await targetFile.createWritable();
      await writable.write(await file.text());
      await writable.close();
    }
  }
}

function pathExists(index: VaultIndex, path: string, kind: "file" | "folder") {
  if (kind === "file") {
    return index.files.some((file) => file.relativePath === path);
  }
  const stack = [...index.tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.kind === "folder" && node.path === path) return true;
    stack.push(...node.children);
  }
  return false;
}

function duplicatePathFor(index: VaultIndex, relativePath: string, kind: "file" | "folder") {
  const parent = dirname(relativePath);
  const filename = pathName(relativePath);
  const extensionMatch = kind === "file" ? filename.match(/(\.[^.]+)$/) : undefined;
  const extension = extensionMatch?.[1] ?? "";
  const stem = extension ? filename.slice(0, -extension.length) : filename;

  for (let copyIndex = 1; copyIndex < 1000; copyIndex += 1) {
    const candidateName = `${stem} copy ${copyIndex}${extension}`;
    const candidate = parent ? `${parent}/${candidateName}` : candidateName;
    if (!pathExists(index, candidate, kind)) return candidate;
  }
  throw new Error("Could not find an available duplicate name.");
}

async function copyBrowserPath(
  root: BrowserDirectoryHandle,
  fromPath: string,
  toPath: string,
  kind: "file" | "folder",
) {
  await ensureBrowserWritePermission(root);
  if (kind === "file") {
    const source = await getBrowserFile(root, fromPath);
    const file = await source.getFile();
    await writeBrowserFile(root, toPath, await file.text());
    return;
  }

  const source = await getBrowserDirectory(root, fromPath);
  const { directory, name } = await getBrowserParent(root, toPath);
  const target = await directory.getDirectoryHandle(name, { create: true });
  await copyBrowserDirectory(source, target);
}

async function renameBrowserPath(
  root: BrowserDirectoryHandle,
  fromPath: string,
  newName: string,
  kind: "file" | "folder",
) {
  const targetPath = dirname(fromPath) ? `${dirname(fromPath)}/${newName}` : newName;
  await copyBrowserPath(root, fromPath, targetPath, kind);
  await removeBrowserPath(root, fromPath, true);
  return targetPath;
}

async function moveBrowserPath(
  root: BrowserDirectoryHandle,
  fromPath: string,
  toFolderPath: string,
  kind: "file" | "folder",
) {
  const targetPath = toFolderPath ? `${toFolderPath}/${pathName(fromPath)}` : pathName(fromPath);
  await copyBrowserPath(root, fromPath, targetPath, kind);
  await removeBrowserPath(root, fromPath, true);
  return targetPath;
}

function contentFromTemplate(index: VaultIndex, entityType: string, name: string) {
  const slug = slugify(name);
  const template = index.templates.find((candidate) => candidate.type === entityType);
  if (!template) {
    return `---\nid: ${slug}\ntype: ${entityType}\nname: ${name}\nstatus: draft\n---\n\n# ${name}\n`;
  }
  return template.content
    .replace(/\{\{id\}\}/g, slug)
    .replace(/\{\{type\}\}/g, entityType)
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{status\}\}/g, "draft");
}

function folderDescriptionContent(name: string) {
  return `---\nid: ${slugify(name)}-folder\ntype: folder-description\nname: ${name}\nstatus: draft\nfolder: ${name}\n---\n\n# ${name}\n\nDescription of this folder's contents.\n`;
}

function folderDescriptionPath(folderPath: string) {
  const folderName = pathName(folderPath);
  const parentPath = dirname(folderPath);
  return parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
}

function updateFolderDescriptionContent(content: string, oldName: string, newName: string) {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content
    .replace(new RegExp(`(^name:\\s*)${escaped}(\\s*$)`, "m"), `$1${newName}$2`)
    .replace(new RegExp(`(^folder:\\s*)${escaped}(\\s*$)`, "m"), `$1${newName}$2`)
    .replace(new RegExp(`(^#\\s+)${escaped}(\\s*$)`, "m"), `$1${newName}$2`);
}

function universeNoteContent(name: string) {
  return `---\nid: ${slugify(name)}\ntype: universe\nname: ${name}\nstatus: draft\n---\n\n# ${name}\n`;
}

function rawToEditorParts(rawMarkdown: string): EditorDocumentParts {
  return splitMarkdown(rawMarkdown);
}

function bodyToRawMarkdown(tab: OpenTab, bodyMarkdown: string) {
  return joinMarkdown(rawToEditorParts(tab.rawMarkdown).frontmatterRaw, bodyMarkdown);
}

function universeDisplayName(index?: VaultIndex) {
  if (!index) return "Universe";
  return index.universeProfile?.name ?? pathName(index.rootPath);
}

function UniverseIconFrame({ profile, size = 34 }: { profile?: UniverseProfile; size?: number }) {
  const icon = profile?.icon;
  if (icon?.type === "image" && icon.value) {
    return (
      <span className="universe-icon-frame" style={{ width: size, height: size }}>
        <img src={icon.value} alt="" />
      </span>
    );
  }
  const preset = icon?.value ?? "book";
  const iconSize = Math.max(16, Math.round(size * 0.56));
  const Icon = preset === "globe" ? Globe2 : preset === "castle" ? Castle : preset === "sparkles" ? Sparkles : BookOpen;
  return (
    <span className="universe-icon-frame" style={{ width: size, height: size }}>
      <Icon size={iconSize} />
    </span>
  );
}

// Command Palette Helper Functions
function buildFileResults(index: VaultIndex | null): FileResult[] {
  if (!index) return [];
  
  return index.entities.map((entity) => ({
    type: "file" as const,
    id: entity.path,
    title: entity.name,
    subtitle: entity.path,
    path: entity.path,
    tags: entity.tags || [],
    lastModified: entity.file.modifiedMs || undefined,
  }));
}

function buildCommandResults(keybindings: Array<{ commandId: EditorCommandId; shortcut: string }>): CommandResult[] {
  return EDITOR_COMMANDS.map((command) => ({
    type: "command" as const,
    id: command.id,
    commandId: command.id,
    title: command.label,
    subtitle: command.group,
    group: command.group,
    shortcut: shortcutFor(command.id, keybindings),
  }));
}

function buildHeaderResults(markdown: string): HeaderResult[] {
  const results: HeaderResult[] = [];
  const lines = markdown.split("\n");
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();
      results.push({
        type: "header" as const,
        id: `header-${index}`,
        title,
        level,
        line: index + 1,
      });
    }
  });
  
  return results;
}

function buildTagResults(index: VaultIndex | null): TagResult[] {
  if (!index) return [];
  
  const tagCounts = new Map<string, number>();
  
  index.entities.forEach((entity) => {
    entity.tags?.forEach((tag: string) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  
  return Array.from(tagCounts.entries()).map(([tag, count]) => ({
    type: "tag" as const,
    id: `tag-${tag}`,
    tag,
    title: `#${tag}`,
    subtitle: `${count} file${count !== 1 ? "s" : ""}`,
    fileCount: count,
  }));
}

const FLOATING_FORMAT_COMMANDS: FloatingFormatCommand[] = [
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

function TreeNode({
  node,
  selectedPath,
  openTabPaths,
  dirtyTabPaths,
  favoritePaths,
  onSelectPath,
  onSelectFolder,
  expandedPaths,
  onToggleExpand,
  onContextMenu,
  onToggleFavorite,
  onDragMove,
  onPointerDragStart,
  isPointerClickSuppressed,
}: {
  node: VaultTreeNode;
  selectedPath?: string;
  openTabPaths: Set<string>;
  dirtyTabPaths: Set<string>;
  favoritePaths: Set<string>;
  onSelectPath: (path: string) => void;
  onSelectFolder: (path: string) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string, kind: "file" | "folder" | "empty") => void;
  onToggleFavorite: (path: string, kind: "file" | "folder") => void;
  onDragMove: (fromPath: string, toFolderPath: string, kind?: "file" | "folder") => void;
  onPointerDragStart: (path: string, kind: "file" | "folder", x: number, y: number) => void;
  isPointerClickSuppressed: () => boolean;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children.length > 0;
  const isFavorite = favoritePaths.has(node.path);
  const isOpen = openTabPaths.has(node.path);
  const isDirty = dirtyTabPaths.has(node.path);
  const activateNode = () => {
    if (isPointerClickSuppressed()) return;
    if (node.kind === "folder") {
      onSelectFolder(node.path);
      if (hasChildren) {
        onToggleExpand(node.path);
      }
    } else if (node.kind === "file") {
      onSelectPath(node.path);
    }
  };

  return (
    <div className="tree-node">
      <div
        role="button"
        tabIndex={0}
        draggable={false}
        data-tree-node="true"
        data-tree-drop-path={node.kind === "folder" ? node.path : undefined}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", node.path);
          event.dataTransfer.setData("application/worldnotion-kind", node.kind);
          event.dataTransfer.effectAllowed = "move";
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          onPointerDragStart(node.path, node.kind, event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          if (node.kind === "folder") {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (node.kind !== "folder") return;
          const fromPath = event.dataTransfer.getData("text/plain");
          const fromKind = event.dataTransfer.getData("application/worldnotion-kind") as "file" | "folder" | "";
          if (fromPath && fromPath !== node.path && !node.path.startsWith(`${fromPath}/`)) {
            onDragMove(fromPath, node.path, fromKind || undefined);
          }
        }}
        className={`tree-button ${selectedPath === node.path ? "active" : ""} ${node.hasDescription ? "has-description" : ""} ${isOpen ? "is-open" : ""}`}
        onClick={activateNode}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateNode();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(event, node.path, node.kind);
        }}
        title={node.path}
      >
        {node.kind === "folder" && hasChildren && (
          <span className="tree-chevron">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {node.kind === "folder" ? (
          isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
        ) : (
          <FileText size={14} />
        )}
        <span>{node.name}</span>
        {isDirty ? <strong className="tree-dirty">*</strong> : null}
        {isFavorite ? <Star size={12} className="tree-favorite" /> : null}
        {node.kind === "folder" && node.hasDescription && (
          <button
            type="button"
            className="folder-description-button"
            onClick={(e) => {
              e.stopPropagation();
              if (node.descriptionPath) {
                onSelectPath(node.descriptionPath);
              }
            }}
            title={`Edit ${node.name} description`}
          >
            <FileEdit size={12} />
          </button>
        )}
        <button
          type="button"
          className="folder-description-button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(node.path, node.kind);
          }}
          title={isFavorite ? "Remove favorite" : "Add favorite"}
        >
          {isFavorite ? <StarOff size={12} /> : <Star size={12} />}
        </button>
      </div>
      {node.kind === "folder" && hasChildren && isExpanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              openTabPaths={openTabPaths}
              dirtyTabPaths={dirtyTabPaths}
              favoritePaths={favoritePaths}
              onSelectPath={onSelectPath}
              onSelectFolder={onSelectFolder}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onToggleFavorite={onToggleFavorite}
              onDragMove={onDragMove}
              onPointerDragStart={onPointerDragStart}
              isPointerClickSuppressed={isPointerClickSuppressed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingBadge({ finding }: { finding: ValidationFinding }) {
  return <span className={`finding-badge finding-${finding.severity}`}>{finding.severity}</span>;
}

function Inspector({
  entity,
  template,
  index,
  activeTab,
  onChangeFrontmatter,
}: {
  entity?: Entity;
  template?: EntityTemplate;
  index?: VaultIndex;
  activeTab?: OpenTab;
  onChangeFrontmatter?: (frontmatterRaw: string) => void;
}) {
  if (!index) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">Open a universe to inspect metadata and links.</p>
      </aside>
    );
  }

  if (template) {
    return (
      <aside className="inspector">
        <h2>Template</h2>
        <p className="path-line">{template.path}</p>
        <p className="muted">Templates are Markdown files with placeholders.</p>
      </aside>
    );
  }

  if (!entity) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">Select a note or template.</p>
      </aside>
    );
  }

  const findings = index.findings.filter((finding) => finding.file === entity.path);
  const backlinks = entity.backlinks
    .map((id) => index.entities.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Entity => Boolean(candidate));
  const typeDefinition = index.taxonomy?.types[entity.type];
  const editableFrontmatter = activeTab?.path === entity.path ? rawToEditorParts(activeTab.rawMarkdown).frontmatterRaw : "";

  return (
    <aside className="inspector">
      <h2>{entity.name}</h2>
      <p className="path-line">{entity.path}</p>

      <section>
        <h3>Frontmatter</h3>
        {activeTab?.path === entity.path && onChangeFrontmatter ? (
          <label className="frontmatter-editor-wrap">
            <span>YAML metadata</span>
            <textarea
              value={editableFrontmatter || "---\n\n---"}
              onChange={(event) => onChangeFrontmatter(event.target.value)}
              spellCheck={false}
            />
          </label>
        ) : (
          <p className="muted">Open this note in a tab to edit its metadata.</p>
        )}
        <dl className="metadata-list">
          <dt>id</dt>
          <dd>{entity.id}</dd>
          <dt>type</dt>
          <dd>{typeDefinition?.label ?? entity.type}</dd>
          <dt>status</dt>
          <dd>{entity.status}</dd>
          {Object.entries(entity.customProperties).map(([key, value]) => (
            <div key={key} className="metadata-pair">
              <dt>{key}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>Links</h3>
        <p className="muted">Wikilinks: {entity.wikilinks.length ? entity.wikilinks.join(", ") : "None"}</p>
        <p className="muted">Backlinks: {backlinks.length ? backlinks.map((item) => item.name).join(", ") : "None"}</p>
      </section>

      <section>
        <h3>Findings</h3>
        {findings.length ? (
          <div className="finding-list">
            {findings.map((finding) => (
              <div key={`${finding.code}-${finding.message}`} className="finding-item">
                <FindingBadge finding={finding} />
                <span>{finding.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No findings for this file.</p>
        )}
      </section>
    </aside>
  );
}

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
  const [activeTabPath, setActiveTabPath] = useState<string>();
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [appZoom, setAppZoom] = useState(1);
  const [floatingToolbarRect, setFloatingToolbarRect] = useState<DOMRect>();
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [cursorLine, setCursorLine] = useState(0);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  
  // Font detection hook
  const { fonts } = useFonts();
  
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("worldnotion.expandedPaths");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
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

  const [toastQueue, setToastQueue] = useState<string[]>([]);
  const [activeToast, setActiveToast] = useState("");
  const [pointerDragItem, setPointerDragItem] = useState<PointerDragItem>();
  const suppressTreeClickRef = useRef(false);

  const showToast = (message: string) => {
    setToastQueue((current) => [...current, message]);
  };

  const activeTab = tabs.find((tab) => tab.path === activeTabPath);
  const openTabPaths = useMemo(() => new Set(tabs.map((tab) => tab.path)), [tabs]);
  const dirtyTabPaths = useMemo(() => new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.path)), [tabs]);
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
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.body.style.setProperty("zoom", String(appZoom));
  }, [appZoom]);

  useEffect(() => {
    if (activeToast || !toastQueue.length) return;
    const [nextToast, ...remainingToasts] = toastQueue;
    setActiveToast(nextToast);
    setToastQueue(remainingToasts);
  }, [activeToast, toastQueue]);

  useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => {
      setActiveToast("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  useEffect(() => {
    if (!index || !settings.editor.persistTabs) return;
    const session: WorkspaceSession = {
      rootPath: index.rootPath,
      activePath: activeTabPath,
      tabs: tabs.map((tab) => ({
        path: tab.path,
        title: tab.title,
        mode: tab.mode,
        modifiedMs: tab.modifiedMs,
        isTemplate: tab.isTemplate,
      })),
    };
    setSettings((current) => ({
      ...current,
      sessions: { ...current.sessions, [index.rootPath]: session },
    }));
  }, [activeTabPath, index?.rootPath, settings.editor.persistTabs, tabs]);

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

  const selectedEntity = index?.entities.find((entity) => entity.path === selectedPath);
  const selectedTemplate = index?.templates.find((template) => template.path === selectedPath);
  const canWrite = Boolean(index);

  const visibleTree = useMemo(() => {
    if (!index) return [];
    const tree = settings.explorer.showHiddenEverend
      ? buildTree(index.files, index.directories, true, `${pathName(index.rootPath)}.md`)
      : index.tree;
    if (!query.trim()) return tree;
    const normalized = query.toLowerCase();
    const files: VaultTreeNode[] = [];
    const folders: VaultTreeNode[] = [];
    collectSearchMatches(tree, normalized, files, folders);
    return [...files, ...folders];
  }, [index, query, settings.explorer.showHiddenEverend]);

  const activeExplorerSection = settings.explorer.activeSection;
  const universeSettings = useMemo(() => {
    if (!index) return undefined;
    return {
      name: universeDisplayName(index),
      rootPath: index.rootPath,
      profile: index.universeProfile,
      fileCount: index.markdownFiles.length,
      entityCount: index.entities.length,
      templateCount: index.templates.length,
      findingCount: index.findings.length,
    };
  }, [index]);
  const favoriteItems = useMemo(() => {
    if (!index) return [];
    const treePaths = new Set<string>();
    function collectTreePaths(nodes: VaultTreeNode[]) {
      for (const node of nodes) {
        treePaths.add(node.path);
        collectTreePaths(node.children);
      }
    }
    collectTreePaths(index.tree);
    return settings.explorer.favorites.filter((favorite) => {
      if (favorite.kind === "folder") {
        return treePaths.has(favorite.path);
      }
      return index.files.some((file) => file.relativePath === favorite.path);
    });
  }, [index, settings.explorer.favorites]);

  function collectSearchMatches(
    nodes: VaultTreeNode[],
    normalized: string,
    files: VaultTreeNode[],
    folders: VaultTreeNode[],
  ) {
    nodes.forEach((node) => {
      const matches = node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized);
      if (matches) {
        if (node.kind === "file") {
          files.push({ ...node, children: [] });
        } else {
          folders.push({ ...node, children: [] });
        }
      }
      collectSearchMatches(node.children, normalized, files, folders);
    });
  }

  useEffect(() => {
    localStorage.setItem("worldnotion.expandedPaths", JSON.stringify(Array.from(expandedPaths)));
  }, [expandedPaths]);

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

  function handleContextMenu(event: React.MouseEvent, targetPath: string, targetKind: "file" | "folder" | "empty") {
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
        recentUniverse: current.recentUniverse === path ? recentUniverses[0] : current.recentUniverse,
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
    showToast("Removed from dashboard.");
  }

  function selectedAbsolutePath(path = selectedPath) {
    if (!index || !path) return index?.rootPath;
    const file = index.files.find((candidate) => candidate.relativePath === path);
    return file?.absolutePath ?? `${index.rootPath}/${path}`;
  }

  function activeCreationFolder() {
    if (selectedExplorerTarget?.kind === "folder") return selectedExplorerTarget.path;
    if (selectedExplorerTarget?.kind === "file") return dirname(selectedExplorerTarget.path);
    return selectedPath ? dirname(selectedPath) : "";
  }

  function updateExplorer(next: Partial<AppSettingsV4["explorer"]>) {
    setSettings((current) => ({ ...current, explorer: { ...current.explorer, ...next } }));
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
    setTabs((current) =>
      current.map((tab) => {
        if (!pathIsAffectedByChanges(tab.path, change)) return tab;
        const path = pathAfterChanges(tab.path, change);
        return { ...tab, path, title: fileTitle(path), absolutePath: index ? `${index.rootPath}/${path}` : tab.absolutePath };
      }),
    );
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
    const oldDescriptionPath = folderDescriptionPath(folderPath);
    const oldDescriptionFile = index.files.find((file) => file.relativePath === oldDescriptionPath);
    if (!oldDescriptionFile) return undefined;

    const newDescriptionPath = dirname(folderPath)
      ? `${dirname(folderPath)}/${newFolderName}.md`
      : `${newFolderName}.md`;
    if (
      oldDescriptionPath !== newDescriptionPath &&
      index.files.some((file) => file.relativePath === newDescriptionPath)
    ) {
      throw new Error(`Cannot rename folder description because ${newDescriptionPath} already exists.`);
    }

    const oldFolderName = pathName(folderPath);
    const nextContent = updateFolderDescriptionContent(oldDescriptionFile.content, oldFolderName, newFolderName);

    if (browserRoot) {
      if (oldDescriptionPath !== newDescriptionPath) {
        await renameBrowserPath(browserRoot, oldDescriptionPath, `${newFolderName}.md`, "file");
      }
      await writeBrowserFile(browserRoot, newDescriptionPath, nextContent);
    } else {
      if (oldDescriptionPath !== newDescriptionPath) {
        const renameResult = await invoke<WriteResult>("rename_path", {
          vaultPath: index.rootPath,
          relativePath: oldDescriptionPath,
          newName: `${newFolderName}.md`,
        });
        if (!renameResult.ok) {
          throw new Error(renameResult.message ?? "Could not rename folder description.");
        }
      }
      const saveResult = await invoke<WriteResult>("save_file", {
        path: `${index.rootPath}/${newDescriptionPath}`,
        content: nextContent,
        expectedModifiedMs: null,
      });
      if (!saveResult.ok) {
        throw new Error(saveResult.message ?? "Could not update folder description.");
      }
    }

    return {
      fromPath: oldDescriptionPath,
      toPath: newDescriptionPath,
      mode: "single",
    } satisfies PathChange;
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    targetPath: string,
    targetKind: "file" | "folder" | "empty",
    templateType?: string,
  ) {
    if (!index) return;

    const parentPath = targetKind === "folder" ? targetPath : targetPath.split("/").slice(0, -1).join("/");

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

        try {
          const fileName = name.endsWith(".md") ? name : `${name}.md`;
          const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
          const content = `---\nid: ${slugify(name)}\ntype: concept\nname: ${name.replace(/\.md$/i, "")}\nstatus: draft\n---\n\n# ${name.replace(/\.md$/i, "")}\n`;


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
          showToast(`Created blank page: ${fileName}`);
        } catch (error) {
          throw error;
        }
      } else if (action === "newPageFromTemplate" && templateType) {
        const name = await promptUser(`Enter ${templateType} name:`);
        if (!name || name.trim() === "") {
          return;
        }

        try {
          const slug = slugify(name);
          const filePath = parentPath ? `${parentPath}/${slug}.md` : `${slug}.md`;


          if (browserRoot) {
            await writeBrowserFile(browserRoot, filePath, contentFromTemplate(index, templateType, name));
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
          showToast(`Created ${templateType}: ${name}`);
        } catch (error) {
          throw error;
        }
      } else if (action === "newFolder") {
        const name = await promptUser("Enter folder name:");
        if (!name || name.trim() === "") {
          return;
        }

        try {
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
          showToast(`Created folder: ${name}`);
        } catch (error) {
          throw error;
        }
      } else if (action === "rename" && targetKind !== "empty") {
        const currentName = pathName(targetPath);
        const newName = await promptUser("New name:", "new name", currentName);
        if (!newName || newName === currentName) return;
        const nextPath = `${dirname(targetPath) ? `${dirname(targetPath)}/` : ""}${newName}`;
        if (targetKind === "folder") {
          const oldDescriptionPath = folderDescriptionPath(targetPath);
          const newDescriptionPath = dirname(targetPath) ? `${dirname(targetPath)}/${newName}.md` : `${newName}.md`;
          if (
            oldDescriptionPath !== newDescriptionPath &&
            index.files.some((file) => file.relativePath === oldDescriptionPath) &&
            index.files.some((file) => file.relativePath === newDescriptionPath)
          ) {
            throw new Error(`Cannot rename folder description because ${newDescriptionPath} already exists.`);
          }
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
          targetKind === "folder" ? await renameFolderDescriptionIfNeeded(targetPath, newName) : undefined;
        const change: PathChange = { fromPath: targetPath, toPath: nextPath, mode: targetKind === "folder" ? "tree" : "single" };
        const changes = folderDescriptionChange ? [change, folderDescriptionChange] : [change];
        updateTabsForPathChange(changes);
        await refreshUniverse(undefined, changes);
        showToast(`Renamed ${currentName}.`);
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
        showToast("Duplicated item.");
      } else if (action === "move" && targetKind !== "empty") {
        const targetFolder = prompt("Move to folder path:", dirname(targetPath));
        if (targetFolder === null) return;
        await moveExplorerPath(targetPath, targetFolder, targetKind);
      } else if (action === "toggleFavorite" && targetKind !== "empty") {
        toggleFavorite(targetPath, targetKind);
      } else if (action === "editFolderDescription" && targetKind === "folder") {
        await createFolderDescription(targetPath);
      } else if (action === "reveal") {
        await revealExplorerPath(targetKind === "empty" ? undefined : targetPath);
      } else if (action === "trash" && targetKind !== "empty") {
        await trashExplorerPath(targetPath, targetKind);
      } else if (action === "refresh") {
        await refreshUniverse();
      } else if (action === "collapseAll") {
        setExpandedPaths(new Set());
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setLoadState("error");
      setErrorMessage(`[${action}] ${errorMsg}`);
    } finally {
      setContextMenu(null);
    }
  }

  async function moveExplorerPath(fromPath: string, toFolderPath: string, kind?: "file" | "folder") {
    if (!index) return;
    const itemKind = kind ?? (index.files.some((file) => file.relativePath === fromPath) ? "file" : "folder");
    if (itemKind === "folder" && (toFolderPath === fromPath || toFolderPath.startsWith(`${fromPath}/`))) {
      showToast("Cannot move a folder into itself.");
      return;
    }
    if (dirname(fromPath) === toFolderPath) {
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
    const change: PathChange = { fromPath, toPath: movedPath, mode: "tree" };
    updateTabsForPathChange(change);
    await refreshUniverse(undefined, change);
    showToast(`Moved ${pathName(fromPath)}.`);
  }

  async function revealExplorerPath(path?: string) {
    if (!index) return;
    if (browserRoot) {
      throw new Error(`${labels.revealItem} is only available in the desktop app.`);
    }
    const absolutePath = path ? selectedAbsolutePath(path) : index.rootPath;
    if (!path) {
      await invoke<WriteResult>("reveal_vault", { vaultPath: index.rootPath });
    } else {
      await invoke<WriteResult>("reveal_path", { path: absolutePath });
    }
  }

  async function trashExplorerPath(path: string, kind: "file" | "folder") {
    if (!index) return;
    const affectedDirtyTabs = tabs.filter((tab) => tab.dirty && (tab.path === path || tab.path.startsWith(`${path}/`)));
    if (affectedDirtyTabs.length) {
      const confirmed = window.confirm(`${affectedDirtyTabs.length} open tab(s) have unsaved changes. ${labels.trashAction} anyway?`);
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
    setTabs((current) => current.filter((tab) => !(tab.path === path || tab.path.startsWith(`${path}/`))));
    if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
      setSelectedPath(undefined);
      setActiveTabPath(undefined);
    }
    updateExplorer({
      favorites: settings.explorer.favorites.filter((favorite) => !(favorite.path === path || favorite.path.startsWith(`${path}/`))),
    });
    await refreshUniverse();
    showToast(`${kind === "folder" ? "Folder" : "File"} ${labels.trashDone.toLowerCase()}`);
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
      showToast(`Created folder description: ${folderName}.md`);
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
      setIndex((current) => (current ? { ...current, universeProfile: normalizedProfile } : current));
      await reindexUniverseMetadata();
      showToast("Universe profile updated.");
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

  function toggleBuiltinTheme() {
    setThemeById(toggledThemeMode(settings.theme));
  }

  function applyUniverse(readResult: VaultReadResult, preferredPath?: string, pathChange?: PathChangeSet) {
    const nextIndex = indexVault(readResult);
    const activePathAfterChange =
      activeTabPath && pathChange && pathIsAffectedByChanges(activeTabPath, pathChange)
        ? pathAfterChanges(activeTabPath, pathChange)
        : activeTabPath;
    const selectedPathAfterChange =
      selectedPath && pathChange && pathIsAffectedByChanges(selectedPath, pathChange)
        ? pathAfterChanges(selectedPath, pathChange)
        : selectedPath;
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setErrorMessage("");
    setSettings((current) => rememberUniverse(current, readResult.rootPath, profileForRecent(nextIndex)));

    const liveTabs =
      index?.rootPath === readResult.rootPath && tabs.length
        ? tabs
            .map((tab) => {
              const nextTabPath = pathChange && pathIsAffectedByChanges(tab.path, pathChange)
                ? pathAfterChanges(tab.path, pathChange)
                : tab.path;
              const file = nextIndex.files.find((candidate) => candidate.relativePath === nextTabPath);
              if (!file) return undefined;
              return tab.dirty
                ? { ...tab, path: nextTabPath, title: fileTitle(nextTabPath), absolutePath: file.absolutePath, modifiedMs: file.modifiedMs }
                : createTabFromFile(file, tab.mode);
            })
            .filter((tab): tab is OpenTab => Boolean(tab))
        : [];
    const restoredSession = settings.sessions[readResult.rootPath];
    const restoredTabs = liveTabs.length
      ? liveTabs
      : settings.editor.persistTabs
        ? (restoredSession?.tabs ?? [])
          .map((tab) => {
            const file = nextIndex.files.find((candidate) => candidate.relativePath === tab.path);
            return file ? createTabFromFile(file, tab.mode) : undefined;
          })
          .filter((tab): tab is OpenTab => Boolean(tab))
        : [];

    const nextPath =
      preferredPath && nextIndex.files.some((file) => file.relativePath === preferredPath)
        ? preferredPath
        : activePathAfterChange && nextIndex.files.some((file) => file.relativePath === activePathAfterChange)
          ? activePathAfterChange
          : selectedPathAfterChange && nextIndex.files.some((file) => file.relativePath === selectedPathAfterChange)
            ? selectedPathAfterChange
            : restoredSession?.activePath && nextIndex.files.some((file) => file.relativePath === restoredSession.activePath)
              ? restoredSession.activePath
              : undefined;

    if (restoredTabs.length) {
      setTabs(restoredTabs);
      setActiveTabPath(nextPath);
      setSelectedPath(nextPath);
    } else if (nextPath) {
      openDocument(nextIndex, nextPath);
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
    const nextIndex = indexVault(readResult);
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setSettings((current) => rememberUniverse(current, readResult.rootPath, profileForRecent(nextIndex)));
  }

  function createTabFromFile(file: VaultFile, mode = settings.editor.defaultMode): OpenTab {
    return {
      path: file.relativePath,
      title: fileTitle(file.relativePath),
      absolutePath: file.absolutePath,
      rawMarkdown: file.content,
      savedMarkdown: file.content,
      modifiedMs: file.modifiedMs,
      dirty: false,
      mode,
      isTemplate: file.relativePath.startsWith(".everend/templates/"),
    };
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
      return [...current, createTabFromFile(file)];
    });
    setActiveTabPath(path);
  }

  function activateTab(path: string) {
    setActiveTabPath(path);
    setSelectedPath(path);
    rememberRecentFile(path);
  }

  function openOrCreateTab(path: string, nextIndex = index) {
    if (!nextIndex) return;
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      activateTab(path);
      
      // Actualizar estadísticas de acceso
      if (nextIndex?.rootPath) {
        setSettings((current) => {
          const currentSession = current.sessions[nextIndex.rootPath] || {
            rootPath: nextIndex.rootPath,
            tabs: [],
          };
          const updatedStats = incrementFileAccess(currentSession, path);
          return {
            ...current,
            sessions: {
              ...current.sessions,
              [nextIndex.rootPath]: {
                ...currentSession,
                fileAccessStats: updatedStats,
              },
            },
          };
        });
      }
      return;
    }
    openDocument(nextIndex, path);
    
    // Actualizar estadísticas de acceso
    if (nextIndex?.rootPath) {
      setSettings((current) => {
        const currentSession = current.sessions[nextIndex.rootPath] || {
          rootPath: nextIndex.rootPath,
          tabs: [],
        };
        const updatedStats = incrementFileAccess(currentSession, path);
        return {
          ...current,
          sessions: {
            ...current.sessions,
            [nextIndex.rootPath]: {
              ...currentSession,
              fileAccessStats: updatedStats,
            },
          },
        };
      });
    }
  }

  function resolveWikilink(label: string): ResolvedWikilink {
    const normalized = label.trim().toLowerCase();
    if (!index || !normalized) return { label, status: "missing" };
    const entity = index.entities.find((candidate) => {
      const candidates = [
        candidate.id,
        candidate.name,
        fileTitle(candidate.path),
        ...candidate.aliases,
      ].map((value) => value.trim().toLowerCase());
      return candidates.includes(normalized);
    });
    if (entity) return { label, targetPath: entity.path, status: "resolved" };
    const file = index.markdownFiles.find((candidate) => fileTitle(candidate.relativePath).trim().toLowerCase() === normalized);
    return file ? { label, targetPath: file.relativePath, status: "resolved" } : { label, status: "missing" };
  }

  async function createTemplate() {
    if (!index) return;
    const type = await promptUser("New template type", "Template type");
    if (!type) return;
    const templateType = slugify(type);
    if (!templateType) return;
    const relativePath = `.everend/templates/${templateType}.md`;
    const content = `---\nid: {{id}}\ntype: ${templateType}\nname: {{name}}\nstatus: {{status}}\ntags: []\naliases: []\n---\n\n# {{name}}\n\n`;
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
      showToast(`Created template: ${templateType}.`);
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
    defaultValue: string = ""
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
    setActiveTabPath(undefined); // Clear active tab to show folder view
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

      if (!canUseBrowserDirectoryPicker()) {
        throw new Error("Folder picker is unavailable in this browser. Run the Tauri app or use a Chromium browser.");
      }

      const picker = window as unknown as {
        showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<BrowserDirectoryHandle>;
      };
      const root = await picker.showDirectoryPicker({ mode: "readwrite" });
      await ensureBrowserWritePermission(root);
      setBrowserRoot(root);
      applyUniverse(await readBrowserUniverse(root));
    } catch (error) {
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

  function updateRawMarkdown(rawMarkdown: string) {
    if (!activeTabPath) return;
    setTabs((current) =>
      current.map((tab) => {
        if (tab.path !== activeTabPath) return tab;
        const nextRawMarkdown = tab.mode === "write" ? bodyToRawMarkdown(tab, rawMarkdown) : rawMarkdown;
        return {
          ...tab,
          rawMarkdown: nextRawMarkdown,
          dirty: nextRawMarkdown !== tab.savedMarkdown,
        };
      }),
    );
  }

  function updateActiveFrontmatter(frontmatterRaw: string) {
    if (!activeTabPath) return;
    setTabs((current) =>
      current.map((tab) => {
        if (tab.path !== activeTabPath) return tab;
        const parts = rawToEditorParts(tab.rawMarkdown);
        const nextRawMarkdown = joinMarkdown(frontmatterRaw, parts.bodyMarkdown);
        return {
          ...tab,
          rawMarkdown: nextRawMarkdown,
          dirty: nextRawMarkdown !== tab.savedMarkdown,
        };
      }),
    );
  }

  async function saveEditor() {
    if (!activeTab) return;
    setErrorMessage("");
    try {
      if (browserRoot) {
        if (activeTab.modifiedMs) {
          const handle = await getBrowserFile(browserRoot, activeTab.path);
          const currentFile = await handle.getFile();
          if (currentFile.lastModified !== activeTab.modifiedMs) {
            showToast("File changed externally. Reload before saving.");
            return;
          }
        }
        const modifiedMs = await writeBrowserFile(browserRoot, activeTab.path, activeTab.rawMarkdown);
        setTabs((current) =>
          current.map((tab) =>
            tab.path === activeTab.path
              ? { ...tab, savedMarkdown: tab.rawMarkdown, dirty: false, modifiedMs }
              : tab,
          ),
        );
        showToast("Saved.");
        await reindexUniverseMetadata();
        return;
      }

      if (!activeTab.absolutePath) throw new Error("This document does not have a writable path.");
      const result = await invoke<WriteResult>("save_file", {
        path: activeTab.absolutePath,
        content: activeTab.rawMarkdown,
        expectedModifiedMs: activeTab.modifiedMs ?? null,
      });
      if (!result.ok) {
        showToast(result.message ?? "Save failed.");
        return;
      }
      setTabs((current) =>
        current.map((tab) =>
          tab.path === activeTab.path
            ? {
                ...tab,
                savedMarkdown: tab.rawMarkdown,
                dirty: false,
                modifiedMs: result.modifiedMs ?? tab.modifiedMs,
              }
            : tab,
        ),
      );
      showToast("Saved.");
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
    const selected = view.state.sliceDoc(selection.from, selection.to) || placeholder;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: `${before}${selected}${after}` },
      selection: { anchor: selection.from + before.length, head: selection.from + before.length + selected.length },
    });
    view.focus();
  }

  function applyFontFamily(fontFamily: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to) || "text";
    const before = `<span style="font-family: ${fontFamily}">`;
    const after = `</span>`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: `${before}${selected}${after}` },
      selection: { anchor: selection.from + before.length, head: selection.from + before.length + selected.length },
    });
    view.focus();
  }

  function insertWikilinkAtSelection() {
    const view = editorViewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to) || "Page Name";
    const alias = selected === "Page Name" ? "Alias" : selected;
    const insert = `[[${selected}|${alias}]]`;
    const aliasFrom = selection.from + 2 + selected.length + 1;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: aliasFrom, head: aliasFrom + alias.length },
    });
    view.focus();
  }

  async function insertMarkdownLinkAtSelection() {
    const view = editorViewRef.current;
    if (!view) return;
    const url = await promptUser("Insert link", "https://example.com", "https://");
    if (!url?.trim()) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to) || "link text";
    const insert = `[${selected}](${url.trim()})`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + 1, head: selection.from + 1 + selected.length },
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
      showToast(error instanceof Error ? error.message : `Could not open ${normalized}`);
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
    replaceCurrentLines((line) => {
      const clean = line.replace(/^#{1,6}\s+/, "").replace(/^(- \[[ xX]\]|\d+\.|[-*])\s+/, "");
      return `${"#".repeat(level)} ${clean || `Heading ${level}`}`;
    });
  }

  function applyList(kind: "bullet" | "ordered" | "task") {
    replaceCurrentLines((line, index) => {
      const clean = line
        .replace(/^(\s*)(- \[[ xX]\]|\d+\.|[-*])\s+/, "$1")
        .replace(/^#{1,6}\s+/, "");
      const indent = /^(\s*)/.exec(line)?.[1] ?? "";
      const content = clean.trim() ? clean.trimStart() : "List item";
      if (kind === "ordered") return `${indent}${index + 1}. ${content}`;
      if (kind === "task") return `${indent}- [ ] ${content}`;
      return `${indent}- ${content}`;
    });
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

  async function closeTab(path = activeTabPath) {
    if (!path) return;
    const target = tabs.find((tab) => tab.path === path);
    if (!target) return;
    if (target.dirty && settings.editor.confirmCloseDirtyTab) {
      const confirmed = window.confirm(`${target.title} has unsaved changes. Close it anyway?`);
      if (!confirmed) return;
    }

    setTabs((current) => {
      const next = current.filter((tab) => tab.path !== path);
      if (activeTabPath === path) {
        const currentIndex = current.findIndex((tab) => tab.path === path);
        const replacement = next[Math.max(0, currentIndex - 1)] ?? next[0];
        setActiveTabPath(replacement?.path);
        setSelectedPath(replacement?.path);
      }
      return next;
    });
  }

  async function closeOtherTabs(path: string) {
    for (const tab of tabs) {
      if (tab.path !== path) {
        await closeTab(tab.path);
      }
    }
    activateTab(path);
    setTabContextMenu(null);
  }

  async function closeTabsToRight(path: string) {
    const indexOfTab = tabs.findIndex((tab) => tab.path === path);
    if (indexOfTab === -1) return;
    const rightTabs = tabs.slice(indexOfTab + 1);
    for (const tab of rightTabs) {
      await closeTab(tab.path);
    }
    setTabContextMenu(null);
  }

  function closeSavedTabs() {
    setTabs((current) => {
      const next = current.filter((tab) => tab.dirty);
      if (activeTabPath && !next.some((tab) => tab.path === activeTabPath)) {
        const fallback = next[0];
        setActiveTabPath(fallback?.path);
        setSelectedPath(fallback?.path);
      }
      return next;
    });
    setTabContextMenu(null);
  }

  function activateAdjacentTab(direction: 1 | -1) {
    if (!activeTabPath || !tabs.length) return;
    const currentIndex = tabs.findIndex((tab) => tab.path === activeTabPath);
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    setActiveTabPath(next.path);
    setSelectedPath(next.path);
  }

  async function createNoteFromTabButton() {
    if (!index) return;
    const name = await promptUser("New note", "Note name");
    if (!name) return;
    const folderPath = activeCreationFolder();
    const slug = slugify(name);
    const relativePath = folderPath ? `${folderPath}/${slug}.md` : `${slug}.md`;
    const content = `---\nid: ${slug}\ntype: concept\nname: ${name}\nstatus: draft\n---\n\n# ${name}\n`;

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
      showToast(`Created ${name}.`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function openTabPicker() {
    if (!index) return;
    const query = await promptUser("Open note", "Type a note name or path");
    if (!query?.trim()) return;
    const normalized = query.trim().toLowerCase();
    const match = noteSuggestions.find((note) => {
      return (
        note.label.toLowerCase().includes(normalized) ||
        note.path.toLowerCase().includes(normalized) ||
        note.aliases.some((alias) => alias.toLowerCase().includes(normalized)) ||
        note.id?.toLowerCase().includes(normalized)
      );
    });
    if (!match) {
      showToast(`No note found for "${query}".`);
      return;
    }
    openOrCreateTab(match.path);
  }

  async function executeCommand(commandId: EditorCommandId) {
    switch (commandId) {
      case "save":
        await saveEditor();
        break;
      case "search":
        if (editorViewRef.current) openSearchPanel(editorViewRef.current);
        break;
      case "bold":
        replaceSelection("**");
        break;
      case "italic":
        replaceSelection("*");
        break;
      case "inlineCode":
        replaceSelection("`", "`", "code");
        break;
      case "codeBlock":
        replaceSelection("```\n", "\n```", "code");
        break;
      case "heading1":
        applyHeading(1);
        break;
      case "heading2":
        applyHeading(2);
        break;
      case "heading3":
        applyHeading(3);
        break;
      case "heading4":
        applyHeading(4);
        break;
      case "heading5":
        applyHeading(5);
        break;
      case "heading6":
        applyHeading(6);
        break;
      case "blockquote":
        replaceCurrentLines((line) => `> ${line.replace(/^>\s?/, "")}`);
        break;
      case "unorderedList":
        applyList("bullet");
        break;
      case "orderedList":
        applyList("ordered");
        break;
      case "taskList":
        applyList("task");
        break;
      case "link":
        await insertMarkdownLinkAtSelection();
        break;
      case "wikilink":
        insertWikilinkAtSelection();
        break;
      case "horizontalRule":
        insertAtCursor("\n\n---\n\n");
        break;
      case "foldBlock":
        if (editorViewRef.current) foldCode(editorViewRef.current);
        break;
      case "commandPalette":
        setShowCommandPalette(true);
        break;
      case "quickSwitcher":
        setShowQuickSwitcher(true);
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
      case "nextTab":
        activateAdjacentTab(1);
        break;
      case "previousTab":
        activateAdjacentTab(-1);
        break;
    }
  }

  async function handleNativeMenuCommand(commandId: string) {
    if (commandId.startsWith("wn:window:style:")) {
      setThemeById(themeForStyleCommand(commandId.replace("wn:window:style:", ""), settings.theme));
      return;
    }

    switch (commandId) {
      case "wn:file:new-note":
        if (!index) {
          showToast("Open a universe before creating notes.");
          return;
        }
        await createNoteFromTabButton();
        break;
      case "wn:file:new-folder":
        if (!index) {
          showToast("Open a universe before creating folders.");
          return;
        }
        await handleContextMenuAction("newFolder", "", "empty");
        break;
      case "wn:file:open-universe":
        await openUniverse();
        break;
      case "wn:file:open-recent":
        if (!settings.recentUniverse) {
          showToast("No recent universe yet.");
          return;
        }
        await openRecentUniverse();
        break;
      case "wn:file:save":
        await saveEditor();
        break;
      case "wn:file:reveal-universe":
      case "wn:help:open-project-folder":
        if (!index) {
          showToast("Open a universe first.");
          return;
        }
        await revealExplorerPath();
        break;
      case "wn:file:close-tab":
        await closeTab();
        break;
      case "wn:edit:find":
        await executeCommand("search");
        break;
      case "wn:edit:bold":
        await executeCommand("bold");
        break;
      case "wn:edit:italic":
        await executeCommand("italic");
        break;
      case "wn:edit:link":
        await executeCommand("link");
        break;
      case "wn:edit:wikilink":
        await executeCommand("wikilink");
        break;
      case "wn:view:toggle-sidebar":
        setShowSidebar((current) => !current);
        break;
      case "wn:view:toggle-inspector":
        setShowInspector((current) => !current);
        break;
      case "wn:view:toggle-light-dark":
        toggleBuiltinTheme();
        break;
      case "wn:view:command-palette":
        setShowCommandPalette(true);
        break;
      case "wn:view:quick-switcher":
        setShowQuickSwitcher(true);
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
      const binding = settings.keybindings.find((candidate) => shortcutMatches(event, candidate.shortcut));
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
  }, [activeTabPath, activeTab?.path, index?.rootPath, settings.recentUniverse, settings.theme, tabs]);

  const currentSession = index?.rootPath ? settings.sessions[index.rootPath] : undefined;

  // Calculate outline and current header for breadcrumbs
  const outline = useMemo(() => {
    if (!activeTab) return [];
    
    let headers = extractOutline(activeTab.rawMarkdown);
    
    // In write mode, adjust outline line numbers to match bodyMarkdown coordinates
    if (activeTab.mode === "write") {
      const parts = rawToEditorParts(activeTab.rawMarkdown);
      const frontmatterLines = parts.frontmatterRaw.split("\n").length;
      
      // Recursively adjust line numbers for all headers
      const adjustHeaders = (hdrs: typeof headers): typeof headers => {
        return hdrs.map(h => ({
          ...h,
          line: Math.max(0, h.line - frontmatterLines),
          children: adjustHeaders(h.children),
        }));
      };
      
      headers = adjustHeaders(headers);
    }
    
    return headers;
  }, [activeTab?.rawMarkdown, activeTab?.mode]);
  
  const currentHeader = useMemo(() => {
    if (!activeTab) return null;
    return findCurrentHeader(outline, cursorLine, 0);
  }, [outline, cursorLine]);

  const activeEditorValue =
    activeTab?.mode === "write" ? rawToEditorParts(activeTab.rawMarkdown).bodyMarkdown : activeTab?.rawMarkdown ?? "";

  const inputAndToastOverlays = (
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

      <Toast
        message={activeToast}
        isVisible={Boolean(activeToast)}
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
            <button
              type="button"
              onClick={toggleBuiltinTheme}
              title="Toggle theme"
            >
              {isDarkTheme(settings.theme) ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </header>

          <section className="home-panel">
            <div className="home-hero">
              <div className="home-copy">
                <p className="eyebrow">Home</p>
                <h2>Choose a universe</h2>
                <p>
                  Open any local folder as a universe. Markdown stays readable, `.everend` keeps the portable metadata,
                  and WorldNotion remembers where you were working.
                </p>
              </div>

              {index ? (
                <button type="button" className="active-universe-card" onClick={() => setView("workspace")}>
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
                <strong>{settings.recentUniverses.filter((path) => !path.startsWith("browser:")).length}</strong>
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
            {loadState === "loading" ? <div className="loading-banner">Loading universe...</div> : null}

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
        {inputAndToastOverlays}
      </>
    );
  }

  return (
    <main className={`app-shell ${showSidebar ? "" : "sidebar-hidden"} ${showInspector ? "" : "inspector-hidden"}`}>
      {showSidebar ? (
      <aside className="sidebar">
        <button type="button" className="universe-button" onClick={() => setShowSettings(true)}>
          <UniverseIconFrame profile={index.universeProfile} />
          <div>
            <h1>{universeDisplayName(index)}</h1>
            <p>{pathName(index.rootPath)}</p>
          </div>
          <Settings size={15} className="universe-button-control" />
        </button>

        <div className="action-row">
          <button type="button" onClick={() => setView("home")}>
            <Home size={15} />
            Home
          </button>
        </div>

        <div className="explorer-toolbar" onContextMenu={(event) => handleContextMenu(event, "", "empty")}>
          <button type="button" onClick={() => setExpandedPaths(new Set())} title="Collapse all">
            <ChevronsDownUp size={14} />
          </button>
          <button type="button" onClick={() => refreshUniverse()} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => revealExplorerPath(selectedPath)}
            title={browserRoot ? "Reveal is available in the desktop app" : labels.revealItem}
            disabled={Boolean(browserRoot)}
          >
            <ExternalLink size={14} />
          </button>
        </div>

        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" />
        </label>

        <nav className="explorer-sections">
          {(["allFiles", "favorites"] as ExplorerSection[]).map((section) => (
            <button
              key={section}
              type="button"
              className={activeExplorerSection === section ? "active" : ""}
              onClick={() => updateExplorer({ activeSection: section })}
            >
              {section === "allFiles" ? "All Files" : `${section.charAt(0).toUpperCase()}${section.slice(1)}`}
            </button>
          ))}
        </nav>

        <div className="sidebar-main" onContextMenu={(event) => handleContextMenu(event, "", "empty")}>
          {activeExplorerSection === "favorites" ? (
            <section className="sidebar-section">
              <h2>Favorites</h2>
              <div className="template-list">
                {favoriteItems.length ? (
                  favoriteItems.map((favorite) => (
                    <button
                      key={favorite.path}
                      type="button"
                      className={`template-button ${selectedPath === favorite.path ? "active" : ""}`}
                      onClick={() => favorite.kind === "file" && selectPath(favorite.path)}
                      onContextMenu={(event) => handleContextMenu(event, favorite.path, favorite.kind)}
                    >
                      {favorite.kind === "folder" ? <Folder size={14} /> : <FileText size={14} />}
                      {favorite.label}
                    </button>
                  ))
                ) : (
                  <p className="muted">No favorites yet.</p>
                )}
              </div>
            </section>
          ) : (
            <section className="sidebar-section">
              <h2>All Files</h2>
              <div
                className={`tree-list ${pointerDragItem?.active ? "is-pointer-dragging" : ""}`}
                data-tree-root-drop="true"
                onContextMenu={(event) => handleContextMenu(event, "", "empty")}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromPath = event.dataTransfer.getData("text/plain");
                  const fromKind = event.dataTransfer.getData("application/worldnotion-kind") as "file" | "folder" | "";
                  if (fromPath) {
                    void moveExplorerPath(fromPath, "", fromKind || undefined);
                  }
                }}
              >
                {visibleTree.length ? (
                  visibleTree.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      selectedPath={selectedPath}
                      openTabPaths={openTabPaths}
                      dirtyTabPaths={dirtyTabPaths}
                      favoritePaths={favoritePaths}
                      onSelectPath={selectPath}
                      onSelectFolder={selectFolder}
                      expandedPaths={expandedPaths}
                      onToggleExpand={toggleExpand}
                      onContextMenu={handleContextMenu}
                      onToggleFavorite={toggleFavorite}
                      onDragMove={moveExplorerPath}
                      onPointerDragStart={(path, kind, startX, startY) =>
                        setPointerDragItem({ path, kind, startX, startY, active: false })
                      }
                      isPointerClickSuppressed={() => suppressTreeClickRef.current}
                    />
                  ))
                ) : (
                  <p className="muted">No files yet.</p>
                )}
              </div>
            </section>
          )}
        </div>

        <section className={`templates-dock ${templatesExpanded ? "expanded" : ""}`}>
          <div className="templates-dock-header">
            <button
              type="button"
              className="templates-dock-toggle"
              onClick={() => setTemplatesExpanded((expanded) => !expanded)}
            >
              {templatesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Templates</span>
              <small>{index.templates.length}</small>
            </button>
            <button type="button" className="templates-dock-action" onClick={createTemplate} title="New template">
              <Plus size={13} />
            </button>
          </div>
          {templatesExpanded ? (
            <div
              className="template-list templates-dock-list"
              onContextMenu={(event) => {
                handleContextMenu(event, ".everend/templates", "folder");
              }}
            >
              {index.templates.length ? (
                index.templates.map((template) => (
                  <button
                    key={template.path}
                    type="button"
                    className={`template-button ${selectedPath === template.path ? "active" : ""}`}
                    onClick={() => selectPath(template.path)}
                    onContextMenu={(event) => handleContextMenu(event, template.path, "file")}
                  >
                    <FileText size={14} />
                    {template.type}
                  </button>
                ))
              ) : (
                <p className="muted">No templates in this universe.</p>
              )}
            </div>
          ) : null}
        </section>
      </aside>
      ) : null}

      <section className="editor-shell" ref={editorShellRef}>
        <div className="tab-bar">
          <div className="tab-strip">
            {tabs.map((tab) => (
              <div
                key={tab.path}
                role="button"
                tabIndex={0}
                className={`editor-tab ${tab.path === activeTabPath ? "active" : ""}`}
                onClick={() => {
                  setActiveTabPath(tab.path);
                  setSelectedPath(tab.path);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTabContextMenu({ x: event.clientX, y: event.clientY, path: tab.path });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveTabPath(tab.path);
                    setSelectedPath(tab.path);
                  }
                }}
                title={tab.path}
              >
                <span>{tab.title}</span>
                {tab.dirty ? <strong>*</strong> : null}
                <button
                  type="button"
                  className="tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeTab(tab.path);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                      void closeTab(tab.path);
                    }
                  }}
                  title="Close tab"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="tab-add" onClick={openTabPicker} title="Open note">
            <Plus size={14} />
          </button>
        </div>

        <div className="floating-control-panel">
          <div className="mode-toggle" aria-label="Editor mode">
            <button
              type="button"
              className={activeTab?.mode === "write" ? "active" : ""}
              onClick={() =>
                activeTabPath &&
                setTabs((current) =>
                  current.map((tab) => (tab.path === activeTabPath ? { ...tab, mode: "write" } : tab)),
                )
              }
              disabled={!activeTab}
            >
              Write
            </button>
            <button
              type="button"
              className={activeTab?.mode === "source" ? "active" : ""}
              onClick={() =>
                activeTabPath &&
                setTabs((current) =>
                  current.map((tab) => (tab.path === activeTabPath ? { ...tab, mode: "source" } : tab)),
                )
              }
              disabled={!activeTab}
            >
              Source
            </button>
          </div>
          <button
            type="button"
            onClick={toggleBuiltinTheme}
            title="Toggle theme"
          >
            {isDarkTheme(settings.theme) ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button type="button" onClick={saveEditor} disabled={!activeTab || !canWrite} title="Save">
            <Save size={15} />
          </button>
        </div>

        {floatingToolbarRect && activeTab?.mode === "write" ? (
          <div
            className="floating-format-toolbar"
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
            <FontSelector
              availableFonts={fonts}
              onSelectFont={applyFontFamily}
            />
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

        {loadState === "error" ? <div className="error-banner">{errorMessage}</div> : null}
        {loadState === "loading" ? <div className="loading-banner">Loading universe...</div> : null}
        {activeTab ? (
          <div
            className={`editor-surface page-style-${settings.editor.pageStyle} mode-${activeTab.mode}`}
            style={
              settings.editor.pageStyle === "custom"
                ? ({ "--wn-custom-page": settings.editor.customPageColor } as CSSProperties)
                : undefined
            }
          >
            <CodeMirrorEditor
              value={activeEditorValue}
              onChange={(value) => {
                updateRawMarkdown(value);
              }}
              theme={settings.theme}
              mode={activeTab.mode}
              settings={settings.editor}
              readOnly={!canWrite}
              resolveWikilink={resolveWikilink}
              noteSuggestions={noteSuggestions}
              onOpenWikilink={(targetPath) => openOrCreateTab(targetPath)}
              onMissingWikilink={(label) => showToast(`Missing wikilink: ${label}`)}
              onOpenUrl={(url) => {
                void openUrl(url);
              }}
              onRequestUrl={() => promptUser("Insert link", "https://example.com", "https://")}
              onCursorMove={() => {
                // Update cursor line for outline on any cursor/selection movement
                if (editorViewRef.current) {
                  const pos = editorViewRef.current.state.selection.main.head;
                  const line = editorViewRef.current.state.doc.lineAt(pos);
                  setCursorLine(line.number - 1); // 0-indexed
                }
              }}
              onSelectionChange={(rect) => {
                setFloatingToolbarRect(rect);
              }}
              onEditorReady={(view) => {
                editorViewRef.current = view;
              }}
            />

            {/* Outline guide - visible when enabled */}
            {settings.editor.outlineGuideEnabled && activeTab && (
              <OutlineGuide
                outline={outline}
                currentHeader={currentHeader}
                onNavigate={(line) => {
                  if (editorViewRef.current) {
                    // Outline lines are already adjusted for write mode, so use directly
                    const pos = editorViewRef.current.state.doc.line(line + 1).from;
                    editorViewRef.current.dispatch({
                      selection: { anchor: pos },
                      effects: EditorView.scrollIntoView(pos, { y: "center" }),
                    });
                    // Update cursor line immediately after navigation
                    setCursorLine(line);
                    editorViewRef.current.focus();
                  }
                }}
              />
            )}
          </div>
        ) : (
          <section className="empty-editor">
            <FileText size={42} />
            {selectedExplorerTarget?.kind === "folder" ? (
              <>
                <h2>Folder: {pathName(selectedExplorerTarget.path) || "Root"}</h2>
                <p>View or create a note to describe this folder's contents.</p>
                {(() => {
                  const folderName = selectedExplorerTarget.path.split("/").pop() || pathName(index.rootPath);
                  const parentPath = dirname(selectedExplorerTarget.path);
                  const descriptionPath = parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
                  const hasDescription = index.files.some((file) => file.relativePath === descriptionPath);
                  
                  if (hasDescription) {
                    return (
                      <button type="button" onClick={() => selectPath(descriptionPath)}>
                        <FileEdit size={15} />
                        Edit folder note
                      </button>
                    );
                  } else {
                    return (
                      <button type="button" onClick={() => createFolderDescription(selectedExplorerTarget.path)}>
                        <Plus size={15} />
                        Create folder note
                      </button>
                    );
                  }
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
        )}
      </section>

      {showInspector ? (
        <Inspector
          entity={selectedEntity}
          template={selectedTemplate}
          index={index}
          activeTab={activeTab}
          onChangeFrontmatter={updateActiveFrontmatter}
        />
      ) : null}

      {showSettings ? (
        <SettingsModal
          settings={settings}
          universe={universeSettings}
          onChange={setSettings}
          onSaveUniverseProfile={saveUniverseProfile}
          onClose={() => setShowSettings(false)}
          onRevealUniverse={() => {
            void revealExplorerPath();
          }}
          onOpenUniverseNote={openUniverseNote}
          revealUniverseLabel={labels.revealUniverse}
        />
      ) : null}

      {showCommandPalette ? (
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
          onSelectFile={(path) => {
            openOrCreateTab(path);
            setShowCommandPalette(false);
          }}
          onSelectCommand={(commandId) => {
            setShowCommandPalette(false);
            void executeCommand(commandId);
          }}
          onSelectHeader={(line) => {
            // Scroll to line in editor
            if (editorViewRef.current) {
              const state = editorViewRef.current.state;
              const lineInfo = state.doc.line(line);
              editorViewRef.current.dispatch({
                selection: { anchor: lineInfo.from },
                effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
              });
              editorViewRef.current.focus();
            }
            setShowCommandPalette(false);
          }}
          onSelectTag={(tag) => {
            // Search for files with this tag
            setQuery(tag);
            setShowCommandPalette(false);
          }}
        />
      ) : null}

      {showQuickSwitcher ? (
        <CommandPalette
          isOpen={showQuickSwitcher}
          onClose={() => setShowQuickSwitcher(false)}
          fileResults={buildFileResults(index)}
          commandResults={[]}
          headerResults={[]}
          tagResults={[]}
          fileAccessStats={currentSession?.fileAccessStats}
          quickSwitcherMode={true}
          onSelectFile={(path) => {
            openOrCreateTab(path);
            setShowQuickSwitcher(false);
          }}
          onSelectCommand={() => {}}
          onSelectHeader={() => {}}
          onSelectTag={() => {}}
        />
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

      {tabContextMenu ? (
        <div
          className="context-menu tab-context-menu"
          style={{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
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
          <button type="button" className="context-menu-item" onClick={() => closeOtherTabs(tabContextMenu.path)}>
            <X size={16} />
            <span>Close others</span>
          </button>
          <button type="button" className="context-menu-item" onClick={() => closeTabsToRight(tabContextMenu.path)}>
            <X size={16} />
            <span>Close tabs to right</span>
          </button>
          <button type="button" className="context-menu-item" onClick={closeSavedTabs}>
            <X size={16} />
            <span>Close saved tabs</span>
          </button>
        </div>
      ) : null}

      {inputAndToastOverlays}
    </main>
  );
}

export default App;
