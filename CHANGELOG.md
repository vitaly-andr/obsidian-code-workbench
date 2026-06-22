# Changelog

All notable changes to Code Workbench are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[semantic versioning](https://semver.org/).

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
