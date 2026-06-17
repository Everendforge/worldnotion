import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Moon,
  Plus,
  Save,
  Search,
  Sun,
} from "lucide-react";
import "./App.css";
import { ContextMenu, CodeMirrorEditor, MarkdownPreview } from "./components";
import type { ContextMenuAction } from "./components";
import {
  Entity,
  EntityTemplate,
  ValidationFinding,
  VaultFile,
  VaultIndex,
  VaultReadResult,
  VaultTreeNode,
  WriteResult,
  indexVault,
  splitMarkdown,
} from "./domain";

type LoadState = "idle" | "loading" | "ready" | "error";
type ThemeChoice = "light" | "dark";
type EditorMode = "source" | "preview";
type AppView = "home" | "workspace";

type BrowserFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }>;
};

type BrowserDirectoryHandle = {
  name: string;
  entries: () => AsyncIterableIterator<[string, BrowserDirectoryHandle | BrowserFileHandle]>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserFileHandle>;
};

const SETTINGS_KEY = "worldnotion.settings.v3";

type AppSettings = {
  theme: ThemeChoice;
  recentUniverse?: string;
  recentUniverses: string[];
};

type EditorState = {
  path: string;
  absolutePath?: string;
  rawMarkdown: string;
  savedMarkdown: string;
  frontmatterRaw: string;
  bodyMarkdown: string;
  modifiedMs?: number | null;
  dirty: boolean;
  mode: "file" | "template";
};

function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AppSettings>;
    const recentUniverses = Array.isArray(parsed.recentUniverses)
      ? parsed.recentUniverses.filter((item): item is string => typeof item === "string")
      : parsed.recentUniverse
        ? [parsed.recentUniverse]
        : [];
    return { theme: parsed.theme ?? "light", recentUniverse: parsed.recentUniverse, recentUniverses };
  } catch {
    return { theme: "light", recentUniverses: [] };
  }
}

