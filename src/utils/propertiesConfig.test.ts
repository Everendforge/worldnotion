import { describe, expect, it } from "vitest";
import { createDefaultTaxonomyConfig } from "../domain";
import { createEntityFrontmatter } from "./contentTemplates";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "./propertyTemplates";
import {
  adaptFrontmatterProperty,
  addPropertyToConfig,
  buildInspectorPropertySections,
  buildPropertySchemaSections,
  getConfiguredFrontmatterOrder,
  inferPropertyDefinition,
  listAllProperties,
  listUnconfiguredProperties,
  listVisibleProperties,
  moveInspectorProperty,
  parseFrontmatterRaw,
  removeFrontmatterProperty,
  reorderInspectorPropertySiblings,
  removeInspectorProperty,
  setInspectorPropertyVisibility,
  uniquePropertyId,
  upsertInspectorProperty,
  updateFrontmatterProperties,
} from "./propertiesConfig";
import { isPropertyVisible } from "./propertyTreeUtils";

describe("propertiesConfig", () => {
  it("generates unique property ids from labels", () => {
    expect(uniquePropertyId("Lore Level", ["lore-level"])).toBe("lore-level-2");
    expect(uniquePropertyId("Lore Level", ["lore-level", "lore-level-2"])).toBe("lore-level-3");
  });

  it("lists visible base and custom properties", () => {
    const config = addPropertyToConfig(applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE), {
      id: "rarity",
      label: "Rarity",
      type: "select",
      options: [{ value: "rare", label: "Rare" }],
    });

    expect(listVisibleProperties(config).map((property) => property.id)).toContain("status");
    expect(listVisibleProperties(config).map((property) => property.id)).toContain("rarity");
  });

  it("worldbuilding starts with the Everend base inspector contract visible", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const visibleIds = listVisibleProperties(config).map((property) => property.id);

    expect(visibleIds).toContain("type");
    expect(visibleIds).toContain("status");
    expect(visibleIds).toContain("aliases");
    expect(visibleIds).not.toContain("id");
    expect(visibleIds).not.toContain("name");
  });

  it("worldbuilding shows modular property roots instead of every field globally", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const characterIds = listVisibleProperties(config, "character").map((property) => property.id);
    const itemIds = listVisibleProperties(config, "item").map((property) => property.id);

    expect(characterIds).toEqual(["type", "status", "aliases", "lore-level", "identity", "narrative"]);
    expect(itemIds).toEqual([
      "type",
      "status",
      "aliases",
      "parentId",
      "childrenIds",
      "lore-level",
      "identity",
      "place",
      "item-details",
    ]);
    expect(characterIds).not.toContain("rarity");
    expect(itemIds).not.toContain("role");
    expect(listAllProperties(config).map((property) => property.id)).toEqual(expect.arrayContaining(["role", "rarity", "arc"]));
    expect(listAllProperties(config).map((property) => property.id)).not.toContain("worldbuilding-details");
    expect(listVisibleProperties(config, "character").every((property) => isPropertyVisible(property, { type: "character" }))).toBe(true);
  });

  it("does not treat hidden configured properties as unconfigured", () => {
    const config = addPropertyToConfig(createDefaultTaxonomyConfig(), {
      id: "rarity",
      label: "Rarity",
      type: "text",
    });
    const hiddenConfig = {
      ...config,
      customFields: { ...config.customFields, globalFields: [] },
    };

    expect(listUnconfiguredProperties({ id: "iron", rarity: "rare" }, hiddenConfig)).toEqual([]);
  });

  it("detects unconfigured properties and infers definitions", () => {
    const extras = listUnconfiguredProperties({ id: "iron", rating: 5, released: true }, createDefaultTaxonomyConfig());

    expect(extras).toEqual([
      { key: "rating", value: 5, inferredType: "number" },
      { key: "released", value: true, inferredType: "boolean" },
    ]);
    expect(inferPropertyDefinition("rating", 5)).toMatchObject({ id: "rating", type: "number" });
  });

  it("removes and adapts frontmatter properties", () => {
    const raw = "---\nid: iron\nrarity: rare\noldKey: value\n---";

    expect(parseFrontmatterRaw(removeFrontmatterProperty(raw, "rarity"))).not.toHaveProperty("rarity");
    expect(parseFrontmatterRaw(adaptFrontmatterProperty(raw, "oldKey", "newKey"))).toMatchObject({
      id: "iron",
      rarity: "rare",
      newKey: "value",
    });
  });

  it("updates frontmatter fields using configured YAML order", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const raw = [
      "---",
      "id: mara",
      "name: Mara",
      "lore-level: canon",
      "type: character",
      "arc: awakening",
      "status: draft",
      "role: lead",
      "aliases:",
      "  - Mara",
      "affiliation: archive",
      "home: north",
      "---",
    ].join("\n");

    const next = updateFrontmatterProperties(raw, { status: "canon" }, config, "character");
    const keys = Object.keys(parseFrontmatterRaw(next));

    expect(parseFrontmatterRaw(next)).toMatchObject({ status: "canon", role: "lead" });
    expect(keys.slice(0, 8)).toEqual(["type", "status", "aliases", "lore-level", "role", "affiliation", "home", "arc"]);
    expect(keys.slice(-2)).toEqual(["id", "name"]);
  });

  it("creates frontmatter through the same configured serializer", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const raw = createEntityFrontmatter({
      id: "mara",
      name: "Mara",
      type: "character",
      propertiesConfig: config,
    });

    expect(Object.keys(parseFrontmatterRaw(raw))).toEqual(["type", "status", "aliases", "id", "name", "tags"]);
  });

  it("adds child properties without making YAML nested", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withParent = upsertInspectorProperty(
      config,
      {
        id: "magic",
        label: "Magic",
        type: "select",
        options: [{ value: "yes", label: "Yes" }],
      },
      "character",
    );
    const withChild = upsertInspectorProperty(
      withParent,
      {
        id: "power-level",
        label: "Power level",
        type: "number",
        visibleWhen: { magic: ["yes"] },
      },
      "character",
      "magic",
    );

    const magic = listVisibleProperties(withChild, "character").find((property) => property.id === "magic");

    expect(magic?.children?.map((child) => child.id)).toEqual(["power-level"]);
    expect(listUnconfiguredProperties({ magic: "yes", "power-level": 3 }, withChild)).toEqual([]);
    expect(getConfiguredFrontmatterOrder(withChild, "character", ["power-level", "magic"])).toEqual(["magic", "power-level"]);
  });

  it("reorders child properties inside their parent", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withParent = upsertInspectorProperty(config, { id: "magic", label: "Magic", type: "group" }, "character");
    const withFirstChild = upsertInspectorProperty(withParent, { id: "alpha", label: "Alpha", type: "text" }, "character", "magic");
    const withSecondChild = upsertInspectorProperty(withFirstChild, { id: "beta", label: "Beta", type: "text" }, "character", "magic");
    const reordered = reorderInspectorPropertySiblings(withSecondChild, "character", "beta", "alpha");
    const magic = listVisibleProperties(reordered, "character").find((property) => property.id === "magic");

    expect(magic?.children?.map((child) => child.id)).toEqual(["beta", "alpha"]);
  });

  it("removes nested properties from schema visibility and known fields", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withParent = upsertInspectorProperty(config, { id: "magic", label: "Magic", type: "group" }, "character");
    const withChild = upsertInspectorProperty(withParent, { id: "power-level", label: "Power level", type: "number" }, "character", "magic");
    const next = removeInspectorProperty(withChild, "power-level");

    expect(listAllProperties(next).map((property) => property.id)).not.toContain("power-level");
    expect(listUnconfiguredProperties({ "power-level": 3 }, next)).toEqual([
      { key: "power-level", value: 3, inferredType: "number" },
    ]);
  });

  it("builds inspector sections as MAIN plus root-property trays", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withMagic = upsertInspectorProperty(
      config,
      {
        id: "magic",
        label: "Magic",
        type: "select",
        options: [
          { value: "elemental", label: "Elemental" },
          { value: "divine", label: "Divine" },
        ],
      },
      "character",
    );
    const withSchool = upsertInspectorProperty(
      withMagic,
      {
        id: "school",
        label: "School",
        type: "group",
        visibleWhen: { magic: ["elemental"] },
      },
      "character",
      "magic",
    );
    const withTechnique = upsertInspectorProperty(
      withSchool,
      { id: "technique", label: "Technique", type: "text" },
      "character",
      "school",
    );

    const sections = buildInspectorPropertySections(withTechnique, "character", { type: "character", magic: "elemental" });
    const mainSection = sections.find((section) => section.id === "main");
    const magicSection = sections.find((section) => section.id === "root:magic");
    const magic = magicSection?.nodes.find((node) => node.property.id === "magic");

    expect(mainSection?.title).toBe("MAIN");
    expect(mainSection?.nodes.map((node) => node.property.id)).toContain("lore-level");
    expect(magicSection).toMatchObject({ kind: "root", title: "MAGIC", rootId: "magic" });
    expect(magic?.children[0]).toMatchObject({
      property: expect.objectContaining({ id: "school" }),
      parentId: "magic",
      depth: 1,
      conditionActive: true,
      conditionLabel: "Depends on Magic = elemental",
    });
    expect(magic?.children[0].children[0]).toMatchObject({
      property: expect.objectContaining({ id: "technique" }),
      parentId: "school",
      depth: 2,
    });
    expect(getConfiguredFrontmatterOrder(withTechnique, "character", ["technique", "school", "magic"])).toEqual([
      "magic",
      "school",
      "technique",
    ]);
  });

  it("separates Everend structural connectors from main creative properties", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const inspectorSections = buildInspectorPropertySections(config, "item", { type: "item" });
    const schemaSections = buildPropertySchemaSections(config, "item");

    expect(inspectorSections.find((section) => section.id === "main")?.nodes.map((node) => node.property.id)).toEqual([
      "type",
      "status",
      "aliases",
      "lore-level",
    ]);
    expect(inspectorSections.find((section) => section.id === "structure")).toMatchObject({
      kind: "structure",
      title: "STRUCTURE",
    });
    expect(inspectorSections.find((section) => section.id === "structure")?.nodes.map((node) => node.property.id)).toEqual([
      "parentId",
      "childrenIds",
    ]);
    expect(schemaSections.find((section) => section.id === "structure")?.nodes.map((node) => node.property.id)).toEqual([
      "parentId",
      "childrenIds",
    ]);
  });

  it("builds customize schema sections from properties config instead of note values", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withMagic = upsertInspectorProperty(config, { id: "magic", label: "Magic", type: "group" }, "character");
    const withChild = upsertInspectorProperty(withMagic, { id: "power-level", label: "Power Level", type: "number" }, "character", "magic");
    const hiddenForCharacter = setInspectorPropertyVisibility(withChild, "character", "identity", false);

    const sections = buildPropertySchemaSections(hiddenForCharacter, "character");
    const mainSection = sections.find((section) => section.id === "main");
    const magicSection = sections.find((section) => section.id === "root:magic");
    const hiddenSection = sections.find((section) => section.id === "hidden");

    expect(mainSection?.nodes.map((node) => node.property.id)).toContain("lore-level");
    expect(magicSection?.nodes[0].children.map((child) => child.property.id)).toEqual(["power-level"]);
    expect(hiddenSection?.nodes.map((node) => node.property.id)).toContain("identity");
  });

  it("hides inactive conditional trays unless hidden conditional display is requested", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withMagic = upsertInspectorProperty(
      config,
      {
        id: "magic",
        label: "Magic",
        type: "multiselect",
        options: [
          { value: "fire", label: "Fire" },
          { value: "water", label: "Water" },
        ],
      },
      "character",
    );
    const withChild = upsertInspectorProperty(
      withMagic,
      {
        id: "pyromancy",
        label: "Pyromancy",
        type: "text",
        visibleWhen: { magic: ["fire"] },
      },
      "character",
      "magic",
    );

    const inactive = buildInspectorPropertySections(withChild, "character", { magic: ["water"] });
    const active = buildInspectorPropertySections(withChild, "character", { magic: ["water", "fire"] });
    const expanded = buildInspectorPropertySections(withChild, "character", { magic: ["water"] }, { includeInactiveConditions: true });
    const findChild = (sections: ReturnType<typeof buildInspectorPropertySections>) =>
      sections.flatMap((section) => section.nodes).find((node) => node.property.id === "magic")?.children.map((child) => child.property.id) ?? [];

    expect(findChild(inactive)).not.toContain("pyromancy");
    expect(findChild(active)).toContain("pyromancy");
    expect(findChild(expanded)).toContain("pyromancy");
  });

  it("blocks invalid tree moves that would create cycles", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withMagic = upsertInspectorProperty(config, { id: "magic", label: "Magic", type: "group" }, "character");
    const withSchool = upsertInspectorProperty(withMagic, { id: "school", label: "School", type: "group" }, "character", "magic");
    const withTechnique = upsertInspectorProperty(withSchool, { id: "technique", label: "Technique", type: "text" }, "character", "school");

    expect(moveInspectorProperty(withTechnique, "character", "magic", "technique")).toBe(withTechnique);
  });

  it("syncs hidden child properties without duplicating them in hidden tree output", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withMagic = upsertInspectorProperty(config, { id: "magic", label: "Magic", type: "group" }, "character");
    const withTechnique = upsertInspectorProperty(withMagic, { id: "technique", label: "Technique", type: "text" }, "character", "magic");
    const hidden = setInspectorPropertyVisibility(withTechnique, "character", "technique", false);

    const defaultSections = buildInspectorPropertySections(hidden, "character");
    const expandedSections = buildInspectorPropertySections(hidden, "character", {}, { includeHidden: true });
    const defaultMagic = defaultSections.flatMap((section) => section.nodes).find((node) => node.property.id === "magic");
    const expandedIds = expandedSections.flatMap((section) => section.nodes).flatMap((node) => [
      node.property.id,
      ...node.children.map((child) => child.property.id),
    ]);

    expect(defaultMagic?.children.map((child) => child.property.id)).not.toContain("technique");
    expect(expandedIds.filter((id) => id === "technique")).toHaveLength(1);
    expect(hidden.entityTypes.definitions.find((definition) => definition.id === "character")?.hiddenProperties).toContain("technique");
  });

  it("moves properties between root and group without changing frontmatter values", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const withGroup = upsertInspectorProperty(config, { id: "magic", label: "Magic", type: "group" }, "character");
    const withPower = upsertInspectorProperty(withGroup, { id: "power-level", label: "Power level", type: "number" }, "character");
    const movedIntoGroup = moveInspectorProperty(withPower, "character", "power-level", "magic");
    const magic = listAllProperties(movedIntoGroup).find((property) => property.id === "magic");

    expect(magic?.children?.map((child) => child.id)).toEqual(["power-level"]);
    expect(listUnconfiguredProperties({ "power-level": 8 }, movedIntoGroup)).toEqual([]);

    const movedToRoot = moveInspectorProperty(movedIntoGroup, "character", "power-level", null);
    const rootPower = movedToRoot.customFields.definitions.find((property) => property.id === "power-level");

    expect(rootPower?.id).toBe("power-level");
    expect(listAllProperties(movedToRoot).find((property) => property.id === "magic")?.children ?? []).toEqual([]);
  });

  it("hides and shows properties for the active entity type", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const hidden = setInspectorPropertyVisibility(config, "character", "role", false);

    const hiddenIdentity = buildInspectorPropertySections(hidden, "character", { type: "character" })
      .find((section) => section.id === "root:identity")
      ?.nodes[0];

    expect(hiddenIdentity?.children.map((child) => child.property.id)).not.toContain("role");

    const shown = setInspectorPropertyVisibility(hidden, "character", "role", true);
    const shownIdentity = buildInspectorPropertySections(shown, "character", { type: "character" })
      .find((section) => section.id === "root:identity")
      ?.nodes[0];

    expect(shownIdentity?.children.map((child) => child.property.id)).toContain("role");
  });

  it("can hide global properties only for the active entity type", () => {
    const config = applyPropertyTemplate(createDefaultTaxonomyConfig(), WORLDBUILDING_TEMPLATE);
    const hidden = setInspectorPropertyVisibility(config, "character", "status", false);

    expect(listVisibleProperties(hidden, "character").map((property) => property.id)).not.toContain("status");
    expect(listVisibleProperties(hidden, "item").map((property) => property.id)).toContain("status");
  });

  it("returns an empty object for malformed frontmatter instead of throwing", () => {
    expect(parseFrontmatterRaw("---\nid: iron\nlore-level: semi-canon\nc\n---")).toEqual({});
  });
});
