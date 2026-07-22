import YAML from "yaml";

export type ParsedMarkdown = {
  data: Record<string, unknown>;
  content: string;
};

export type SplitMarkdown = {
  frontmatterRaw: string;
  bodyMarkdown: string;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeMarkdownKey(value: string): string {
  return value.trim().toLowerCase();
}

export function extractWikilinks(body: string): string[] {
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
    return { frontmatterRaw: "", bodyMarkdown: normalized.replace(/^\n+/, "") };
  }
  const closingFence = normalized.indexOf("\n---", 4);
  if (closingFence === -1) {
    return { frontmatterRaw: "", bodyMarkdown: normalized.replace(/^\n+/, "") };
  }
  const frontmatterRaw = normalized.slice(0, closingFence + 4).trim();
  const bodyStart = normalized.indexOf("\n", closingFence + 4);
  const bodyMarkdown = bodyStart === -1 ? "" : normalized.slice(bodyStart + 1).replace(/^\n+/, "");
  return { frontmatterRaw, bodyMarkdown };
}

export function joinMarkdown(frontmatterRaw: string, bodyMarkdown: string): string {
  const frontmatter = frontmatterRaw.trim();
  const body = bodyMarkdown.replace(/^\n+/, "");
  return frontmatter ? `${frontmatter}\n\n${body}` : body;
}

/** Replaces only the body while preserving the original frontmatter envelope byte-for-byte. */
export function replaceMarkdownBodyPreservingEnvelope(
  content: string,
  bodyMarkdown: string,
): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const normalizedBody = bodyMarkdown.replace(/\r?\n/g, eol);
  const opening = /^---(?:\r?\n)/.exec(content);
  if (!opening) return normalizedBody;

  const closing = /^---[ \t]*(?:\r?\n|$)/gm;
  closing.lastIndex = opening[0].length;
  const closingMatch = closing.exec(content);
  if (!closingMatch) return normalizedBody;

  let bodyStart = closingMatch.index + closingMatch[0].length;
  while (content.startsWith("\r\n", bodyStart) || content[bodyStart] === "\n") {
    bodyStart += content.startsWith("\r\n", bodyStart) ? 2 : 1;
  }
  return `${content.slice(0, bodyStart)}${normalizedBody}`;
}