function saveSettings(settings: AppSettings) {
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

function rememberUniverse(settings: AppSettings, rootPath: string): AppSettings {
  const recentUniverses = [
    rootPath,
    ...settings.recentUniverses.filter((candidate) => candidate !== rootPath),
  ].slice(0, 8);
  return { ...settings, recentUniverse: rootPath, recentUniverses };
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

async function getBrowserFile(root: BrowserDirectoryHandle, relativePath: string, create = false) {
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts.pop();
  if (!filename) throw new Error("File path is required.");
  const directory = await getBrowserDirectory(root, parts.join("/"), create);
  return directory.getFileHandle(filename, { create });
}

async function writeBrowserFile(root: BrowserDirectoryHandle, relativePath: string, content: string) {
  const fileHandle = await getBrowserFile(root, relativePath, true);
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  const file = await fileHandle.getFile();
  return file.lastModified;
}

function TreeNode({
  node,
  selectedPath,
  onSelectPath,
  expandedPaths,
  onToggleExpand,
  onContextMenu,
}: {
  node: VaultTreeNode;
  selectedPath?: string;
  onSelectPath: (path: string) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string, kind: "file" | "folder") => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children.length > 0;

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-button ${selectedPath === node.path ? "active" : ""}`}
        onClick={() => {
          if (node.kind === "folder" && hasChildren) {
            onToggleExpand(node.path);
          } else if (node.kind === "file") {
            onSelectPath(node.path);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
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
      </button>
      {node.kind === "folder" && hasChildren && isExpanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
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
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [view, setView] = useState<AppView>("home");
  const [index, setIndex] = useState<VaultIndex>();
  const [browserRoot, setBrowserRoot] = useState<BrowserDirectoryHandle>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("source");
  const [editor, setEditor] = useState<EditorState>();
  const [message, setMessage] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("worldnotion.expandedPaths");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetPath: string;
    targetKind: "file" | "folder";
  } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

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
    if (!query.trim()) return index.tree;
    const normalized = query.toLowerCase();
    return index.tree
      .map((node) => filterTree(node, normalized))
      .filter((node): node is VaultTreeNode => Boolean(node));
  }, [index, query]);

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

  function handleContextMenu(event: React.MouseEvent, targetPath: string, targetKind: "file" | "folder") {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      targetPath,
      targetKind,
    });
  }

  async function handleContextMenuAction(action: ContextMenuAction, templateType?: string) {
    if (!index || !contextMenu) return;

    const targetPath = contextMenu.targetPath;
    const parentPath = contextMenu.targetKind === "folder" ? targetPath : targetPath.split("/").slice(0, -1).join("/");

    try {
      if (action === "newBlankPage") {
        const name = prompt("Enter page name:");
        if (!name) return;
        
        const fileName = name.endsWith(".md") ? name : `${name}.md`;
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        
        await invoke("save_file", {
          vaultPath: index.rootPath,
          relativePath: filePath,
          content: `---\nid: ${crypto.randomUUID()}\n---\n\n# ${name}\n`,
        });
        
        await refreshUniverse(filePath);
        setMessage(`Created ${fileName}`);
      } else if (action === "newPageFromTemplate" && templateType) {
        const name = prompt(`Enter ${templateType} name:`);
        if (!name) return;
        
        await invoke("create_entity", {
          vaultPath: index.rootPath,
          templateType,
          name,
          parentPath: parentPath || undefined,
        });
        
        const fileName = `${name}.md`;
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        await refreshUniverse(filePath);
        setMessage(`Created ${templateType}: ${name}`);
      } else if (action === "newFolder") {
        const name = prompt("Enter folder name:");
        if (!name) return;
        
        await invoke("create_folder", {
          vaultPath: index.rootPath,
          relativePath: parentPath ? `${parentPath}/${name}` : name,
        });
        
        await refreshUniverse();
        setExpandedPaths((prev) => new Set(prev).add(parentPath ? `${parentPath}/${name}` : name));
        setMessage(`Created folder: ${name}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function updateSettings(next: Partial<AppSettings>) {
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

    const nextPath =
      preferredPath && nextIndex.files.some((file) => file.relativePath === preferredPath)
        ? preferredPath
        : nextIndex.entities[0]?.path ?? nextIndex.templates[0]?.path;
    if (nextPath) {
      selectDocument(nextIndex, nextPath);
    } else {
      setSelectedPath(undefined);
      setEditor(undefined);
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

  function selectDocument(nextIndex: VaultIndex, path: string) {
    const file = nextIndex.files.find((candidate) => candidate.relativePath === path);
    if (!file) return;
    const split = splitMarkdown(file.content);
    setSelectedPath(path);
    setEditor({
      path: file.relativePath,
      absolutePath: file.absolutePath,
      rawMarkdown: file.content,
      savedMarkdown: file.content,
      frontmatterRaw: split.frontmatterRaw,
      bodyMarkdown: split.bodyMarkdown,
      modifiedMs: file.modifiedMs,
      dirty: false,
      mode: path.startsWith(".everend/templates/") ? "template" : "file",
    });
    setEditorMode("source");
  }

  function selectPath(path: string) {
    if (!index) return;
    selectDocument(index, path);
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
        showDirectoryPicker: () => Promise<BrowserDirectoryHandle>;
      };
      const root = await picker.showDirectoryPicker();
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
    const split = splitMarkdown(rawMarkdown);
    setEditor((current) =>
      current
        ? {
            ...current,
            rawMarkdown,
            frontmatterRaw: split.frontmatterRaw,
            bodyMarkdown: split.bodyMarkdown,
            dirty: rawMarkdown !== current.savedMarkdown,
          }
        : current,
    );
  }

  async function saveEditor() {
    if (!editor) return;
    setMessage("");
    setErrorMessage("");
    try {
      if (browserRoot) {
        if (editor.modifiedMs) {
          const handle = await getBrowserFile(browserRoot, editor.path);
          const currentFile = await handle.getFile();
          if (currentFile.lastModified !== editor.modifiedMs) {
            setMessage("File changed externally. Reload before saving.");
            return;
          }
        }
        await writeBrowserFile(browserRoot, editor.path, editor.rawMarkdown);
        setMessage("Saved.");
        await refreshUniverse(editor.path);
        return;
      }

      if (!editor.absolutePath) throw new Error("This document does not have a writable path.");
      const result = await invoke<WriteResult>("save_file", {
        path: editor.absolutePath,
        content: editor.rawMarkdown,
        expectedModifiedMs: editor.modifiedMs ?? null,
      });
      if (!result.ok) {
        setMessage(result.message ?? "Save failed.");
        return;
      }
      setMessage("Saved.");
      await refreshUniverse(editor.path);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

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
        <div className="brand">
          <BookOpen size={22} />
          <div>
            <h1>WorldNotion</h1>
            <p>{pathName(index.rootPath)}</p>
          </div>
        </div>

        <div className="action-row">
          <button type="button" onClick={() => setView("home")}>
            <Home size={15} />
            Home
          </button>
          <button type="button" onClick={openUniverse}>
            <FolderOpen size={15} />
            Open
          </button>
        </div>

        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" />
        </label>

        <section className="sidebar-section">
          <h2>Files</h2>
          <div className="tree-list">
            {visibleTree.length ? (
              visibleTree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  selectedPath={selectedPath}
                  onSelectPath={selectPath}
                  expandedPaths={expandedPaths}
                  onToggleExpand={toggleExpand}
                  onContextMenu={handleContextMenu}
                />
              ))
            ) : (
              <p className="muted">No files yet.</p>
            )}
          </div>
        </section>

        <section className="sidebar-section">
          <h2>Templates</h2>
          <div className="template-list">
            {index.templates.length ? (
              index.templates.map((template) => (
                <button
                  key={template.path}
                  type="button"
                  className={`template-button ${selectedPath === template.path ? "active" : ""}`}
                  onClick={() => selectPath(template.path)}
                >
                  <FileText size={14} />
                  {template.type}
                </button>
              ))
            ) : (
              <p className="muted">No templates in this universe.</p>
            )}
          </div>
        </section>
      </aside>

      <section className="editor-shell">
        <header className="editor-header">
          <div>
            <p className="eyebrow">{editor?.mode === "template" ? "Template" : "Markdown document"}</p>
            <h2>{editor ? pathName(editor.path) : "No document selected"}</h2>
          </div>
          <div className="editor-actions">
            <button
              type="button"
              className={editorMode === "source" ? "active" : ""}
              onClick={() => setEditorMode("source")}
              disabled={!editor}
            >
              Source
            </button>
            <button
              type="button"
              className={editorMode === "preview" ? "active" : ""}
              onClick={() => setEditorMode("preview")}
              disabled={!editor}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ theme: settings.theme === "light" ? "dark" : "light" })}
              title="Toggle theme"
            >
              {settings.theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button type="button" onClick={saveEditor} disabled={!editor?.dirty || !canWrite}>
              <Save size={15} />
              Save
            </button>
          </div>
        </header>

        {loadState === "error" ? <div className="error-banner">{errorMessage}</div> : null}
        {loadState === "loading" ? <div className="loading-banner">Loading universe...</div> : null}
        {message ? <div className="message-banner">{message}</div> : null}

        {editor ? (
          <div className="editor-surface">
            {editorMode === "source" ? (
              <CodeMirrorEditor
                value={editor.rawMarkdown}
                onChange={updateRawMarkdown}
                theme={settings.theme}
                readOnly={!canWrite}
              />
            ) : (
              <MarkdownPreview markdown={editor.bodyMarkdown} />
            )}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetPath={contextMenu.targetPath}
          targetKind={contextMenu.targetKind}
          templates={index?.templates.map((t) => t.type) || []}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </main>
  );
}

export default App;
