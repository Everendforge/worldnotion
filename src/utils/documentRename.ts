import type { VaultIndex } from "../domain";
import { dirname, joinMarkdown, splitMarkdown } from "../domain";
import type { PropertiesConfig } from "../editorTypes";
import { folderDescriptionPath } from "./contentTemplates";
import { pathName, type PathChange } from "./pathUtils";
import { renamePathTarget } from "./vaultOperations";
import { parseFrontmatterRaw, updateFrontmatterProperties } from "./propertiesConfig";

export type DocumentRenamePlan = {
  oldName: string;
  newName: string;
  oldNotePath: string;
  newNotePath: string;
  newFileName: string;
  folderPath?: string;
  newFolderPath?: string;
  diskContent: string;
  liveContent: string;
  changes: PathChange[];
};

export function normalizeDocumentName(value: string) {
  return value.trim().replace(/\.md$/i, "").trim();
}

export function validateDocumentName(value: string) {
  const name = normalizeDocumentName(value);
  if (!name) throw new Error("Document name cannot be empty.");
  if (/[\\/:*?"<>|\0]/.test(name) || name === "." || name === "..") {
    throw new Error("Document name contains characters that are not valid in file names.");
  }
  return name;
}

function frontmatterData(content: string) {
  const { frontmatterRaw } = splitMarkdown(content);
  try {
    return parseFrontmatterRaw(frontmatterRaw);
  } catch {
    return {};
  }
}

function linkedFolderForNote(index: VaultIndex, notePath: string, content: string) {
  const data = frontmatterData(content);
  const configuredFolder = typeof data.folder === "string" ? data.folder.trim() : "";
  const configuredPath = configuredFolder
    ? dirname(notePath)
      ? `${dirname(notePath)}/${configuredFolder}`
      : configuredFolder
    : undefined;
  const candidates = configuredPath ? [configuredPath, ...index.directories] : index.directories;
  return candidates.find(
    (folderPath, candidateIndex) =>
      candidates.indexOf(folderPath) === candidateIndex &&
      folderDescriptionPath(folderPath) === notePath &&
      index.directories.includes(folderPath),
  );
}

function updateMatchingFirstHeading(body: string, oldName: string, newName: string) {
  let visited = false;
  return body.replace(
    /^(#\s+)(.+?)(\r?)$/m,
    (full, prefix: string, heading: string, carriage: string) => {
      if (visited) return full;
      visited = true;
      return heading.trim() === oldName ? `${prefix}${newName}${carriage}` : full;
    },
  );
}

function renamedContent(
  content: string,
  oldName: string,
  newName: string,
  folderName: string | undefined,
  propertiesConfig?: PropertiesConfig,
) {
  const { frontmatterRaw, bodyMarkdown } = splitMarkdown(content);
  const data = frontmatterData(content);
  const entityType = typeof data.type === "string" ? data.type : undefined;
  const updates: Record<string, unknown> = { name: newName };
  if (folderName) updates.folder = folderName;
  const nextFrontmatter = frontmatterRaw
    ? updateFrontmatterProperties(frontmatterRaw, updates, propertiesConfig, entityType)
    : frontmatterRaw;
  const nextBody = updateMatchingFirstHeading(bodyMarkdown, oldName, newName);
  return joinMarkdown(nextFrontmatter, nextBody);
}

export function planDocumentRename(
  index: VaultIndex,
  notePath: string,
  requestedName: string,
  diskContent: string,
  liveContent = diskContent,
): DocumentRenamePlan {
  const newName = validateDocumentName(requestedName);
  const data = frontmatterData(liveContent);
  const oldName =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : pathName(notePath).replace(/\.md$/i, "");
  const newFileName = `${newName}.md`;
  const newNotePath = renamePathTarget(notePath, newFileName);
  const folderPath = linkedFolderForNote(index, notePath, liveContent);
  const newFolderPath = folderPath ? renamePathTarget(folderPath, newName) : undefined;

  if (newNotePath !== notePath && index.files.some((file) => file.relativePath === newNotePath)) {
    throw new Error(`A note already exists at ${newNotePath}.`);
  }
  if (newFolderPath && newFolderPath !== folderPath && index.directories.includes(newFolderPath)) {
    throw new Error(`A folder already exists at ${newFolderPath}.`);
  }

  const changes: PathChange[] = [];
  if (folderPath && newFolderPath && folderPath !== newFolderPath) {
    changes.push({ fromPath: folderPath, toPath: newFolderPath, mode: "tree" });
  }
  if (notePath !== newNotePath) {
    changes.push({ fromPath: notePath, toPath: newNotePath, mode: "single" });
  }

  return {
    oldName,
    newName,
    oldNotePath: notePath,
    newNotePath,
    newFileName,
    folderPath,
    newFolderPath,
    diskContent: renamedContent(
      diskContent,
      oldName,
      newName,
      folderPath ? newName : undefined,
      index.propertiesConfig,
    ),
    liveContent: renamedContent(
      liveContent,
      oldName,
      newName,
      folderPath ? newName : undefined,
      index.propertiesConfig,
    ),
    changes,
  };
}
