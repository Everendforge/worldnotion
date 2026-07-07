import { invoke } from "@tauri-apps/api/core";
import type { WriteResult } from "../domain";
import {
  copyBrowserPath,
  ensureBrowserWritePermission,
  getBrowserDirectory,
  moveBrowserPath,
  removeBrowserPath,
  renameBrowserPath,
  writeBrowserFile,
  type BrowserDirectoryHandle,
} from "./browserVault";
import { relativeFromAbsolute } from "./pathUtils";

/**
 * Destino de una operación de archivos: un vault abierto vía File System
 * Access API (navegador) o vía comandos Tauri (escritorio). Las primitivas de
 * este módulo encapsulan la bifurcación para que la capa de UI no repita
 * `if (browserRoot)` en cada acción.
 */
export type VaultHandle =
  { kind: "browser"; root: BrowserDirectoryHandle } | { kind: "tauri"; rootPath: string };

export function vaultHandleFor(
  rootPath: string,
  browserRoot: BrowserDirectoryHandle | undefined,
): VaultHandle {
  return browserRoot ? { kind: "browser", root: browserRoot } : { kind: "tauri", rootPath };
}

async function invokeWrite(
  command: string,
  args: Record<string, unknown>,
  fallbackMessage: string,
): Promise<WriteResult> {
  const result = await invoke<WriteResult>(command, args);
  if (!result.ok) throw new Error(result.message ?? fallbackMessage);
  return result;
}

/**
 * Guarda un archivo y devuelve su `modifiedMs` cuando el backend lo informa.
 * `expectedModifiedMs` habilita la detección de conflictos en escritorio; el
 * navegador no la soporta y escribe siempre.
 */
export async function saveVaultFile(
  vault: VaultHandle,
  relativePath: string,
  content: string,
  fallbackMessage = "Could not save file.",
  expectedModifiedMs: number | null = null,
): Promise<number | null | undefined> {
  if (vault.kind === "browser") {
    return writeBrowserFile(vault.root, relativePath, content);
  }
  const result = await invokeWrite(
    "save_file",
    { path: `${vault.rootPath}/${relativePath}`, content, expectedModifiedMs },
    fallbackMessage,
  );
  return result.modifiedMs;
}

/**
 * En escritorio delega en `create_entity` (el backend genera el contenido a
 * partir de la plantilla del vault); en navegador escribe `content` en la
 * ruta calculada por el llamador.
 */
export async function createVaultEntity(
  vault: VaultHandle,
  params: {
    parentPath: string;
    entityType: string;
    name: string;
    browserPath: string;
    browserContent: string;
  },
): Promise<void> {
  if (vault.kind === "browser") {
    await writeBrowserFile(vault.root, params.browserPath, params.browserContent);
    return;
  }
  await invokeWrite(
    "create_entity",
    {
      vaultPath: vault.rootPath,
      universePath: "",
      folderPath: params.parentPath,
      entityType: params.entityType,
      name: params.name,
    },
    "Could not create entity.",
  );
}

export async function createVaultFolder(vault: VaultHandle, folderPath: string): Promise<void> {
  if (vault.kind === "browser") {
    await ensureBrowserWritePermission(vault.root);
    await getBrowserDirectory(vault.root, folderPath, true);
    return;
  }
  await invokeWrite(
    "create_folder",
    { vaultPath: vault.rootPath, relativePath: folderPath },
    "Could not create folder.",
  );
}

export async function renameVaultPath(
  vault: VaultHandle,
  targetPath: string,
  newName: string,
  kind: "file" | "folder",
): Promise<void> {
  if (vault.kind === "browser") {
    await renameBrowserPath(vault.root, targetPath, newName, kind);
    return;
  }
  await invokeWrite(
    "rename_path",
    { vaultPath: vault.rootPath, relativePath: targetPath, newName },
    "Could not rename item.",
  );
}

/** Devuelve la ruta relativa del duplicado. */
export async function duplicateVaultPath(
  vault: VaultHandle,
  targetPath: string,
  kind: "file" | "folder",
  plannedTargetPath: string,
): Promise<string> {
  if (vault.kind === "browser") {
    await copyBrowserPath(vault.root, targetPath, plannedTargetPath, kind);
    return plannedTargetPath;
  }
  const result = await invokeWrite(
    "duplicate_path",
    { vaultPath: vault.rootPath, relativePath: targetPath, targetName: null },
    "Could not duplicate item.",
  );
  return relativeFromAbsolute(vault.rootPath, result.path);
}

/** Devuelve la ruta relativa tras el movimiento. */
export async function moveVaultPath(
  vault: VaultHandle,
  fromPath: string,
  toFolderPath: string,
  kind: "file" | "folder",
): Promise<string> {
  if (vault.kind === "browser") {
    return moveBrowserPath(vault.root, fromPath, toFolderPath, kind);
  }
  const result = await invokeWrite(
    "move_path",
    { vaultPath: vault.rootPath, fromRelativePath: fromPath, toFolderRelativePath: toFolderPath },
    "Could not move item.",
  );
  return relativeFromAbsolute(vault.rootPath, result.path);
}

export async function trashVaultPath(vault: VaultHandle, relativePath: string): Promise<void> {
  if (vault.kind === "browser") {
    await removeBrowserPath(vault.root, relativePath, true);
    return;
  }
  await invokeWrite(
    "trash_path",
    { vaultPath: vault.rootPath, relativePath },
    "Could not move item to Trash.",
  );
}
