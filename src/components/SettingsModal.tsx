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
  KeyRound,
  PanelLeft,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  TextCursorInput,
  Trash2,
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
  AiAdvisorSettings,
  Keybinding,
  PluginCategory,
  PropertiesConfig,
} from "../editorTypes";
import type { UniverseProfile } from "../domain";
import { createDefaultTaxonomyConfig } from "../domain";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "../utils/propertyTemplates";
import type { FrontmatterNormalizationItem } from "../utils/frontmatterNormalizer";
import type { PropertyNormalizationItem } from "../utils/propertyNormalizer";
import type { PropertyStructureMigrationPlan } from "../utils/propertyStructureMigration";
import { THEMES, themeById } from "../themes";
import { normalizeAiProviderUrl } from "../utils/aiProviders";
import { PropertiesManager } from "./TaxonomyManager";
import type { SuiteSettings } from "../suiteChrome";
import {
  getPluginDefinitions,
  isPluginEnabled,
  legacyPluginEnabled,
  pluginCategoryLabel,
  updatePluginEnabled,
} from "../utils/pluginRegistry";
import {
  customLocaleId,
  localeDisplayName,
  localeOptions,
  normalizeLocaleList,
  normalizeLocaleNames,
} from "../utils/localization";
import "../App.css";
import { interfaceLocaleCopy, resolveInterfaceLocale, worldnotionSettingsCopy } from "../i18n";


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
  onScanPropertyNormalization?: () =>
    PropertyNormalizationItem[] | Promise<PropertyNormalizationItem[]>;
  onApplyPropertyNormalization?: (
    items: PropertyNormalizationItem[],
  ) => Promise<{ applied: number; skipped: number; errors: string[] }>;
  onScanPropertyStructureMigration?: () =>
    | PropertyStructureMigrationPlan
    | undefined
    | Promise<PropertyStructureMigrationPlan | undefined>;
  onApplyPropertyStructureMigration?: (
    plan: PropertyStructureMigrationPlan,
  ) => Promise<{ applied: number; skipped: number; errors: string[] }>;
  onClose: () => void;
  onRevealUniverse?: () => void;
  onOpenUniverseNote?: () => void;
  onResetOnboarding?: () => void;
  revealUniverseLabel?: string;
  initialSection?: SettingsSection;
  initialPropertiesMode?: "template" | "blank";
  suiteSettings?: SuiteSettings;
};

function createStarterPropertiesConfig(mode: "template" | "blank" = "template") {
  const baseConfig = createDefaultTaxonomyConfig();
  return mode === "blank" ? baseConfig : applyPropertyTemplate(baseConfig, WORLDBUILDING_TEMPLATE);
}

