# Changelog

All notable changes to Code Workbench are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[semantic versioning](https://semver.org/).

## [1.1.0] - 2026-06-20

### Added
- Diff review: revert changes one at a time. Each changed hunk has a revert control —
  revert the ones you don't want, then Keep commits the rest.
- Diff review: long unchanged stretches are folded, so on large files every change is
  visible at once. Click a folded section to expand it.
- Diff review: opening a diff places the cursor on the first change and scrolls to it.

### Changed
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
