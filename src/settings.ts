import {
  AppSettingsV4,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_PLUGIN_SETTINGS,
} from "./editorTypes";
import type { DefaultEditorMode, WritingMode, WorkspaceSession } from "./editorTypes";
import { normalizeThemeId } from "./themes";
import { DEFAULT_AI_ADVISOR_SETTINGS, normalizeAiAdvisorSettings } from "./utils/aiProviders";
import { normalizePluginSettings } from "./utils/pluginRegistry";
import { normalizeLocalePreference } from "./i18n";

export const SETTINGS_KEY = "worldnotion.settings.v4";
export const LEGACY_SETTINGS_KEY = "worldnotion.settings.v3";

function legacyWritingMode(
  editor: Record<string, unknown>,
  legacyPluginEnabled: unknown,
): WritingMode {
  if (editor.writeStructureMode === "semi" || editor.writeStructureMode === "visible") {
    return "semi";
  }
  if (editor.writeStructureMode === "processed") return "processed";
  return editor.hideMarkdownSyntaxInWrite === false || legacyPluginEnabled === false
    ? "semi"
    : "processed";
}

function normalizeDefaultMode(value: unknown, writingMode: WritingMode): DefaultEditorMode {
  if (value === "source" || value === "processed" || value === "semi") return value;
  if (value === "write") return writingMode;
  return writingMode;
}

function normalizeSessions(
  sessions: AppSettingsV4["sessions"] | undefined,
  writingMode: WritingMode,
): Record<string, WorkspaceSession> {
  return Object.fromEntries(
    Object.entries(sessions ?? {}).map(([rootPath, session]) => [
      rootPath,
      {
        ...session,
        tabs: (session.tabs ?? []).map((tab) => ({
          ...tab,
          writingMode:
            tab.writingMode === "semi" || tab.writingMode === "processed"
              ? tab.writingMode
              : writingMode,
        })),
      },
    ]),
  );
}

export function loadSettings(): AppSettingsV4 {
  try {
    const stored =
      localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "{}";
    const parsed = JSON.parse(stored) as Partial<AppSettingsV4>;
    const recentUniverses = Array.isArray(parsed.recentUniverses)
      ? parsed.recentUniverses.filter((item): item is string => typeof item === "string")
      : parsed.recentUniverse
        ? [parsed.recentUniverse]
        : [];
    const parsedExplorer: Partial<AppSettingsV4["explorer"]> = parsed.explorer ?? {};
    const legacyExplorer = (parsed.explorer ?? {}) as Record<string, unknown>;
    const activeSection =
      parsedExplorer.activeSection === "favorites" ||
      parsedExplorer.activeSection === "ecosystem" ||
      parsedExplorer.activeSection === "images"
        ? parsedExplorer.activeSection
        : "allFiles";
    const folderNotesEnabled =
      typeof legacyExplorer.folderNotesEnabled === "boolean"
        ? legacyExplorer.folderNotesEnabled
        : legacyExplorer.ignoreFolderNoteMetadata === true
          ? false
          : true;
    const showImagesInAllFiles = legacyExplorer.showImagesInAllFiles === true;

    const mergedKeybindings = (() => {
      if (!parsed.keybindings?.length) return DEFAULT_KEYBINDINGS;

      const userBindings = new Map(
        parsed.keybindings.map((keybinding) => [keybinding.commandId, keybinding.shortcut]),
      );
      return DEFAULT_KEYBINDINGS.map((defaultKeybinding) => ({
        commandId: defaultKeybinding.commandId,
        shortcut: userBindings.get(defaultKeybinding.commandId) ?? defaultKeybinding.shortcut,
      }));
    })();

    const legacyEditor = (parsed.editor ?? {}) as Record<string, unknown>;
    const legacyPluginEnabled = (parsed.plugins?.enabled as Record<string, unknown> | undefined)?.[
      "markdown-syntax-hiding"
    ];
    const writingMode = legacyWritingMode(legacyEditor, legacyPluginEnabled);
    const defaultMode = normalizeDefaultMode(legacyEditor.defaultMode, writingMode);
    const {
      hideMarkdownSyntaxInWrite: _legacySyntaxSetting,
      writeStructureMode: _legacyStructureMode,
      defaultMode: _legacyDefaultMode,
      ...editorSettings
    } = legacyEditor;

    return {
      localePreference: normalizeLocalePreference(parsed.localePreference),
      theme: normalizeThemeId(parsed.theme),
      recentUniverse: parsed.recentUniverse,
      recentUniverses,
      recentUniverseProfiles: parsed.recentUniverseProfiles ?? {},
      editor: { ...DEFAULT_EDITOR_SETTINGS, ...editorSettings, defaultMode },
      explorer: {
        ...DEFAULT_EXPLORER_SETTINGS,
        ...parsedExplorer,
        activeSection,
        folderNotesEnabled,
        showImagesInAllFiles,
      },
      graph: { ...DEFAULT_GRAPH_SETTINGS, ...(parsed.graph ?? {}) },
      plugins: normalizePluginSettings(parsed.plugins ?? DEFAULT_PLUGIN_SETTINGS),
      aiAdvisor: normalizeAiAdvisorSettings(parsed.aiAdvisor ?? DEFAULT_AI_ADVISOR_SETTINGS),
      keybindings: mergedKeybindings,
      sessions: normalizeSessions(parsed.sessions, writingMode),
    };
  } catch {
    return {
      localePreference: "system",
      theme: "worldnotion-light",
      recentUniverses: [],
      recentUniverseProfiles: {},
      editor: DEFAULT_EDITOR_SETTINGS,
      explorer: DEFAULT_EXPLORER_SETTINGS,
      graph: DEFAULT_GRAPH_SETTINGS,
      plugins: DEFAULT_PLUGIN_SETTINGS,
      aiAdvisor: DEFAULT_AI_ADVISOR_SETTINGS,
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

  if (key === "editor") {
    const {
      hideMarkdownSyntaxInWrite: _legacySyntaxSetting,
      writeStructureMode: _legacyStructureMode,
      ...editor
    } = value as Record<string, unknown>;
    return editor;
  }

  if (key === "plugins") {
    const plugins = value as { enabled?: Record<string, unknown> };
    const { "markdown-syntax-hiding": _legacySyntaxPlugin, ...enabled } = plugins.enabled ?? {};
    return { ...plugins, enabled };
  }

  if (key === "explorer") {
    const { ignoreFolderNoteMetadata: _legacyFolderNotes, ...explorer } = value as Record<
      string,
      unknown
    >;
    return explorer;
  }

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
          variantSelections: workspaceSession.variantSelections ?? {},
        };
      }
    }
    return simplified;
  }

  return value;
}
