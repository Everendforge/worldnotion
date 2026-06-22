import { describe, expect, it } from "vitest";
import type { VaultFile } from "../domain";
import {
  frontmatterNormalizationConflict,
  planFrontmatterNormalization,
} from "./frontmatterNormalizer";

function file(relativePath: string, content: string, modifiedMs = 1): VaultFile {
  return { relativePath, content, modifiedMs };
}

describe("frontmatter normalizer", () => {
  it("adds concept frontmatter to a markdown note without frontmatter", () => {
    const [item] = planFrontmatterNormalization({
      rootPath: "/Vault/Demo",
      files: [file("Loose Note.md", "# Loose Note\n\nBody")],
      directories: [],
    });

    expect(item).toMatchObject({
      path: "Loose Note.md",
      id: "loose-note",
      type: "concept",
      name: "Loose Note",
      status: "draft",
      kind: "note",
      reason: "missing_frontmatter",
    });
    expect(item?.nextContent).toContain("type: concept");
    expect(item?.nextContent).toContain("# Loose Note\n\nBody");
  });

  it("converts a same-name folder sibling into a folder note", () => {
    const [item] = planFrontmatterNormalization({
      rootPath: "/Vault/Demo",
      files: [file("Characters.md", "# Characters")],
      directories: ["Characters"],
    });

    expect(item).toMatchObject({
      path: "Characters.md",
      id: "characters-folder",
      type: "folder-description",
      name: "Characters",
      folder: "Characters",
      kind: "folder-description",
    });
    expect(item?.nextContent).toContain("folder: Characters");
  });

  it("preserves malformed frontmatter as raw body content", () => {
    const [item] = planFrontmatterNormalization({
      rootPath: "/Vault/Demo",
      files: [file("Broken.md", "---\nid: broken\n\n# Broken")],
      directories: [],
    });

    expect(item?.reason).toBe("invalid_frontmatter");
    expect(item?.nextContent).toContain("---\nid: broken\n\n# Broken");
  });

  it("ignores .everend metadata and files that already have valid frontmatter", () => {
    const items = planFrontmatterNormalization({
      rootPath: "/Vault/Demo",
      files: [
        file(".everend/templates/concept.md", "# Template"),
        file("Ready.md", "---\nid: ready\ntype: concept\nname: Ready\nstatus: draft\n---\n\n# Ready"),
      ],
      directories: [".everend", ".everend/templates"],
    });

    expect(items).toEqual([]);
  });

  it("reports modified time conflicts against a scanned item", () => {
    const [item] = planFrontmatterNormalization({
      rootPath: "/Vault/Demo",
      files: [file("Loose.md", "# Loose", 10)],
      directories: [],
    });

    expect(frontmatterNormalizationConflict(item!, file("Loose.md", "# Loose", 11))).toBe(
      "File changed since scan: Loose.md",
    );
    expect(frontmatterNormalizationConflict(item!, undefined)).toBe("File no longer exists: Loose.md");
  });
});
