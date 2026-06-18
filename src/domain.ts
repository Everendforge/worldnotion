import YAML from "yaml";

export type VaultFile = {
  relativePath: string;
  absolutePath?: string;
  content: string;
  modifiedMs?: number | null;
};

export type VaultReadError = {
  relativePath: string;
  message: string;
};

export type VaultReadResult = {
  rootPath: string;
  files: VaultFile[];
  errors: VaultReadError[];
};

export type TaxonomyProperty = {
  type: string;
  label?: string;
  description?: string;
  options?: string[];
  targetTypes?: string[];
  required?: boolean;
};

export type TaxonomyType = {
  label: string;
  description?: string;
  properties?: Record<string, TaxonomyProperty>;
};

export type Taxonomy = {
  specVersion?: string;
  types: Record<string, TaxonomyType>;
};

export type ValidationFinding = {
  code:
    | "missing_frontmatter"
    | "missing_required_field"
    | "duplicate_id"
    | "broken_wikilink"
    | "missing_canon_ref"
    | "broken_graph_transition"
    | "missing_runtime_asset"
    | "save_conflict";
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  field?: string;
  nodeId?: string;
  suggestion?: string;
};

export type Entity = {
  id: string;
  type: string;
  name: string;
  status: string;
  tags: string[];
  aliases: string[];
  parentId?: string;
  childrenIds: string[];
  customProperties: Record<string, unknown>;
  body: string;
  path: string;
  file: VaultFile;
  wikilinks: string[];
  backlinks: string[];
};

export type VaultIndex = {
  rootPath: string;
  files: VaultFile[];
  markdownFiles: VaultFile[];
  taxonomy?: Taxonomy;
  templates: EntityTemplate[];
  universes: Universe[];
  tree: VaultTreeNode[];
  entities: Entity[];
  findings: ValidationFinding[];
  readErrors: VaultReadError[];
  typeCounts: Record<string, number>;
};

export type Universe = {
  name: string;
  relativePath: string;
  entityCount: number;
};

export type VaultTreeNode = {
  name: string;
  path: string;
  kind: "folder" | "file";
  children: VaultTreeNode[];
  hasDescription?: boolean;
};

export type EntityTemplate = {
  type: string;
  path: string;
  content: string;
  modifiedMs?: number | null;
};

export type EditorDocument = {
  path: string;
  absolutePath?: string;
  content: string;
  savedContent: string;
  modifiedMs?: number | null;
  dirty: boolean;
  mode: "entity" | "template" | "taxonomy" | "file";
};

export type WriteResult = {
  ok: boolean;
  path: string;
  modifiedMs?: number | null;
  message?: string | null;
};

export type ThemeManifest = {
  name: string;
  relativePath: string;
  absolutePath: string;
  content: string;
  kind: "css" | "json";
};

export const STARTER_TAXONOMY: Taxonomy = {
  specVersion: "0.1",
  types: {
    character: { label: "Character", description: "Person, creature, or viewpoint actor." },
    location: { label: "Location", description: "Place, region, settlement, or site." },
    organization: { label: "Organization", description: "Faction, institution, house, or guild." },
    event: { label: "Event", description: "Canon event or historical beat." },
    concept: { label: "Concept", description: "Idea, law, magic rule, or abstract note." },
    item: { label: "Item", description: "Object, relic, tool, or artifact." },
    world: { label: "World", description: "Top-level world entity." },
    cycle: { label: "Cycle", description: "Era, cycle, age, or repeated chronology." },
    universe: { label: "Universe", description: "Universe-level project container." },
    story: { label: "Story", description: "Narrative container." },
    arc: { label: "Arc", description: "Narrative arc." },
    scene: { label: "Scene", description: "Planning scene, not a runtime node." },
    quest: { label: "Quest", description: "Quest or objective chain." },
  },
};

export const PROPERTY_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "multiSelect",
  "entityRef",
  "entityRefList",
] as const;

