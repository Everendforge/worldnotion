import {
  DEFAULT_PLUGIN_SETTINGS,
  type AppSettingsV4,
  type EditorSettings,
  type PluginCategory,
  type PluginDefinition,
  type PluginId,
  type PluginSettings,
} from "../editorTypes";

const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    id: "wikilinks",
    name: "Wikilinks",
    description: "Resolves and opens [[note links]] inside the write editor.",
    category: "navigation",
    status: "core",
    scope: "worldnotion",
    defaultEnabled: true,
    configurable: false,
    riskLevel: "high",
  },
  {
    id: "footnotes",
    name: "Footnotes",
    description: "Styles Markdown footnote references while writing.",
    category: "editor",
    status: "core",
    scope: "worldnotion",
    defaultEnabled: true,
    configurable: false,
    riskLevel: "medium",
  },
  {
    id: "code-folding",
    name: "Code Folding",
    description: "Adds fold gutters and folding keybindings for structured Markdown.",
    category: "editor",
    status: "core",
    scope: "worldnotion",
    defaultEnabled: true,
    configurable: false,
    riskLevel: "medium",
  },
  {
    id: "markdown-syntax-hiding",
    name: "Markdown Syntax Hiding",
    description: "Softens Markdown markers in Write mode for cleaner prose editing.",
    category: "visual",
    status: "available",
    scope: "worldnotion",
    defaultEnabled: true,
    configurable: true,
    riskLevel: "low",
  },
  {
    id: "font-family-rendering",
    name: "Font Family Rendering",
    description: "Renders portable font-family spans in Write mode.",
    category: "visual",
    status: "available",
    scope: "worldnotion",
    defaultEnabled: true,
    configurable: true,
    riskLevel: "low",
  },
  {
    id: "document-header",
    name: "Document Header",
    description: "Shows a lightweight document title header inside Write mode.",
    category: "visual",
    status: "available",
    scope: "worldnotion",
    defaultEnabled: true,
    configurable: true,
    riskLevel: "low",
  },
  {
    id: "unity-adapter",
    name: "Unity Adapter",
    description: "Planned engine adapter for runtime packages exported by PathBranching.",
    category: "runtime-adapter",
    status: "planned",
    scope: "everend-runtime",
    defaultEnabled: false,
    configurable: false,
    riskLevel: "medium",
  },
  {
    id: "godot-adapter",
    name: "Godot Adapter",
    description: "Planned engine adapter for runtime packages exported by PathBranching.",
    category: "runtime-adapter",
    status: "planned",
    scope: "everend-runtime",
    defaultEnabled: false,
    configurable: false,
    riskLevel: "medium",
  },
  {
    id: "unreal-adapter",
    name: "Unreal Adapter",
    description: "Planned engine adapter for runtime packages exported by PathBranching.",
    category: "runtime-adapter",
    status: "planned",
    scope: "everend-runtime",
    defaultEnabled: false,
    configurable: false,
    riskLevel: "medium",
  },
];

const definitionsById = new Map(PLUGIN_DEFINITIONS.map((definition) => [definition.id, definition]));

export function getPluginDefinitions(): PluginDefinition[] {
  return PLUGIN_DEFINITIONS;
}

export function pluginSettingDefaults(): PluginSettings {
  return {
    enabled: { ...DEFAULT_PLUGIN_SETTINGS.enabled },
  };
}

export function normalizePluginSettings(settings: Partial<PluginSettings> | undefined): PluginSettings {
  return {
    enabled: {
      ...pluginSettingDefaults().enabled,
      ...(settings?.enabled ?? {}),
    },
  };
}

export function isPluginEnabled(
  pluginSettings: PluginSettings | undefined,
  pluginId: PluginId,
  legacyEnabled = true,
): boolean {
  const definition = definitionsById.get(pluginId);
  if (!definition) return false;
  if (definition.status === "planned") return false;
  if (definition.status === "core" && !definition.configurable) return legacyEnabled;
  const enabled = normalizePluginSettings(pluginSettings).enabled[pluginId] ?? definition.defaultEnabled;
  return enabled && legacyEnabled;
}

export function updatePluginEnabled(settings: AppSettingsV4, pluginId: PluginId, enabled: boolean): AppSettingsV4 {
  const nextPlugins = normalizePluginSettings(settings.plugins);
  const definition = definitionsById.get(pluginId);
  if (!definition || !definition.configurable || definition.status === "planned") {
    return settings;
  }

  const nextSettings: AppSettingsV4 = {
    ...settings,
    plugins: {
      enabled: {
        ...nextPlugins.enabled,
        [pluginId]: enabled,
      },
    },
  };

  if (pluginId === "markdown-syntax-hiding") {
    return {
      ...nextSettings,
      editor: { ...nextSettings.editor, hideMarkdownSyntaxInWrite: enabled },
    };
  }
  if (pluginId === "document-header") {
    return {
      ...nextSettings,
      editor: { ...nextSettings.editor, documentHeaderEnabled: enabled },
    };
  }
  return nextSettings;
}

export function legacyPluginEnabled(editor: EditorSettings, pluginId: PluginId): boolean {
  if (pluginId === "markdown-syntax-hiding") return editor.hideMarkdownSyntaxInWrite;
  if (pluginId === "document-header") return editor.documentHeaderEnabled;
  if (pluginId === "code-folding") return editor.codeFoldingEnabled;
  return true;
}

export function pluginCategoryLabel(category: PluginCategory): string {
  switch (category) {
    case "editor":
      return "Editor";
    case "navigation":
      return "Navigation";
    case "visual":
      return "Visual";
    case "runtime-adapter":
      return "Runtime Adapters";
  }
}
