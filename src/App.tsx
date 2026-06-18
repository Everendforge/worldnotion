import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { foldCode } from "@codemirror/language";
import {
  Bold,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Code,
  Columns3,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  Plus,
  Quote,
  Save,
  Search,
  Settings,
  Star,
  StarOff,
  Sun,
  FileEdit,
  X,
  ExternalLink,
  RefreshCw,
  ChevronsDownUp,
} from "lucide-react";
import "./App.css";
import { ContextMenu, CodeMirrorEditor, SettingsModal } from "./components";
import { InputDialog } from "./components/InputDialog";
import { Toast } from "./components/Toast";
import type { ContextMenuAction } from "./components";
import {
  AppSettingsV4,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_KEYBINDINGS,
  EDITOR_COMMANDS,
  EditorCommandId,
  ExplorerSection,
  OpenTab,
  WorkspaceSession,
  shortcutFor,
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
  buildTree,
  indexVault,
  dirname,
  slugify,
} from "./domain";

type LoadState = "idle" | "loading" | "ready" | "error";
type AppView = "home" | "workspace";

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
    return {
      theme: parsed.theme ?? "light",
      recentUniverse: parsed.recentUniverse,
      recentUniverses,
      editor: { ...DEFAULT_EDITOR_SETTINGS, ...(parsed.editor ?? {}) },
      explorer: { ...DEFAULT_EXPLORER_SETTINGS, ...parsedExplorer, activeSection },
      keybindings: parsed.keybindings?.length ? parsed.keybindings : DEFAULT_KEYBINDINGS,
      sessions: parsed.sessions ?? {},
    };
  } catch {
    return {
      theme: "light",
      recentUniverses: [],
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
  return path.replace(/^browser:/, "").split("/").pop() ?? path;
}

function rememberUniverse(settings: AppSettingsV4, rootPath: string): AppSettingsV4 {
  const recentUniverses = [
    rootPath,
    ...settings.recentUniverses.filter((candidate) => candidate !== rootPath),
  ].slice(0, 8);
  return { ...settings, recentUniverse: rootPath, recentUniverses };
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
    ? absolutePath.slice(rootPath.length).replace(/^\/+/, "")
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

function countTreeFiles(node: VaultTreeNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce((count, child) => count + countTreeFiles(child), 0);
}

async function readBrowserUniverse(root: BrowserDirectoryHandle): Promise<VaultReadResult> {
  const files: VaultFile[] = [];
  const errors: VaultReadResult["errors"] = [];

  async function walk(directory: BrowserDirectoryHandle, prefix: string) {
    for await (const [name, handle] of directory.entries()) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const maybeDirectory = handle as BrowserDirectoryHandle;
      const maybeFile = handle as BrowserFileHandle;

      if ("entries" in maybeDirectory) {
        if (name.startsWith(".") && name !== ".everend") continue;
        await walk(maybeDirectory, relativePath);
        continue;
      }

      if (!relativePath.endsWith(".md") && !relativePath.endsWith(".yaml")) continue;

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
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { rootPath: `browser:${root.name}`, files, errors };
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
  onDragMove: (fromPath: string, toFolderPath: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children.length > 0;
  const isFavorite = favoritePaths.has(node.path);
  const isOpen = openTabPaths.has(node.path);
  const isDirty = dirtyTabPaths.has(node.path);
  const activateNode = () => {
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
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (node.kind === "folder") {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          if (node.kind !== "folder") return;
          event.preventDefault();
          const fromPath = event.dataTransfer.getData("text/plain");
          if (fromPath && fromPath !== node.path && !node.path.startsWith(`${fromPath}/`)) {
            onDragMove(fromPath, node.path);
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
              const folderName = node.name;
              const parentPath = dirname(node.path);
              const descriptionPath = parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
              onSelectPath(descriptionPath);
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
}: {
  entity?: Entity;
  template?: EntityTemplate;
  index?: VaultIndex;
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

  return (
    <aside className="inspector">
      <h2>{entity.name}</h2>
      <p className="path-line">{entity.path}</p>

      <section>
        <h3>Frontmatter</h3>
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
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);
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
  const [inputDialog, setInputDialog] = useState<{
    isOpen: boolean;
    title: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm?: (value: string) => Promise<void>;
  }>({
    isOpen: false,
    title: "",
  });

  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (message: string) => {
    console.log(`[App] Showing toast: ${message}`);
    setToastMessage(message);
    setToastVisible(true);
  };

  const activeTab = tabs.find((tab) => tab.path === activeTabPath);
  const openTabPaths = useMemo(() => new Set(tabs.map((tab) => tab.path)), [tabs]);
  const dirtyTabPaths = useMemo(() => new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.path)), [tabs]);
  const favoritePaths = useMemo(
    () => new Set(settings.explorer.favorites.map((favorite) => favorite.path)),
    [settings.explorer.favorites],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

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

    let cancelled = false;
    async function openLastUniverse() {
      setLoadState("loading");
      try {
        const readResult = await invoke<VaultReadResult>("index_vault", { path: recent });
        if (!cancelled) applyUniverse(readResult);
      } catch (error) {
        if (!cancelled) {
          setLoadState("error");
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    }

    openLastUniverse();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEntity = index?.entities.find((entity) => entity.path === selectedPath);
  const selectedTemplate = index?.templates.find((template) => template.path === selectedPath);
  const canWrite = Boolean(index);

  const visibleTree = useMemo(() => {
    if (!index) return [];
    const tree = settings.explorer.showHiddenEverend ? buildTree(index.files, true) : index.tree;
    if (!query.trim()) return tree;
    const normalized = query.toLowerCase();
    return tree
      .map((node) => filterTree(node, normalized))
      .filter((node): node is VaultTreeNode => Boolean(node));
  }, [index, query, settings.explorer.showHiddenEverend]);

  const activeExplorerSection = settings.explorer.activeSection;
  const universeSettings = useMemo(() => {
    if (!index) return undefined;
    return {
      name: pathName(index.rootPath),
      rootPath: index.rootPath,
      fileCount: index.markdownFiles.length,
      entityCount: index.entities.length,
      templateCount: index.templates.length,
      findingCount: index.findings.length,
      spaces: index.tree
        .filter((node) => node.kind === "folder")
        .map((node) => ({
          name: node.name,
          path: node.path,
          fileCount: countTreeFiles(node),
          hasDescription: node.hasDescription,
        })),
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

  function filterTree(node: VaultTreeNode, normalized: string): VaultTreeNode | undefined {
    const children = node.children
      .map((child) => filterTree(child, normalized))
      .filter((child): child is VaultTreeNode => Boolean(child));
    if (node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized) || children.length) {
      return { ...node, children };
    }
    return undefined;
  }

  useEffect(() => {
    localStorage.setItem("worldnotion.expandedPaths", JSON.stringify(Array.from(expandedPaths)));
  }, [expandedPaths]);

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

  function updateTabsForPathChange(fromPath: string, toPath: string, mode: "single" | "tree") {
    setTabs((current) =>
      current.map((tab) => {
        const affected = mode === "tree" ? tab.path === fromPath || tab.path.startsWith(`${fromPath}/`) : tab.path === fromPath;
        if (!affected) return tab;
        const path = mode === "tree" ? childPathAfterMove(tab.path, fromPath, dirname(toPath)) : toPath;
        return { ...tab, path, title: fileTitle(path), absolutePath: index ? `${index.rootPath}/${path}` : tab.absolutePath };
      }),
    );
    if (selectedPath === fromPath || (mode === "tree" && selectedPath?.startsWith(`${fromPath}/`))) {
      const nextSelected = mode === "tree" && selectedPath ? childPathAfterMove(selectedPath, fromPath, dirname(toPath)) : toPath;
      setSelectedPath(nextSelected);
      setActiveTabPath(nextSelected);
    }
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    targetPath: string,
    targetKind: "file" | "folder" | "empty",
    templateType?: string,
  ) {
    console.log(`[handleContextMenuAction] START - action: ${action}, targetPath: ${targetPath}, targetKind: ${targetKind}`);
    if (!index) {
      console.error(`[handleContextMenuAction] No index available`);
      return;
    }

    const parentPath = targetKind === "folder" ? targetPath : targetPath.split("/").slice(0, -1).join("/");
    console.log(`[handleContextMenuAction] parentPath: ${parentPath}`);

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
        console.log(`[newBlankPage] Prompting for page name`);
        const name = await promptUser("Enter page name:");
        console.log(`[newBlankPage] Prompt result: ${name}`);
        if (!name || name.trim() === "") {
          console.log(`[newBlankPage] Name is empty, returning`);
          return;
        }

        try {
          const fileName = name.endsWith(".md") ? name : `${name}.md`;
          const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
          const content = `---\nid: ${slugify(name)}\ntype: concept\nname: ${name.replace(/\.md$/i, "")}\nstatus: draft\n---\n\n# ${name.replace(/\.md$/i, "")}\n`;

          console.log(`[newBlankPage] Creating file: ${filePath}`);

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
            console.log(`[newBlankPage] File saved successfully`);
          }

          console.log(`[newBlankPage] Refreshing universe with path: ${filePath}`);
          await refreshUniverse(filePath);
          console.log(`[newBlankPage] Universe refreshed, selecting path`);
          await selectPathAfterRefresh(filePath);
          showToast(`Created blank page: ${fileName}`);
        } catch (error) {
          console.error(`[newBlankPage] Error:`, error);
          throw error;
        }
      } else if (action === "newPageFromTemplate" && templateType) {
        console.log(`[newPageFromTemplate] Prompting for ${templateType} name`);
        const name = await promptUser(`Enter ${templateType} name:`);
        console.log(`[newPageFromTemplate] Prompt result: ${name}`);
        if (!name || name.trim() === "") {
          console.log(`[newPageFromTemplate] Name is empty, returning`);
          return;
        }

        try {
          const slug = slugify(name);
          const filePath = parentPath ? `${parentPath}/${slug}.md` : `${slug}.md`;

          console.log(`[newPageFromTemplate] Creating ${templateType}: ${filePath}`);

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
            console.log(`[newPageFromTemplate] Entity created successfully`);
          }

          console.log(`[newPageFromTemplate] Refreshing universe with path: ${filePath}`);
          await refreshUniverse(filePath);
          console.log(`[newPageFromTemplate] Universe refreshed, selecting path`);
          await selectPathAfterRefresh(filePath);
          showToast(`Created ${templateType}: ${name}`);
        } catch (error) {
          console.error(`[newPageFromTemplate] Error:`, error);
          throw error;
        }
      } else if (action === "newFolder") {
        console.log(`[newFolder] Prompting for folder name`);
        const name = await promptUser("Enter folder name:");
        console.log(`[newFolder] Prompt result: ${name}`);
        if (!name || name.trim() === "") {
          console.log(`[newFolder] Name is empty, returning`);
          return;
        }

        try {
          const folderPath = parentPath ? `${parentPath}/${name}` : name;
          const descriptionPath = parentPath ? `${parentPath}/${name}.md` : `${name}.md`;
          const descriptionContent = `---\nid: ${slugify(name)}-folder\ntype: folder-description\nname: ${name}\nstatus: draft\nfolder: ${name}\n---\n\n# ${name}\n\nDescription of this folder's contents.\n`;

          console.log(`[newFolder] Creating folder: ${folderPath}`);

          if (browserRoot) {
            console.log(`[newFolder] Using browser mode`);
            await ensureBrowserWritePermission(browserRoot);
            await getBrowserDirectory(browserRoot, folderPath, true);
            await writeBrowserFile(browserRoot, descriptionPath, descriptionContent);
          } else {
            console.log(`[newFolder] Using desktop mode`);
            const folderResult = await invoke<WriteResult>("create_folder", {
              vaultPath: index.rootPath,
              relativePath: folderPath,
            });
            if (!folderResult.ok) {
              throw new Error(folderResult.message ?? "Could not create folder.");
            }
            console.log(`[newFolder] Folder created, now saving description`);
            const descriptionResult = await invoke<WriteResult>("save_file", {
              path: `${index.rootPath}/${descriptionPath}`,
              content: descriptionContent,
              expectedModifiedMs: null,
            });
            if (!descriptionResult.ok) {
              throw new Error(descriptionResult.message ?? "Could not create folder description.");
            }
            console.log(`[newFolder] Description saved`);
          }
          
          console.log(`[newFolder] Refreshing universe with path: ${descriptionPath}`);
          await refreshUniverse(descriptionPath);
          setExpandedPaths((prev) => new Set(prev).add(folderPath));
          console.log(`[newFolder] Universe refreshed, selecting path`);
          await selectPathAfterRefresh(descriptionPath);
          showToast(`Created folder: ${name}`);
        } catch (error) {
          console.error(`[newFolder] Error:`, error);
          throw error;
        }
      } else if (action === "rename" && targetKind !== "empty") {
        const currentName = pathName(targetPath);
        console.log(`[rename] Prompting to rename "${currentName}"`);
        const newName = await promptUser("New name:", "new name", currentName);
        console.log(`[rename] Prompt result: ${newName}`);
        if (!newName || newName === currentName) {
          console.log(`[rename] New name is same or empty, returning`);
          return;
        }
        const nextPath = `${dirname(targetPath) ? `${dirname(targetPath)}/` : ""}${newName}`;
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
        updateTabsForPathChange(targetPath, nextPath, targetKind === "folder" ? "tree" : "single");
        await refreshUniverse(nextPath);
        if (targetKind === "file") {
          selectPath(nextPath);
        }
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
      console.error(`[handleContextMenuAction] ERROR in action "${action}":`, errorMsg);
      console.error(`[handleContextMenuAction] Full error:`, error);
      setLoadState("error");
      setErrorMessage(`[${action}] ${errorMsg}`);
    } finally {
      console.log(`[handleContextMenuAction] END - action: ${action}`);
      setContextMenu(null);
    }
  }

  async function moveExplorerPath(fromPath: string, toFolderPath: string, kind?: "file" | "folder") {
    if (!index) return;
    const itemKind = kind ?? (index.files.some((file) => file.relativePath === fromPath) ? "file" : "folder");
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
    updateTabsForPathChange(fromPath, movedPath, "tree");
    await refreshUniverse(movedPath);
    setMessage(`Moved ${pathName(fromPath)}.`);
  }

  async function revealExplorerPath(path?: string) {
    if (!index) return;
    if (browserRoot) {
      throw new Error("Reveal in Finder is only available in the desktop app.");
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
      const confirmed = window.confirm(`${affectedDirtyTabs.length} open tab(s) have unsaved changes. Move to Trash anyway?`);
      if (!confirmed) return;
    }
    const confirmed = window.confirm(
      browserRoot
        ? `Delete ${pathName(path)} from this browser-opened universe?`
        : `Move ${pathName(path)} to Trash?`,
    );
    if (!confirmed) return;
    if (browserRoot) {
      await removeBrowserPath(browserRoot, path, true);
    } else {
      const result = await invoke<WriteResult>("trash_path", {
        vaultPath: index.rootPath,
        relativePath: path,
      });
      if (!result.ok) throw new Error(result.message ?? "Could not move item to Trash.");
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
    setMessage(`Moved ${kind} to Trash.`);
  }

  async function createFolderDescription(folderPath: string) {
    if (!index) return;
    
    const folderName = folderPath.split("/").pop() ?? folderPath;
    const parentPath = dirname(folderPath);
    const descriptionPath = parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
    const fullPath = `${index.rootPath}/${descriptionPath}`;
    const content = `---\nid: ${slugify(folderName)}-folder\ntype: folder-description\nname: ${folderName}\nstatus: draft\nfolder: ${folderName}\n---\n\n# ${folderName}\n\nDescription of this folder's contents.\n`;
    
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
      
      await refreshUniverse(descriptionPath);
      selectPath(descriptionPath);
      setMessage(`Created folder description: ${folderName}.md`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function updateSettings(next: Partial<AppSettingsV4>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function applyUniverse(readResult: VaultReadResult, preferredPath?: string) {
    const nextIndex = indexVault(readResult);
    setIndex(nextIndex);
    setView("workspace");
    setLoadState("ready");
    setMessage("");
    setErrorMessage("");
    setSettings((current) => rememberUniverse(current, readResult.rootPath));

    const liveTabs =
      index?.rootPath === readResult.rootPath && tabs.length
        ? tabs
            .map((tab) => {
              const file = nextIndex.files.find((candidate) => candidate.relativePath === tab.path);
              if (!file) return undefined;
              return tab.dirty
                ? { ...tab, absolutePath: file.absolutePath, modifiedMs: file.modifiedMs }
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
        : restoredSession?.activePath && nextIndex.files.some((file) => file.relativePath === restoredSession.activePath)
          ? restoredSession.activePath
          : restoredTabs[0]?.path ?? nextIndex.entities[0]?.path ?? nextIndex.templates[0]?.path;

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
  }

  async function readCurrentUniverse() {
    if (!index) return undefined;
    if (browserRoot) return readBrowserUniverse(browserRoot);
    return invoke<VaultReadResult>("index_vault", { path: index.rootPath });
  }

  async function refreshUniverse(preferredPath = selectedPath) {
    const readResult = await readCurrentUniverse();
    if (!readResult) return;
    applyUniverse(readResult, preferredPath);
  }

  async function reindexUniverseMetadata() {
    const readResult = await readCurrentUniverse();
    if (!readResult) return;
    setIndex(indexVault(readResult));
    setView("workspace");
    setLoadState("ready");
    setSettings((current) => rememberUniverse(current, readResult.rootPath));
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
    setActiveTabPath(path);
    rememberRecentFile(path);
    setTabs((current) => {
      if (settings.editor.reuseOpenTabs && current.some((tab) => tab.path === path)) {
        return current;
      }
      return [...current, createTabFromFile(file)];
    });
  }

  async function createExplorerNote(parentPath = activeCreationFolder()) {
    if (!index) return;
    const name = window.prompt("Note name");
    if (!name) return;
    try {
      const slug = slugify(name);
      const filePath = parentPath ? `${parentPath}/${slug}.md` : `${slug}.md`;
      const content = `---\nid: ${slug}\ntype: concept\nname: ${name}\nstatus: draft\n---\n\n# ${name}\n`;
      if (browserRoot) {
        await writeBrowserFile(browserRoot, filePath, content);
      } else {
        const result = await invoke<WriteResult>("save_file", {
          path: `${index.rootPath}/${filePath}`,
          content,
          expectedModifiedMs: null,
        });
        if (!result.ok) throw new Error(result.message ?? "Could not create note.");
      }
      await refreshUniverse(filePath);
      selectPath(filePath);
      setMessage(`Created ${name}.`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createExplorerFolder(parentPath = activeCreationFolder()) {
    if (!index) return;
    const name = window.prompt("Folder name");
    if (!name) return;
    try {
      const folderPath = parentPath ? `${parentPath}/${name}` : name;
      const descriptionPath = parentPath ? `${parentPath}/${name}.md` : `${name}.md`;
      const descriptionContent = `---\nid: ${slugify(name)}-folder\ntype: folder-description\nname: ${name}\nstatus: draft\nfolder: ${name}\n---\n\n# ${name}\n\nDescription of this folder's contents.\n`;

      if (browserRoot) {
        await ensureBrowserWritePermission(browserRoot);
        await getBrowserDirectory(browserRoot, folderPath, true);
        await writeBrowserFile(browserRoot, descriptionPath, descriptionContent);
      } else {
        const folderResult = await invoke<WriteResult>("create_folder", {
          vaultPath: index.rootPath,
          relativePath: folderPath,
        });
        if (!folderResult.ok) throw new Error(folderResult.message ?? "Could not create folder.");
        const descriptionResult = await invoke<WriteResult>("save_file", {
          path: `${index.rootPath}/${descriptionPath}`,
          content: descriptionContent,
          expectedModifiedMs: null,
        });
        if (!descriptionResult.ok) throw new Error(descriptionResult.message ?? "Could not create folder description.");
      }
      
      setExpandedPaths((current) => new Set(current).add(folderPath));
      await refreshUniverse(descriptionPath);
      selectPath(descriptionPath);
      setMessage(`Created folder ${name}.`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createTemplate() {
    if (!index) return;
    const type = window.prompt("Template type");
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
      await refreshUniverse(relativePath);
      selectPath(relativePath);
      setTemplatesExpanded(true);
      setMessage(`Created template: ${templateType}.`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function selectPath(path: string) {
    if (!index) return;
    setSelectedExplorerTarget({ path, kind: "file" });
    openDocument(index, path);
  }

  async function promptUser(
    title: string,
    placeholder: string = "Enter value",
    defaultValue: string = ""
  ): Promise<string | null> {
    return new Promise((resolve) => {
      console.log(`[promptUser] Opening dialog: ${title}`);
      setInputDialog({
        isOpen: true,
        title,
        placeholder,
        defaultValue,
        onConfirm: async (value: string) => {
          console.log(`[promptUser] User confirmed: "${value}"`);
          setInputDialog({ isOpen: false, title: "" });
          resolve(value);
        },
      });
    });
  }

  function closeInputDialog(value: string | null) {
    console.log(`[closeInputDialog] Closing with value: ${value}`);
    setInputDialog({ isOpen: false, title: "" });
  }

  async function selectPathAfterRefresh(path: string) {
    // Wait longer to ensure state has been updated and filesystem reflects changes
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!index) {
      console.warn(`[selectPathAfterRefresh] No index available`);
      return;
    }
    const file = index.files.find((f) => f.relativePath === path);
    if (!file) {
      console.warn(`[selectPathAfterRefresh] File not found after refresh: ${path}. Available files: ${index.files.map(f => f.relativePath).join(", ")}`);
      return;
    }
    console.log(`[selectPathAfterRefresh] Opening file: ${path}`);
    setSelectedExplorerTarget({ path, kind: "file" });
    openDocument(index, path);
  }

  function selectFolder(path: string) {
    setSelectedExplorerTarget({ path, kind: "folder" });
    setSelectedPath(path);
  }

  async function openUniverse() {
    setLoadState("loading");
    setErrorMessage("");
    setMessage("");
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
    setLoadState("loading");
    setErrorMessage("");
    setMessage("");
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

      const name = window.prompt("Universe folder name");
      if (!name) {
        setLoadState(index ? "ready" : "idle");
        return;
      }

      const result = await invoke<WriteResult>("create_universe", { vaultPath: parent, name });
      if (!result.ok) throw new Error(result.message ?? "Could not create universe.");
      setBrowserRoot(undefined);
      applyUniverse(await invoke<VaultReadResult>("index_vault", { path: result.path }));
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
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function updateRawMarkdown(rawMarkdown: string) {
    if (!activeTabPath) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.path === activeTabPath
          ? { ...tab, rawMarkdown, dirty: rawMarkdown !== tab.savedMarkdown }
          : tab,
      ),
    );
  }

  async function saveEditor() {
    if (!activeTab) return;
    setMessage("");
    setErrorMessage("");
    try {
      if (browserRoot) {
        if (activeTab.modifiedMs) {
          const handle = await getBrowserFile(browserRoot, activeTab.path);
          const currentFile = await handle.getFile();
          if (currentFile.lastModified !== activeTab.modifiedMs) {
            setMessage("File changed externally. Reload before saving.");
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
        setMessage("Saved.");
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
        setMessage(result.message ?? "Save failed.");
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
      setMessage("Saved.");
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

  function applyHeading(level: 1 | 2 | 3) {
    replaceCurrentLines((line) => `${"#".repeat(level)} ${line.replace(/^#{1,6}\s+/, "")}`);
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
    const name = window.prompt("Note name");
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
      await refreshUniverse(relativePath);
      setMessage(`Created ${name}.`);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
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
      case "blockquote":
        replaceCurrentLines((line) => `> ${line.replace(/^>\s?/, "")}`);
        break;
      case "unorderedList":
        replaceCurrentLines((line) => `- ${line.replace(/^[-*]\s+/, "")}`);
        break;
      case "orderedList":
        replaceCurrentLines((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`);
        break;
      case "taskList":
        replaceCurrentLines((line) => `- [ ] ${line.replace(/^-\s+\[[ xX]\]\s+/, "")}`);
        break;
      case "link":
        replaceSelection("[", "](url)", "link text");
        break;
      case "wikilink":
        replaceSelection("[[", "]]", "Page Name");
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

  if (view === "home" || !index) {
    return (
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
            onClick={() => updateSettings({ theme: settings.theme === "light" ? "dark" : "light" })}
            title="Toggle theme"
          >
            {settings.theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
        </header>

        <section className="home-panel">
          <p className="eyebrow">Home</p>
          <h2>Open a universe folder</h2>
          <p>
            A universe is any local folder. WorldNotion reads Markdown, `.everend/taxonomy.yaml`,
            and `.everend/templates` from that folder.
          </p>

          <div className="home-actions">
            <button type="button" onClick={openUniverse}>
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
            {index ? (
              <button type="button" onClick={() => setView("workspace")}>
                <FileText size={16} />
                Return to Workspace
              </button>
            ) : null}
          </div>

          {loadState === "error" ? <div className="error-banner">{errorMessage}</div> : null}
          {loadState === "loading" ? <div className="loading-banner">Loading universe...</div> : null}

          {settings.recentUniverses.filter((path) => !path.startsWith("browser:")).length ? (
            <section className="recent-section">
              <h3>Recent universes</h3>
              <div className="recent-list">
                {settings.recentUniverses
                  .filter((path) => !path.startsWith("browser:"))
                  .map((path) => (
                    <button key={path} type="button" onClick={() => openRecentUniverse(path)}>
                      <Folder size={15} />
                      <span>{pathName(path)}</span>
                      <small>{path}</small>
                    </button>
                  ))}
              </div>
            </section>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button type="button" className="universe-button" onClick={() => setShowSettings(true)}>
          <BookOpen size={22} />
          <div>
            <h1>{pathName(index.rootPath)}</h1>
            <p>Universe</p>
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
          <button type="button" onClick={() => createExplorerNote()} title="New note">
            <FileText size={14} />
          </button>
          <button type="button" onClick={() => createExplorerFolder()} title="New folder">
            <FolderPlus size={14} />
          </button>
          <button type="button" onClick={() => setExpandedPaths(new Set())} title="Collapse all">
            <ChevronsDownUp size={14} />
          </button>
          <button type="button" onClick={() => refreshUniverse()} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => revealExplorerPath(selectedPath)}
            title={browserRoot ? "Reveal is available in the desktop app" : "Reveal in Finder"}
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
              <div className="tree-list" onContextMenu={(event) => handleContextMenu(event, "", "empty")}>
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

      <section className="editor-shell">
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
          <button type="button" className="tab-add" onClick={createNoteFromTabButton} title="New tab">
            <Plus size={14} />
          </button>
        </div>

        <header className="editor-header">
          <div>
            <p className="eyebrow">{activeTab?.isTemplate ? "Template" : "Markdown document"}</p>
            <h2>{activeTab ? pathName(activeTab.path) : "No document selected"}</h2>
          </div>
          <div className="editor-actions">
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
              onClick={() => updateSettings({ theme: settings.theme === "light" ? "dark" : "light" })}
              title="Toggle theme"
            >
              {settings.theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <span className={`save-status ${activeTab?.dirty ? "dirty" : ""}`}>
              {!activeTab ? "No file" : !canWrite ? "Read only" : activeTab.dirty ? "Unsaved" : "Saved"}
            </span>
            <button type="button" onClick={saveEditor} disabled={!activeTab || !canWrite}>
              <Save size={15} />
              Save
            </button>
          </div>
        </header>

        <div className="editor-toolbar">
          <button type="button" onClick={() => executeCommand("bold")} title={`Bold ${shortcutFor("bold", settings.keybindings)}`}>
            <Bold size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("italic")} title={`Italic ${shortcutFor("italic", settings.keybindings)}`}>
            <Italic size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("inlineCode")} title="Inline code">
            <Code size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("heading1")} title="Heading 1">
            H1
          </button>
          <button type="button" onClick={() => executeCommand("heading2")} title="Heading 2">
            H2
          </button>
          <button type="button" onClick={() => executeCommand("heading3")} title="Heading 3">
            H3
          </button>
          <button type="button" onClick={() => executeCommand("blockquote")} title="Blockquote">
            <Quote size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("unorderedList")} title="Unordered list">
            <List size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("orderedList")} title="Ordered list">
            <ListOrdered size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("taskList")} title="Task list">
            <ListChecks size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("link")} title="Link">
            <Link size={14} />
          </button>
          <button type="button" onClick={() => executeCommand("wikilink")} title="Wikilink">
            [[ ]]
          </button>
          <button type="button" onClick={() => executeCommand("horizontalRule")} title="Horizontal rule">
            —
          </button>
          <button type="button" onClick={() => executeCommand("commandPalette")} title={`Command palette ${shortcutFor("commandPalette", settings.keybindings)}`}>
            <Columns3 size={14} />
          </button>
        </div>

        {loadState === "error" ? <div className="error-banner">{errorMessage}</div> : null}
        {loadState === "loading" ? <div className="loading-banner">Loading universe...</div> : null}
        {message ? <div className="message-banner">{message}</div> : null}

        {activeTab ? (
          <div className="editor-surface">
            <CodeMirrorEditor
              value={activeTab.rawMarkdown}
              onChange={updateRawMarkdown}
              theme={settings.theme}
              mode={activeTab.mode}
              settings={settings.editor}
              readOnly={!canWrite}
              onEditorReady={(view) => {
                editorViewRef.current = view;
              }}
            />
          </div>
        ) : (
          <section className="empty-editor">
            <FileText size={42} />
            <h2>No note selected</h2>
            <p>Select a file from the sidebar or create a new note.</p>
          </section>
        )}
      </section>

      <Inspector entity={selectedEntity} template={selectedTemplate} index={index} />

      {showSettings ? (
        <SettingsModal
          settings={settings}
          universe={universeSettings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          onOpenHome={() => {
            setShowSettings(false);
            setView("home");
          }}
          onRevealUniverse={() => {
            void revealExplorerPath();
          }}
          onCreateSpace={() => {
            setShowSettings(false);
            void createExplorerFolder("");
          }}
          onOpenSpace={(path) => {
            setShowSettings(false);
            updateExplorer({ activeSection: "allFiles" });
            setExpandedPaths((current) => new Set(current).add(path));
            const descriptionPath = `${path}.md`;
            if (index.files.some((file) => file.relativePath === descriptionPath)) {
              selectPath(descriptionPath);
            }
          }}
        />
      ) : null}

      {showCommandPalette ? (
        <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="command-palette">
            <input
              autoFocus
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="Run command..."
            />
            <div className="command-list">
              {EDITOR_COMMANDS.filter((command) =>
                command.label.toLowerCase().includes(commandQuery.toLowerCase()),
              ).map((command) => (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => {
                    setShowCommandPalette(false);
                    setCommandQuery("");
                    void executeCommand(command.id);
                  }}
                >
                  <span>{command.label}</span>
                  <small>{shortcutFor(command.id, settings.keybindings)}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
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
          trashLabel={browserRoot ? "Delete" : "Move to Trash"}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      <InputDialog
        isOpen={inputDialog.isOpen}
        title={inputDialog.title}
        placeholder={inputDialog.placeholder}
        defaultValue={inputDialog.defaultValue}
        onConfirm={inputDialog.onConfirm || (async () => {})}
        onCancel={() => {
          console.log(`[App] InputDialog cancelled`);
          setInputDialog({ isOpen: false, title: "" });
        }}
      />

      <Toast
        message={toastMessage}
        isVisible={toastVisible}
        duration={3000}
        onDismiss={() => {
          console.log(`[App] Toast dismissed`);
          setToastVisible(false);
        }}
      />
    </main>
  );
}

export default App;
