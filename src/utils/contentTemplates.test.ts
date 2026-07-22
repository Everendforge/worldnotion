import { describe, expect, it } from "vitest";
import type { OpenTab } from "../editorTypes";
import type { VaultIndex } from "../domain";
import {
  bodyToRawMarkdown,
  contentFromTemplate,
  folderDescriptionContent,
  folderDescriptionInfo,
  folderDescriptionPath,
  universeNoteContent,
  updateFolderDescriptionContent,
} from "./contentTemplates";

const baseIndex: VaultIndex = {
  rootPath: "C:/Vault",
  files: [],
  directories: [],
  markdownFiles: [],
  templates: [],
  universes: [],
  tree: [],
  entities: [],
  findings: [],
  readErrors: [],
  typeCounts: {},
};

describe("content template helpers", () => {
  it("creates default entity content when no template exists", () => {
    const content = contentFromTemplate(baseIndex, "character", "Mara Voss");

    expect(content).toContain("id: mara-voss");
    expect(content).toContain("type: character");
  });

  it("applies vault templates with standard placeholders", () => {
    const index = {
      ...baseIndex,
      templates: [
        {
          type: "location",
          path: ".everend/templates/location.md",
          content: "---\nid: {{id}}\ntype: {{type}}\nname: {{name}}\nstatus: {{status}}\n---\n",
        },
      ],
    };

    expect(contentFromTemplate(index, "location", "Ash Gate")).toBe(
      "---\nid: ash-gate\ntype: location\nname: Ash Gate\nstatus: draft\n---\n",
    );
  });

  it("creates and updates folder description content", () => {
    const content = folderDescriptionContent("Characters");

    expect(folderDescriptionPath("World/Characters")).toBe("World/Characters.md");
    expect(content).toContain(
      "folder: Characters # Don't delete; it's a WorldNotion system property: indicates whether this note corresponds to a folder.",
    );
    expect(updateFolderDescriptionContent(content, "Characters", "Cast")).toContain(
      "folder: Cast #",
    );
  });

  it("detects folder description info from vault files", () => {
    const index = {
      ...baseIndex,
      files: [{ relativePath: "World/Characters.md", content: "" }],
    };

    expect(folderDescriptionInfo(index, "World/Characters")).toEqual({
      folderName: "Characters",
      descriptionPath: "World/Characters.md",
      hasDescription: true,
    });
    expect(folderDescriptionInfo(baseIndex, "World/Locations")).toEqual({
      folderName: "Locations",
      descriptionPath: "World/Locations.md",
      hasDescription: false,
    });
  });

  it("creates universe note content and preserves frontmatter when saving body edits", () => {
    const tab = {
      rawMarkdown: universeNoteContent("Example Universe"),
    } as OpenTab;

    expect(tab.rawMarkdown).toContain("type: universe");
    expect(bodyToRawMarkdown(tab, "# New Body")).toContain("type: universe");
    expect(bodyToRawMarkdown(tab, "# New Body")).toContain("# New Body");
  });

  it("preserves the exact CRLF frontmatter envelope when saving body edits", () => {
    const raw = "---\r\nid: note\r\nname: Note # keep\r\n---\r\n\r\n# Note\r\n\r\nBody";
    const tab = { rawMarkdown: raw } as OpenTab;

    expect(bodyToRawMarkdown(tab, "# Changed\n\nBody")).toBe(
      "---\r\nid: note\r\nname: Note # keep\r\n---\r\n\r\n# Changed\r\n\r\nBody",
    );
  });
});
