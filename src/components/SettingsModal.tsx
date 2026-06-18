import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { ExternalLink, Files, Folder, Home, Keyboard, PanelLeft, Plus, Settings, TextCursorInput, X } from "lucide-react";
import {
  AppSettingsV4,
  DEFAULT_KEYBINDINGS,
  EDITOR_COMMANDS,
  EditorCommandId,
  EditorSettings,
  Keybinding,
} from "../editorTypes";
import "../App.css";

type SettingsModalProps = {
  settings: AppSettingsV4;
  universe?: {
    name: string;
    rootPath: string;
    fileCount: number;
    entityCount: number;
    templateCount: number;
    findingCount: number;
    spaces: Array<{
      name: string;
      path: string;
      fileCount: number;
      hasDescription?: boolean;
    }>;
  };
  onChange: (settings: AppSettingsV4) => void;
  onClose: () => void;
  onOpenHome?: () => void;
  onRevealUniverse?: () => void;
  onCreateSpace?: () => void;
  onOpenSpace?: (path: string) => void;
};

function eventToShortcut(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Meta", "Alt", "Shift"].includes(key)) {
    parts.push(key);
  }

  return parts.length ? parts.join("+") : "";
}

function duplicateShortcut(shortcut: string, commandId: EditorCommandId, keybindings: Keybinding[]) {
  if (!shortcut) return undefined;
  const duplicate = keybindings.find(
    (binding) => binding.shortcut === shortcut && binding.commandId !== commandId,
  );
  return duplicate ? EDITOR_COMMANDS.find((command) => command.id === duplicate.commandId)?.label : undefined;
}

type SettingsSection = "overview" | "spaces" | "editor" | "shortcuts" | "tabs" | "explorer";

