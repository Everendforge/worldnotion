import type { TaxonomyConfig } from "../editorTypes";
import type { Entity, ValidationFinding, VaultFile } from "../domain";
import { validateAgainstTaxonomy } from "./taxonomyValidation";
import {
  extractWikilinks,
  normalizeMarkdownKey,
  parseMarkdownFrontmatter,
  type ParsedMarkdown,
} from "./markdownFrontmatter";

const REQUIRED_FIELDS = ["id", "type", "name"] as const;
const BASE_ENTITY_FIELDS = new Set([
  "id",
  "type",
  "name",
]);

export type EntityIndexResult = {
  entities: Entity[];
  findings: ValidationFinding[];
  typeCounts: Record<string, number>;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function basenameWithoutExtension(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.[^.]+$/, "");
}

function normalizeKey(value: string): string {
  return normalizeMarkdownKey(value);
}

function createFinding(
  code: ValidationFinding["code"],
  severity: ValidationFinding["severity"],
  message: string,
  file?: string,
  field?: string,
): ValidationFinding {
  return { code, severity, message, file, field };
}

function entityFromMarkdown(file: VaultFile, parsed: ParsedMarkdown): Entity {
  const id = asString(parsed.data.id) || `missing-id:${file.relativePath}`;
  const type = asString(parsed.data.type) || "unknown";
  const name = asString(parsed.data.name) || basenameWithoutExtension(file.relativePath);
  const status = asString(parsed.data.status) || "unknown";
  const customProperties = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => !BASE_ENTITY_FIELDS.has(key)),
  );

  return {
    id,
    type,
    name,
    status,
    tags: toStringArray(parsed.data.tags),
    aliases: toStringArray(parsed.data.aliases),
    parentId: asString(parsed.data.parentId) || undefined,
    childrenIds: toStringArray(parsed.data.childrenIds),
    folder: asString(parsed.data.folder) || undefined,
    customProperties,
    body: parsed.content.trim(),
    path: file.relativePath,
    file,
    wikilinks: extractWikilinks(parsed.content),
    backlinks: [],
  };
}

export function indexMarkdownEntities(
  markdownFiles: VaultFile[],
  taxonomyConfig?: TaxonomyConfig,
): EntityIndexResult {
  const entities: Entity[] = [];
  const findings: ValidationFinding[] = [];
  const ids = new Map<string, Entity[]>();

  for (const file of markdownFiles) {
    if (file.relativePath.endsWith("README.md")) {
      continue;
    }

    if (!file.content.startsWith("---")) {
      findings.push(
        createFinding(
          "missing_frontmatter",
          "error",
          "Markdown entity is missing YAML frontmatter.",
          file.relativePath,
        ),
      );
      continue;
    }

    let parsed: ParsedMarkdown;
    try {
      parsed = parseMarkdownFrontmatter(file.content);
    } catch (error) {
      findings.push(
        createFinding(
          "missing_frontmatter",
          "error",
          `Could not parse frontmatter: ${error instanceof Error ? error.message : String(error)}`,
          file.relativePath,
        ),
      );
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!parsed.data[field]) {
        findings.push(
          createFinding(
            "missing_required_field",
            "error",
            `Entity is missing required field ${field}.`,
            file.relativePath,
            field,
          ),
        );
      }
    }

    const entity = entityFromMarkdown(file, parsed);
    entities.push(entity);
    ids.set(entity.id, [...(ids.get(entity.id) ?? []), entity]);

    if (taxonomyConfig) {
      findings.push(...validateAgainstTaxonomy(entity, taxonomyConfig, file.relativePath));
    }
  }

  for (const [id, matchingEntities] of ids.entries()) {
    if (matchingEntities.length > 1) {
      matchingEntities.forEach((entity) =>
        findings.push(createFinding("duplicate_id", "error", `Duplicate entity id "${id}".`, entity.path, "id")),
      );
    }
  }

  const linkTargets = new Map<string, Entity>();
  entities.forEach((entity) => {
    linkTargets.set(normalizeKey(entity.id), entity);
    linkTargets.set(normalizeKey(entity.name), entity);
    linkTargets.set(normalizeKey(basenameWithoutExtension(entity.path)), entity);
    entity.aliases.forEach((alias) => linkTargets.set(normalizeKey(alias), entity));
  });

  entities.forEach((source) => {
    source.wikilinks.forEach((wikilink) => {
      const target = linkTargets.get(normalizeKey(wikilink));
      if (!target) {
        findings.push(
          createFinding("broken_wikilink", "warning", `Could not resolve wikilink [[${wikilink}]].`, source.path),
        );
        return;
      }

      target.backlinks.push(source.id);
    });
  });

  entities.forEach((entity) => {
    const missingParent = entity.parentId && !ids.has(entity.parentId);
    if (missingParent) {
      findings.push(
        createFinding(
          "missing_canon_ref",
          "warning",
          `Parent entity "${entity.parentId}" was not found.`,
          entity.path,
          "parentId",
        ),
      );
    }

    entity.childrenIds.forEach((childId) => {
      if (!ids.has(childId)) {
        findings.push(
          createFinding(
            "missing_canon_ref",
            "warning",
            `Child entity "${childId}" was not found.`,
            entity.path,
            "childrenIds",
          ),
        );
      }
    });
  });

  const typeCounts = entities.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.type] = (counts[entity.type] ?? 0) + 1;
    return counts;
  }, {});

  entities.sort((a, b) => a.name.localeCompare(b.name));

  return { entities, findings, typeCounts };
}
