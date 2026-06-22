import YAML from "yaml";
import type { VaultFile } from "../domain";
import { dirname, joinMarkdown } from "../domain";
import { parseMarkdownFrontmatter, slugify, splitMarkdown } from "./markdownFrontmatter";
import { isHiddenMetadata } from "./treeBuilder";
import { pathName } from "./pathUtils";

export type FrontmatterNormalizationKind = "note" | "folder-description";
export type FrontmatterNormalizationReason = "missing_frontmatter" | "invalid_frontmatter";

export type FrontmatterNormalizationItem = {
  path: string;
  name: string;
  id: string;
  type: string;
  status: "draft";
  kind: FrontmatterNormalizationKind;
  reason: FrontmatterNormalizationReason;
  folder?: string;
  nextContent: string;
  modifiedMs?: number | null;
};

export type FrontmatterNormalizationPlanInput = {
  rootPath: string;
  files: VaultFile[];
  directories: string[];
  defaultType?: string;
};

function basenameWithoutExtension(path: string) {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

function rootNotePath(rootPath: string) {
  return `${pathName(rootPath)}.md`;
}

function hasValidFrontmatter(content: string) {
  if (!content.startsWith("---")) return false;
  try {
    parseMarkdownFrontmatter(content);
    return true;
  } catch {
    return false;
  }
}

function normalizationReason(content: string): FrontmatterNormalizationReason {
  return content.startsWith("---") ? "invalid_frontmatter" : "missing_frontmatter";
}

function yamlFrontmatter(data: Record<string, unknown>) {
  return `---\n${YAML.stringify(data).trimEnd()}\n---`;
}

function folderDescriptionData(name: string) {
  const idBase = slugify(name) || "folder";
  return {
    id: `${idBase}-folder`,
    type: "folder-description",
    name,
    status: "draft" as const,
    folder: name,
  };
}

function noteData(name: string, defaultType: string) {
  return {
    id: slugify(name) || "untitled",
    type: defaultType,
    name,
    status: "draft" as const,
  };
}

export function planFrontmatterNormalization({
  rootPath,
  files,
  directories,
  defaultType = "concept",
}: FrontmatterNormalizationPlanInput): FrontmatterNormalizationItem[] {
  const directorySet = new Set(directories);
  const hiddenRootFile = rootNotePath(rootPath);

  return files
    .filter((file) => file.relativePath.endsWith(".md"))
    .filter((file) => !isHiddenMetadata(file.relativePath))
    .filter((file) => file.relativePath !== hiddenRootFile)
    .filter((file) => !hasValidFrontmatter(file.content))
    .map((file) => {
      const name = basenameWithoutExtension(file.relativePath);
      const parentPath = dirname(file.relativePath);
      const siblingFolderPath = parentPath ? `${parentPath}/${name}` : name;
      const isFolderDescription = directorySet.has(siblingFolderPath);
      const data = isFolderDescription ? folderDescriptionData(name) : noteData(name, defaultType);
      const bodyMarkdown = splitMarkdown(file.content).bodyMarkdown;
      const frontmatter = yamlFrontmatter(data);

      return {
        path: file.relativePath,
        name,
        id: String(data.id),
        type: String(data.type),
        status: "draft" as const,
        kind: isFolderDescription ? "folder-description" as const : "note" as const,
        reason: normalizationReason(file.content),
        folder: isFolderDescription ? name : undefined,
        nextContent: joinMarkdown(frontmatter, bodyMarkdown),
        modifiedMs: file.modifiedMs,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function frontmatterNormalizationConflict(
  item: FrontmatterNormalizationItem,
  currentFile: VaultFile | undefined,
) {
  if (!currentFile) return `File no longer exists: ${item.path}`;
  if (
    typeof item.modifiedMs === "number" &&
    typeof currentFile.modifiedMs === "number" &&
    item.modifiedMs !== currentFile.modifiedMs
  ) {
    return `File changed since scan: ${item.path}`;
  }
  return undefined;
}
