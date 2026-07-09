import type { VaultFile } from "../domain";

export type CanonChangeSetStatus = "draft" | "proposed" | "conflicted" | "applied" | "dismissed";

export type CanonChangeSet = {
  specVersion: "0.1";
  id: string;
  kind: "canon-change-set";
  sourceApp: string;
  target: { entityId: string; path: string };
  base: { content: string; modifiedMs?: number; contentHash?: string; capturedAt: string };
  proposed: { content: string; diff?: string };
  status: CanonChangeSetStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  appliedBy?: string;
};

export type IndexedCanonChangeSet = CanonChangeSet & { path: string; modifiedMs?: number | null };

const CHANGE_SET_PATH = /^\.everend\/changes\/[^/]+\.json$/;
const STATUSES = new Set<CanonChangeSetStatus>([
  "draft",
  "proposed",
  "conflicted",
  "applied",
  "dismissed",
]);

function isChangeSet(value: unknown): value is CanonChangeSet {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CanonChangeSet>;
  return (
    item.specVersion === "0.1" &&
    item.kind === "canon-change-set" &&
    typeof item.id === "string" &&
    typeof item.sourceApp === "string" &&
    Boolean(item.target?.entityId) &&
    Boolean(item.target?.path) &&
    typeof item.base?.content === "string" &&
    typeof item.base?.capturedAt === "string" &&
    typeof item.proposed?.content === "string" &&
    typeof item.status === "string" &&
    STATUSES.has(item.status as CanonChangeSetStatus) &&
    typeof item.revision === "number"
  );
}

export function indexCanonChangeSets(files: VaultFile[]): IndexedCanonChangeSet[] {
  return files
    .flatMap((file) => {
      if (!CHANGE_SET_PATH.test(file.relativePath)) return [];
      try {
        const parsed = JSON.parse(file.content) as unknown;
        return isChangeSet(parsed)
          ? [{ ...parsed, path: file.relativePath, modifiedMs: file.modifiedMs }]
          : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function lineDiff(original: string, modified: string) {
  const before = original.replace(/\r\n/g, "\n").split("\n");
  const after = modified.replace(/\r\n/g, "\n").split("\n");
  return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => {
    if (before[index] === after[index])
      return before[index] === undefined ? "" : ` ${before[index]}`;
    return [
      before[index] === undefined ? "" : `-${before[index]}`,
      after[index] === undefined ? "" : `+${after[index]}`,
    ]
      .filter(Boolean)
      .join("\n");
  })
    .filter(Boolean)
    .join("\n");
}
