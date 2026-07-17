import { describe, expect, it } from "vitest";
import { makeVaultFile, makeVaultIndex } from "../test/fixtures";
import {
  isExternalUrl,
  isImagePath,
  normalizeVaultImagePath,
  resolveNoteImagePath,
} from "./vaultImages";

const index = makeVaultIndex({
  files: [
    makeVaultFile("attachments/hero.png"),
    makeVaultFile("Characters/Mara.md"),
    makeVaultFile("Characters/portrait.jpg"),
  ],
});

describe("isImagePath / isExternalUrl", () => {
  it("detects image extensions", () => {
    expect(isImagePath("a/b.png")).toBe(true);
    expect(isImagePath("a/b.md")).toBe(false);
    expect(isImagePath("a/b.avif")).toBe(true);
  });

  it("detects external urls", () => {
    expect(isExternalUrl("https://example.com/x.png")).toBe(true);
    expect(isExternalUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isExternalUrl("blob:https://example.com/id")).toBe(true);
    expect(isExternalUrl("attachments/x.png")).toBe(false);
  });
});

describe("normalizeVaultImagePath", () => {
  it("normalizes Windows separators, encoding, and safe parent segments", () => {
    expect(normalizeVaultImagePath(".\\attachments\\my%20art.png")).toBe(
      "attachments/my art.png",
    );
    expect(normalizeVaultImagePath("Characters/../attachments/hero.png")).toBe(
      "attachments/hero.png",
    );
    expect(normalizeVaultImagePath("../outside.png")).toBeNull();
  });
});

describe("resolveNoteImagePath", () => {
  it("matches an exact vault-relative path", () => {
    expect(resolveNoteImagePath(index, "Characters/Mara.md", "attachments/hero.png")).toBe(
      "attachments/hero.png",
    );
  });

  it("resolves a path relative to the note's folder", () => {
    expect(resolveNoteImagePath(index, "Characters/Mara.md", "portrait.jpg")).toBe(
      "Characters/portrait.jpg",
    );
  });

  it("decodes percent-encoded paths", () => {
    const withSpace = makeVaultIndex({ files: [makeVaultFile("attachments/my art.png")] });
    expect(resolveNoteImagePath(withSpace, "note.md", "attachments/my%20art.png")).toBe(
      "attachments/my art.png",
    );
  });

  it("falls back to a filename match anywhere in the vault", () => {
    expect(resolveNoteImagePath(index, "note.md", "hero.png")).toBe("attachments/hero.png");
  });

  it("returns null for external urls and unknown files", () => {
    expect(resolveNoteImagePath(index, "note.md", "https://x/y.png")).toBeNull();
    expect(resolveNoteImagePath(index, "note.md", "missing.png")).toBeNull();
  });

  it("resolves Windows-style note links", () => {
    expect(resolveNoteImagePath(index, "Characters\\Mara.md", "..\\attachments\\hero.png")).toBe(
      "attachments/hero.png",
    );
  });
});
