import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_PLUGIN_SETTINGS,
  type AppSettingsV4,
} from "../editorTypes";
import {
  getPluginDefinitions,
  isPluginEnabled,
  normalizePluginSettings,
  updatePluginEnabled,
} from "./pluginRegistry";

function appSettings(overrides: Partial<AppSettingsV4> = {}): AppSettingsV4 {
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
    ...overrides,
  };
}

describe("plugin registry", () => {
  it("normalizes missing settings with defaults", () => {
    expect(normalizePluginSettings(undefined).enabled["markdown-syntax-hiding"]).toBe(true);
    expect(normalizePluginSettings(undefined).enabled["unity-adapter"]).toBe(false);
  });

  it("respects optional plugin toggles", () => {
    expect(isPluginEnabled({ enabled: { "font-family-rendering": false } }, "font-family-rendering")).toBe(false);
  });

  it("keeps protected core plugins active unless a legacy safe setting disables them", () => {
    expect(isPluginEnabled({ enabled: { wikilinks: false } }, "wikilinks")).toBe(true);
    expect(isPluginEnabled({ enabled: { "code-folding": true } }, "code-folding", false)).toBe(false);
  });

  it("does not enable planned runtime adapters", () => {
    expect(isPluginEnabled({ enabled: { "unity-adapter": true } }, "unity-adapter")).toBe(false);
    expect(getPluginDefinitions().find((plugin) => plugin.id === "unity-adapter")?.status).toBe("planned");
  });

  it("updates optional plugins and mirrors legacy editor settings", () => {
    const next = updatePluginEnabled(appSettings(), "document-header", false);

    expect(next.plugins.enabled["document-header"]).toBe(false);
    expect(next.editor.documentHeaderEnabled).toBe(false);
  });

  it("ignores attempts to toggle planned adapters", () => {
    const settings = appSettings();

    expect(updatePluginEnabled(settings, "unity-adapter", true)).toBe(settings);
  });
});
