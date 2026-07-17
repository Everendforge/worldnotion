import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { VaultIndex } from "../domain";
import { dirname } from "../domain";
import { isTauriRuntime } from "./appEnvironment";
import { getBrowserFile, type BrowserDirectoryHandle } from "./browserVault";

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

export function isImagePath(relativePath: string): boolean {
  const extension = relativePath.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
}

/** Normalizes vault paths before they reach either the Tauri or browser reader. */
export function normalizeVaultImagePath(rawPath: string): string | null {
  let path = rawPath.trim().replace(/\\/g, "/");
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-zA-Z]:\//.test(path) ||
    path.includes(":") ||
    path.includes("\0")
  ) {
    return null;
  }
  try {
    path = decodeURI(path);
  } catch {
    // Keep the original path when a note contains malformed percent encoding.
  }
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-zA-Z]:\//.test(path) ||
    path.includes(":") ||
    path.includes("\0")
  ) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length ? segments.join("/") : null;
}

// In browser mode the directory handle only lives in App state; App registers
// it here so leaf components (image previews) can read binary files without
// threading the handle through every layer.
let browserVaultRoot: BrowserDirectoryHandle | null = null;
let browserVaultGeneration = 0;

export function setBrowserVaultRoot(root: BrowserDirectoryHandle | null) {
  if (root === browserVaultRoot) return;
  for (const url of imageUrlCache.values()) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  imageUrlCache.clear();
  browserVaultGeneration += 1;
  browserVaultRoot = root;
}

async function loadVaultImage(index: VaultIndex, relativePath: string): Promise<string | null> {
  const normalizedPath = normalizeVaultImagePath(relativePath);
  if (!normalizedPath || !isImagePath(normalizedPath)) return null;

  if (isTauriRuntime()) {
    const base64 = await invoke<string>("read_file_base64", {
      vaultPath: index.rootPath,
      relativePath: normalizedPath,
    });
    const extension = normalizedPath.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
    return `data:${mime};base64,${base64}`;
  }

  if (!browserVaultRoot) return null;
  const handle = await getBrowserFile(browserVaultRoot, normalizedPath);
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}

// Resolved image URLs are cached per (vault, path) so the CodeMirror image
// widget can rebuild without re-reading the file every time. The cache owns
// the lifecycle of browser object URLs (revoked on invalidation).
const imageUrlCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function cacheKey(rootPath: string, relativePath: string) {
  return `${browserVaultGeneration}:${rootPath}::${relativePath}`;
}

/**
 * Resolves a vault-relative image path to a displayable URL, memoized across
 * calls. Returns null while unavailable. Non-hook: usable from CodeMirror
 * widgets and other imperative code.
 */
export async function resolveVaultImageUrl(
  index: VaultIndex,
  relativePath: string,
): Promise<string | null> {
  const normalizedPath = normalizeVaultImagePath(relativePath);
  if (!normalizedPath || !isImagePath(normalizedPath)) return null;
  const key = cacheKey(index.rootPath, normalizedPath);
  const cached = imageUrlCache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const generation = browserVaultGeneration;
  const promise = loadVaultImage(index, normalizedPath)
    .then((url) => {
      if (!url) return url;
      if (generation !== browserVaultGeneration) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        return null;
      }
      imageUrlCache.set(key, url);
      return url;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

export function isExternalUrl(rawPath: string): boolean {
  return /^(https?:|data:|blob:)/i.test(rawPath);
}

/**
 * Maps a raw image path written in a note (`![](path)`) to a concrete
 * vault-relative path, tried in order: exact vault-relative, relative to the
 * note's folder, then by filename anywhere in the vault (Obsidian-style
 * fallback). Returns null when nothing matches. Pure — no I/O.
 */
export function resolveNoteImagePath(
  index: VaultIndex,
  notePath: string,
  rawPath: string,
): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed || isExternalUrl(trimmed)) return null;

  const known = new Set(
    index.files
      .map((file) => normalizeVaultImagePath(file.relativePath))
      .filter((path): path is string => Boolean(path)),
  );
  const noteDir = normalizeVaultImagePath(dirname(notePath.replace(/\\/g, "/"))) ?? "";
  const candidates = [
    normalizeVaultImagePath(trimmed),
    normalizeVaultImagePath(noteDir ? `${noteDir}/${trimmed}` : trimmed),
  ];
  for (const candidate of candidates) {
    if (candidate && known.has(candidate)) return candidate;
  }

  let decoded = trimmed.replace(/\\/g, "/");
  try {
    decoded = decodeURI(decoded);
  } catch {
    // Fall back to the raw filename for malformed note links.
  }

  const basename = decoded.split("/").pop();
  if (basename) {
    const match = index.files.find(
      (file) => normalizeVaultImagePath(file.relativePath)?.split("/").pop() === basename,
    );
    if (match) return normalizeVaultImagePath(match.relativePath);
  }

  return null;
}

/**
 * Resolves a raw image path from a note to a displayable URL. External URLs
 * pass through; vault paths go through {@link resolveNoteImagePath}.
 */
export async function resolveNoteImageUrl(
  index: VaultIndex,
  notePath: string,
  rawPath: string,
): Promise<string | null> {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (isExternalUrl(trimmed)) return trimmed;
  const matched = resolveNoteImagePath(index, notePath, trimmed);
  return matched ? resolveVaultImageUrl(index, matched) : null;
}

/** Drops a cached URL so the next resolve re-reads from disk (after rename/edit). */
export function invalidateVaultImage(rootPath: string, relativePath: string) {
  const normalizedPath = normalizeVaultImagePath(relativePath);
  if (!normalizedPath) return;
  const key = cacheKey(rootPath, normalizedPath);
  const url = imageUrlCache.get(key);
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  imageUrlCache.delete(key);
}

/**
 * Resolves a vault-relative image path to a displayable URL.
 * Returns undefined while loading or when the image cannot be read.
 */
export function useVaultImage(index: VaultIndex | undefined, relativePath: string) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!index || !relativePath) {
      setUrl(undefined);
      setError(undefined);
      return;
    }
    let cancelled = false;

    resolveVaultImageUrl(index, relativePath)
      .then((resolved) => {
        if (cancelled) return;
        setUrl(resolved ?? undefined);
        setError(undefined);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setUrl(undefined);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [index, relativePath]);

  return { url, error };
}
