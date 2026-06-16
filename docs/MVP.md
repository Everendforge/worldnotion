# Everend WorldNotion MVP

Everend WorldNotion is the desktop worldbuilding vault app for Everend Forge. The first MVP should be useful on Windows, macOS, and Linux without cloud, telemetry, or proprietary storage.

## Core behavior

- Open a local vault.
- Browse folders and Markdown files.
- Render Markdown.
- Parse YAML frontmatter.
- Resolve Obsidian-compatible wikilinks.
- Show backlinks.
- Search by name, content, tags, and IDs.
- Report broken links.
- Report missing required metadata.
- Edit and save Markdown files.

## Editing scope

The MVP editor is intentionally simple:

- Raw Markdown editing.
- Save the current file.
- No destructive actions.
- No mass rename.
- No folder moves.
- No automatic backlink rewrites.

## Safety defaults

- No cloud.
- No telemetry.
- No proprietary database as the source of truth.
- Warn before overwriting files changed externally since opening.
- Keep files readable by Obsidian-compatible tools.
- Prefer clear errors over risky automatic repairs.

## Done criteria

- Opens a synthetic demo vault.
- Opens an Obsidian-compatible vault.
- Navigates through file tree and wikilinks.
- Shows backlinks.
- Searches entities and content.
- Edits and saves Markdown.
- Reports broken links and incomplete frontmatter.
- Builds on Windows, macOS, and Linux.

## Not in MVP

- Advanced graph visualization.
- Multi-level templates.
- Astronomical calendar.
- Plugin system.
- AI.
- Multi-device sync.
- Real-time collaboration.
