import { describe, expect, it } from "vitest";
import type { VaultFile } from "../domain";
import { buildTree, isHiddenMetadata } from "./treeBuilder";

describe("tree builder", () => {
  const files: VaultFile[] = [
    {
      relativePath: "World/Cast.md",
      content: "---\ntype: folder-description\nfolder: Cast\n---\n\n# Cast",
    },
    {
      relativePath: "World/Cast/Ada.md",
      content: "---\nid: ada\n---\n\n# Ada",
    },
    {
      relativePath: "World/Notes.md",
      content: "# Plain note",
    },
    {
      relativePath: ".everend/universe.json",
      content: "{}",
    },
    {
      relativePath: "Demo.md",
      content: "# Root universe note",
    },
  ];

  it("marks folder description files without rendering them as regular files", () => {
    const tree = buildTree(files, ["World", "World/Cast"], false, "Demo.md");
    const world = tree.find((node) => node.path === "World");
    const cast = world?.children.find((node) => node.path === "World/Cast");

    expect(cast).toMatchObject({
      kind: "folder",
      hasDescription: true,
      descriptionPath: "World/Cast.md",
    });
    expect(cast?.children.map((node) => node.path)).toEqual(["World/Cast/Ada.md"]);
    expect(world?.children.some((node) => node.path === "World/Cast.md")).toBe(false);
  });

  it("can ignore folder note metadata and render folder notes as regular files", () => {
    const tree = buildTree(files, ["World", "World/Cast"], false, "Demo.md", true);
    const world = tree.find((node) => node.path === "World");
    const cast = world?.children.find((node) => node.path === "World/Cast");

    expect(cast?.hasDescription).toBeUndefined();
    expect(world?.children.some((node) => node.path === "World/Cast.md")).toBe(true);
  });

  it("excludes hidden metadata and the hidden root file by default", () => {
    const tree = buildTree(files, ["World", ".everend"], false, "Demo.md");

    expect(tree.map((node) => node.path)).toEqual(["World"]);
    expect(tree.some((node) => node.path === ".everend")).toBe(false);
    expect(tree.some((node) => node.path === "Demo.md")).toBe(false);
  });

  it("can include hidden metadata when explicitly requested", () => {
    const tree = buildTree(files, ["World", ".everend"], true);

    expect(tree.map((node) => node.path)).toEqual([".everend", "World", "Demo.md"]);
    expect(tree.find((node) => node.path === ".everend")?.children[0].path).toBe(
      ".everend/universe.json",
    );
  });

  it("detects hidden metadata paths", () => {
    expect(isHiddenMetadata(".everend/universe.json")).toBe(true);
    expect(isHiddenMetadata("World/.everend-note.md")).toBe(false);
  });

  it("renders indexed images so they can be managed from the explorer", () => {
    const tree = buildTree(
      [
        { relativePath: "attachments/hero.png", content: "", binary: true },
        { relativePath: "attachments/cover.webp", content: "", binary: true },
      ],
      ["attachments"],
    );

    expect(tree[0]?.children.map((node) => node.path)).toEqual([
      "attachments/cover.webp",
      "attachments/hero.png",
    ]);
  });
});
