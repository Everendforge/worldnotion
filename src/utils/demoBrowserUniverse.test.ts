import { describe, expect, it } from "vitest";
import { createDemoBrowserUniverse } from "./demoBrowserUniverse";
import { getBrowserFile, readBrowserUniverse, writeBrowserFile } from "./browserVault";

describe("createDemoBrowserUniverse", () => {
  it("loads the repository fixture through the browser vault interface", async () => {
    const root = createDemoBrowserUniverse();
    const result = await readBrowserUniverse(root);

    expect(result.rootPath).toBe("browser:demo-universe");
    expect(result.files.some((file) => file.relativePath === "demo-universe.md")).toBe(true);
    expect(result.files.some((file) => file.relativePath === ".everend/universe.json")).toBe(true);
    expect(result.directories).toContain("Characters");
    expect(result.errors).toEqual([]);
  });

  it("keeps demo edits writable for the current browser session", async () => {
    const root = createDemoBrowserUniverse();
    await writeBrowserFile(root, "Scratch.md", "# Draft\n");

    const file = await getBrowserFile(root, "Scratch.md");
    expect(await (await file.getFile()).text()).toBe("# Draft\n");
  });
});
