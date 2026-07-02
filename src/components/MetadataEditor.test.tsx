import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Entity } from "../domain";
import { createDefaultTaxonomyConfig } from "../domain";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "../utils/propertyTemplates";
import type { PropertiesConfig } from "../editorTypes";
import { MetadataEditor } from "./MetadataEditor";
import { ToastProvider } from "./ToastProvider";

// MetadataEditor uses useToast(), so every render needs the provider.
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: ToastProvider });
}

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "mara",
    type: "character",
    name: "Mara",
    status: "draft",
    tags: [],
    aliases: [],
    childrenIds: [],
    customProperties: {},
    body: "",
    path: "Mara.md",
    file: {
      relativePath: "Mara.md",
      absolutePath: "Mara.md",
      content: "",
      modifiedMs: 0,
    },
    wikilinks: [],
    backlinks: [],
    ...overrides,
  };
}

describe("MetadataEditor property manager", () => {
  it("opens the inspector property manager and creates an auto-id property", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const onUpdatePropertiesConfig = vi.fn();

    render(
      <MetadataEditor
        entity={entity()}
        propertiesConfig={config}
        rawYaml={"---\ntype: character\nstatus: draft\n---"}
        onUpdate={vi.fn()}
        onUpdatePropertiesConfig={onUpdatePropertiesConfig}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /customize/i }));
    const dialog = screen.getByRole("dialog", { name: /customize properties/i });

    fireEvent.change(within(dialog).getByLabelText("New property name"), {
      target: { value: "Lore Level" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const savedConfig =
      onUpdatePropertiesConfig.mock.calls[onUpdatePropertiesConfig.mock.calls.length - 1]?.[0];

    expect(
      savedConfig.customFields.definitions.map((property: { id: string }) => property.id),
    ).toContain("lore-level");
  }, 10000);

  it("shows visible and hidden properties in the inspector context menu", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);

    render(
      <MetadataEditor
        entity={entity()}
        propertiesConfig={config}
        rawYaml={"---\ntype: character\nstatus: draft\n---"}
        onUpdate={vi.fn()}
        onUpdatePropertiesConfig={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Properties"));
    const menu = screen.getByRole("menu");

    expect(within(menu).getByText("Role")).toBeTruthy();
    expect(within(menu).getByText("Rarity")).toBeTruthy();
  });

  it("uses entity core values to keep typed hierarchy visible when yaml omits type", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);

    render(
      <MetadataEditor
        entity={entity({ type: "character" })}
        propertiesConfig={config}
        rawYaml={"---\nstatus: draft\n---"}
        onUpdate={vi.fn()}
        onUpdatePropertiesConfig={vi.fn()}
      />,
    );

    expect(screen.getByText("Role")).toBeTruthy();
  });

  it("customize modal creates child properties inside the selected tree branch", () => {
    function Harness() {
      const [config, setConfig] = useState<PropertiesConfig>(() =>
        applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE),
      );
      return (
        <MetadataEditor
          entity={entity()}
          propertiesConfig={config}
          rawYaml={"---\ntype: character\nstatus: draft\n---"}
          onUpdate={vi.fn()}
          onUpdatePropertiesConfig={(nextConfig) => setConfig(nextConfig)}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /customize/i }));
    const dialog = screen.getByRole("dialog", { name: /customize properties/i });

    fireEvent.change(within(dialog).getByLabelText("New property name"), {
      target: { value: "Magic" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    fireEvent.change(within(dialog).getByLabelText("New child property name"), {
      target: { value: "Power Level" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add child" }));

    expect(within(dialog).getAllByText("Power Level").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole("button", { name: /MAGIC/i }).length).toBeGreaterThan(0);
  });

  it("adds an existing schema property to the note via the add-property picker", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const onUpdateRawYaml = vi.fn();

    render(
      <MetadataEditor
        entity={entity()}
        propertiesConfig={config}
        rawYaml={"---\ntype: character\nstatus: draft\n---"}
        onUpdate={vi.fn()}
        onUpdateRawYaml={onUpdateRawYaml}
        onUpdatePropertiesConfig={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add property/i }));
    const listbox = screen.getByRole("listbox");
    const roleOption = within(listbox)
      .getAllByRole("option")
      .find((option) => within(option).queryByText("Role"));
    expect(roleOption).toBeTruthy();
    fireEvent.click(roleOption!);

    const nextYaml = onUpdateRawYaml.mock.calls[0]?.[0] as string;
    expect(nextYaml).toContain("role:");
  });

  it("creates a brand-new property from the add-property picker query", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const onUpdateRawYaml = vi.fn();
    const onUpdatePropertiesConfig = vi.fn();

    render(
      <MetadataEditor
        entity={entity()}
        propertiesConfig={config}
        rawYaml={"---\ntype: character\nstatus: draft\n---"}
        onUpdate={vi.fn()}
        onUpdateRawYaml={onUpdateRawYaml}
        onUpdatePropertiesConfig={onUpdatePropertiesConfig}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add property/i }));
    fireEvent.change(screen.getByPlaceholderText("Property name…"), {
      target: { value: "Secret Motive" },
    });
    fireEvent.click(screen.getByText('Create property "Secret Motive"'));

    const savedConfig = onUpdatePropertiesConfig.mock.calls[0]?.[0];
    expect(
      savedConfig.customFields.definitions.map((property: { id: string }) => property.id),
    ).toContain("secret-motive");
    const nextYaml = onUpdateRawYaml.mock.calls[0]?.[0] as string;
    expect(nextYaml).toContain("secret-motive:");
  });
});
