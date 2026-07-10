import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  BookOpen,
  Castle,
  ExternalLink,
  FileText,
  Folder,
  Globe2,
  Hash,
  Keyboard,
  PanelLeft,
  Plug,
  Settings,
  Sparkles,
  TextCursorInput,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import {
  AppSettingsV4,
  DEFAULT_KEYBINDINGS,
  EDITOR_COMMANDS,
  EditorCommandId,
  EditorSettings,
  Keybinding,
  PluginCategory,
  PropertiesConfig,
} from "../editorTypes";
import type { UniverseProfile } from "../domain";
import { createDefaultTaxonomyConfig } from "../domain";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "../utils/propertyTemplates";
import type { FrontmatterNormalizationItem } from "../utils/frontmatterNormalizer";
import { THEMES, themeById } from "../themes";
import { PropertiesManager } from "./TaxonomyManager";
import {
  getPluginDefinitions,
  isPluginEnabled,
  legacyPluginEnabled,
  pluginCategoryLabel,
  updatePluginEnabled,
} from "../utils/pluginRegistry";
import "../App.css";

type SettingsModalProps = {
  settings: AppSettingsV4;
  universe?: {
    name: string;
    rootPath: string;
    fileCount: number;
    entityCount: number;
    templateCount: number;
    hasEverendWorkspace: boolean;
    profile?: UniverseProfile;
    propertiesConfig?: PropertiesConfig;
  };
  onChange: (settings: AppSettingsV4) => void;
  onSaveUniverseProfile?: (profile: UniverseProfile) => Promise<void>;
  onSavePropertiesConfig?: (config: PropertiesConfig) => Promise<void>;
  onInitializePropertiesWorkspace?: (config: PropertiesConfig) => Promise<void>;
  onScanFrontmatterNormalization?: () =>
    FrontmatterNormalizationItem[] | Promise<FrontmatterNormalizationItem[]>;
  onApplyFrontmatterNormalization?: (
    items: FrontmatterNormalizationItem[],
  ) => Promise<{ applied: number; skipped: number; errors: string[] }>;
  onClose: () => void;
  onRevealUniverse?: () => void;
  onOpenUniverseNote?: () => void;
  revealUniverseLabel?: string;
  initialSection?: SettingsSection;
  initialPropertiesMode?: "template" | "blank";
  suiteSettings?: {
    primaryFont: string;
    onPrimaryFontChange: (font: string) => void;
    style: string;
    onStyleChange: (style: string) => void;
  };
};

function createStarterPropertiesConfig(mode: "template" | "blank" = "template") {
  const baseConfig = createDefaultTaxonomyConfig();
  return mode === "blank" ? baseConfig : applyPropertyTemplate(baseConfig, WORLDBUILDING_TEMPLATE);
}

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

function duplicateShortcut(
  shortcut: string,
  commandId: EditorCommandId,
  keybindings: Keybinding[],
) {
  if (!shortcut) return undefined;
  const duplicate = keybindings.find(
    (binding) => binding.shortcut === shortcut && binding.commandId !== commandId,
  );
  return duplicate
    ? EDITOR_COMMANDS.find((command) => command.id === duplicate.commandId)?.label
    : undefined;
}

function dockTabScaleFromInput(value: string) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return 1.25;
  return Math.min(1.75, Math.max(0.75, nextValue));
}

