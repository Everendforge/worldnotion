import { describe, expect, it } from "vitest";
import { indexCanonChangeSets, lineDiff } from "./canonChangeSets";

describe("canon change sets", () => {
  it("indexes valid portable proposals and ignores unrelated metadata", () => {
    const changes = indexCanonChangeSets([
      {
        relativePath: ".everend/changes/change-mara.json",
        content: JSON.stringify({
          specVersion: "0.1",
          id: "change:mara",
          kind: "canon-change-set",
          sourceApp: "pathbranching",
          target: { entityId: "character:mara", path: "Characters/Mara.md" },
          base: { content: "old", capturedAt: "now" },
          proposed: { content: "new" },
          status: "proposed",
          revision: 1,
          createdAt: "now",
          updatedAt: "now",
        }),
      },
      { relativePath: ".everend/.pathbranching/manifest.json", content: "{}" },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.target.entityId).toBe("character:mara");
  });

  it("renders a readable line diff", () => {
    expect(lineDiff("old\n", "new\n")).toContain("-old");
    expect(lineDiff("old\n", "new\n")).toContain("+new");
  });
});
