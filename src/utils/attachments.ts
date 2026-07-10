export const DEFAULT_ATTACHMENTS_FOLDER = "attachments";

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]+/g;

function splitExtension(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return { base: fileName, ext: "" };
  // dot === 0 means an extension-only name (e.g. ".png") -> empty base.
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

/** Sanitizes a file name into a safe, lowercase vault segment. */
export function sanitizeAttachmentName(fileName: string, fallback = "image"): string {
  const { base, ext } = splitExtension(fileName.trim());
  const safeBase = base
    .replace(UNSAFE_CHARS, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const safeExt = ext.replace(UNSAFE_CHARS, "").toLowerCase();
  return `${safeBase || fallback}${safeExt}`;
}

/**
 * Returns a collision-free vault-relative path under the attachments folder
 * for a new file, appending -1, -2, … when the name is already taken.
 */
export function uniqueAttachmentPath(
  existingPaths: Iterable<string>,
  fileName: string,
  folder: string = DEFAULT_ATTACHMENTS_FOLDER,
): string {
  const taken = new Set(existingPaths);
  const safeName = sanitizeAttachmentName(fileName);
  const { base, ext } = splitExtension(safeName);

  let candidate = `${folder}/${safeName}`;
  let counter = 1;
  while (taken.has(candidate)) {
    candidate = `${folder}/${base}-${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}

/** Percent-encodes a vault path for use inside `![](…)` (spaces → %20). */
export function encodeImagePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Builds the standard Markdown image snippet for an inserted attachment. */
export function imageMarkdown(relativePath: string, alt?: string): string {
  const label = (alt ?? splitExtension(relativePath.split("/").pop() ?? "").base).trim();
  return `![${label}](${encodeImagePath(relativePath)})`;
}
