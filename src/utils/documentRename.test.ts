import { describe, expect, it } from "vitest";
import type { VaultIndex } from "../domain";
import { planDocumentRename, validateDocumentName } from "./documentRename";

const index = {
  rootPath: "/vault",
  directories: ["World/Characters"],
  files: [],
  markdownFiles: [],
  templates: [],
  universes: [],
  tree: [],
  entities: [],
  findings: [],
  readErrors: [],
  typeCounts: {},
} as unknown as VaultIndex;

describe("document rename planning", () => {
  it("updates canonical name and only a matching first H1", () => {
    const content = "---\nid: mara\nname: Mara\ntype: character\n---\n\n# Mara\n\n## Mara";
    const plan = planDocumentRename(index, "World/Mara.md", "Mara Voss", content);
    expect(plan.diskContent).toContain("name: Mara Voss");
    expect(plan.diskContent).toContain("# Mara Voss");
    expect(plan.diskContent).toContain("## Mara");
  });

  it("preserves a custom first H1", () => {
    const content = "---\nname: Mara\n---\n\n# Biography";
    expect(planDocumentRename(index, "World/Mara.md", "Mara Voss", content).diskContent).toContain(
      "# Biography",
    );
  });

  it("renames a structurally linked folder note together with its folder", () => {
    const content =
      "---\ntype: folder-description\nname: Characters\nfolder: Characters\n---\n\n# Characters";
    const plan = planDocumentRename(index, "World/Characters.md", "People", content);
    expect(plan.folderPath).toBe("World/Characters");
    expect(plan.newFolderPath).toBe("World/People");
    expect(plan.newNotePath).toBe("World/People.md");
    expect(plan.diskContent).toContain("folder: People");
  });

  it("rejects unsafe file names", () => {
    expect(() => validateDocumentName("bad/name")).toThrow(/not valid/i);
  });
});
