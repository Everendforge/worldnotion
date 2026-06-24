import { describe, expect, it } from "vitest";
import type { Entity, VaultIndex } from "../domain";
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from "../editorTypes";
import { buildGraphData } from "./graphData";

function vaultIndex(files: Array<{ path: string; content: string }>, entities: Entity[] = []): VaultIndex {
  return {
    rootPath: "/Universe",
    files: files.map((file) => ({ relativePath: file.path, content: file.content, modifiedMs: 1 })),
    directories: [],
    markdownFiles: files.map((file) => ({ relativePath: file.path, content: file.content, modifiedMs: 1 })),
    templates: [],
    universes: [],
    tree: [],
    entities,
    findings: [],
    readErrors: [],
    typeCounts: {},
  };
}

function entity(path: string, patch: Partial<Entity> = {}): Entity {
  return {
    id: patch.id ?? path.replace(/\.md$/, "").toLowerCase(),
    type: patch.type ?? "concept",
    name: patch.name ?? path.replace(/\.md$/, ""),
    status: "draft",
    tags: patch.tags ?? [],
    aliases: patch.aliases ?? [],
    childrenIds: patch.childrenIds ?? [],
    customProperties: {},
    body: "",
    path,
    file: { relativePath: path, content: "", modifiedMs: 1 },
    wikilinks: [],
    backlinks: [],
    ...patch,
  };
}

function settings(patch: Partial<GraphSettings> = {}): GraphSettings {
  return { ...DEFAULT_GRAPH_SETTINGS, ...patch };
}

describe("buildGraphData", () => {
  it("builds nodes from markdown files without frontmatter", () => {
    const graph = buildGraphData(vaultIndex([{ path: "Notes/Alo.md", content: "Plain note" }]), settings());

    expect(graph.nodes).toMatchObject([{ id: "Notes/Alo.md", label: "Alo", type: "note", kind: "note" }]);
  });

  it("enriches note nodes with entity metadata", () => {
    const graph = buildGraphData(
      vaultIndex([{ path: "Characters/Mara.md", content: "[[Alo]]" }], [
        entity("Characters/Mara.md", { id: "mara-voss", name: "Mara Voss", type: "character", tags: ["crew"], aliases: ["Captain Mara"] }),
      ]),
      settings(),
    );

    expect(graph.nodes[0]).toMatchObject({
      id: "Characters/Mara.md",
      label: "Mara Voss",
      type: "character",
      tags: ["crew"],
      aliases: ["Captain Mara"],
    });
  });

  it("resolves wikilinks by basename, name, alias and id", () => {
    const index = vaultIndex(
      [
        { path: "A.md", content: "[[B]] [[Real C]] [[Alias D]] [[entity-e]]" },
        { path: "B.md", content: "" },
        { path: "C.md", content: "" },
        { path: "D.md", content: "" },
        { path: "E.md", content: "" },
      ],
      [
        entity("C.md", { name: "Real C" }),
        entity("D.md", { aliases: ["Alias D"] }),
        entity("E.md", { id: "entity-e" }),
      ],
    );

    const graph = buildGraphData(index, settings());

    expect(graph.links.map((link) => [link.source, link.target])).toEqual([
      ["A.md", "B.md"],
      ["A.md", "C.md"],
      ["A.md", "D.md"],
      ["A.md", "E.md"],
    ]);
  });

  it("creates unresolved nodes when existing files only is disabled", () => {
    const graph = buildGraphData(
      vaultIndex([{ path: "A.md", content: "[[Missing Note]]" }]),
      settings({ existingFilesOnly: false }),
    );

    expect(graph.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "unresolved:missing note", kind: "unresolved", label: "Missing Note" })]),
    );
    expect(graph.links).toEqual([expect.objectContaining({ source: "A.md", target: "unresolved:missing note" })]);
  });

  it("filters orphans when disabled", () => {
    const graph = buildGraphData(
      vaultIndex([
        { path: "A.md", content: "[[B]]" },
        { path: "B.md", content: "" },
        { path: "Orphan.md", content: "" },
      ]),
      settings({ showOrphans: false }),
    );

    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["A.md", "B.md"]);
  });

  it("limits local graph by active note and depth", () => {
    const graph = buildGraphData(
      vaultIndex([
        { path: "A.md", content: "[[B]]" },
        { path: "B.md", content: "[[C]]" },
        { path: "C.md", content: "[[D]]" },
        { path: "D.md", content: "" },
      ]),
      settings({ mode: "local", depth: 1 }),
      "B.md",
    );

    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["A.md", "B.md", "C.md"]);
  });
});
