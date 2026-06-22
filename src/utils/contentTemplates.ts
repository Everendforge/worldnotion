import type { OpenTab } from "../editorTypes";
import type { VaultIndex } from "../domain";
import { dirname, joinMarkdown, slugify, splitMarkdown } from "../domain";
import { pathName } from "./pathUtils";

export function contentFromTemplate(index: VaultIndex, entityType: string, name: string) {
  const slug = slugify(name);
  const template = index.templates.find((candidate) => candidate.type === entityType);
  if (!template) {
    // Return frontmatter only, no header for blank notes
    return `---\nid: ${slug}\ntype: ${entityType}\nname: ${name}\nstatus: draft\n---\n`;
  }
  return template.content
    .replace(/\{\{id\}\}/g, slug)
    .replace(/\{\{type\}\}/g, entityType)
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{status\}\}/g, "draft");
}

export function folderDescriptionContent(name: string) {
  return `---\nid: ${slugify(name)}-folder\ntype: folder-description\nname: ${name}\nstatus: draft\nfolder: ${name}\n---\n`;
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
    .replace(new RegExp(`(^folder:\\s*)${escaped}(\\s*$)`, "m"), `$1${newName}$2`)
    .replace(new RegExp(`(^#\\s+)${escaped}(\\s*$)`, "m"), `$1${newName}$2`);
}

export function universeNoteContent(name: string) {
  return `---\nid: ${slugify(name)}\ntype: universe\nname: ${name}\nstatus: draft\n---\n\n# ${name}\n`;
}

export function rawToEditorParts(rawMarkdown: string) {
  return splitMarkdown(rawMarkdown);
}

export function bodyToRawMarkdown(tab: OpenTab, bodyMarkdown: string) {
  return joinMarkdown(rawToEditorParts(tab.rawMarkdown).frontmatterRaw, bodyMarkdown);
}
