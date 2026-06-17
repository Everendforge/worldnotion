# CodeMirror 6 Integration

WorldNotion uses CodeMirror 6 as its Markdown editor, the same engine that powers Obsidian. This ensures maximum compatibility with Obsidian vaults and provides a professional, extensible editing experience.

## Architecture

The editor has two modes:

- **Source mode**: Direct Markdown editing with syntax highlighting and wikilink decoration
- **Preview mode**: Rendered HTML view with GitHub Flavored Markdown support

Unlike WYSIWYG editors (e.g., Tiptap, TinyMCE), CodeMirror edits Markdown directly without HTML conversion, eliminating data loss and ensuring perfect round-trip fidelity.

## Components

### CodeMirrorEditor (`src/components/CodeMirrorEditor.tsx`)

Wrapper component around `@uiw/react-codemirror` with:

- Markdown language support (`@codemirror/lang-markdown`)
- Wikilink decoration plugin (highlights `[[links]]`)
- Line wrapping and syntax highlighting
- Theme support (light/dark)
- Read-only mode for templates

**Props:**
- `value: string` - The raw Markdown content
- `onChange: (value: string) => void` - Change handler
- `theme?: "light" | "dark"` - Editor theme
- `readOnly?: boolean` - Disable editing

**Extensions:**
- `markdown()` - Markdown syntax highlighting
- `wikilinkPlugin` - Decorates `[[wikilinks]]` with custom styling
- `EditorView.lineWrapping` - Soft line wrapping
- `EditorView.editable.of(!readOnly)` - Controls edit state

### Wikilink Plugin (`src/components/wikilinkPlugin.ts`)

CodeMirror decoration plugin that highlights `[[wikilinks]]` in the editor using regex matching and the `Decoration` API.

**Features:**
- Matches `[[target]]` pattern in visible ranges
- Applies `.cm-wikilink` CSS class
- Updates decorations on document/viewport changes
- No DOM manipulation, uses CodeMirror's decoration system

### MarkdownPreview (`src/components/MarkdownPreview.tsx`)

Renders Markdown to HTML using `remark` and `remark-gfm` (GitHub Flavored Markdown).

**Features:**
- Tables, task lists, strikethrough, autolinks
- Custom wikilink processing (converts `[[link]]` to styled `<span>`)
- Sanitization disabled (we control the content)
- Responsive styling with proper heading hierarchy

## Styling

### Wikilinks in Source Mode (`.cm-wikilink`)

```css
.cm-wikilink {
  color: var(--wn-accent);
  text-decoration: underline dotted;
  cursor: pointer;
  font-weight: 500;
}

.cm-wikilink:hover {
  background: var(--wn-accent-soft);
  text-decoration-style: solid;
}
```

### Markdown Preview (`.markdown-preview`)

Comprehensive styling for:
- Headings (`h1` with bottom border, `h2`-`h6` hierarchy)
- Lists, tables, code blocks, blockquotes
- Wikilinks (styled identically to editor)
- GitHub Flavored Markdown elements

## Comparison to Tiptap

| Feature | CodeMirror 6 | Tiptap (removed) |
|---------|-------------|------------------|
| **Data format** | Pure Markdown | HTML (converted to/from MD) |
| **Round-trip fidelity** | Perfect | Lossy (conversion errors) |
| **Obsidian compatibility** | Native | Requires conversion |
| **Wikilinks** | Direct editing | Must convert `[[]]` ↔ HTML |
| **Learning curve** | Markdown syntax | WYSIWYG interface |
| **Extensibility** | Decoration API, extensions | ProseMirror plugins |
| **Performance** | Optimized for large docs | DOM-heavy rendering |

## Why CodeMirror?

1. **Obsidian uses it**: WorldNotion aims for Obsidian compatibility, CodeMirror is the standard
2. **No conversion layer**: Direct Markdown editing eliminates bugs and data loss
3. **Extensible**: Decoration API allows custom syntax highlighting (wikilinks, tags, etc.)
4. **Mature ecosystem**: Well-documented, widely used, active development

## Dependencies

```json
{
  "@codemirror/state": "^6.x",
  "@codemirror/view": "^6.x",
  "@codemirror/commands": "^6.x",
  "@codemirror/lang-markdown": "^6.x",
  "@codemirror/language": "^6.x",
  "@codemirror/theme-one-dark": "^6.x",
  "@uiw/react-codemirror": "^4.x",
  "remark": "^15.x",
  "remark-gfm": "^4.x",
  "remark-html": "^16.x"
}
```

## Future Enhancements

- [ ] Live preview mode (split pane, source + preview simultaneously)
- [ ] Wikilink autocomplete (suggest existing pages)
- [ ] Clickable wikilinks in source mode (navigate to target)
- [ ] Syntax highlighting for YAML frontmatter
- [ ] Tag decoration (highlight `#tags`)
- [ ] Vim/Emacs keybindings (optional)
- [ ] Collaborative editing (via Yjs/CRDT)

## References

- [CodeMirror 6 Docs](https://codemirror.net/docs/)
- [Obsidian Editor](https://obsidian.md/) (inspiration)
- [Remark Plugins](https://github.com/remarkjs/remark/blob/main/doc/plugins.md)
