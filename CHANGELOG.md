# Changelog

All notable changes to Code Workbench are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[semantic versioning](https://semver.org/).

## [4.3.0] - 2026-07-02

### Added
- Highlight occurrences of the symbol under the cursor, from the language server: placing the cursor
  on a variable, method, or type subtly highlights every other place it appears in the file, with a
  distinct tint for the occurrence where it is assigned/defined. Part of the opt-in
  language-intelligence feature.

## [4.2.0] - 2026-07-02

### Added
- Code outline panel: a sidebar view listing the active code file's classes, methods, and other
  symbols from the connected language server, click-to-jump. It follows the active file and shows a
  placeholder when language intelligence is off or no server is connected. Part of the opt-in
  language-intelligence feature.

## [4.1.0] - 2026-07-02

### Added
- Indentation guides: faint vertical lines mark each indentation level in the code editor and in both
  side-by-side diffs (Keep/Reject and the git-graph commit diff). On by default, with a "Show indentation
  guides" toggle in settings.

## [4.0.0] - 2026-07-01

### Added
- Editor language intelligence via LSP (opt-in, off by default, desktop only). With it on, the code
  editor connects to a language server you already have installed — it never installs one — and adds
  inline diagnostics, autocomplete, hover documentation, signature help, go-to-definition, and
  find-references on top of highlighting. Diagnostics work with both push and pull servers, so
  pull-only servers such as ruby-lsp are covered, and the same diagnostics reach Claude through the
  IDE `getDiagnostics` tool for an edit → verify → fix loop. Everything loads lazily, so the base
  plugin and startup are unchanged while it is off.
- A "Detected language servers" list in settings. When the feature is on, settings scans your
  environment for installed servers and lists each language you can connect to and where its server
  was found, each with an on/off switch. Rescan picks up a newly installed server without a restart,
  and "show all / not installed" lists the remaining supported languages with install hints.

### Fixed
- Turning "Enable syntax highlighting" on or off now applies to already-open code files immediately,
  instead of only the next time a file is opened.

## [3.3.2] - 2026-06-30

### Changed
- Diagnostic and hover tooltips are now styled through CodeMirror's theme instead of `!important` CSS,
  and are parented to the editor's own window so they render correctly in popped-out windows.

## [3.3.1] - 2026-06-30

### Fixed
- Editor diagnostic and hover tooltips are readable in dark themes. They previously rendered on
  CodeMirror's light default background, which left white-on-white text.
- Diagnostic and hover tooltips now open next to the relevant line instead of at the top of the
  editor. Obsidian sets `contain: strict` on each workspace pane, which was clipping the tooltip;
  it is now rendered against the window so CodeMirror positions it correctly.

## [3.3.0] - 2026-06-27

### Added
- `openNote` vault tool. The companion MCP server can now open a note in the editor and bring it to
  the foreground; pass `newLeaf: true` to open it in a new tab. It only changes which note is focused
  and never writes to the vault, so it needs no approval.

## [3.2.4] - 2026-06-26

### Changed
- Crypto support addresses in settings now show as QR codes only; the plaintext addresses are no
  longer included in the plugin bundle.
- The funding link now uses a CDN-hosted URL.

## [3.2.3] - 2026-06-26

### Changed
- Internal type-safety cleanup. Replaced the remaining `any` and resolved the unsafe-value and
  string-coercion findings the plugin-review tooling flagged across the formatters, vault tools, git
  graph, and the websocket layer. No behaviour change; purely typing.

## [3.2.2] - 2026-06-26

### Fixed
- Plugin-review lint: the git ref-log watcher now uses `window.setTimeout`/`window.clearTimeout`
  (popout-window compatibility) instead of the bare globals. Also reworded a settings description so
  it no longer names the config folder `.obsidian` (it is user-configurable).

## [3.2.1] - 2026-06-26

### Fixed
- The Rename dialog for a hidden file rejects a name that contains a path separator (`/` or `\`), so a
  rename stays within the same folder instead of moving the file.

## [3.2.0] - 2026-06-26

### Added
- Working-tree diff. Right-click a file — in the explorer, on a tab, or in the editor — and "Diff
  against last commit" opens a read-only side-by-side diff of its uncommitted changes against `HEAD`
  (working copy on the right). Works for Markdown notes, code files, and hidden dot-files.
- Git status in the file explorer, VS Code style: changed files are tinted and badged (`M` modified,
  `U` untracked, `A` added, `D` deleted, `R` renamed), folders that contain changes are tinted, and
  git-ignored files and folders are dimmed. The same marks appear in the Hidden files panel — the
  only place dot-files are shown. Refreshes on commit/checkout, on edits, and on window focus. Toggle
  under Settings → "Git status in the explorer". Shows nothing when the vault is not a git repository.
- "Add selection to Claude context" in the right-click menu of Markdown notes, code files, and hidden
  files (previously available only as a command).

### Changed
- Hidden files are now first-class. The hidden-file editor has a Save button and a "Save hidden file"
  command (and Mod+S), shows the file name with folder breadcrumbs in its header instead of a generic
  "Hidden file" label, reports its selection to Claude over `/ide`, and has a full right-click menu
  (cut/copy/paste, share selection, diff). The Hidden files panel gains a right-click menu too: open,
  make a copy, rename, delete to trash, show in system explorer, copy path, and diff against the last
  commit. Desktop only.

## [3.1.4] - 2026-06-25

### Changed
- The git graph keeps the mainline on the left. The first-parent chain of `main` (or `master`,
  else the checked-out branch) stays in the leftmost lane as a straight line, and other branches
  are drawn to its right, instead of whichever branch tip happened to sort first.

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
