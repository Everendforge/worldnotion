import { useCallback, useMemo, useState, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState as CodeMirrorState, Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { selectSubwordBackward, selectSubwordForward, indentMore, indentLess } from "@codemirror/commands";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { markdownSyntaxPlugin } from "./markdownSyntaxPlugin";
import { wikilinkPlugin } from "./wikilinkPlugin";
import { footnotePlugin } from "./footnotePlugin";
import { fontFamilyPlugin } from "./fontFamilyPlugin";
import { createDocumentHeaderPlugin } from "./documentHeaderPlugin";
import {
  EditorMode,
  EditorSettings,
  NoteSuggestion,
  ResolvedWikilink,
  SlashCommandDefinition,
  ThemeId,
} from "../editorTypes";
import { isDarkTheme, selectionColorForTheme } from "../themes";

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme?: ThemeId;
  readOnly?: boolean;
  mode?: EditorMode;
  settings: EditorSettings;
  documentName?: string;
  projectName?: string;
  resolveWikilink?: (label: string) => ResolvedWikilink;
  noteSuggestions?: NoteSuggestion[];
  onOpenWikilink?: (targetPath: string, label: string) => void;
  onMissingWikilink?: (label: string) => void;
  onOpenUrl?: (url: string) => void;
  onRequestUrl?: () => Promise<string | null>;
  onSelectionChange?: (rect?: DOMRect) => void;
  onCursorMove?: () => void; // Called on any cursor/selection change
  onEditorReady?: (view: EditorView) => void;
}

type SlashMenuState = {
  from: number;
  to: number;
  query: string;
  x: number;
  y: number;
};

type WikilinkMenuState = {
  from: number;
  to: number;
  query: string;
  x: number;
  y: number;
};

function lineTokenRangeAt(text: string, absoluteLineFrom: number, position: number, pattern: RegExp) {
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    const from = absoluteLineFrom + match.index;
    const to = from + match[0].length;
    if (position >= from && position < to) return { from, to, match };
  }
  return undefined;
}

const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { id: "text", label: "Text", keywords: ["paragraph", "normal"], group: "block" },
  { id: "heading1", label: "Heading 1", keywords: ["h1", "title"], group: "block" },
  { id: "heading2", label: "Heading 2", keywords: ["h2", "subtitle"], group: "block" },
  { id: "heading3", label: "Heading 3", keywords: ["h3"], group: "block" },
  { id: "heading4", label: "Heading 4", keywords: ["h4"], group: "block" },
  { id: "heading5", label: "Heading 5", keywords: ["h5"], group: "block" },
  { id: "heading6", label: "Heading 6", keywords: ["h6"], group: "block" },
  { id: "bullet", label: "Bullet list", keywords: ["ul", "list"], group: "block" },
  { id: "ordered", label: "Ordered list", keywords: ["ol", "number"], group: "block" },
  { id: "task", label: "Task list", keywords: ["todo", "checkbox"], group: "block" },
  { id: "quote", label: "Quote", keywords: ["blockquote"], group: "block" },
  { id: "code", label: "Code block", keywords: ["pre", "snippet"], group: "block" },
  { id: "divider", label: "Divider", keywords: ["rule", "hr"], group: "insert" },
  { id: "wikilink", label: "Wikilink", keywords: ["page", "note"], group: "insert" },
  { id: "link", label: "Link", keywords: ["url"], group: "insert" },
  { id: "footnote", label: "Footnote", keywords: ["reference", "note"], group: "insert" },
];

