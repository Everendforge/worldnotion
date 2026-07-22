import { describe, expect, it } from "vitest";
import type { OpenTab } from "../editorTypes";
import type { Entity, VaultIndex } from "../domain";
import { selectLiveEntity } from "./liveEntity";

function entity(overrides: Partial<Entity> = {}): Entity {
  const path = overrides.path ?? "Characters/Ada.md";
  return {
    id: "ada",
    type: "character",
    name: "Ada",
    status: "draft",
    tags: ["cast/old"],
    aliases: ["Archivist"],
    parentId: undefined,
    childrenIds: [],
    customProperties: { rank: "junior" },
    body: "Indexed body",
    path,
    file: { relativePath: path, content: "" },
    wikilinks: [],
    backlinks: [],
    ...overrides,
  };
}

function index(entities: Entity[]): VaultIndex {
  return {
    rootPath: "Demo",
    files: [],
    directories: [],
    markdownFiles: [],
    templates: [],
    universes: [],
    tree: [],
    entities,
    findings: [],
    readErrors: [],
    typeCounts: {},
  };
}

function tab(path: string, rawMarkdown: string): OpenTab {
  return {
    path,
    title: path,
    dirty: true,
    mode: "write",
    writingMode: "processed",
    isTemplate: false,
    rawMarkdown,
    savedMarkdown: "",
  };
}

describe("live entity selector", () => {
  it("returns the indexed entity when no active tab matches", () => {
    const indexed = entity();

    expect(selectLiveEntity(index([indexed]), indexed.path, [])).toBe(indexed);
    expect(selectLiveEntity(index([indexed]), "Missing.md", [])).toBeUndefined();
  });

  it("projects unsaved frontmatter and body changes onto the indexed entity", () => {
    const indexed = entity();
    const live = selectLiveEntity(index([indexed]), indexed.path, [
      tab(
        indexed.path,
        [
          "---",
          "id: ada-live",
          "type: protagonist",
          "name: Ada Live",
          "status: canon",
          "tags: [cast/main, featured]",
          "aliases: [A, 42]",
          "rank: senior",
          "featured: true",
          "---",
          "",
          "Unsaved body",
        ].join("\n"),
      ),
    ]);

    expect(live).toMatchObject({
      id: "ada-live",
      type: "protagonist",
      name: "Ada Live",
      status: "canon",
      tags: ["cast/main", "featured"],
      aliases: ["A", "42"],
      customProperties: { rank: "senior", featured: true },
      body: "\nUnsaved body",
    });
    expect(live?.path).toBe(indexed.path);
    expect(live?.file).toBe(indexed.file);
  });

  it("falls back to indexed fields when live frontmatter omits base values", () => {
    const indexed = entity();
    const live = selectLiveEntity(index([indexed]), indexed.path, [
      tab(indexed.path, "---\nrank: senior\n---\n\nBody"),
    ]);

    expect(live).toMatchObject({
      id: indexed.id,
      type: indexed.type,
      name: indexed.name,
      status: indexed.status,
      tags: indexed.tags,
      aliases: indexed.aliases,
      customProperties: { rank: "senior" },
    });
  });

  it("builds a temporary live entity from an open tab that is not indexed yet", () => {
    const live = selectLiveEntity(index([]), "Loose Note.md", [
      tab(
        "Loose Note.md",
        [
          "---",
          "type: item",
          "name: Loose Artifact",
          "status: canon",
          "folder: Items",
          "rarity: rare",
          "---",
          "",
          "Mentions [[Other Note]].",
        ].join("\n"),
      ),
    ]);

    expect(live).toMatchObject({
      id: "loose-note",
      type: "item",
      name: "Loose Artifact",
      status: "canon",
      folder: "Items",
      customProperties: { rarity: "rare" },
      wikilinks: ["Other Note"],
      path: "Loose Note.md",
    });
  });

  it("returns the indexed entity when live frontmatter cannot be parsed", () => {
    const indexed = entity();

    expect(
      selectLiveEntity(index([indexed]), indexed.path, [tab(indexed.path, "---\nid: broken")]),
    ).toBe(indexed);
  });
});
