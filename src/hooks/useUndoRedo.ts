import { useCallback, useState } from "react";

export type UndoRedoAction =
  | { type: "move"; data: { fromPath: string; toFolderPath: string; kind: "file" | "folder" } }
  | { type: "create"; data: { path: string; kind: "file" | "folder"; parentPath?: string } }
  | { type: "delete"; data: { path: string; kind: "file" | "folder"; canRestore: boolean } }
  | { type: "rename"; data: { oldPath: string; newPath: string; kind: "file" | "folder" } }
  | { type: "duplicate"; data: { sourcePath: string; newPath: string; kind: "file" | "folder" } };

export interface UseUndoRedoOptions {
  maxHistorySize?: number;
}

export function useUndoRedo(options: UseUndoRedoOptions = {}) {
  const { maxHistorySize = 50 } = options;

  const [undoStack, setUndoStack] = useState<UndoRedoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoAction[]>([]);

  const recordAction = useCallback((action: UndoRedoAction) => {
    setUndoStack((current) => {
      const next = [...current, action];
      // Keep only last maxHistorySize items
      if (next.length > maxHistorySize) {
        return next.slice(-maxHistorySize);
      }
      return next;
    });
    // Clear redo stack when new action is recorded
    setRedoStack([]);
  }, [maxHistorySize]);

  const undo = useCallback(() => {
    setUndoStack((current) => {
      if (current.length === 0) return current;
      const lastAction = current[current.length - 1];
      setRedoStack((redoState) => [...redoState, lastAction]);
      return current.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((current) => {
      if (current.length === 0) return current;
      const nextAction = current[current.length - 1];
      setUndoStack((undoState) => [...undoState, nextAction]);
      return current.slice(0, -1);
    });
  }, []);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    undoStack,
    redoStack,
    recordAction,
    undo,
    redo,
    clearHistory,
    canUndo,
    canRedo,
  };
}