export function CodeMirrorEditor({
  value,
  onChange,
  theme = "worldnotion-light",
  readOnly = false,
  mode = "write",
  settings,
  documentName,
  projectName,
  resolveWikilink,
  noteSuggestions = [],
  onOpenWikilink,
  onMissingWikilink,
  onOpenUrl,
  onRequestUrl,
  onSelectionChange,
  onCursorMove,
  onEditorReady,
}: CodeMirrorEditorProps) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>();
  const [slashIndex, setSlashIndex] = useState(0);
  const [wikilinkMenu, setWikilinkMenu] = useState<WikilinkMenuState>();
  const [wikilinkIndex, setWikilinkIndex] = useState(0);
  
  // Debounce timers for menu detection (100ms debounce)
  const slashMenuDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const wikilinkMenuDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  const filteredSlashCommands = useMemo(() => {
    if (!slashMenu) return [];
    const query = slashMenu.query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (command) =>
        command.label.toLowerCase().includes(query) ||
        command.keywords.some((keyword) => keyword.includes(query)),
    ).slice(0, 8);
  }, [slashMenu]);

  const filteredNoteSuggestions = useMemo(() => {
    if (!wikilinkMenu) return [];
    const query = wikilinkMenu.query.toLowerCase();
    return noteSuggestions
      .filter((note) => {
        if (!query) return true;
        return (
          note.label.toLowerCase().includes(query) ||
          note.path.toLowerCase().includes(query) ||
          note.aliases.some((alias) => alias.toLowerCase().includes(query)) ||
          note.id?.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  }, [noteSuggestions, wikilinkMenu]);

  async function applySlashCommand(commandId: string) {
    if (!editorView || !slashMenu) return;
    const line = editorView.state.doc.lineAt(slashMenu.from);
    const lineText = editorView.state.doc.sliceString(line.from, line.to);
    const afterSlash = editorView.state.doc.sliceString(slashMenu.to, line.to);
    const plain = `${lineText.slice(0, slashMenu.from - line.from)}${afterSlash}`
      .replace(/^#{1,6}\s+/, "")
      .replace(/^(- \[[ xX]\]|\d+\.|[-*])\s+/, "")
      .replace(/^>\s+/, "");
    const linkUrl = commandId === "link" ? await onRequestUrl?.() : undefined;
    if (commandId === "link" && !linkUrl?.trim()) {
      editorView.focus();
      setSlashMenu(undefined);
      return;
    }
    
    // Calculate next footnote number
    let footnoteRef = "[^1]";
    if (commandId === "footnote") {
      const fullText = editorView.state.doc.toString();
      const footnoteRegex = /\[\^(\d+)\]/g;
      let maxNum = 0;
      let match: RegExpExecArray | null;
      while ((match = footnoteRegex.exec(fullText)) !== null) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
      footnoteRef = `[^${maxNum + 1}]`;
    }
    
    const replacements: Record<string, string> = {
      text: plain || "",
      heading1: `# ${plain || "Heading 1"}`,
      heading2: `## ${plain || "Heading 2"}`,
      heading3: `### ${plain || "Heading 3"}`,
      heading4: `#### ${plain || "Heading 4"}`,
      heading5: `##### ${plain || "Heading 5"}`,
      heading6: `###### ${plain || "Heading 6"}`,
      bullet: `- ${plain || "List item"}`,
      ordered: `1. ${plain || "List item"}`,
      task: `- [ ] ${plain || "Task"}`,
      quote: `> ${plain || "Quote"}`,
      code: "```\ncode\n```",
      divider: "---",
      wikilink: `[[${plain || "Page Name"}|${plain || "Alias"}]]`,
      footnote: footnoteRef,
      link: `[${plain || "link text"}](${linkUrl?.trim()})`,
    };
    const insert = replacements[commandId] ?? plain;
    const aliasSelection =
      commandId === "wikilink"
        ? {
            anchor: line.from + 2 + (plain || "Page Name").length + 1,
            head: line.from + insert.length - 2,
          }
        : undefined;
    editorView.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: aliasSelection ?? { anchor: line.from + insert.length },
    });
    editorView.focus();
    setSlashMenu(undefined);
  }

  function applyWikilinkSuggestion(note: NoteSuggestion) {
    if (!editorView || !wikilinkMenu) return;
    const insert = `[[${note.label}|${note.label}]]`;
    const aliasFrom = wikilinkMenu.from + 2 + note.label.length + 1;
    const trailing = editorView.state.doc.sliceString(wikilinkMenu.to, Math.min(editorView.state.doc.length, wikilinkMenu.to + 2));
    const replaceTo = trailing === "]]" ? wikilinkMenu.to + 2 : wikilinkMenu.to;
    editorView.dispatch({
      changes: { from: wikilinkMenu.from, to: replaceTo, insert },
      selection: { anchor: aliasFrom, head: aliasFrom + note.label.length },
    });
    editorView.focus();
    setWikilinkMenu(undefined);
  }

  function handleMenuKey(event: KeyboardEvent) {
    if (wikilinkMenu && filteredNoteSuggestions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setWikilinkIndex((current) => (current + 1) % filteredNoteSuggestions.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setWikilinkIndex((current) => (current - 1 + filteredNoteSuggestions.length) % filteredNoteSuggestions.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applyWikilinkSuggestion(filteredNoteSuggestions[wikilinkIndex] ?? filteredNoteSuggestions[0]);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setWikilinkMenu(undefined);
        return true;
      }
    }

    if (slashMenu && filteredSlashCommands.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((current) => (current + 1) % filteredSlashCommands.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex((current) => (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        void applySlashCommand(filteredSlashCommands[slashIndex]?.id ?? filteredSlashCommands[0].id);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenu(undefined);
        return true;
      }
    }

    return false;
  }

  // Helper: Check if cursor is in a context where menus should not appear
  function isInIgnoredContext(view: EditorView, selection: { from: number }): boolean {
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    const cursorPos = selection.from - line.from;
    
    // Check for code blocks (triple backticks or indented code)
    if (lineText.trim().startsWith("```") || /^\s{4,}/.test(lineText)) {
      return true;
    }
    
    // Check if inside backticks (inline code)
    const beforeCursor = lineText.slice(0, cursorPos);
    const afterCursor = lineText.slice(cursorPos);
    const backtickCountBefore = (beforeCursor.match(/`/g) || []).length;
    const backtickCountAfter = (afterCursor.match(/`/g) || []).length;
    if (backtickCountBefore % 2 === 1 && backtickCountAfter % 2 === 1) {
      return true;
    }
    
    // Check if inside quotes or blockquote
    if (lineText.trim().startsWith(">")) {
      return true;
    }
    
    // Check if previous line is a fence start (for code block continuation)
    if (line.number > 1) {
      const prevLine = view.state.doc.line(line.number - 1);
      if (prevLine.text.trim().startsWith("```")) {
        return true;
      }
    }
    
    return false;
  }

  function detectSlashMenu(view: EditorView) {
    // Clear any pending debounce
    if (slashMenuDebounceRef.current) {
      clearTimeout(slashMenuDebounceRef.current);
    }

    if (mode !== "write") {
      setSlashMenu(undefined);
      return;
    }
    const selection = view.state.selection.main;
    if (!selection.empty) {
      setSlashMenu(undefined);
      return;
    }
    
    // Check if in ignored context
    if (isInIgnoredContext(view, selection)) {
      setSlashMenu(undefined);
      return;
    }
    
    const line = view.state.doc.lineAt(selection.from);
    const before = view.state.doc.sliceString(line.from, selection.from);
    const match = /(?:^|\s)\/([\w-]*)$/.exec(before);
    if (!match) {
      setSlashMenu(undefined);
      return;
    }
    
    // Debounce the actual menu display (100ms)
    slashMenuDebounceRef.current = setTimeout(() => {
      const coords = view.coordsAtPos(selection.from);
      if (!coords) return;
      setSlashMenu({
        from: selection.from - (match[1]?.length ?? 0) - 1,
        to: selection.from,
        query: match[1] ?? "",
        x: coords.left,
        y: coords.bottom + 8,
      });
      setSlashIndex(0);
    }, 100);
  }

  function detectWikilinkMenu(view: EditorView) {
    // Clear any pending debounce
    if (wikilinkMenuDebounceRef.current) {
      clearTimeout(wikilinkMenuDebounceRef.current);
    }

    if (mode !== "write") {
      setWikilinkMenu(undefined);
      return;
    }
    const selection = view.state.selection.main;
    if (!selection.empty) {
      setWikilinkMenu(undefined);
      return;
    }
    
    // Check if in ignored context
    if (isInIgnoredContext(view, selection)) {
      setWikilinkMenu(undefined);
      return;
    }
    
    const line = view.state.doc.lineAt(selection.from);
    const before = view.state.doc.sliceString(line.from, selection.from);
    const lastOpen = before.lastIndexOf("[[");
    if (lastOpen === -1) {
      setWikilinkMenu(undefined);
      return;
    }
    const fragment = before.slice(lastOpen + 2);
    if (fragment.includes("]") || fragment.includes("|") || fragment.includes("\n")) {
      setWikilinkMenu(undefined);
      return;
    }
    
    // Debounce the actual menu display (100ms)
    wikilinkMenuDebounceRef.current = setTimeout(() => {
      const coords = view.coordsAtPos(selection.from);
      if (!coords) return;
      setWikilinkMenu({
        from: line.from + lastOpen,
        to: selection.from,
        query: fragment,
        x: coords.left,
        y: coords.bottom + 8,
      });
      setWikilinkIndex(0);
    }, 100);
  }

  function openUrlAtEvent(event: MouseEvent, view: EditorView) {
    if (!event.metaKey && !event.ctrlKey) return false;
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position === null) return false;
    const line = view.state.doc.lineAt(position);
    const token = lineTokenRangeAt(line.text, line.from, position, /\[([^\]]+)\]\(([^)]+)\)/g);
    if (token) {
      event.preventDefault();
      onOpenUrl?.(token.match[2]);
      return true;
    }
    return false;
  }

  // Helper functions for smart keybindings
  function isInList(view: EditorView): boolean {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    // Match unordered lists (-, *), ordered lists (1.), or checkboxes (- [ ])
    return /^(\s*)([-*]|(\d+)\.|\-\s\[[\sx]\])\s/.test(lineText);
  }

  function isInQuote(view: EditorView): boolean {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    // Match quote lines starting with >
    return /^(\s*)>/.test(lineText);
  }

  function getListItemPrefix(lineText: string): { indent: string; prefix: string } {
    // Handle bullet lists with - or *
    const bulletMatch = /^(\s*)([-*])\s/.exec(lineText);
    if (bulletMatch) {
      return { indent: bulletMatch[1], prefix: bulletMatch[2] + " " };
    }
    
    // Handle ordered lists (1., 2., etc.)
    const orderedMatch = /^(\s*)(\d+)\.\s/.exec(lineText);
    if (orderedMatch) {
      const num = parseInt(orderedMatch[2], 10) + 1;
      return { indent: orderedMatch[1], prefix: `${num}. ` };
    }
    
    // Handle checkboxes (- [ ], - [x], - [X])
    const checkboxMatch = /^(\s*)-\s\[([\sx])\]\s/.exec(lineText);
    if (checkboxMatch) {
      return { indent: checkboxMatch[1], prefix: "- [ ] " };
    }
    
    return { indent: "", prefix: "" };
  }

  function getQuotePrefix(lineText: string): string {
    const match = /^(\s*)>/.exec(lineText);
    if (!match) return "> ";
    const indent = match[1];
    return indent + "> ";
  }

  // Smart markdown helpers for bold/italic toggling
  function toggleMarkdownFormat(view: EditorView, marker: string): boolean {
    if (mode !== "write") return false;
    
    const selection = view.state.selection.main;
    if (selection.empty) return false; // No selection, do nothing
    
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);
    const doubleMarker = marker + marker;
    
    // Check if text is already wrapped in markers
    if (selectedText.startsWith(doubleMarker) && selectedText.endsWith(doubleMarker)) {
      // Remove markers
      const unwrapped = selectedText.slice(doubleMarker.length, -doubleMarker.length);
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: unwrapped },
        selection: { anchor: selection.from, head: selection.from + unwrapped.length },
      });
      return true;
    } else {
      // Add markers
      const wrapped = doubleMarker + selectedText + doubleMarker;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: wrapped },
        selection: { anchor: selection.from + doubleMarker.length, head: selection.from + doubleMarker.length + selectedText.length },
      });
      return true;
    }
  }

  // Check if selection is inside or adjacent to special markdown syntax
  const isSelectionInSpecialSyntax = useCallback((view: EditorView, from: number, to: number): boolean => {
    // Get the line containing the selection
    const lineFrom = view.state.doc.lineAt(from);
    const lineTo = view.state.doc.lineAt(to);
    
    // If selection spans multiple lines, allow toolbar
    if (lineFrom.number !== lineTo.number) {
      return false;
    }
    
    const lineText = lineFrom.text;
    const selStart = from - lineFrom.from;
    const selEnd = to - lineFrom.from;
    
    // Check for wikilinks [[...]]
    const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = wikilinkRegex.exec(lineText)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      
      // Check if selection overlaps or is adjacent to wikilink
      if (selStart <= matchEnd && selEnd >= matchStart) {
        return true;
      }
    }
    
    // Check for inline code `...`
    const codeRegex = /`[^`]+`/g;
    while ((match = codeRegex.exec(lineText)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      
      if (selStart <= matchEnd && selEnd >= matchStart) {
        return true;
      }
    }
    
    return false;
  }, []);

  // Simple selection rect calculation
  const handleSelectionChange = useCallback((view: EditorView) => {
    const selection = view.state.selection.main;
    if (selection.empty) {
      onSelectionChange?.(undefined);
      return;
    }

    // Don't show toolbar if selection is inside special syntax
    if (isSelectionInSpecialSyntax(view, selection.from, selection.to)) {
      onSelectionChange?.(undefined);
      return;
    }

    const fromCoords = view.coordsAtPos(selection.from);
    const toCoords = view.coordsAtPos(selection.to);

    if (!fromCoords || !toCoords) {
      onSelectionChange?.(undefined);
      return;
    }

    const left = Math.min(fromCoords.left, toCoords.left);
    const right = Math.max((fromCoords.right ?? fromCoords.left), (toCoords.right ?? toCoords.left));
    const top = Math.min(fromCoords.top, toCoords.top);
    const bottom = Math.max(fromCoords.bottom, toCoords.bottom);

    const rect = new DOMRect(left, top, right - left, bottom - top);
    onSelectionChange?.(rect);
  }, [onSelectionChange, isSelectionInSpecialSyntax]);

  return (
    <div className="codemirror-wrap">
      <CodeMirror
        value={value}
        onChange={handleChange}
        onCreateEditor={(view) => {
          setEditorView(view);
          onEditorReady?.(view);
        }}
        theme={isDarkTheme(theme) ? oneDark : undefined}
        extensions={[
          markdown(),
          ...(settings.documentHeaderEnabled && documentName && mode === "write" 
            ? [createDocumentHeaderPlugin({ 
                documentName, 
                projectName, 
                showProjectName: settings.showProjectNameInHeader 
              })] 
            : []),
          ...(settings.codeFoldingEnabled ? [
            foldGutter({
              openText: "▼",
              closedText: "▶",
            }),
            keymap.of(foldKeymap),
          ] : []),
          ...(mode === "write" ? [wikilinkPlugin({ resolveWikilink, onOpenWikilink, onMissingWikilink })] : []),
          ...(mode === "write" ? [footnotePlugin()] : []),
          ...(mode === "write" && settings.hideMarkdownSyntaxInWrite ? [markdownSyntaxPlugin] : []),
          ...(mode === "write" ? [fontFamilyPlugin] : []),
          ...(settings.lineWrap ? [EditorView.lineWrapping] : []),
          CodeMirrorState.tabSize.of(settings.tabSize),
          Prec.highest(keymap.of([
            {
              key: "ArrowDown",
              run: () => {
                if (wikilinkMenu && filteredNoteSuggestions.length) {
                  setWikilinkIndex((current) => (current + 1) % filteredNoteSuggestions.length);
                  return true;
                }
                if (!slashMenu || !filteredSlashCommands.length) return false;
                setSlashIndex((current) => (current + 1) % filteredSlashCommands.length);
                return true;
              },
            },
            {
              key: "ArrowUp",
              run: () => {
                if (wikilinkMenu && filteredNoteSuggestions.length) {
                  setWikilinkIndex((current) => (current - 1 + filteredNoteSuggestions.length) % filteredNoteSuggestions.length);
                  return true;
                }
                if (!slashMenu || !filteredSlashCommands.length) return false;
                setSlashIndex((current) => (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
                return true;
              },
            },
            {
              key: "Tab",
              run: (view) => {
                // Tab only hijacks if a menu is active
                if (wikilinkMenu && filteredNoteSuggestions.length) {
                  applyWikilinkSuggestion(filteredNoteSuggestions[wikilinkIndex] ?? filteredNoteSuggestions[0]);
                  return true;
                }
                if (slashMenu && filteredSlashCommands.length) {
                  void applySlashCommand(filteredSlashCommands[slashIndex]?.id ?? filteredSlashCommands[0].id);
                  return true;
                }
                // Default: indent normally
                return indentMore(view);
              },
            },
            {
              key: "Shift-Tab",
              run: (view) => {
                // Always dedent (don't hijack for menus)
                return indentLess(view);
              },
            },
            {
              key: "Enter",
              run: (view) => {
                // First check if menus are active
                if (wikilinkMenu && filteredNoteSuggestions.length) {
                  applyWikilinkSuggestion(filteredNoteSuggestions[wikilinkIndex] ?? filteredNoteSuggestions[0]);
                  return true;
                }
                if (slashMenu && filteredSlashCommands.length) {
                  void applySlashCommand(filteredSlashCommands[slashIndex]?.id ?? filteredSlashCommands[0].id);
                  return true;
                }
                
                const selection = view.state.selection.main;
                const line = view.state.doc.lineAt(selection.from);
                
                // Handle quotes: continue with > prefix
                if (isInQuote(view)) {
                  const quotePrefix = getQuotePrefix(line.text);
                  view.dispatch({
                    changes: { from: selection.from, insert: "\n" + quotePrefix },
                    selection: { anchor: selection.from + 1 + quotePrefix.length },
                  });
                  return true;
                }
                
                // Handle lists: auto-continue with proper prefix
                if (isInList(view)) {
                  const before = line.text.slice(0, selection.from - line.from);
                  // Only auto-continue if we're at the end of a non-empty list item
                  if (before.match(/^(\s*)([-*]|(\d+)\.|\[\s*[\sx]\s*\])\s+\S/)) {
                    const { indent, prefix } = getListItemPrefix(line.text);
                    view.dispatch({
                      changes: { from: selection.from, insert: "\n" + indent + prefix },
                      selection: { anchor: selection.from + indent.length + prefix.length + 1 },
                    });
                    return true;
                  }
                }
                
                // Default: insert plain newline
                view.dispatch({
                  changes: { from: selection.from, insert: "\n" },
                  selection: { anchor: selection.from + 1 },
                });
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                if (wikilinkMenu) {
                  setWikilinkMenu(undefined);
                  return true;
                }
                if (!slashMenu) return false;
                setSlashMenu(undefined);
                return true;
              },
            },
            {
              key: "Cmd-Shift-ArrowLeft",
              mac: "Cmd-Shift-ArrowLeft",
              run: selectSubwordBackward,
            },
            {
              key: "Cmd-Shift-ArrowRight",
              mac: "Cmd-Shift-ArrowRight",
              run: selectSubwordForward,
            },
            {
              key: "Alt-Shift-ArrowLeft",
              mac: "Alt-Shift-ArrowLeft",
              run: selectSubwordBackward,
            },
            {
              key: "Alt-Shift-ArrowRight",
              mac: "Alt-Shift-ArrowRight",
              run: selectSubwordForward,
            },
            {
              key: "Cmd-b",
              mac: "Cmd-b",
              run: (view) => toggleMarkdownFormat(view, "*"),
            },
            {
              key: "Ctrl-b",
              run: (view) => toggleMarkdownFormat(view, "*"),
            },
            {
              key: "Cmd-i",
              mac: "Cmd-i",
              run: (view) => toggleMarkdownFormat(view, "_"),
            },
            {
              key: "Ctrl-i",
              run: (view) => toggleMarkdownFormat(view, "_"),
            },
          ])),
          EditorView.domEventHandlers({
            keydown(event) {
              return handleMenuKey(event);
            },
            mousedown(event, view) {
              return openUrlAtEvent(event, view);
            },
          }),
          EditorView.updateListener.of((update) => {
            // Menu detection
            if (update.docChanged || update.selectionSet) {
              detectSlashMenu(update.view);
              detectWikilinkMenu(update.view);
            }

            // Cursor move callback
            if (update.selectionSet || update.docChanged) {
              onCursorMove?.();
            }

            // Selection change callback
            if (update.selectionSet) {
              handleSelectionChange(update.view);
            }
          }),
          EditorView.theme({
            "&": {
              fontSize: `${settings.fontSize}px`,
              height: "100%",
              backgroundColor: "var(--wn-editor-bg)",
              color: "var(--wn-editor-text)",
            },
            ".cm-editor": {
              backgroundColor: "var(--wn-editor-bg)",
              color: "var(--wn-editor-text)",
            },
            ".cm-scroller": {
              backgroundColor: "var(--wn-editor-bg)",
            },
            ".cm-gutters": {
              backgroundColor: "var(--wn-editor-bg)",
              borderRight: "1px solid var(--wn-border)",
              color: "var(--wn-muted)",
            },
            ".cm-activeLine, .cm-activeLineGutter": {
              backgroundColor: "var(--wn-panel-2)",
            },
            ".cm-cursor": {
              borderLeftColor: "var(--wn-accent)",
            },
            ".cm-selectionBackground": {
              backgroundColor: selectionColorForTheme(theme).backgroundColor,
              opacity: selectionColorForTheme(theme).opacity,
            },
            ".cm-selection": {
              backgroundColor: selectionColorForTheme(theme).backgroundColor,
              opacity: selectionColorForTheme(theme).opacity,
            },
            ".cm-content": {
              fontFamily: mode === "source" ? settings.sourceFontFamily : settings.writeFontFamily,
            },
          }),
          EditorView.editable.of(!readOnly),
        ]}
        basicSetup={{
          lineNumbers: mode === "source" ? true : settings.lineNumbers,
          highlightActiveLineGutter: true,
          highlightActiveLine: settings.activeLine,
          foldGutter: mode === "source",
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
      {slashMenu && filteredSlashCommands.length ? (
        <div className="slash-menu" style={{ left: slashMenu.x, top: slashMenu.y }}>
          {filteredSlashCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              className={filteredSlashCommands[slashIndex]?.id === command.id ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSlashIndex(filteredSlashCommands.findIndex((candidate) => candidate.id === command.id))}
              onClick={() => {
                void applySlashCommand(command.id);
              }}
            >
              <span>{command.label}</span>
              <small>{command.group}</small>
            </button>
          ))}
        </div>
      ) : null}
      {wikilinkMenu && filteredNoteSuggestions.length ? (
        <div className="slash-menu note-suggestion-menu" style={{ left: wikilinkMenu.x, top: wikilinkMenu.y }}>
          {filteredNoteSuggestions.map((note) => (
            <button
              key={note.path}
              type="button"
              className={filteredNoteSuggestions[wikilinkIndex]?.path === note.path ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setWikilinkIndex(filteredNoteSuggestions.findIndex((candidate) => candidate.path === note.path))}
              onClick={() => applyWikilinkSuggestion(note)}
            >
              <span>{note.label}</span>
              <small>{note.path}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
