import { describe, expect, it } from "vitest";
import { createDefaultTaxonomyConfig } from "../domain";
import { applyPropertyTemplate, WORLDBUILDING_TEMPLATE } from "./propertyTemplates";
import {
  adaptFrontmatterProperty,
  addPropertyToConfig,
  inferPropertyDefinition,
  listUnconfiguredProperties,
  listVisibleProperties,
  parseFrontmatterRaw,
  removeFrontmatterProperty,
} from "./propertiesConfig";

describe("propertiesConfig", () => {
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

  it("returns an empty object for malformed frontmatter instead of throwing", () => {
    expect(parseFrontmatterRaw("---\nid: iron\nlore-level: semi-canon\nc\n---")).toEqual({});
  });
});
