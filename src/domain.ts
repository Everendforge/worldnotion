import {
  parseMarkdownFrontmatter,
  slugify,
  splitMarkdown,
  joinMarkdown,
  type ParsedMarkdown,
  type SplitMarkdown,
} from "./utils/markdownFrontmatter";
import {
  createDefaultTaxonomyConfig,
  generateTaxonomyFromEntities,
  mergeTagHierarchy,
} from "./utils/taxonomyConfig";
import { validateAgainstTaxonomy } from "./utils/taxonomyValidation";
import { buildTree } from "./utils/treeBuilder";
import { parsePropertiesConfig, parseTaxonomyConfig, parseTemplates, parseUniverseProfile } from "./utils/vaultMetadata";
import { indexMarkdownEntities } from "./utils/entityIndex";
import { detectUniverses } from "./utils/universeDetection";
import {
  mergeWithStarterTaxonomy,
  parseLegacyTaxonomy,
  STARTER_TAXONOMY,
  PROPERTY_TYPES,
  taxonomyToYaml,
  defaultTemplateForType,
  createTypeDefinition,
} from "./utils/legacyTaxonomy";

export { parseMarkdownFrontmatter, slugify, splitMarkdown, joinMarkdown };
export { createDefaultTaxonomyConfig, generateTaxonomyFromEntities, mergeTagHierarchy };
export { validateAgainstTaxonomy };
export { buildTree };
export { STARTER_TAXONOMY, PROPERTY_TYPES, taxonomyToYaml, defaultTemplateForType, createTypeDefinition };
export type { ParsedMarkdown, SplitMarkdown };

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
  directories: string[];
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

export type UniverseIcon = {
  type: "preset" | "image";
  value: string;
};

export type UniverseProfile = {
  name?: string;
  icon?: UniverseIcon;
  taxonomyVersion?: string; // Version of taxonomy config being used
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
    | "save_conflict"
    | "undefined_tag"
    | "undefined_entity_type"
    | "undefined_status"
    | "invalid_custom_field";
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
  folder?: string; // Folder name if this is a folder description note
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
  directories: string[];
  markdownFiles: VaultFile[];
  taxonomy?: Taxonomy;
  propertiesConfig?: import("./editorTypes.js").PropertiesConfig;
  taxonomyConfig?: import("./editorTypes.js").TaxonomyConfig; // Compatibility alias for older components
  templates: EntityTemplate[];
  universeProfile?: UniverseProfile;
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
  descriptionPath?: string;
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

/**
 * Process tags considering hierarchical slash notation
 * Returns normalized tag strings
 * @internal Not currently used - kept for future tag hierarchy processing
 *
function _processTagsWithHierarchy(value: unknown): string[] {
  const tags = toStringArray(value);
  // Tags are stored as-is (with slash notation if present)
  // The hierarchy extraction happens in mergeTagHierarchy during indexing
  return tags;
}
*/

function pathName(path: string): string {
  return path.replace(/^browser:/, "").split(/[\\/]/).pop() ?? path;
}

export function dirname(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
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

export function indexVault(readResult: VaultReadResult): VaultIndex {
  const findings: ValidationFinding[] = [];
  const markdownFiles = readResult.files.filter((file) => file.relativePath.endsWith(".md"));
  const taxonomy = mergeWithStarterTaxonomy(parseLegacyTaxonomy(readResult.files, findings));
  const templates = parseTemplates(readResult.files);
  const universeProfile = parseUniverseProfile(readResult.files, findings);
  const propertiesConfig = parsePropertiesConfig(readResult.files, findings);
  const taxonomyConfig = propertiesConfig ?? parseTaxonomyConfig(readResult.files, findings);
  const entityIndex = indexMarkdownEntities(markdownFiles, propertiesConfig ?? taxonomyConfig);
  findings.push(...entityIndex.findings);

  readResult.errors.forEach((error) =>
    findings.push(
      createFinding("missing_runtime_asset", "warning", error.message, error.relativePath),
    ),
  );

  const directories = readResult.directories ?? [];
  const universes = detectUniverses(readResult.files, directories, entityIndex.entities);
  const hiddenRootFile = `${pathName(readResult.rootPath)}.md`;

  return {
    rootPath: readResult.rootPath,
    files: readResult.files,
    directories,
    markdownFiles,
    taxonomy,
    propertiesConfig,
    taxonomyConfig,
    templates,
    universeProfile,
    universes,
    tree: buildTree(readResult.files, directories, false, hiddenRootFile),
    entities: entityIndex.entities,
    findings,
    readErrors: readResult.errors,
    typeCounts: entityIndex.typeCounts,
  };
}
