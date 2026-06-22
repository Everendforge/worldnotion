import YAML from "yaml";
import type { Entity } from "../domain";

export type TextInsertion = {
  text: string;
  anchorOffset: number;
  headOffset?: number;
};

export function entityToFrontmatterRaw(entity: Entity): string {
  const yamlObject: Record<string, unknown> = {
    id: entity.id,
    type: entity.type,
    status: entity.status,
  };

  if (entity.tags.length > 0) {
    yamlObject.tags = entity.tags;
  }
  if (entity.aliases.length > 0) {
    yamlObject.aliases = entity.aliases;
  }

  Object.entries(entity.customProperties).forEach(([key, value]) => {
    yamlObject[key] = value;
  });

  return `---\n${YAML.stringify(yamlObject)}---`;
}

export function wrapSelectionText(
  selectedText: string,
  before: string,
  after = before,
  placeholder = "text",
): TextInsertion {
  const selected = selectedText || placeholder;
  return {
    text: `${before}${selected}${after}`,
    anchorOffset: before.length,
    headOffset: before.length + selected.length,
  };
}

export function fontFamilyInsertion(selectedText: string, fontFamily: string): TextInsertion {
  return wrapSelectionText(selectedText, `<span style="font-family: ${fontFamily}">`, "</span>");
}

export function wikilinkInsertion(selectedText: string): TextInsertion {
  const selected = selectedText || "Page Name";
  const alias = selected === "Page Name" ? "Alias" : selected;
  return {
    text: `[[${selected}|${alias}]]`,
    anchorOffset: 2 + selected.length + 1,
    headOffset: 2 + selected.length + 1 + alias.length,
  };
}

export function footnoteInsertion(documentText: string): TextInsertion {
  // Find the next available footnote number
  const footnoteRegex = /\[\^(\d+)\]/g;
  let maxNum = 0;
  let match: RegExpExecArray | null;
  
  while ((match = footnoteRegex.exec(documentText)) !== null) {
    const num = parseInt(match[1], 10);
    if (num > maxNum) maxNum = num;
  }
  
  const nextNum = maxNum + 1;
  return {
    text: `[^${nextNum}]`,
    anchorOffset: 0,
    headOffset: 4 + nextNum.toString().length,
  };
}

export function markdownLinkInsertion(selectedText: string, url: string): TextInsertion {
  const selected = selectedText || "link text";
  return {
    text: `[${selected}](${url.trim()})`,
    anchorOffset: 1,
    headOffset: 1 + selected.length,
  };
}

export function headingLine(line: string, level: 1 | 2 | 3 | 4 | 5 | 6) {
  const clean = line.replace(/^#{1,6}\s+/, "").replace(/^(- \[[ xX]\]|\d+\.|[-*])\s+/, "");
  return `${"#".repeat(level)} ${clean || `Heading ${level}`}`;
}

export function listLine(line: string, index: number, kind: "bullet" | "ordered" | "task") {
  const clean = line
    .replace(/^(\s*)(- \[[ xX]\]|\d+\.|[-*])\s+/, "$1")
    .replace(/^#{1,6}\s+/, "");
  const indent = /^(\s*)/.exec(line)?.[1] ?? "";
  const content = clean.trim() ? clean.trimStart() : "List item";
  if (kind === "ordered") return `${indent}${index + 1}. ${content}`;
  if (kind === "task") return `${indent}- [ ] ${content}`;
  return `${indent}- ${content}`;
}
