# Everend WorldNotion

Everend WorldNotion is the desktop worldbuilding vault app for Everend Forge. It opens local Markdown vaults, keeps canon portable, and implements Everend Spec compatibility.

This repository contains the Tauri + React + TypeScript app scaffold and the public MVP documentation.

## MVP Goals

- Open local vaults.
- Browse Markdown file trees.
- Render Markdown.
- Parse YAML frontmatter.
- Resolve wikilinks.
- Show backlinks.
- Search files and entities.
- Report broken links and missing required metadata.
- Edit and save Markdown files.

## Development

~~~bash
npm install
npm run build
npm run tauri dev
~~~

## Demo Vault

A deliberately empty placeholder vault lives in [examples/demo-vault](examples/demo-vault). It exists only for public testing and documentation. It is not derived from private canon.

## Related Repositories

- [Everend Forge portal](https://github.com/Everendforge/everend-forge)
- [Everend Spec](https://github.com/Everendforge/spec)

## License

Code is licensed under MIT OR Apache-2.0. Documentation is licensed under CC BY 4.0 unless stated otherwise.
