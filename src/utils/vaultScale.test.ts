import { describe, expect, it } from "vitest";
import type { VaultFile } from "../domain";
import { DEFAULT_GRAPH_SETTINGS } from "../editorTypes";
import { indexMarkdownEntities } from "./entityIndex";
import { buildTree } from "./treeBuilder";
import { buildGraphData } from "./graphData";
import { flattenVisibleExplorerTree, selectVisibleTree } from "./explorerSelectors";
import { resolveWikilinkInIndex } from "./wikilinkResolver";
import { makeVaultIndex } from "../test/fixtures";

/**
 * Tests de escala: ejercitan los caminos calientes de la apertura de un
 * universo con un vault sintético de 1,000 notas enlazadas entre sí.
 *
 * Los umbrales son deliberadamente holgados (una máquina de CI fría y
 * saturada debe pasarlos): no miden micro-rendimiento, atrapan regresiones
 * de complejidad (un O(n²) accidental sobre 1,000 notas los revienta).
 */

const NOTE_COUNT = 1000;
const TYPES = ["character", "location", "item", "concept", "organization"] as const;

function syntheticVaultFiles(count: number): VaultFile[] {
  const files: VaultFile[] = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[i % TYPES.length];
    const folder = `${type.charAt(0).toUpperCase()}${type.slice(1)}s`;
    const name = `Entity ${i}`;
    const relativePath = `${folder}/Entity-${i}.md`;
    const links = Array.from(
      { length: 5 },
      (_, k) => `[[Entity ${(i + 1 + k * 37) % count}]]`,
    ).join(" and ");
    const content = [
      "---",
      `id: entity-${i}`,
      `type: ${type}`,
      `name: ${name}`,
      "status: draft",
      `tags: [arc-${i % 20}]`,
      "aliases: []",
      "---",
      "",
      `# ${name}`,
      "",
      `Connected to ${links}.`,
      "",
    ].join("\n");
    files.push({
      relativePath,
      absolutePath: `/vault/${relativePath}`,
      content,
      modifiedMs: 0,
    });
  }
  return files;
}

function timed<T>(label: string, budgetMs: number, run: () => T): T {
  const start = performance.now();
  const result = run();
  const elapsed = performance.now() - start;
  console.info(`[vaultScale] ${label}: ${Math.round(elapsed)}ms (budget ${budgetMs}ms)`);
  expect(
    elapsed,
    `${label} exceeded its ${budgetMs}ms budget (took ${Math.round(elapsed)}ms)`,
  ).toBeLessThan(budgetMs);
  return result;
}

describe(`vault sintético de ${NOTE_COUNT} notas`, () => {
  const files = syntheticVaultFiles(NOTE_COUNT);

  it("indexa entidades, wikilinks y backlinks dentro de presupuesto", () => {
    const { entities } = timed("indexMarkdownEntities", 5000, () => indexMarkdownEntities(files));
    expect(entities).toHaveLength(NOTE_COUNT);
    expect(entities[0].wikilinks.length).toBeGreaterThan(0);
    const withBacklinks = entities.filter((entity) => entity.backlinks.length > 0);
    expect(withBacklinks.length).toBeGreaterThan(0);
  });

  it("construye el árbol del explorer y sus filas visibles dentro de presupuesto", () => {
    const tree = timed("buildTree", 1500, () => buildTree(files));
    expect(tree.length).toBeGreaterThan(0);

    const { entities } = indexMarkdownEntities(files);
    const index = makeVaultIndex({
      entities,
      files,
      markdownFiles: files,
      tree,
      directories: TYPES.map((type) => `${type.charAt(0).toUpperCase()}${type.slice(1)}s`),
    });

    const allExpanded = new Set(index.directories);
    const rows = timed("selectVisibleTree + flatten (todo expandido)", 1500, () =>
      flattenVisibleExplorerTree(selectVisibleTree(index, "", false), allExpanded),
    );
    expect(rows.length).toBeGreaterThan(TYPES.length);

    timed("selectVisibleTree con búsqueda", 1500, () =>
      flattenVisibleExplorerTree(selectVisibleTree(index, "Entity 5", false), allExpanded),
    );
  });

  it("construye el grafo completo dentro de presupuesto", () => {
    const { entities } = indexMarkdownEntities(files);
    const index = makeVaultIndex({ entities, files, markdownFiles: files });

    const graph = timed("buildGraphData", 4000, () =>
      buildGraphData(index, DEFAULT_GRAPH_SETTINGS),
    );
    expect(graph.nodes.length).toBeGreaterThanOrEqual(NOTE_COUNT);
    expect(graph.links.length).toBeGreaterThan(0);
  });

  it("resuelve wikilinks repetidamente dentro de presupuesto", () => {
    const { entities } = indexMarkdownEntities(files);
    const index = makeVaultIndex({ entities, files, markdownFiles: files });

    timed("resolveWikilinkInIndex x300", 2000, () => {
      for (let i = 0; i < 300; i++) {
        const resolved = resolveWikilinkInIndex(index, `Entity ${(i * 13) % NOTE_COUNT}`);
        expect(resolved.status).toBe("resolved");
      }
    });
  });
});