export function SettingsModal({
  settings,
  universe,
  onChange,
  onClose,
  onOpenHome,
  onRevealUniverse,
  onCreateSpace,
  onOpenSpace,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(universe ? "overview" : "editor");
  const [conflictMessage, setConflictMessage] = useState("");

  const keybindingMap = useMemo(
    () => new Map(settings.keybindings.map((binding) => [binding.commandId, binding.shortcut])),
    [settings.keybindings],
  );

  function updateEditor(next: Partial<EditorSettings>) {
    onChange({ ...settings, editor: { ...settings.editor, ...next } });
  }

  function updateShortcut(commandId: EditorCommandId, shortcut: string) {
    const conflict = duplicateShortcut(shortcut, commandId, settings.keybindings);
    if (conflict) {
      setConflictMessage(`${shortcut} is already assigned to ${conflict}.`);
      return;
    }

    setConflictMessage("");
    onChange({
      ...settings,
      keybindings: [
        ...settings.keybindings.filter((binding) => binding.commandId !== commandId),
        { commandId, shortcut },
      ].filter((binding) => binding.shortcut),
    });
  }

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-modal">
        <header className="settings-header">
          <div>
            <p className="eyebrow">{universe ? "Universe settings" : "Application settings"}</p>
            <h2>{universe?.name ?? "WorldNotion"}</h2>
          </div>
          <button type="button" onClick={onClose} title="Close settings">
            <X size={16} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav">
            {universe ? (
              <div className="settings-nav-group">
                <p>Universe</p>
                <button className={activeSection === "overview" ? "active" : ""} onClick={() => setActiveSection("overview")} type="button">
                  <Settings size={14} />
                  Overview
                </button>
                <button className={activeSection === "spaces" ? "active" : ""} onClick={() => setActiveSection("spaces")} type="button">
                  <Files size={14} />
                  Spaces
                </button>
              </div>
            ) : null}

            <div className="settings-nav-group app-settings-group">
              <p>Application</p>
              <button className={activeSection === "editor" ? "active" : ""} onClick={() => setActiveSection("editor")} type="button">
                <TextCursorInput size={14} />
                Editor
              </button>
              <button className={activeSection === "shortcuts" ? "active" : ""} onClick={() => setActiveSection("shortcuts")} type="button">
                <Keyboard size={14} />
                Shortcuts
              </button>
              <button className={activeSection === "tabs" ? "active" : ""} onClick={() => setActiveSection("tabs")} type="button">
                <PanelLeft size={14} />
                Tabs
              </button>
              <button className={activeSection === "explorer" ? "active" : ""} onClick={() => setActiveSection("explorer")} type="button">
                <Folder size={14} />
                Explorer
              </button>
            </div>
          </nav>

          <section className="settings-section">
            {activeSection === "overview" && universe ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Universe</h3>
                  <p>{universe.rootPath}</p>
                </div>

                <div className="universe-stats">
                  <div>
                    <strong>{universe.entityCount}</strong>
                    <span>Entities</span>
                  </div>
                  <div>
                    <strong>{universe.fileCount}</strong>
                    <span>Files</span>
                  </div>
                  <div>
                    <strong>{universe.templateCount}</strong>
                    <span>Templates</span>
                  </div>
                  <div>
                    <strong>{universe.findingCount}</strong>
                    <span>Findings</span>
                  </div>
                </div>

                <div className="settings-action-list">
                  <button type="button" onClick={onCreateSpace}>
                    <Plus size={15} />
                    New space
                  </button>
                  <button type="button" onClick={onRevealUniverse}>
                    <ExternalLink size={15} />
                    Reveal universe folder
                  </button>
                  <button type="button" onClick={onOpenHome}>
                    <Home size={15} />
                    Go to home
                  </button>
                </div>
              </div>
            ) : null}

            {activeSection === "spaces" && universe ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Spaces</h3>
                  <p>Top-level folders in this universe.</p>
                </div>
                <div className="space-list">
                  {universe.spaces.length ? (
                    universe.spaces.map((space) => (
                      <button key={space.path} type="button" onClick={() => onOpenSpace?.(space.path)}>
                        <Folder size={15} />
                        <span>{space.name}</span>
                        <small>
                          {space.fileCount} file{space.fileCount === 1 ? "" : "s"}
                          {space.hasDescription ? " · description" : ""}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p className="muted">No spaces yet. Create a top-level folder to start organizing this universe.</p>
                  )}
                </div>
              </div>
            ) : null}

            {activeSection === "editor" ? (
              <div className="settings-grid">
                <label>
                  <span>Line numbers</span>
                  <input type="checkbox" checked={settings.editor.lineNumbers} onChange={(event) => updateEditor({ lineNumbers: event.target.checked })} />
                </label>
                <label>
                  <span>Line wrap</span>
                  <input type="checkbox" checked={settings.editor.lineWrap} onChange={(event) => updateEditor({ lineWrap: event.target.checked })} />
                </label>
                <label>
                  <span>Active line</span>
                  <input type="checkbox" checked={settings.editor.activeLine} onChange={(event) => updateEditor({ activeLine: event.target.checked })} />
                </label>
                <label>
                  <span>Font size</span>
                  <input type="number" min={11} max={22} value={settings.editor.fontSize} onChange={(event) => updateEditor({ fontSize: Number(event.target.value) })} />
                </label>
                <label>
                  <span>Tab size</span>
                  <input type="number" min={2} max={8} value={settings.editor.tabSize} onChange={(event) => updateEditor({ tabSize: Number(event.target.value) })} />
                </label>
                <label>
                  <span>Default mode</span>
                  <select value={settings.editor.defaultMode} onChange={(event) => updateEditor({ defaultMode: event.target.value as EditorSettings["defaultMode"] })}>
                    <option value="write">Write</option>
                    <option value="source">Source</option>
                  </select>
                </label>
              </div>
            ) : null}

            {activeSection === "shortcuts" ? (
              <div>
                <div className="settings-inline">
                  <p className="muted">Focus a shortcut field and press the desired keys.</p>
                  <button type="button" onClick={() => onChange({ ...settings, keybindings: DEFAULT_KEYBINDINGS })}>
                    Reset defaults
                  </button>
                </div>
                {conflictMessage ? <div className="error-banner settings-error">{conflictMessage}</div> : null}
                <div className="shortcut-list">
                  {EDITOR_COMMANDS.map((command) => (
                    <label key={command.id} className="shortcut-row">
                      <span>{command.label}</span>
                      <input
                        value={keybindingMap.get(command.id) ?? ""}
                        onChange={(event) => updateShortcut(command.id, event.target.value)}
                        onKeyDown={(event) => {
                          event.preventDefault();
                          updateShortcut(command.id, eventToShortcut(event));
                        }}
                        placeholder="Unassigned"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {activeSection === "tabs" ? (
              <div className="settings-grid">
                <label>
                  <span>Persist tabs</span>
                  <input type="checkbox" checked={settings.editor.persistTabs} onChange={(event) => updateEditor({ persistTabs: event.target.checked })} />
                </label>
                <label>
                  <span>Reuse open tabs</span>
                  <input type="checkbox" checked={settings.editor.reuseOpenTabs} onChange={(event) => updateEditor({ reuseOpenTabs: event.target.checked })} />
                </label>
                <label>
                  <span>Confirm dirty close</span>
                  <input type="checkbox" checked={settings.editor.confirmCloseDirtyTab} onChange={(event) => updateEditor({ confirmCloseDirtyTab: event.target.checked })} />
                </label>
              </div>
            ) : null}

            {activeSection === "explorer" ? (
              <div className="settings-grid">
                <label>
                  <span>Confirm drag moves</span>
                  <input
                    type="checkbox"
                    checked={settings.explorer.confirmDragMove}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        explorer: { ...settings.explorer, confirmDragMove: event.target.checked },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Show hidden `.everend`</span>
                  <input
                    type="checkbox"
                    checked={settings.explorer.showHiddenEverend}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        explorer: { ...settings.explorer, showHiddenEverend: event.target.checked },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
