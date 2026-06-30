import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Entity } from "../domain";
import { createDefaultTaxonomyConfig } from "../domain";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "../utils/propertyTemplates";
import type { PropertiesConfig } from "../editorTypes";
import { MetadataEditor } from "./MetadataEditor";

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

    fireEvent.change(within(dialog).getByLabelText("New property name"), { target: { value: "Lore Level" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const savedConfig = onUpdatePropertiesConfig.mock.calls[onUpdatePropertiesConfig.mock.calls.length - 1]?.[0];

    expect(savedConfig.customFields.definitions.map((property: { id: string }) => property.id)).toContain("lore-level");
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
      const [config, setConfig] = useState<PropertiesConfig>(() => applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE));
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

    fireEvent.change(within(dialog).getByLabelText("New property name"), { target: { value: "Magic" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    fireEvent.change(within(dialog).getByLabelText("New child property name"), { target: { value: "Power Level" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add child" }));

    expect(within(dialog).getAllByText("Power Level").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole("button", { name: /MAGIC/i }).length).toBeGreaterThan(0);
  });
});
