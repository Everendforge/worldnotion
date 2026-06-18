import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState as CodeMirrorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { wikilinkPlugin } from "./wikilinkPlugin";
import { EditorMode, EditorSettings } from "../editorTypes";

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme?: "light" | "dark";
  readOnly?: boolean;
  mode?: EditorMode;
  settings: EditorSettings;
  onEditorReady?: (view: EditorView) => void;
}

export function CodeMirrorEditor({
  value,
  onChange,
  theme = "light",
  readOnly = false,
  mode = "write",
  settings,
  onEditorReady,
}: CodeMirrorEditorProps) {
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <CodeMirror
      value={value}
      onChange={handleChange}
      onCreateEditor={(view) => onEditorReady?.(view)}
      theme={theme === "dark" ? oneDark : undefined}
      extensions={[
        markdown(),
        ...(mode === "write" ? [wikilinkPlugin] : []),
        ...(settings.lineWrap ? [EditorView.lineWrapping] : []),
        CodeMirrorState.tabSize.of(settings.tabSize),
        EditorView.theme({
          "&": {
            fontSize: `${settings.fontSize}px`,
          },
          ".cm-content": {
            fontFamily: mode === "source" ? '"SFMono-Regular", Consolas, monospace' : "inherit",
          },
        }),
        EditorView.editable.of(!readOnly),
      ]}
      basicSetup={{
        lineNumbers: settings.lineNumbers,
        highlightActiveLineGutter: true,
        highlightActiveLine: settings.activeLine,
        foldGutter: true,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        rectangularSelection: true,
        crosshairCursor: true,
        highlightSelectionMatches: true,
        closeBracketsKeymap: true,
        searchKeymap: true,
        foldKeymap: true,
        completionKeymap: true,
        lintKeymap: true,
      }}
      style={{
        height: "100%",
        width: "100%",
      }}
    />
  );
}
