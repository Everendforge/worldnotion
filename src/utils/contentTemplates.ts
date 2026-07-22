import type { OpenTab } from "../editorTypes";
import type { PropertiesConfig } from "../editorTypes";
import type { VaultIndex } from "../domain";
import { dirname, slugify, splitMarkdown } from "../domain";
import { replaceMarkdownBodyPreservingEnvelope } from "./markdownFrontmatter";
import { pathName } from "./pathUtils";
import {
  conditionIsActive,
  emptyPropertyValue,
  frontmatterDataToRaw,
  getConfiguredFrontmatterOrder,
  listVisibleProperties,
  reorderFrontmatter,
  updateFrontmatterProperties,
} from "./propertiesConfig";
import type { PropertyDefinition } from "../editorTypes";

export const FOLDER_SYSTEM_PROPERTY_COMMENT =
  "Don't delete; it's a WorldNotion system property: indicates whether this note corresponds to a folder.";

type EntityFrontmatterInput = {
  id: string;
  type: string;
  name: string;
  status?: string;
  tags?: string[];
  aliases?: string[];
  parentId?: string;
  childrenIds?: string[];
  folder?: string;
  propertiesConfig?: PropertiesConfig;
};

export function createEntityFrontmatter({
  id,
  type,
  name,
  status = "draft",
  tags = [],
  aliases = [],
  parentId,
  childrenIds,
  folder,
  propertiesConfig,
}: EntityFrontmatterInput) {
  const data: Record<string, unknown> = {};
  if (folder) data.folder = folder;
  data.id = id;
  data.type = type;
  data.name = name;
  data.status = status;
  data.tags = tags;
  data.aliases = aliases;
  if (parentId) data.parentId = parentId;
  if (childrenIds && childrenIds.length > 0) data.childrenIds = childrenIds;
  const order = getConfiguredFrontmatterOrder(propertiesConfig, type, Object.keys(data));
  let frontmatter = reorderFrontmatter(frontmatterDataToRaw(data), order);
  if (propertiesConfig) {
    const defaults: Record<string, unknown> = {};
    const values: Record<string, unknown> = { ...data };
    const visit = (property: PropertyDefinition) => {
      if (!conditionIsActive(property, values)) return;
      if (
        property.type !== "group" &&
        !(property.id in data) &&
        (property.required || property.defaultValue !== undefined)
      ) {
        defaults[property.id] = property.defaultValue ?? emptyPropertyValue(property.type);
        values[property.id] = defaults[property.id];
      }
      property.children?.forEach(visit);
    };
    listVisibleProperties(propertiesConfig, type).forEach(visit);
    frontmatter = updateFrontmatterProperties(frontmatter, defaults, propertiesConfig, type);
  }
  return frontmatter;
}

export function contentFromTemplate(index: VaultIndex, entityType: string, name: string) {
  const slug = slugify(name);
  const template = index.templates.find((candidate) => candidate.type === entityType);
  if (!template) {
    // Return frontmatter only, no header for blank notes
    return `${createEntityFrontmatter({ id: slug, type: entityType, name, propertiesConfig: index.propertiesConfig })}\n`;
  }
  return template.content
    .replace(/\{\{id\}\}/g, slug)
    .replace(/\{\{type\}\}/g, entityType)
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{status\}\}/g, "draft");
}

export function folderDescriptionContent(name: string) {
  return `${createEntityFrontmatter({
    id: `${slugify(name)}-folder`,
    type: "folder-description",
    name,
    folder: name,
  })}\n`;
}

export function folderDescriptionPath(folderPath: string) {
  const folderName = pathName(folderPath);
  const parentPath = dirname(folderPath);
  return parentPath ? `${parentPath}/${folderName}.md` : `${folderName}.md`;
}

export function folderDescriptionInfo(index: VaultIndex, folderPath: string) {
  const folderName = pathName(folderPath) || pathName(index.rootPath);
  const descriptionPath = folderDescriptionPath(folderPath);

  return {
    folderName,
    descriptionPath,
    hasDescription: index.files.some((file) => file.relativePath === descriptionPath),
  };
}

export function updateFolderDescriptionContent(content: string, oldName: string, newName: string) {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content
    .replace(new RegExp(`(^name:\\s*)${escaped}(\\s*$)`, "m"), `$1${newName}$2`)
    .replace(new RegExp(`(^folder:\\s*)${escaped}(\\s*(?:#.*)?$)`, "m"), `$1${newName}$2`)
    .replace(new RegExp(`(^#\\s+)${escaped}(\\s*$)`, "m"), `$1${newName}$2`);
}

export function universeNoteContent(name: string) {
  return `${createEntityFrontmatter({ id: slugify(name), type: "universe", name })}\n\n# ${name}\n`;
}

export function rawToEditorParts(rawMarkdown: string) {
  return splitMarkdown(rawMarkdown);
}

export function bodyToRawMarkdown(tab: OpenTab, bodyMarkdown: string) {
  return replaceMarkdownBodyPreservingEnvelope(tab.rawMarkdown, bodyMarkdown);
}