function UniverseIconPreview({ profile }: { profile: UniverseProfile }) {
  const icon = profile.icon;
  if (icon?.type === "image" && icon.value) {
    return (
      <span className="universe-icon-frame large">
        <img src={icon.value} alt="" />
      </span>
    );
  }
  const preset = icon?.value ?? "book";
  const Icon =
    preset === "globe"
      ? Globe2
      : preset === "castle"
        ? Castle
        : preset === "sparkles"
          ? Sparkles
          : BookOpen;
  return (
    <span className="universe-icon-frame large">
      <Icon size={28} />
    </span>
  );
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

type SettingsSection =
  | "suite"
  | "overview"
  | "tags"
  | "utils"
  | "editor"
  | "shortcuts"
  | "tabs"
  | "explorer"
  | "plugins";

const primaryFontOptions = [
  ["sans", "Sans serif"],
  ["serif", "Serif editorial"],
  ["humanist", "Humanist"],
] as const;

export function SettingsModal({
  settings,
  universe,
  onChange,
  onSaveUniverseProfile,
  onSavePropertiesConfig,
  onInitializePropertiesWorkspace,
  onScanFrontmatterNormalization,
  onApplyFrontmatterNormalization,
  onClose,
  onRevealUniverse,
  onOpenUniverseNote,
  revealUniverseLabel = "Reveal universe folder",
  initialSection,
  initialPropertiesMode = "template",
  suiteSettings,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    initialSection ?? (universe ? "overview" : "editor"),
  );
  const [conflictMessage, setConflictMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState<UniverseProfile>(() => ({
    name: universe?.profile?.name ?? universe?.name,
    icon: universe?.profile?.icon ?? { type: "preset", value: "book" },
  }));
  const [profileSaving, setProfileSaving] = useState(false);
  const [propertiesDraft, setPropertiesDraft] = useState<PropertiesConfig>(
    () => universe?.propertiesConfig ?? createStarterPropertiesConfig(initialPropertiesMode),
  );
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [normalizationItems, setNormalizationItems] = useState<FrontmatterNormalizationItem[]>([]);
  const [selectedNormalizationPaths, setSelectedNormalizationPaths] = useState<Set<string>>(
    new Set(),
  );
  const [normalizationBusy, setNormalizationBusy] = useState(false);
  const [normalizationErrors, setNormalizationErrors] = useState<string[]>([]);
  const [pluginQuery, setPluginQuery] = useState("");

  useEffect(() => {
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!universe) return;
    setProfileDraft({
      name: universe.profile?.name ?? universe.name,
      icon: universe.profile?.icon ?? { type: "preset", value: "book" },
    });
    setPropertiesDraft(
      universe.propertiesConfig ?? createStarterPropertiesConfig(initialPropertiesMode),
    );
  }, [
    initialPropertiesMode,
    universe?.name,
    universe?.rootPath,
    universe?.profile?.name,
    universe?.profile?.icon?.type,
    universe?.profile?.icon?.value,
    universe?.propertiesConfig,
  ]);

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

  function updateEditorWithPluginMirror(next: Partial<EditorSettings>) {
    const pluginEnabled = { ...settings.plugins.enabled };
    if (typeof next.hideMarkdownSyntaxInWrite === "boolean") {
      pluginEnabled["markdown-syntax-hiding"] = next.hideMarkdownSyntaxInWrite;
    }
    if (typeof next.documentHeaderEnabled === "boolean") {
      pluginEnabled["document-header"] = next.documentHeaderEnabled;
    }
    onChange({
      ...settings,
      editor: { ...settings.editor, ...next },
      plugins: { enabled: pluginEnabled },
    });
  }

  async function scanNormalizationItems() {
    if (!onScanFrontmatterNormalization) return;
    setNormalizationBusy(true);
    setNormalizationErrors([]);
    try {
      const items = await onScanFrontmatterNormalization();
      setNormalizationItems(items);
      setSelectedNormalizationPaths(new Set(items.map((item) => item.path)));
    } catch (error) {
      setNormalizationErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setNormalizationBusy(false);
    }
  }

  async function applyNormalizationItems(items: FrontmatterNormalizationItem[]) {
    if (!onApplyFrontmatterNormalization || items.length === 0) return;
    setNormalizationBusy(true);
    setNormalizationErrors([]);
    try {
      const result = await onApplyFrontmatterNormalization(items);
      setNormalizationErrors(result.errors);
      const appliedPaths = new Set(items.map((item) => item.path));
      setNormalizationItems((current) => current.filter((item) => !appliedPaths.has(item.path)));
      setSelectedNormalizationPaths(new Set());
    } catch (error) {
      setNormalizationErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setNormalizationBusy(false);
    }
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
            {suiteSettings ? (
              <div className="settings-nav-group">
                <p>Forge</p>
                <button
                  className={activeSection === "suite" ? "active" : ""}
                  onClick={() => setActiveSection("suite")}
                  type="button"
                >
                  <Settings size={14} />
                  Suite
                </button>
              </div>
            ) : null}
            {universe ? (
              <div className="settings-nav-group">
                <p>Universe</p>
                <button
                  className={activeSection === "overview" ? "active" : ""}
                  onClick={() => setActiveSection("overview")}
                  type="button"
                >
                  <Settings size={14} />
                  Overview
                </button>
                <button
                  className={activeSection === "tags" ? "active" : ""}
                  onClick={() => setActiveSection("tags")}
                  type="button"
                >
                  <Hash size={14} />
                  Tags
                </button>
                <button
                  className={activeSection === "utils" ? "active" : ""}
                  onClick={() => setActiveSection("utils")}
                  type="button"
                >
                  <Wrench size={14} />
                  Utils
                </button>
              </div>
            ) : null}

            <div className="settings-nav-group app-settings-group">
              <p>Application</p>
              <button
                className={activeSection === "editor" ? "active" : ""}
                onClick={() => setActiveSection("editor")}
                type="button"
              >
                <TextCursorInput size={14} />
                Editor
              </button>
              <button
                className={activeSection === "shortcuts" ? "active" : ""}
                onClick={() => setActiveSection("shortcuts")}
                type="button"
              >
                <Keyboard size={14} />
                Shortcuts
              </button>
              <button
                className={activeSection === "tabs" ? "active" : ""}
                onClick={() => setActiveSection("tabs")}
                type="button"
              >
                <PanelLeft size={14} />
                Tabs
              </button>
              <button
                className={activeSection === "explorer" ? "active" : ""}
                onClick={() => setActiveSection("explorer")}
                type="button"
              >
                <Folder size={14} />
                Explorer
              </button>
              <button
                className={activeSection === "plugins" ? "active" : ""}
                onClick={() => setActiveSection("plugins")}
                type="button"
              >
                <Plug size={14} />
                Plugins
              </button>
            </div>
          </nav>

          <section className="settings-section">
            {activeSection === "suite" && suiteSettings ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Everend Forge Suite</h3>
                  <p>Shared preferences applied to every app in this Suite.</p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Style</span>
                    <select
                      value={suiteSettings.style}
                      onChange={(event) => suiteSettings.onStyleChange(event.target.value)}
                    >
                      {THEMES.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Primary typeface</span>
                    <select
                      value={suiteSettings.primaryFont}
                      onChange={(event) => suiteSettings.onPrimaryFontChange(event.target.value)}
                    >
                      {primaryFontOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}
            {activeSection === "overview" && universe ? (
              <div className="settings-panel">
                <div className="universe-profile-editor">
                  <UniverseIconPreview profile={profileDraft} />
                  <div className="universe-profile-fields">
                    <label>
                      <span>Universe name</span>
                      <input
                        value={profileDraft.name ?? ""}
                        onChange={(event) =>
                          setProfileDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder={universe.name}
                      />
                    </label>
                    <div className="icon-preset-row">
                      {[
                        ["book", BookOpen],
                        ["globe", Globe2],
                        ["castle", Castle],
                        ["sparkles", Sparkles],
                      ].map(([value, Icon]) => (
                        <button
                          key={value as string}
                          type="button"
                          className={
                            profileDraft.icon?.type === "preset" &&
                            profileDraft.icon.value === value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            setProfileDraft((current) => ({
                              ...current,
                              icon: { type: "preset", value: value as string },
                            }))
                          }
                          title={`Use ${value} icon`}
                        >
                          <Icon size={16} />
                        </button>
                      ))}
                      <label className="image-upload-button" title="Use PNG or JPG">
                        <Upload size={16} />
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            const value = await readImageFile(file);
                            setProfileDraft((current) => ({
                              ...current,
                              icon: { type: "image", value },
                            }));
                          }}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!onSaveUniverseProfile) return;
                        setProfileSaving(true);
                        try {
                          await onSaveUniverseProfile(profileDraft);
                        } finally {
                          setProfileSaving(false);
                        }
                      }}
                      disabled={profileSaving}
                    >
                      Save customization
                    </button>
                  </div>
                </div>

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
                    <strong>{universe.propertiesConfig ? "On" : "Off"}</strong>
                    <span>Properties</span>
                  </div>
                </div>

                {!universe.propertiesConfig ? (
                  <div className="universe-onboarding-card">
                    <div>
                      <h3>Personalize this universe</h3>
                      <p>
                        WorldNotion can create `.everend/universe.json` and
                        `.everend/properties.json` to start organizing this space with editable
                        properties. Your Markdown files stay untouched.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!onInitializePropertiesWorkspace) return;
                        setPropertiesSaving(true);
                        try {
                          await onInitializePropertiesWorkspace(propertiesDraft);
                        } finally {
                          setPropertiesSaving(false);
                        }
                      }}
                      disabled={propertiesSaving}
                    >
                      {propertiesSaving ? "Creating..." : "Create properties setup"}
                    </button>
                  </div>
                ) : null}

                <div className="settings-action-list">
                  <button type="button" onClick={onOpenUniverseNote}>
                    <FileText size={15} />
                    Open universe note
                  </button>
                  <button type="button" onClick={onRevealUniverse}>
                    <ExternalLink size={15} />
                    {revealUniverseLabel}
                  </button>
                </div>
              </div>
            ) : null}

            {activeSection === "editor" ? (
              <>
                <div className="settings-grid">
                  <label>
                    <span>Active style</span>
                    <input value={themeById(settings.theme).label} readOnly />
                  </label>
                  <label>
                    <span>Page style</span>
                    <select
                      value={settings.editor.pageStyle}
                      onChange={(event) =>
                        updateEditor({
                          pageStyle: event.target.value as EditorSettings["pageStyle"],
                        })
                      }
                    >
                      <option value="theme">Theme</option>
                      <option value="white">White page</option>
                      <option value="warm-paper">Warm paper</option>
                      <option value="system">System surface</option>
                      <option value="custom">Custom color</option>
                    </select>
                  </label>
                  <label>
                    <span>Custom page color</span>
                    <input
                      type="color"
                      value={settings.editor.customPageColor}
                      onChange={(event) => updateEditor({ customPageColor: event.target.value })}
                      disabled={settings.editor.pageStyle !== "custom"}
                    />
                  </label>
                  <label>
                    <span>Paper shadow (Write mode)</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.showPaperShadow}
                      onChange={(event) => updateEditor({ showPaperShadow: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Line numbers</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.lineNumbers}
                      onChange={(event) => updateEditor({ lineNumbers: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Line wrap</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.lineWrap}
                      onChange={(event) => updateEditor({ lineWrap: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Active line</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.activeLine}
                      onChange={(event) => updateEditor({ activeLine: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Hide Markdown syntax in Write</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.hideMarkdownSyntaxInWrite}
                      onChange={(event) =>
                        updateEditorWithPluginMirror({
                          hideMarkdownSyntaxInWrite: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Font size</span>
                    <input
                      type="number"
                      min={11}
                      max={22}
                      value={settings.editor.fontSize}
                      onChange={(event) => updateEditor({ fontSize: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Write font</span>
                    <input
                      value={settings.editor.writeFontFamily}
                      onChange={(event) => updateEditor({ writeFontFamily: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Source font</span>
                    <input
                      value={settings.editor.sourceFontFamily}
                      onChange={(event) => updateEditor({ sourceFontFamily: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Tab size</span>
                    <input
                      type="number"
                      min={2}
                      max={8}
                      value={settings.editor.tabSize}
                      onChange={(event) => updateEditor({ tabSize: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Default mode</span>
                    <select
                      value={settings.editor.defaultMode}
                      onChange={(event) =>
                        updateEditor({
                          defaultMode: event.target.value as EditorSettings["defaultMode"],
                        })
                      }
                    >
                      <option value="write">Write</option>
                      <option value="source">Source</option>
                    </select>
                  </label>
                </div>

                <h3
                  style={{
                    gridColumn: "1 / -1",
                    fontSize: "13px",
                    fontWeight: 600,
                    margin: "16px 0 8px 0",
                    color: "var(--wn-muted)",
                  }}
                >
                  Navigation
                </h3>
                <div className="settings-grid">
                  <label>
                    <span>Command Palette (Cmd+P)</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.commandPaletteEnabled}
                      onChange={(event) =>
                        updateEditor({ commandPaletteEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>Quick Switcher (Cmd+Alt+O)</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.quickSwitcherEnabled}
                      onChange={(event) =>
                        updateEditor({ quickSwitcherEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>Find & Replace (Cmd+F)</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.searchPanelEnabled}
                      onChange={(event) =>
                        updateEditor({ searchPanelEnabled: event.target.checked })
                      }
                    />
                  </label>
                </div>

                <h3
                  style={{
                    gridColumn: "1 / -1",
                    fontSize: "13px",
                    fontWeight: 600,
                    margin: "16px 0 8px 0",
                    color: "var(--wn-muted)",
                  }}
                >
                  Visualization
                </h3>
                <div className="settings-grid">
                  <label>
                    <span>Outline Guide (Cmd+Shift+O)</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.outlineGuideEnabled}
                      onChange={(event) =>
                        updateEditor({ outlineGuideEnabled: event.target.checked })
                      }
                    />
                  </label>
                  {settings.editor.outlineGuideEnabled && (
                    <label>
                      <span>Outline Position</span>
                      <select
                        value={settings.editor.outlinePosition}
                        onChange={(event) =>
                          updateEditor({ outlinePosition: event.target.value as "left" | "right" })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  )}
                  <label>
                    <span>Breadcrumbs</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.breadcrumbsEnabled}
                      onChange={(event) =>
                        updateEditor({ breadcrumbsEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>Code Folding</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.codeFoldingEnabled}
                      onChange={(event) =>
                        updateEditor({ codeFoldingEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>Floating Toolbar</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.floatingToolbarEnabled}
                      onChange={(event) =>
                        updateEditor({ floatingToolbarEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>Document Header</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.documentHeaderEnabled}
                      onChange={(event) =>
                        updateEditorWithPluginMirror({
                          documentHeaderEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Show Project Name in Header</span>
                    <input
                      type="checkbox"
                      disabled={!settings.editor.documentHeaderEnabled}
                      checked={settings.editor.showProjectNameInHeader}
                      onChange={(event) =>
                        updateEditor({ showProjectNameInHeader: event.target.checked })
                      }
                    />
                  </label>
                </div>
              </>
            ) : null}

            {activeSection === "shortcuts" ? (
              <div>
                <div className="settings-inline">
                  <p className="muted">Focus a shortcut field and press the desired keys.</p>
                  <button
                    type="button"
                    onClick={() => onChange({ ...settings, keybindings: DEFAULT_KEYBINDINGS })}
                  >
                    Reset defaults
                  </button>
                </div>
                {conflictMessage ? (
                  <div className="error-banner settings-error">{conflictMessage}</div>
                ) : null}
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
                  <span>Dock tab size</span>
                  <input
                    type="range"
                    min={0.75}
                    max={1.75}
                    step={0.05}
                    value={settings.editor.dockTabScale}
                    onChange={(event) =>
                      updateEditor({ dockTabScale: dockTabScaleFromInput(event.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Dock tab scale</span>
                  <input
                    type="number"
                    min={75}
                    max={175}
                    step={5}
                    value={Math.round(settings.editor.dockTabScale * 100)}
                    onChange={(event) =>
                      updateEditor({
                        dockTabScale: dockTabScaleFromInput(
                          String(Number(event.target.value) / 100),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Persist tabs</span>
                  <input
                    type="checkbox"
                    checked={settings.editor.persistTabs}
                    onChange={(event) => updateEditor({ persistTabs: event.target.checked })}
                  />
                </label>
                <label>
                  <span>Reuse open tabs</span>
                  <input
                    type="checkbox"
                    checked={settings.editor.reuseOpenTabs}
                    onChange={(event) => updateEditor({ reuseOpenTabs: event.target.checked })}
                  />
                </label>
                <label>
                  <span>Confirm dirty close</span>
                  <input
                    type="checkbox"
                    checked={settings.editor.confirmCloseDirtyTab}
                    onChange={(event) =>
                      updateEditor({ confirmCloseDirtyTab: event.target.checked })
                    }
                  />
                </label>
              </div>
            ) : null}

            {activeSection === "tags" && universe ? (
              <div className="settings-panel">
                <PropertiesManager config={propertiesDraft} onChange={setPropertiesDraft} />
                <div className="settings-actions">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!onSavePropertiesConfig) return;
                      setPropertiesSaving(true);
                      try {
                        await onSavePropertiesConfig(propertiesDraft);
                      } finally {
                        setPropertiesSaving(false);
                      }
                    }}
                    disabled={propertiesSaving}
                  >
                    {propertiesSaving ? "Saving..." : "Save properties"}
                  </button>
                </div>
              </div>
            ) : null}

            {activeSection === "utils" && universe ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Frontmatter utilities</h3>
                  <p>
                    Add WorldNotion frontmatter to Markdown files that do not have valid metadata
                    yet.
                  </p>
                </div>
                <div className="universe-onboarding-card">
                  <div>
                    <h3>Normalize notes</h3>
                    <p>
                      Scans this universe, detects normal notes and folder notes, previews the
                      changes, then writes only the files you choose.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={scanNormalizationItems}
                    disabled={normalizationBusy}
                  >
                    {normalizationBusy ? "Scanning..." : "Scan notes"}
                  </button>
                </div>

                {normalizationItems.length > 0 ? (
                  <>
                    <div className="normalization-actions">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedNormalizationPaths(
                            new Set(normalizationItems.map((item) => item.path)),
                          )
                        }
                        disabled={normalizationBusy}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedNormalizationPaths(new Set())}
                        disabled={normalizationBusy}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyNormalizationItems(
                            normalizationItems.filter((item) =>
                              selectedNormalizationPaths.has(item.path),
                            ),
                          )
                        }
                        disabled={normalizationBusy || selectedNormalizationPaths.size === 0}
                      >
                        Apply selected
                      </button>
                      <button
                        type="button"
                        onClick={() => applyNormalizationItems(normalizationItems)}
                        disabled={normalizationBusy}
                      >
                        Apply all
                      </button>
                    </div>
                    <div className="normalization-preview">
                      {normalizationItems.map((item) => (
                        <label key={item.path} className="normalization-row">
                          <input
                            type="checkbox"
                            checked={selectedNormalizationPaths.has(item.path)}
                            onChange={(event) =>
                              setSelectedNormalizationPaths((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(item.path);
                                else next.delete(item.path);
                                return next;
                              })
                            }
                          />
                          <span className="normalization-row-main">
                            <strong>{item.path}</strong>
                            <small>{item.reason.replace(/_/g, " ")}</small>
                          </span>
                          <span className={`normalization-kind ${item.kind}`}>{item.kind}</span>
                          <span className="normalization-meta">
                            <code>{item.type}</code>
                            {item.folder ? <code>folder: {item.folder}</code> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">Run a scan to preview files that need frontmatter.</p>
                )}

                {normalizationErrors.length > 0 ? (
                  <div className="settings-error-list">
                    {normalizationErrors.map((error, index) => (
                      <p key={`${error}-${index}`}>{error}</p>
                    ))}
                  </div>
                ) : null}
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
                <label>
                  <span>Ignore folder note metadata</span>
                  <input
                    type="checkbox"
                    checked={settings.explorer.ignoreFolderNoteMetadata}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        explorer: {
                          ...settings.explorer,
                          ignoreFolderNoteMetadata: event.target.checked,
                        },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {activeSection === "plugins" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Plugins</h3>
                  <p>
                    Manage WorldNotion editor plugins and preview planned Everend runtime adapters.
                  </p>
                </div>
                <label className="plugin-search">
                  <span>Filter plugins</span>
                  <input
                    value={pluginQuery}
                    onChange={(event) => setPluginQuery(event.target.value)}
                    placeholder="Search plugins"
                  />
                </label>
                <div className="plugin-manager-list">
                  {(["navigation", "editor", "visual", "runtime-adapter"] as PluginCategory[]).map(
                    (category) => {
                      const normalizedQuery = pluginQuery.trim().toLowerCase();
                      const plugins = getPluginDefinitions().filter((plugin) => {
                        const matchesCategory = plugin.category === category;
                        const matchesQuery =
                          !normalizedQuery ||
                          plugin.name.toLowerCase().includes(normalizedQuery) ||
                          plugin.description.toLowerCase().includes(normalizedQuery);
                        return matchesCategory && matchesQuery;
                      });
                      if (!plugins.length) return null;
                      return (
                        <section key={category} className="plugin-category">
                          <h4>{pluginCategoryLabel(category)}</h4>
                          {plugins.map((plugin) => {
                            const enabled = isPluginEnabled(
                              settings.plugins,
                              plugin.id,
                              legacyPluginEnabled(settings.editor, plugin.id),
                            );
                            const badge =
                              plugin.status === "planned"
                                ? "Planned"
                                : plugin.status === "core"
                                  ? "Core"
                                  : "Optional";
                            return (
                              <article key={plugin.id} className={`plugin-card ${plugin.status}`}>
                                <div className="plugin-card-main">
                                  <div className="plugin-card-title">
                                    <strong>{plugin.name}</strong>
                                    <span className={`plugin-badge ${plugin.status}`}>{badge}</span>
                                    <span
                                      className={`plugin-badge ${enabled ? "enabled" : "disabled"}`}
                                    >
                                      {enabled ? "Enabled" : "Disabled"}
                                    </span>
                                  </div>
                                  <p>{plugin.description}</p>
                                  {plugin.status === "planned" ? (
                                    <small>
                                      Documentation only for now. Engine adapters are not installed
                                      or executed in v1.
                                    </small>
                                  ) : plugin.status === "core" ? (
                                    <small>
                                      Core plugin. Protected to keep editing and navigation behavior
                                      stable.
                                    </small>
                                  ) : null}
                                </div>
                                <label className="plugin-toggle">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    disabled={!plugin.configurable || plugin.status === "planned"}
                                    onChange={(event) =>
                                      onChange(
                                        updatePluginEnabled(
                                          settings,
                                          plugin.id,
                                          event.target.checked,
                                        ),
                                      )
                                    }
                                  />
                                  <span>{plugin.configurable ? "Active" : "Locked"}</span>
                                </label>
                              </article>
                            );
                          })}
                        </section>
                      );
                    },
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
