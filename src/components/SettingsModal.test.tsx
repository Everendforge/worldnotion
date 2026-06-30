import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_PLUGIN_SETTINGS,
  type AppSettingsV4,
} from "../editorTypes";
import { createDefaultTaxonomyConfig } from "../domain";
import { SettingsModal } from "./SettingsModal";

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

describe("SettingsModal", () => {
  it("updates the dock tab scale from the tabs settings", () => {
    const onChange = vi.fn();
    const settings = appSettings();

    render(<SettingsModal settings={settings} onChange={onChange} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    fireEvent.change(screen.getByLabelText("Dock tab size"), { target: { value: "1.5" } });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      editor: {
        ...settings.editor,
        dockTabScale: 1.5,
      },
    });
  });

  it("keeps universe properties out of settings", () => {
    render(
      <SettingsModal
        settings={appSettings()}
        universe={{
          name: "Demo",
          rootPath: "D:/Demo",
          fileCount: 1,
          entityCount: 1,
          templateCount: 0,
          hasEverendWorkspace: true,
          propertiesConfig: createDefaultTaxonomyConfig(),
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
        initialSection="tags"
      />,
    );

    expect(screen.queryByRole("button", { name: /add property/i })).toBeNull();
    expect(screen.queryByText("Advanced Property Editor")).toBeNull();
  });

  it("shows the plugin manager and toggles optional plugins", () => {
    const onChange = vi.fn();
    const settings = appSettings();

    render(<SettingsModal settings={settings} onChange={onChange} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Plugins" }));

    expect(screen.getByText("Unity Adapter")).toBeInTheDocument();
    expect(screen.getAllByText("Planned").length).toBeGreaterThan(0);

    const syntaxToggle = screen.getAllByLabelText("Active", { selector: "input" })[0];
    fireEvent.click(syntaxToggle);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.objectContaining({
          enabled: expect.objectContaining({ "markdown-syntax-hiding": false }),
        }),
      }),
    );
  });
});
