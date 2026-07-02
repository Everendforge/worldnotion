import { canUseBrowserDirectoryPicker } from "./appEnvironment";
import type { BrowserDirectoryHandle } from "./browserVault";

export type BrowserPickerResult =
  { status: "selected"; root: BrowserDirectoryHandle } | { status: "cancelled" };

function pickerErrorName(error: unknown): string | undefined {
  return error instanceof DOMException ? error.name : undefined;
}

/**
 * Opens the File System Access directory picker, trying readwrite first and
 * falling back to read-only in restricted environments. Cancellation is a
 * normal result; environment problems (unsupported browser, VS Code webview)
 * throw with a user-facing message.
 */
export async function pickBrowserDirectory(): Promise<BrowserPickerResult> {
  if (!canUseBrowserDirectoryPicker()) {
    throw new Error(
      "Folder picker is unavailable in this browser. Please use a Chromium-based browser (Chrome, Edge, Brave) or the Tauri desktop app.",
    );
  }

  if (navigator.userAgent.includes("Electron")) {
    throw new Error(
      "File picker is restricted in VS Code's embedded browser. " +
        "Please use the Tauri desktop app instead: npm run tauri dev",
    );
  }

  const picker = window as unknown as {
    showDirectoryPicker: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<BrowserDirectoryHandle>;
  };

  try {
    return { status: "selected", root: await picker.showDirectoryPicker({ mode: "readwrite" }) };
  } catch (readwriteError: unknown) {
    if (pickerErrorName(readwriteError) !== "AbortError") throw readwriteError;
    // AbortError can mean the user cancelled OR a restricted environment
    // rejecting readwrite; retry read-only to distinguish the two.
    try {
      return { status: "selected", root: await picker.showDirectoryPicker() };
    } catch (readonlyError: unknown) {
      if (pickerErrorName(readonlyError) === "AbortError") return { status: "cancelled" };
      throw readonlyError;
    }
  }
}
