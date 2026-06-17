import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { wikilinkPlugin } from "./wikilinkPlugin";

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme?: "light" | "dark";
  readOnly?: boolean;
}

export function CodeMirrorEditor({
  value,
  onChange,
  theme = "light",
  readOnly = false,
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
      theme={theme === "dark" ? oneDark : undefined}
      extensions={[
        markdown(),
        wikilinkPlugin,
        EditorView.lineWrapping,
        EditorView.editable.of(!readOnly),
      ]}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
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
        fontSize: "14px",
        height: "100%",
        width: "100%",
      }}
    />
  );
}