const REQUIRED_FIELDS = ["id", "type", "name", "status"] as const;
const BASE_ENTITY_FIELDS = new Set([
  "id",
  "type",
  "name",
  "status",
  "tags",
  "aliases",
  "parentId",
  "childrenIds",
]);
const ALLOWED_PROPERTY_TYPES = new Set([
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "multiSelect",
  "entityRef",
  "entityRefList",
]);

type ParsedMarkdown = {
  data: Record<string, unknown>;
  content: string;
};

export type SplitMarkdown = {
  frontmatterRaw: string;
  bodyMarkdown: string;
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

export function dirname(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function isHiddenMetadata(path: string): boolean {
  return path.startsWith(".everend/");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function extractWikilinks(body: string): string[] {
  const links = new Set<string>();
  const linkPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(body)) !== null) {
    const target = match[1]?.trim();
    if (target) {
      links.add(target);
    }
  }

  return Array.from(links);
}

export function parseMarkdownFrontmatter(content: string): ParsedMarkdown {
  if (!content.startsWith("---")) {
    throw new Error("Missing YAML frontmatter fence.");
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const closingFence = normalized.indexOf("\n---", 3);
  if (closingFence === -1) {
    throw new Error("Unterminated YAML frontmatter fence.");
  }

  const yaml = normalized.slice(3, closingFence).trim();
  const bodyStart = normalized.indexOf("\n", closingFence + 4);
  const body = bodyStart === -1 ? "" : normalized.slice(bodyStart + 1);
  const data = YAML.parse(yaml) as Record<string, unknown> | null;

  return {
    data: data ?? {},
    content: body,
  };
}

export function splitMarkdown(content: string): SplitMarkdown {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatterRaw: "", bodyMarkdown: normalized };
  }
  const closingFence = normalized.indexOf("\n---", 4);
  if (closingFence === -1) {
    return { frontmatterRaw: "", bodyMarkdown: normalized };
  }
  const frontmatterRaw = normalized.slice(0, closingFence + 4).trim();
  const bodyStart = normalized.indexOf("\n", closingFence + 4);
  const bodyMarkdown = bodyStart === -1 ? "" : normalized.slice(bodyStart + 1);
  return { frontmatterRaw, bodyMarkdown };
}

