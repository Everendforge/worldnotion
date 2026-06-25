import { describe, expect, it } from "vitest";
import type { ValidationFinding, VaultFile } from "../domain";
import { parsePropertiesConfig, parseTaxonomyConfig, parseTemplates, parseUniverseProfile } from "./vaultMetadata";

describe("vault metadata parsers", () => {
  it("parses Markdown templates from .everend/templates", () => {
    const templates = parseTemplates([
      { relativePath: ".everend/templates/location.md", content: "location", modifiedMs: 2 },
      { relativePath: ".everend/templates/character.md", content: "character", modifiedMs: 1 },
      { relativePath: ".everend/templates/readme.txt", content: "ignore" },
      { relativePath: "Notes/character.md", content: "ignore" },
    ]);

    expect(templates).toEqual([
      { type: "character", path: ".everend/templates/character.md", content: "character", modifiedMs: 1 },
      { type: "location", path: ".everend/templates/location.md", content: "location", modifiedMs: 2 },
    ]);
  });

  it("parses and normalizes universe profile JSON", () => {
    const findings: ValidationFinding[] = [];
    const profile = parseUniverseProfile(
      [{ relativePath: ".everend/universe.json", content: '{"name":"  Demo  ","icon":{"type":"unknown","value":"castle"}}' }],
      findings,
    );

    expect(profile).toEqual({ name: "Demo", icon: { type: "preset", value: "castle" } });
    expect(findings).toEqual([]);
  });

  it("reports invalid universe profile JSON", () => {
    const findings: ValidationFinding[] = [];

    expect(parseUniverseProfile([{ relativePath: ".everend/universe.json", content: "{" }], findings)).toBeUndefined();
    expect(findings).toEqual([
      expect.objectContaining({
        code: "missing_runtime_asset",
        message: "Universe profile must be valid JSON.",
        file: ".everend/universe.json",
      }),
    ]);
  });

  it("parses taxonomy config JSON and reports malformed configs", () => {
    const valid: VaultFile = {
      relativePath: ".everend/taxonomy.json",
      content: JSON.stringify({
        version: "1.0",
        tags: { rootNodes: [], allowCustomTags: true, autoDetectSlashNotation: true },
        entityTypes: { definitions: [], defaultType: "concept", allowCustomTypes: true },
        statuses: { definitions: [], defaultStatus: "draft", allowCustomStatuses: true },
        customFields: { definitions: [] },
      }),
    };
    const findings: ValidationFinding[] = [];

    expect(parseTaxonomyConfig([valid], findings)?.version).toBe("1.0");
    expect(findings).toEqual([]);

    const badFindings: ValidationFinding[] = [];
    expect(
      parseTaxonomyConfig([{ relativePath: ".everend/taxonomy.json", content: '{"version":"1.0"}' }], badFindings),
    ).toBeUndefined();
    expect(badFindings).toEqual([
      expect.objectContaining({
        code: "missing_runtime_asset",
        message: "Taxonomy config is missing required fields.",
      }),
    ]);
  });

  it("parses properties config JSON from .everend/properties.json", () => {
    const valid: VaultFile = {
      relativePath: ".everend/properties.json",
      content: JSON.stringify({
        version: "1.0",
        tags: { rootNodes: [], allowCustomTags: true, autoDetectSlashNotation: true },
        entityTypes: { definitions: [], defaultType: "concept", allowCustomTypes: true },
        statuses: { definitions: [], defaultStatus: "draft", allowCustomStatuses: true },
        customFields: { definitions: [], globalFields: [] },
      }),
    };
    const findings: ValidationFinding[] = [];

    expect(parsePropertiesConfig([valid], findings)?.version).toBe("1.0");
    expect(findings).toEqual([]);
  });
});
