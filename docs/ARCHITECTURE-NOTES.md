# Architecture Notes

WorldNotion is a client over Everend Spec. The Markdown vault remains the source of truth.

The app may cache indexes for speed, but caches must be rebuildable from the vault.

The editor should preserve Markdown readability and avoid hidden app-only state in content files.

## App boundaries

- WorldNotion owns worldbuilding vault UX.
- Everend Spec owns shared compatibility contracts.
- PathBranching owns branching graph UX.
- Engine plugins own runtime package execution.
