import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_EXPLORER_SETTINGS,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_KEYBINDINGS,
  type AppSettingsV4,
} from "../editorTypes";
import { SettingsModal } from "./SettingsModal";

function appSettings(overrides: Partial<AppSettingsV4> = {}): AppSettingsV4 {
  return {
    theme: "worldnotion-light",
    recentUniverses: [],
    recentUniverseProfiles: {},
    editor: DEFAULT_EDITOR_SETTINGS,
    explorer: DEFAULT_EXPLORER_SETTINGS,
    graph: DEFAULT_GRAPH_SETTINGS,
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
});