export function joinMarkdown(frontmatterRaw: string, bodyMarkdown: string): string {
  const frontmatter = frontmatterRaw.trim();
  const body = bodyMarkdown.replace(/^\n+/, "");
  return frontmatter ? `${frontmatter}\n\n${body}` : body;
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

function parseTemplates(files: VaultFile[]): EntityTemplate[] {
  return files
    .filter((file) => file.relativePath.startsWith(".everend/templates/"))
    .filter((file) => file.relativePath.endsWith(".md"))
    .map((file) => ({
      type: basenameWithoutExtension(file.relativePath),
      path: file.relativePath,
      content: file.content,
      modifiedMs: file.modifiedMs,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

export function buildTree(files: VaultFile[], includeHiddenMetadata = false): VaultTreeNode[] {
  const roots: VaultTreeNode[] = [];
  const folders = new Map<string, VaultTreeNode>();
  
  // Build set of folder description file paths to exclude from tree
  // A folder description is {FolderName}.md at the same level as {FolderName}/ folder
  const descriptionFiles = new Set<string>();
  const folderPaths = new Set<string>();
  
  // First pass: collect all folder paths
  files.forEach((file) => {
    const parentPath = dirname(file.relativePath);
    if (parentPath) {
      folderPaths.add(parentPath);
      // Also add all ancestor folders
      let current = parentPath;
      while (current) {
        folderPaths.add(current);
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
  });
  
  // Second pass: identify description files
  files.forEach((file) => {
    if (!includeHiddenMetadata && isHiddenMetadata(file.relativePath)) return;
    
    const parentPath = dirname(file.relativePath);
    const fileName = file.relativePath.split("/").pop() ?? "";
    
    // Check if this is a folder description file
    // Example: Characters.md is a description for Characters/ folder
    if (fileName.endsWith(".md")) {
      const folderName = fileName.replace(/\.md$/, "");
      const potentialFolderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      
      if (folderPaths.has(potentialFolderPath)) {
        descriptionFiles.add(file.relativePath);
      }
    }
  });

  function ensureFolder(folderPath: string): VaultTreeNode {
    const existing = folders.get(folderPath);
    if (existing) {
      return existing;
    }

    const name = folderPath.split("/").pop() ?? folderPath;
    const node: VaultTreeNode = { name, path: folderPath, kind: "folder", children: [] };
    folders.set(folderPath, node);
    const parentPath = dirname(folderPath);
    if (parentPath) {
      ensureFolder(parentPath).children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  }

  files
    .filter((file) => (includeHiddenMetadata || !isHiddenMetadata(file.relativePath)) && !descriptionFiles.has(file.relativePath))
    .forEach((file) => {
      const parentPath = dirname(file.relativePath);
      const node: VaultTreeNode = {
        name: file.relativePath.split("/").pop() ?? file.relativePath,
        path: file.relativePath,
        kind: "file",
        children: [],
      };
      if (parentPath) {
        ensureFolder(parentPath).children.push(node);
      } else {
        roots.push(node);
      }
    });
  
  // Mark folders that have description files
  folders.forEach((folder) => {
    const folderName = folder.name;
    const parentPath = dirname(folder.path);
    const expectedDescPath = parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
    if (descriptionFiles.has(expectedDescPath)) {
      folder.hasDescription = true;
    }
  });

  function sort(nodes: VaultTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
  }
  sort(roots);
  return roots;
}

function detectUniverses(files: VaultFile[], entities: Entity[]): Universe[] {
  const rootFolders = new Set<string>();
  files
    .filter((file) => !isHiddenMetadata(file.relativePath))
    .forEach((file) => {
      const [first] = file.relativePath.split("/");
      if (first && first !== file.relativePath) {
        rootFolders.add(first);
      }
    });

  entities.forEach((entity) => {
    const [first] = entity.path.split("/");
    if (first && first !== entity.path) {
      rootFolders.add(first);
    }
  });

  return Array.from(rootFolders)
    .sort((a, b) => a.localeCompare(b))
    .map((folder) => ({
      name: folder,
      relativePath: folder,
      entityCount: entities.filter((entity) => entity.path.startsWith(`${folder}/`)).length,
    }));
}

function parseTaxonomy(files: VaultFile[], findings: ValidationFinding[]): Taxonomy | undefined {
  const taxonomyFile = files.find((file) => file.relativePath === ".everend/taxonomy.yaml");
  if (!taxonomyFile) {
    return undefined;
  }

  try {
    const parsed = YAML.parse(taxonomyFile.content) as Taxonomy | null;
    if (!parsed || typeof parsed !== "object") {
      findings.push(
        createFinding(
          "missing_required_field",
          "error",
          "Taxonomy manifest must contain a YAML object.",
          taxonomyFile.relativePath,
        ),
      );
      return undefined;
    }

    if (parsed.specVersion !== "0.1") {
      findings.push(
        createFinding(
          "missing_required_field",
          "error",
          'Taxonomy manifest must use specVersion "0.1".',
          taxonomyFile.relativePath,
          "specVersion",
        ),
      );
    }

    if (!parsed.types || typeof parsed.types !== "object") {
      findings.push(
        createFinding(
          "missing_required_field",
          "error",
          "Taxonomy manifest must define a types object.",
          taxonomyFile.relativePath,
          "types",
        ),
      );
    }

    Object.entries(parsed.types ?? {}).forEach(([typeName, typeDefinition]) => {
      if (!typeDefinition.label) {
        findings.push(
          createFinding(
            "missing_required_field",
            "error",
            `Taxonomy type "${typeName}" is missing label.`,
            taxonomyFile.relativePath,
            `types.${typeName}.label`,
          ),
        );
      }

      Object.entries(typeDefinition.properties ?? {}).forEach(([propertyName, propertyDefinition]) => {
        if (!ALLOWED_PROPERTY_TYPES.has(propertyDefinition.type)) {
          findings.push(
            createFinding(
              "missing_required_field",
              "error",
              `Property "${propertyName}" uses unsupported type "${propertyDefinition.type}".`,
              taxonomyFile.relativePath,
              `types.${typeName}.properties.${propertyName}.type`,
            ),
          );
        }
      });
    });

    return parsed;
  } catch (error) {
    findings.push(
      createFinding(
        "missing_required_field",
        "error",
        `Could not parse taxonomy manifest: ${error instanceof Error ? error.message : String(error)}`,
        taxonomyFile.relativePath,
      ),
    );
    return undefined;
  }
}

function mergeWithStarterTaxonomy(taxonomy: Taxonomy | undefined): Taxonomy {
  return {
    specVersion: taxonomy?.specVersion ?? "0.1",
    types: {
      ...STARTER_TAXONOMY.types,
      ...(taxonomy?.types ?? {}),
    },
  };
}

export function indexVault(readResult: VaultReadResult): VaultIndex {
  const findings: ValidationFinding[] = [];
  const markdownFiles = readResult.files.filter((file) => file.relativePath.endsWith(".md"));
  const taxonomy = mergeWithStarterTaxonomy(parseTaxonomy(readResult.files, findings));
  const templates = parseTemplates(readResult.files);
  const entities: Entity[] = [];
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

    const id = asString(parsed.data.id) || `missing-id:${file.relativePath}`;
    const type = asString(parsed.data.type) || "unknown";
    const name = asString(parsed.data.name) || basenameWithoutExtension(file.relativePath);
    const status = asString(parsed.data.status) || "unknown";
    const customProperties = Object.fromEntries(
      Object.entries(parsed.data).filter(([key]) => !BASE_ENTITY_FIELDS.has(key)),
    );

    const entity: Entity = {
      id,
      type,
      name,
      status,
      tags: toStringArray(parsed.data.tags),
      aliases: toStringArray(parsed.data.aliases),
      parentId: asString(parsed.data.parentId) || undefined,
      childrenIds: toStringArray(parsed.data.childrenIds),
      customProperties,
      body: parsed.content.trim(),
      path: file.relativePath,
      file,
      wikilinks: extractWikilinks(parsed.content),
      backlinks: [],
    };

    entities.push(entity);
    ids.set(entity.id, [...(ids.get(entity.id) ?? []), entity]);
  }

  for (const [id, matchingEntities] of ids.entries()) {
    if (matchingEntities.length > 1) {
      matchingEntities.forEach((entity) =>
        findings.push(
          createFinding("duplicate_id", "error", `Duplicate entity id "${id}".`, entity.path, "id"),
        ),
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
          createFinding(
            "broken_wikilink",
            "warning",
            `Could not resolve wikilink [[${wikilink}]].`,
            source.path,
          ),
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

  readResult.errors.forEach((error) =>
    findings.push(
      createFinding("missing_runtime_asset", "warning", error.message, error.relativePath),
    ),
  );

  entities.sort((a, b) => a.name.localeCompare(b.name));
  const universes = detectUniverses(readResult.files, entities);

  return {
    rootPath: readResult.rootPath,
    files: readResult.files,
    markdownFiles,
    taxonomy,
    templates,
    universes,
    tree: buildTree(readResult.files),
    entities,
    findings,
    readErrors: readResult.errors,
    typeCounts,
  };
}

export function taxonomyToYaml(taxonomy: Taxonomy): string {
  return YAML.stringify({
    specVersion: taxonomy.specVersion ?? "0.1",
    types: taxonomy.types,
  });
}

export function defaultTemplateForType(type: string): string {
  return `---
id: {{id}}
type: {{type}}
name: {{name}}
status: {{status}}
tags: []
---

# {{name}}

<!-- Default ${type} template. -->
`;
}

export function createTypeDefinition(type: string): TaxonomyType {
  const label = type
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  return {
    label: label || type,
    description: "",
    properties: {},
  };
}
