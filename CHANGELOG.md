# Changelog

All notable changes to Code Workbench are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[semantic versioning](https://semver.org/).

## [3.1.3] - 2026-06-25

### Fixed
- The git graph, status-bar branch, and inline blame now refresh on their own when the repository
  changes (a commit, checkout, merge, or reset), including changes made from outside Obsidian such
  as a terminal or Claude Code. The graph previously updated only when reopened or refreshed by hand.

### Removed
- The git graph's manual refresh control, which did not render in the panel header. Auto-refresh
  replaces it.

## [3.1.2] - 2026-06-25

### Changed
- Removed a generic "Options" heading from the settings page (Obsidian review guideline), and
  refreshed the plugin's store description.

## [3.1.1] - 2026-06-25

### Fixed
- Settings screenshots load from the repository's `main` branch via jsDelivr, which serves them
  immediately, instead of the `3.1.0` tag, which the CDN needs time to warm up after a release.

## [3.1.0] - 2026-06-25

### Added
- Inline git blame. The current line shows who last changed it and when ("commit · author · age ·
  summary"), read from `git blame`, in both the code editor and Markdown notes. The line you are
  editing reads as "You · uncommitted". On by default; toggle it under Settings. Shows nothing when
  the vault is not a git repository. Desktop only.

### Changed
- Settings screenshots are now fetched from the repository on demand (jsDelivr, CDN-cached) instead
  of being inlined, keeping `main.js` smaller.

## [3.0.0] - 2026-06-24

### Added
- Git graph. A new sidebar panel draws the repository history as a branch graph: commits
  newest-first, a lane per concurrent branch with merge and branch edges, ref labels
  (branch/tag/HEAD), colored by lane. Click a commit to see the branches that contain it and the
  files it changed; click a file to open a read-only side-by-side diff (parent on the left, the
  commit on the right) with syntax highlighting. History is read locally via git. Desktop only,
  read-only.

## [2.1.0] - 2026-06-24

### Added
- Current git branch in the status bar. A status-bar indicator shows the vault repository's current
  branch, or `no git` when the vault is not a repository. The branch icon is colored by working-tree
  state: green when clean, yellow with uncommitted changes, orange on a detached HEAD, and muted when
  there is no repository. History is read locally via git, refreshed on focus and active-note changes
  (no polling). Desktop only, read-only.

## [2.0.3] - 2026-06-23

### Fixed
- The destructive confirm button (shown when Claude asks to delete a note) is back on
  `setWarning()`. 2.0.2 had switched it to `setDestructive()` to clear a deprecation notice, but that
  API only exists in Obsidian 1.13.0 — above the plugin's `minAppVersion` of 1.7.2 — so plugin review
  flagged it as an unsupported API and it would have thrown on older Obsidian. `setWarning()` gives
  the same red styling and works back to 1.7.2.

## [2.0.2] - 2026-06-23

### Fixed
- More plugin-review cleanups. The destructive confirm button now uses `setDestructive()` instead of
  the deprecated `setWarning()`; in-vault file access (the Hidden files editor and the Keep/Reject
  diff base) goes through the vault adapter rather than raw `fs`, keeping it scoped to the vault; and
  the config-folder icon is resolved via `Vault#configDir` instead of a hardcoded `.obsidian`, so a
  renamed config folder still gets the right icon.

## [2.0.1] - 2026-06-22

### Fixed
- Plugin-review cleanups: the plugin no longer detaches its sidebar leaves on unload (which could
  reset their position on the next load); `minAppVersion` now correctly declares **1.7.2** (the
  release whose APIs the plugin actually uses); plus popout-window, timer, and document-scope
  tidy-ups.

## [2.0.0] - 2026-06-22

### Added
- Vault tools for Claude (opt-in, off by default). Claude can read and safely maintain this vault
  through model-callable tools over a local companion server, set up automatically via a project
  `.mcp.json`. Reads cover backlinks, outgoing links, wikilink resolution, frontmatter, metadata
  search, folder listing, the daily note, and the active note. Writes go through the Obsidian vault
  API and are shown for your approval first: create, append, update frontmatter, link-preserving
  rename, and delete to trash. Loopback-only with a per-session token; desktop only.
- Hidden files panel (opt-in): browse and edit the dot-files Obsidian normally hides (`.gitignore`,
  `.obsidian/…`) in the editor, scoped to the vault.

## [1.2.2] - 2026-06-22

### Fixed
- Syntax highlighting and error underlines no longer drift on lines with non-ASCII text (Cyrillic,
  CJK, emoji). Tree-sitter node offsets are now mapped to editor positions directly, so colours and
  underlines line up with the characters they mark.

## [1.2.1] - 2026-06-21

### Changed
- Internal only, no user-facing changes: the explorer icons apply their background through
  `setCssStyles` (Obsidian plugin-review guideline), and the release workflow uses current GitHub
  Actions.

## [1.2.0] - 2026-06-21

### Added
- File-type icons in the file explorer: Material file and folder icons matched by filename and
  extension, with an open-folder variant for expanded folders. Each icon downloads on first use and
  stays cached. On by default; toggle under Settings → Code Workbench → "File type icons". Icon set
  derived from material-icon-theme (MIT).

## [1.1.3] - 2026-06-21

### Changed
- Packaging: `@codemirror/state` is now declared in devDependencies. No user-facing changes.

## [1.1.2] - 2026-06-21

### Fixed
- Diff review: the per-change reject control now behaves correctly when the diff is opened in a
  pop-out window.

## [1.1.1] - 2026-06-21

### Changed
- Diff review: the per-change reject control is now a red ✕ instead of an arrow that read like
  "apply", making it clear the control discards (reverts) that change.

### Fixed
- Diff review: the reject control no longer shows two tooltips on hover.

## [1.1.0] - 2026-06-20

### Added
- Diff review: revert changes one at a time. Each changed hunk has a revert control —
  revert the ones you don't want, then Keep commits the rest.
- Diff review: long unchanged stretches are folded, so on large files every change is
  visible at once. Click a folded section to expand it.
- Diff review: opening a diff places the cursor on the first change and scrolls to it.

### Changed
- Syntax highlighting (tree-sitter) is on by default. Each language's grammar downloads on
  first use and is cached; offline, the simpler highlighter is used until the grammar can be
  fetched.
- Faster startup: the code formatters now load only when you format a file, instead of when
  the plugin loads, so enabling it is quicker.
- Smaller download: the Ruby parser (~0.6 MB) is fetched on first use and cached instead of
  being bundled, making the plugin about 0.6 MB smaller. The first Ruby format now needs a
  network connection once.

## [1.0.3] - 2026-06-19

### Fixed
- Removed a stray "Options" heading from the settings page.

## [1.0.2] - 2026-06-19

### Fixed
- Settings heading naming and other community-review cleanups.

## [1.0.1] - 2026-06-19

### Fixed
- Addressed Obsidian plugin review feedback.

## [1.0.0] - 2026-06-19

### Added
- First public release: an editable, syntax-highlighted editor for code files in Obsidian
  (~50 languages) with error diagnostics and one-command formatting, a Keep/Reject diff for
  Claude Code's edits, a one-click Claude launcher, a demo-files installer, and a settings page.