function UniverseLanguageSettings({
  value,
  onChange,
}: {
  value?: NonNullable<UniverseProfile["localization"]>;
  onChange: (value: NonNullable<UniverseProfile["localization"]>) => void;
}) {
  const [inventedLanguage, setInventedLanguage] = useState("");
  const localization = value ?? { primaryLocale: "en", locales: ["en"] };
  const locales = normalizeLocaleList(localization.primaryLocale, localization.locales);
  const localeNames = normalizeLocaleNames(localization.localeNames, locales);
  const options = useMemo(() => localeOptions(locales, localeNames), [localeNames, locales]);
  const update = (nextPrimary: string, nextLocales: string[], nextNames = localeNames) => {
    const normalizedLocales = normalizeLocaleList(nextPrimary, nextLocales);
    onChange({
      primaryLocale: normalizedLocales[0],
      locales: normalizedLocales,
      localeNames: normalizeLocaleNames(nextNames, normalizedLocales),
    });
  };

  return (
    <div className="locale-settings-fields">
      <label>
        <span>Primary language</span>
        <select
          value={locales[0]}
          onChange={(event) =>
            update(event.target.value, [
              event.target.value,
              ...locales.filter((locale) => locale !== event.target.value),
            ])
          }
        >
          {options.map((locale) => (
            <option key={locale} value={locale}>
              {localeDisplayName(locale, localeNames)}
            </option>
          ))}
        </select>
      </label>
      <div className="locale-settings-list">
        <span>Additional languages</span>
        {locales.slice(1).length ? (
          <ul>
            {locales.slice(1).map((locale) => (
              <li key={locale}>
                <span>{localeDisplayName(locale, localeNames)}</span>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      locales[0],
                      locales.filter((candidate) => candidate !== locale),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>None yet.</p>
        )}
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) update(locales[0], [...locales, event.target.value]);
          }}
        >
          <option value="">Add a real language…</option>
          {options
            .filter((locale) => !locales.includes(locale))
            .map((locale) => (
              <option key={locale} value={locale}>
                {localeDisplayName(locale, localeNames)}
              </option>
            ))}
        </select>
      </div>
      <div className="locale-invented-language">
        <label>
          <span>Invented language</span>
          <input
            value={inventedLanguage}
            placeholder="e.g. Eldarin"
            onChange={(event) => setInventedLanguage(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!inventedLanguage.trim()}
          onClick={() => {
            const name = inventedLanguage.trim();
            const locale = customLocaleId(name, locales);
            update(locales[0], [...locales, locale], { ...localeNames, [locale]: name });
            setInventedLanguage("");
          }}
        >
          Add invented language
        </button>
      </div>
    </div>
  );
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





function SuiteLicenseSettings({ license }: { license: SuiteSettings["license"] }) {
  const [keyDraft, setKeyDraft] = useState("");
  const isActive = license.status === "active";
  const isBusy = license.status === "activating";
  const maskedKey = license.licenseKey
    ? `${license.licenseKey.slice(0, 4)}••••${license.licenseKey.slice(-4)}`
    : "—";

  useEffect(() => {
    if (isActive && license.instances === undefined && license.devicesStatus === "idle") {
      license.onLoadDevices();
    }
  }, [isActive, license.devicesStatus, license.instances, license.onLoadDevices]);

  return (
    <div className="settings-panel forge-license-settings">
      <div className="settings-page-title">
        <h3>Licencia</h3>
        <p>Activa y administra la licencia de Everend Forge Suite en este equipo.</p>
      </div>

      {isActive ? (
        <>
          <div className="forge-license-status active" role="status">
            <KeyRound size={18} />
            <div>
              <strong>Licencia activa</strong>
              <p>La Suite está habilitada en este equipo.</p>
            </div>
          </div>
          <div className="forge-license-details">
            <div>
              <span>Clave</span>
              <code>{maskedKey}</code>
            </div>
            <div>
              <span>Equipo</span>
              <strong>{license.instanceName ?? "—"}</strong>
            </div>
            {license.activationUsage !== undefined || license.activationLimit !== undefined ? (
              <div>
                <span>Activaciones</span>
                <strong>
                  {license.activationUsage ?? 0} / {license.activationLimit ?? "—"}
                </strong>
              </div>
            ) : null}
          </div>
          <div className="settings-actions">
            <button type="button" onClick={license.onValidate} disabled={isBusy}>
              {isBusy ? "Verificando..." : "Validar licencia"}
            </button>
            <button type="button" onClick={license.onDeactivate} disabled={isBusy}>
              Desactivar en este equipo
            </button>
          </div>
          <section className="forge-license-devices" aria-labelledby="forge-license-devices-title">
            <div className="forge-license-devices-heading">
              <div>
                <h4 id="forge-license-devices-title">Dispositivos</h4>
                <p>Consulta y desactiva las activaciones de esta licencia.</p>
              </div>
              <button type="button" onClick={license.onLoadDevices} disabled={isBusy || license.devicesStatus === "loading"}>
                {license.devicesStatus === "loading"
                  ? "Cargando..."
                  : license.instances
                    ? "Actualizar"
                    : "Ver dispositivos"}
              </button>
            </div>
            {license.devicesError ? <p className="forge-license-error" role="alert">{license.devicesError}</p> : null}
            {license.instances ? (
              license.instances.length ? (
                <ul className="forge-license-device-list">
                  {license.instances.map((instance) => {
                    const isCurrentDevice = instance.id === license.currentInstanceId;
                    return (
                      <li key={instance.id}>
                        <div>
                          <strong>{instance.name}</strong>
                          <small>{isCurrentDevice ? "Este equipo" : "Otro equipo"}</small>
                        </div>
                        <button
                          type="button"
                          onClick={() => license.onDeactivateDevice(instance.id)}
                          disabled={isBusy || license.devicesStatus === "loading"}
                        >
                          {isCurrentDevice ? "Desactivar este equipo" : "Desactivar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="forge-license-devices-empty">No hay dispositivos activos para esta licencia.</p>
              )
            ) : null}
          </section>
        </>
      ) : (
        <>
          <div className={`forge-license-status ${license.status === "error" ? "error" : ""}`} role="status">
            <KeyRound size={18} />
            <div>
              <strong>{license.status === "error" ? "No se pudo verificar la licencia" : "Licencia no activada"}</strong>
              <p>Introduce una clave de Lemon Squeezy para habilitar la Suite.</p>
            </div>
          </div>
          <form
            className="forge-license-form"
            onSubmit={(event) => {
              event.preventDefault();
              license.onActivate(keyDraft);
            }}
          >
            <label>
              <span>Clave de licencia</span>
              <input
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="Pega aquí tu clave"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="settings-actions">
              <button type="submit" className="primary-action" disabled={!keyDraft.trim() || isBusy}>
                {isBusy ? "Verificando..." : "Activar licencia"}
              </button>
            </div>
          </form>
        </>
      )}

      {license.error ? <p className="forge-license-error" role="alert">{license.error}</p> : null}
      <small>La clave se guarda en el llavero seguro del sistema operativo.</small>
    </div>
  );
}


type SettingsSection =
  | "suite"
  | "update"
  | "license"
  | "overview"
  | "tags"
  | "utils"
  | "editor"
  | "shortcuts"
  | "tabs"
  | "explorer"
  | "plugins"
  | "ai-advisor"
  | "tutorials";

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
  onScanPropertyNormalization,
  onApplyPropertyNormalization,
  onScanPropertyStructureMigration,
  onApplyPropertyStructureMigration,
  onClose,
  onRevealUniverse,
  onOpenUniverseNote,
  onResetOnboarding,
  revealUniverseLabel = "Reveal universe folder",
  initialSection,
  initialPropertiesMode = "template",
  suiteSettings,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    initialSection ?? (universe ? "overview" : "editor"),
  );
  const interfaceCopy = interfaceLocaleCopy(
    resolveInterfaceLocale(suiteSettings?.localePreference ?? settings.localePreference ?? "system"),
  );
  const settingsText = worldnotionSettingsCopy(
    resolveInterfaceLocale(suiteSettings?.localePreference ?? settings.localePreference ?? "system"),
  );
  const [conflictMessage, setConflictMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState<UniverseProfile>(() => ({
    name: universe?.profile?.name ?? universe?.name,
    icon: universe?.profile?.icon ?? { type: "preset", value: "book" },
    localization: universe?.profile?.localization ?? {
      primaryLocale: navigator.languages?.[0] ?? navigator.language ?? "en",
      locales: [navigator.languages?.[0] ?? navigator.language ?? "en"],
    },
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
  const [propertyNormItems, setPropertyNormItems] = useState<PropertyNormalizationItem[]>([]);
  const [propertyNormScanned, setPropertyNormScanned] = useState(false);
  const [selectedPropertyNormPaths, setSelectedPropertyNormPaths] = useState<Set<string>>(
    new Set(),
  );
  const [propertyNormBusy, setPropertyNormBusy] = useState(false);
  const [propertyNormErrors, setPropertyNormErrors] = useState<string[]>([]);
  const [structureMigration, setStructureMigration] = useState<PropertyStructureMigrationPlan>();
  const [structureMigrationBusy, setStructureMigrationBusy] = useState(false);
  const [structureMigrationErrors, setStructureMigrationErrors] = useState<string[]>([]);
  const [pluginQuery, setPluginQuery] = useState("");
  const [newAiProviderName, setNewAiProviderName] = useState("");
  const [newAiProviderUrl, setNewAiProviderUrl] = useState("");
  const [aiProviderError, setAiProviderError] = useState("");

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
    if (typeof next.documentHeaderEnabled === "boolean") {
      pluginEnabled["document-header"] = next.documentHeaderEnabled;
    }
    onChange({
      ...settings,
      editor: { ...settings.editor, ...next },
      plugins: { enabled: pluginEnabled },
    });
  }

  function updateAiAdvisor(next: Partial<AiAdvisorSettings>) {
    onChange({ ...settings, aiAdvisor: { ...settings.aiAdvisor, ...next } });
  }

  function updateAiProvider(id: string, next: Partial<AiAdvisorSettings["providers"][number]>) {
    updateAiAdvisor({
      providers: settings.aiAdvisor.providers.map((provider) =>
        provider.id === id ? { ...provider, ...next } : provider,
      ),
    });
  }

  function addAiProvider() {
    const name = newAiProviderName.trim();
    const url = normalizeAiProviderUrl(newAiProviderUrl);
    if (!name || !url) {
      setAiProviderError("Enter a name and a valid http(s) URL.");
      return;
    }
    const id = `custom-${Date.now()}`;
    const providers = [...settings.aiAdvisor.providers, { id, name, url, enabled: true }];
    updateAiAdvisor({ providers, activeProviderId: settings.aiAdvisor.activeProviderId || id });
    setNewAiProviderName("");
    setNewAiProviderUrl("");
    setAiProviderError("");
  }

  function removeAiProvider(id: string) {
    const providers = settings.aiAdvisor.providers.filter((provider) => provider.id !== id);
    const activeProviderId =
      settings.aiAdvisor.activeProviderId === id
        ? (providers.find((provider) => provider.enabled)?.id ?? providers[0]?.id ?? "")
        : settings.aiAdvisor.activeProviderId;
    updateAiAdvisor({ providers, activeProviderId });
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

  async function scanPropertyNormItems() {
    if (!onScanPropertyNormalization) return;
    setPropertyNormBusy(true);
    setPropertyNormErrors([]);
    try {
      const items = await onScanPropertyNormalization();
      setPropertyNormItems(items);
      setSelectedPropertyNormPaths(new Set(items.map((item) => item.path)));
      setPropertyNormScanned(true);
    } catch (error) {
      setPropertyNormErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setPropertyNormBusy(false);
    }
  }

  async function applyPropertyNormItems(items: PropertyNormalizationItem[]) {
    if (!onApplyPropertyNormalization || items.length === 0) return;
    setPropertyNormBusy(true);
    setPropertyNormErrors([]);
    try {
      const result = await onApplyPropertyNormalization(items);
      setPropertyNormErrors(result.errors);
      const appliedPaths = new Set(items.map((item) => item.path));
      setPropertyNormItems((current) => current.filter((item) => !appliedPaths.has(item.path)));
      setSelectedPropertyNormPaths(new Set());
    } catch (error) {
      setPropertyNormErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setPropertyNormBusy(false);
    }
  }

  async function scanStructureMigration() {
    if (!onScanPropertyStructureMigration) return;
    setStructureMigrationBusy(true);
    setStructureMigrationErrors([]);
    try {
      setStructureMigration(await onScanPropertyStructureMigration());
    } catch (error) {
      setStructureMigrationErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setStructureMigrationBusy(false);
    }
  }

  async function applyStructureMigration() {
    if (!onApplyPropertyStructureMigration || !structureMigration) return;
    setStructureMigrationBusy(true);
    setStructureMigrationErrors([]);
    try {
      const result = await onApplyPropertyStructureMigration(structureMigration);
      setStructureMigrationErrors(result.errors);
      if (!result.errors.length) setStructureMigration(undefined);
    } catch (error) {
      setStructureMigrationErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setStructureMigrationBusy(false);
    }
  }

  function propertyNormSummary(item: PropertyNormalizationItem) {
    const parts: string[] = [];
    if (item.addedFields.length) {
      parts.push(
        `adds ${item.addedFields.length} field${item.addedFields.length === 1 ? "" : "s"}: ${item.addedFields.join(", ")}`,
      );
    }
    if (item.reordered) parts.push("reorders keys");
    return parts.join(" · ");
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
                <p>{settingsText.forge}</p>
                <button
                  className={activeSection === "suite" ? "active" : ""}
                  onClick={() => setActiveSection("suite")}
                  type="button"
                >
                  <Settings size={14} />
                  {settingsText.suite}
                </button>
                <button
                  className={activeSection === "update" ? "active" : ""}
                  onClick={() => setActiveSection("update")}
                  type="button"
                >
                  <RefreshCw size={14} />
                  {settingsText.update}
                </button>
                <button
                  className={activeSection === "license" ? "active" : ""}
                  onClick={() => setActiveSection("license")}
                  type="button"
                >
                  <KeyRound size={14} />
                  Licencia
                </button>
              </div>
            ) : null}
            {universe ? (
              <div className="settings-nav-group">
              <p>{settingsText.universe}</p>
                <button
                  className={activeSection === "overview" ? "active" : ""}
                  onClick={() => setActiveSection("overview")}
                  type="button"
                >
                  <Settings size={14} />
                  {settingsText.overview}
                </button>
                <button
                  className={activeSection === "tags" ? "active" : ""}
                  onClick={() => setActiveSection("tags")}
                  type="button"
                >
                  <Hash size={14} />
                  {settingsText.tags}
                </button>
                <button
                  className={activeSection === "utils" ? "active" : ""}
                  onClick={() => setActiveSection("utils")}
                  type="button"
                >
                  <Wrench size={14} />
                  {settingsText.utils}
                </button>
              </div>
            ) : null}

            <div className="settings-nav-group app-settings-group">
              <p>{settingsText.application}</p>
              <button
                className={activeSection === "editor" ? "active" : ""}
                onClick={() => setActiveSection("editor")}
                type="button"
              >
                <TextCursorInput size={14} />
                {settingsText.editor}
              </button>
              <button
                className={activeSection === "shortcuts" ? "active" : ""}
                onClick={() => setActiveSection("shortcuts")}
                type="button"
              >
                <Keyboard size={14} />
                {settingsText.shortcuts}
              </button>
              <button
                className={activeSection === "tabs" ? "active" : ""}
                onClick={() => setActiveSection("tabs")}
                type="button"
              >
                <PanelLeft size={14} />
                {settingsText.tabs}
              </button>
              <button
                className={activeSection === "explorer" ? "active" : ""}
                onClick={() => setActiveSection("explorer")}
                type="button"
              >
                <Folder size={14} />
                {settingsText.explorer}
              </button>
              <button
                className={activeSection === "plugins" ? "active" : ""}
                onClick={() => setActiveSection("plugins")}
                type="button"
              >
                <Plug size={14} />
                {settingsText.plugins}
              </button>
              <button
                className={activeSection === "ai-advisor" ? "active" : ""}
                onClick={() => setActiveSection("ai-advisor")}
                type="button"
              >
                <Sparkles size={14} />
                {settingsText.advisor}
              </button>
              <button
                className={activeSection === "tutorials" ? "active" : ""}
                onClick={() => setActiveSection("tutorials")}
                type="button"
              >
                <RefreshCw size={14} />
                {settingsText.tutorials}
              </button>
            </div>
          </nav>

          <section className="settings-section">
            {activeSection === "suite" && suiteSettings ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>{settingsText.suiteTitle}</h3>
                  <p>{settingsText.suiteDescription}</p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>{interfaceCopy.interfaceLanguage}</span>
                    <select
                      value={suiteSettings.localePreference}
                      onChange={(event) => suiteSettings.onLocalePreferenceChange(event.target.value as "system" | "en" | "es")}
                    >
                      <option value="system">{interfaceCopy.system}</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </label>
                  <label>
                    <span>{settingsText.style}</span>
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
                    <span>{settingsText.typeface}</span>
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
            {activeSection === "update" && suiteSettings?.update ? (
              <div className="settings-panel forge-update-panel">
                <div className="settings-page-title">
                  <h3>{settingsText.updateTitle}</h3>
                  <p>{settingsText.updateDescription}</p>
                </div>

                <div className="forge-update-details">
                  <div>
                    <span>{settingsText.installedVersion}</span>
                    <strong>{suiteSettings.update.currentVersion}</strong>
                  </div>
                  <div>
                    <span>{settingsText.platform}</span>
                    <strong>{suiteSettings.update.platform}</strong>
                  </div>
                  <div>
                    <span>{settingsText.applicationId}</span>
                    <code>{suiteSettings.update.identifier}</code>
                  </div>
                  <div>
                    <span>{settingsText.channel}</span>
                    <strong>{settingsText.releases}</strong>
                  </div>
                </div>

                <div className={`forge-update-status ${suiteSettings.update.status}`} role="status">
                  <RefreshCw
                    size={18}
                    className={
                      suiteSettings.update.status === "checking" ||
                      suiteSettings.update.status === "downloading"
                        ? "spinning"
                        : ""
                    }
                  />
                  <div>
                    <strong>
                      {suiteSettings.update.status === "checking"
                        ? "Checking for updates..."
                        : suiteSettings.update.status === "available"
                          ? `Version ${suiteSettings.update.availableVersion} is ready`
                          : suiteSettings.update.status === "downloading"
                            ? `Installing Everend Forge ${suiteSettings.update.availableVersion}...`
                            : suiteSettings.update.status === "up-to-date"
                              ? "You are up to date"
                              : suiteSettings.update.status === "error"
                                ? "Update check failed"
                                : "Ready to check for updates"}
                    </strong>
                    <p>
                      {suiteSettings.update.status === "available"
                        ? "Download the signed package when you are ready. The Suite will relaunch after installation."
                        : suiteSettings.update.status === "downloading"
                          ? "Keep the Suite open while the update is downloaded and verified."
                          : suiteSettings.update.status === "up-to-date"
                            ? "No newer signed release is available for this installation."
                            : (suiteSettings.update.error ??
                              "The updater is ready to contact the release server.")}
                    </p>
                  </div>
                </div>

                {suiteSettings.update.status === "downloading" ? (
                  <div className="forge-update-progress" aria-label="Update download progress">
                    <div className="forge-update-progress-header">
                      <span>Download progress</span>
                      <strong>
                        {suiteSettings.update.progress === undefined
                          ? "Preparing..."
                          : `${suiteSettings.update.progress}%`}
                      </strong>
                    </div>
                    <div
                      className="forge-update-progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={suiteSettings.update.progress}
                    >
                      <span style={{ width: `${suiteSettings.update.progress ?? 8}%` }} />
                    </div>
                    {suiteSettings.update.contentLength ? (
                      <small>
                        {(suiteSettings.update.downloadedBytes ?? 0) / 1024 / 1024 >= 0.1
                          ? `${((suiteSettings.update.downloadedBytes ?? 0) / 1024 / 1024).toFixed(1)} MB of ${(suiteSettings.update.contentLength / 1024 / 1024).toFixed(1)} MB`
                          : "Starting download..."}
                      </small>
                    ) : null}
                  </div>
                ) : null}

                {suiteSettings.update.releaseNotes ? (
                  <div className="forge-update-notes">
                    <span>Release notes</span>
                    <p>{suiteSettings.update.releaseNotes}</p>
                  </div>
                ) : null}

                <div className="forge-update-actions">
                  <button
                    type="button"
                    onClick={suiteSettings.update.onCheck}
                    disabled={
                      suiteSettings.update.status === "checking" ||
                      suiteSettings.update.status === "downloading"
                    }
                  >
                    <RefreshCw size={14} />
                    Check for updates
                  </button>
                  {suiteSettings.update.status === "available" ? (
                    <button
                      type="button"
                      className="primary-action"
                      onClick={suiteSettings.update.onInstall}
                    >
                      Download and install
                    </button>
                  ) : null}
                </div>

                {suiteSettings.update.lastCheckedAt ? (
                  <p className="forge-update-last-checked">
                    Last checked {new Date(suiteSettings.update.lastCheckedAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : null}
            {activeSection === "license" && suiteSettings?.license ? (
              <SuiteLicenseSettings license={suiteSettings.license} />
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
                    <UniverseLanguageSettings
                      value={profileDraft.localization}
                      onChange={(localization) =>
                        setProfileDraft((current) => ({ ...current, localization }))
                      }
                    />
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
                  {!suiteSettings ? (
                    <label>
                      <span>{interfaceCopy.interfaceLanguage}</span>
                      <select
                        value={settings.localePreference ?? "system"}
                        onChange={(event) =>
                          onChange({ ...settings, localePreference: event.target.value as "system" | "en" | "es" })
                        }
                      >
                        <option value="system">{interfaceCopy.system}</option>
                        <option value="en">English</option>
                        <option value="es">Español</option>
                      </select>
                    </label>
                  ) : null}
                  <label>
                    <span>{settingsText.activeStyle}</span>
                    <input value={themeById(settings.theme).label} readOnly />
                  </label>
                  <label>
                    <span>{settingsText.pageStyle}</span>
                    <select
                      value={settings.editor.pageStyle}
                      onChange={(event) =>
                        updateEditor({
                          pageStyle: event.target.value as EditorSettings["pageStyle"],
                        })
                      }
                    >
                      <option value="theme">{settingsText.theme}</option>
                      <option value="white">{settingsText.whitePage}</option>
                      <option value="warm-paper">{settingsText.warmPaper}</option>
                      <option value="system">{settingsText.systemSurface}</option>
                      <option value="custom">{settingsText.customColor}</option>
                    </select>
                  </label>
                  <label>
                    <span>{settingsText.customPageColor}</span>
                    <input
                      type="color"
                      value={settings.editor.customPageColor}
                      onChange={(event) => updateEditor({ customPageColor: event.target.value })}
                      disabled={settings.editor.pageStyle !== "custom"}
                    />
                  </label>
                  <label>
                    <span>{settingsText.paperShadow}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.showPaperShadow}
                      onChange={(event) => updateEditor({ showPaperShadow: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.lineNumbers}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.lineNumbers}
                      onChange={(event) => updateEditor({ lineNumbers: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.lineWrap}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.lineWrap}
                      onChange={(event) => updateEditor({ lineWrap: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.activeLine}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.activeLine}
                      onChange={(event) => updateEditor({ activeLine: event.target.checked })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.writingStructures}</span>
                    <select
                      value={settings.editor.writeStructureMode}
                      onChange={(event) =>
                        updateEditor({
                          writeStructureMode: event.target
                            .value as EditorSettings["writeStructureMode"],
                        })
                      }
                    >
                      <option value="processed">{settingsText.processed}</option>
                      <option value="visible">{settingsText.visibleStructures}</option>
                    </select>
                  </label>
                  <label>
                    <span>{settingsText.fontSize}</span>
                    <input
                      type="number"
                      min={11}
                      max={22}
                      value={settings.editor.fontSize}
                      onChange={(event) => updateEditor({ fontSize: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.writeFont}</span>
                    <input
                      value={settings.editor.writeFontFamily}
                      onChange={(event) => updateEditor({ writeFontFamily: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.sourceFont}</span>
                    <input
                      value={settings.editor.sourceFontFamily}
                      onChange={(event) => updateEditor({ sourceFontFamily: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.tabSize}</span>
                    <input
                      type="number"
                      min={2}
                      max={8}
                      value={settings.editor.tabSize}
                      onChange={(event) => updateEditor({ tabSize: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>{settingsText.defaultMode}</span>
                    <select
                      value={settings.editor.defaultMode}
                      onChange={(event) =>
                        updateEditor({
                          defaultMode: event.target.value as EditorSettings["defaultMode"],
                        })
                      }
                    >
                      <option value="write">{settingsText.write}</option>
                      <option value="source">{settingsText.source}</option>
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
                  {settingsText.navigation}
                </h3>
                <div className="settings-grid">
                  <label>
                    <span>{settingsText.commandPalette}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.commandPaletteEnabled}
                      onChange={(event) =>
                        updateEditor({ commandPaletteEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>{settingsText.quickSwitcher}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.quickSwitcherEnabled}
                      onChange={(event) =>
                        updateEditor({ quickSwitcherEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>{settingsText.findReplace}</span>
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
                  {settingsText.visualization}
                </h3>
                <div className="settings-grid">
                  <label>
                    <span>{settingsText.outlineGuide}</span>
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
                      <span>{settingsText.outlinePosition}</span>
                      <select
                        value={settings.editor.outlinePosition}
                        onChange={(event) =>
                          updateEditor({ outlinePosition: event.target.value as "left" | "right" })
                        }
                      >
                        <option value="left">{settingsText.left}</option>
                        <option value="right">{settingsText.right}</option>
                      </select>
                    </label>
                  )}
                  <label>
                    <span>{settingsText.breadcrumbs}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.breadcrumbsEnabled}
                      onChange={(event) =>
                        updateEditor({ breadcrumbsEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>{settingsText.codeFolding}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.codeFoldingEnabled}
                      onChange={(event) =>
                        updateEditor({ codeFoldingEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>{settingsText.floatingToolbar}</span>
                    <input
                      type="checkbox"
                      checked={settings.editor.floatingToolbarEnabled}
                      onChange={(event) =>
                        updateEditor({ floatingToolbarEnabled: event.target.checked })
                      }
                    />
                  </label>
                  <label>
                    <span>{settingsText.documentHeader}</span>
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
                    <span>{settingsText.showProjectName}</span>
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
                    Universe-wide tools to keep every note's YAML frontmatter valid, complete, and
                    consistently ordered. Changes are previewed first and applied only to the files
                    you choose.
                  </p>
                </div>
                {universe.propertiesConfig && universe.propertiesConfig.version !== "3.0" ? (
                  <>
                    <div className="universe-onboarding-card">
                      <div>
                        <h3>Upgrade property structure</h3>
                        <p>
                          Preview the move from flat 2.0 keys to nested 3.0 group objects. Nothing
                          changes until you confirm the preview.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={scanStructureMigration}
                        disabled={structureMigrationBusy}
                      >
                        {structureMigrationBusy ? "Scanning..." : "Preview upgrade"}
                      </button>
                    </div>

                    {structureMigration ? (
                      <div className="normalization-preview">
                        <div className="normalization-actions">
                          <span>
                            {structureMigration.items.length} affected note
                            {structureMigration.items.length === 1 ? "" : "s"}
                          </span>
                          <button
                            type="button"
                            onClick={applyStructureMigration}
                            disabled={
                              structureMigrationBusy ||
                              structureMigration.items.some((item) => item.status !== "ready")
                            }
                          >
                            Confirm upgrade to 3.0
                          </button>
                        </div>
                        {structureMigration.items.length ? (
                          structureMigration.items.map((item) => (
                            <div key={item.path} className="normalization-row">
                              <span className="normalization-row-main">
                                <strong>{item.path}</strong>
                                <small>
                                  {item.moves.length
                                    ? item.moves
                                        .map(
                                          (move) =>
                                            `${move.fromPath.join(".")} → ${move.toPath.join(".")}`,
                                        )
                                        .join(" · ")
                                    : item.conflicts.join(" · ")}
                                </small>
                              </span>
                              <span className={`normalization-kind ${item.status}`}>
                                {item.status.replace("-", " ")}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="muted">
                            No note values need moving; only the schema will be upgraded.
                          </p>
                        )}
                      </div>
                    ) : null}

                    {structureMigrationErrors.length ? (
                      <div className="settings-error-list">
                        {structureMigrationErrors.map((error, index) => (
                          <p key={`${error}-${index}`}>{error}</p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="universe-onboarding-card">
                  <div>
                    <h3>Add missing frontmatter</h3>
                    <p>
                      Scans this universe for Markdown files without valid frontmatter, detects
                      normal notes and folder notes, and previews the metadata it will add.
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

                <div className="universe-onboarding-card">
                  <div>
                    <h3>Normalize properties</h3>
                    <p>
                      Checks every note against the universe schema: fills missing core and required
                      fields with defaults and reorders frontmatter keys to the schema order. The
                      note body is never touched.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={scanPropertyNormItems}
                    disabled={propertyNormBusy || !universe.propertiesConfig}
                    title={
                      universe.propertiesConfig
                        ? undefined
                        : "This universe has no properties schema yet"
                    }
                  >
                    {propertyNormBusy ? "Scanning..." : "Scan properties"}
                  </button>
                </div>

                {propertyNormItems.length > 0 ? (
                  <>
                    <div className="normalization-actions">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPropertyNormPaths(
                            new Set(propertyNormItems.map((item) => item.path)),
                          )
                        }
                        disabled={propertyNormBusy}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPropertyNormPaths(new Set())}
                        disabled={propertyNormBusy}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyPropertyNormItems(
                            propertyNormItems.filter((item) =>
                              selectedPropertyNormPaths.has(item.path),
                            ),
                          )
                        }
                        disabled={propertyNormBusy || selectedPropertyNormPaths.size === 0}
                      >
                        Apply selected
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPropertyNormItems(propertyNormItems)}
                        disabled={propertyNormBusy}
                      >
                        Apply all
                      </button>
                    </div>
                    <div className="normalization-preview">
                      {propertyNormItems.map((item) => (
                        <label key={item.path} className="normalization-row">
                          <input
                            type="checkbox"
                            checked={selectedPropertyNormPaths.has(item.path)}
                            onChange={(event) =>
                              setSelectedPropertyNormPaths((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(item.path);
                                else next.delete(item.path);
                                return next;
                              })
                            }
                          />
                          <span className="normalization-row-main">
                            <strong>{item.path}</strong>
                            <small>{propertyNormSummary(item)}</small>
                          </span>
                          <span className="normalization-meta">
                            <code>{item.type}</code>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : propertyNormScanned && !propertyNormBusy ? (
                  <p className="muted">Every note already matches the universe schema. ✓</p>
                ) : (
                  <p className="muted">
                    Run a scan to preview notes whose properties drift from the schema.
                  </p>
                )}

                {propertyNormErrors.length > 0 ? (
                  <div className="settings-error-list">
                    {propertyNormErrors.map((error, index) => (
                      <p key={`${error}-${index}`}>{error}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeSection === "explorer" ? (
              <div className="settings-grid">
                <label>
                  <span>{settingsText.confirmMoves}</span>
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
                  <span>{settingsText.showHidden}</span>
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
                  <span>{settingsText.folderNotes}</span>
                  <input
                    type="checkbox"
                    checked={settings.explorer.folderNotesEnabled}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        explorer: {
                          ...settings.explorer,
                          folderNotesEnabled: event.target.checked,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>{settingsText.showImages}</span>
                  <input
                    type="checkbox"
                    checked={settings.explorer.showImagesInAllFiles}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        explorer: {
                          ...settings.explorer,
                          showImagesInAllFiles: event.target.checked,
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
                  {(
                    [
                      "navigation",
                      "editor",
                      "visual",
                      "integration",
                      "runtime-adapter",
                    ] as PluginCategory[]
                  ).map((category) => {
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
                                    Documentation only for now. Engine adapters are not installed or
                                    executed in v1.
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
                  })}
                </div>
              </div>
            ) : null}

            {activeSection === "ai-advisor" ? (
              <div className="settings-panel ai-advisor-settings-panel">
                <div className="settings-page-title">
                  <h3>AI Advisor providers</h3>
                  <p>Choose which web providers appear in the Advisor tab.</p>
                </div>
                <div className="settings-security-note">
                  <Sparkles size={16} />
                  <p>
                    WorldNotion stores only provider names, links, enabled state, and your selected
                    provider. It does not store passwords, cookies, API keys, or chat content.
                  </p>
                </div>
                <div className="ai-provider-config-list">
                  {settings.aiAdvisor.providers.map((provider) => (
                    <article key={provider.id} className="ai-provider-config-card">
                      <div className="ai-provider-config-fields">
                        <label>
                          <span>Name</span>
                          <input
                            value={provider.name}
                            onChange={(event) =>
                              updateAiProvider(provider.id, { name: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Web link</span>
                          <input
                            value={provider.url}
                            type="url"
                            spellCheck={false}
                            onChange={(event) =>
                              updateAiProvider(provider.id, { url: event.target.value })
                            }
                          />
                        </label>
                        {!normalizeAiProviderUrl(provider.url) ? (
                          <small className="settings-inline-error">
                            Use a valid http(s) link before opening this provider.
                          </small>
                        ) : null}
                        {provider.url.startsWith("http://") ? (
                          <small className="settings-inline-warning">
                            HTTP is unencrypted; use HTTPS except for local services.
                          </small>
                        ) : null}
                      </div>
                      <div className="ai-provider-config-actions">
                        <label className="ai-provider-enabled-toggle">
                          <input
                            type="checkbox"
                            checked={provider.enabled}
                            onChange={(event) =>
                              updateAiProvider(provider.id, { enabled: event.target.checked })
                            }
                          />
                          Enabled
                        </label>
                        <button
                          type="button"
                          className="icon-button danger"
                          title={`Remove ${provider.name || "provider"}`}
                          aria-label={`Remove ${provider.name || "provider"}`}
                          onClick={() => removeAiProvider(provider.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="ai-provider-add-card">
                  <div>
                    <strong>Add provider</strong>
                    <p>Any http(s) chat, research, or local web service can be added.</p>
                  </div>
                  <div className="ai-provider-add-fields">
                    <input
                      value={newAiProviderName}
                      onChange={(event) => setNewAiProviderName(event.target.value)}
                      placeholder="Provider name"
                      aria-label="New provider name"
                    />
                    <input
                      value={newAiProviderUrl}
                      onChange={(event) => setNewAiProviderUrl(event.target.value)}
                      placeholder="https://example.com/chat"
                      type="url"
                      spellCheck={false}
                      aria-label="New provider URL"
                    />
                    <button type="button" onClick={addAiProvider}>
                      <Plus size={15} />
                      Add
                    </button>
                  </div>
                  {aiProviderError ? (
                    <small className="settings-inline-error">{aiProviderError}</small>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeSection === "tutorials" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Tutoriales</h3>
                  <p>Vuelve a mostrar la guía básica de WorldNotion para este universo.</p>
                </div>
                <button type="button" onClick={onResetOnboarding} disabled={!onResetOnboarding}>
                  <RefreshCw size={15} />
                  Reiniciar tutorial
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
