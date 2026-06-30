import {
  AppSettingsV4,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_PLUGIN_SETTINGS,
} from "./editorTypes";
import { normalizeThemeId } from "./themes";
import { normalizePluginSettings } from "./utils/pluginRegistry";

export const SETTINGS_KEY = "worldnotion.settings.v4";
export const LEGACY_SETTINGS_KEY = "worldnotion.settings.v3";

export function loadSettings(): AppSettingsV4 {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "{}";
    const parsed = JSON.parse(stored) as Partial<AppSettingsV4>;
    const recentUniverses = Array.isArray(parsed.recentUniverses)
      ? parsed.recentUniverses.filter((item): item is string => typeof item === "string")
      : parsed.recentUniverse
        ? [parsed.recentUniverse]
        : [];
    const parsedExplorer: Partial<AppSettingsV4["explorer"]> = parsed.explorer ?? {};
    const activeSection =
      parsedExplorer.activeSection === "favorites" || parsedExplorer.activeSection === "ecosystem"
        ? parsedExplorer.activeSection
        : "allFiles";

    const mergedKeybindings = (() => {
      if (!parsed.keybindings?.length) return DEFAULT_KEYBINDINGS;

      const userBindings = new Map(parsed.keybindings.map((keybinding) => [keybinding.commandId, keybinding.shortcut]));
      return DEFAULT_KEYBINDINGS.map((defaultKeybinding) => ({
        commandId: defaultKeybinding.commandId,
        shortcut: userBindings.get(defaultKeybinding.commandId) ?? defaultKeybinding.shortcut,
      }));
    })();

    return {
      theme: normalizeThemeId(parsed.theme),
      recentUniverse: parsed.recentUniverse,
      recentUniverses,
      recentUniverseProfiles: parsed.recentUniverseProfiles ?? {},
      editor: { ...DEFAULT_EDITOR_SETTINGS, ...(parsed.editor ?? {}) },
      explorer: { ...DEFAULT_EXPLORER_SETTINGS, ...parsedExplorer, activeSection },
      graph: { ...DEFAULT_GRAPH_SETTINGS, ...(parsed.graph ?? {}) },
      plugins: normalizePluginSettings(parsed.plugins ?? DEFAULT_PLUGIN_SETTINGS),
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
      graph: DEFAULT_GRAPH_SETTINGS,
      plugins: DEFAULT_PLUGIN_SETTINGS,
      keybindings: DEFAULT_KEYBINDINGS,
      sessions: {},
    };
  }
}

export function saveSettings(settings: AppSettingsV4) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings, settingsReplacer));
}

function settingsReplacer(key: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  if (key === "editorState") {
    const flattened: Record<string, unknown> = {};
    for (const [filePath, state] of Object.entries(value)) {
      if (state && typeof state === "object") {
        const fileState = state as Record<string, unknown>;
        flattened[filePath] = {
          cursorPosition: fileState.cursorPosition,
          scrollPosition: fileState.scrollPosition,
          foldedRanges: fileState.foldedRanges,
          selection: fileState.selection,
          lastModified: fileState.lastModified,
        };
      }
    }
    return flattened;
  }

  if (key === "sessions") {
    const simplified: Record<string, unknown> = {};
    for (const [path, session] of Object.entries(value)) {
      if (session && typeof session === "object") {
        const workspaceSession = session as Record<string, unknown>;
        simplified[path] = {
          rootPath: workspaceSession.rootPath,
          activePath: workspaceSession.activePath,
          tabs: workspaceSession.tabs ?? [],
          layout: workspaceSession.layout,
          documentTabGroups: workspaceSession.documentTabGroups,
          explorerExpandedPaths: Array.isArray(workspaceSession.explorerExpandedPaths)
            ? workspaceSession.explorerExpandedPaths
            : undefined,
          editorState: workspaceSession.editorState ?? {},
          fileAccessStats: workspaceSession.fileAccessStats ?? [],
        };
      }
    }
    return simplified;
  }

  return value;
}
