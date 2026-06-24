# Code Workbench for Obsidian

[![Release](https://img.shields.io/github/v/release/vitaly-andr/obsidian-code-workbench?sort=semver)](https://github.com/vitaly-andr/obsidian-code-workbench/releases)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm%20Shield%201.0.0-blue)](LICENSE)
![Platform: desktop](https://img.shields.io/badge/platform-desktop-lightgrey)

**Code Workbench turns Obsidian into a real code editor and a Claude Code IDE.** Obsidian is the
most comfortable place to keep notes, specs, and plans, but it only opens Markdown, so your code
had to live somewhere else. Now your code and your notes sit in one app, with Claude working on both.

On the code side, you get syntax highlighting and inline error diagnostics for 50+ languages
(TypeScript, Python, Go, Rust, JSON, YAML, and more) powered by tree-sitter, one-command formatting
with Prettier and native formatters, and a one-click launcher: it opens a terminal in your vault and
starts the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI already connected to
Obsidian, with no `/ide` step. When Claude edits your files, the changes open as a side-by-side
Keep/Reject diff you control, so you review AI-written code right where you work, next to your notes.

**New in 2.0 — Vault tools for Claude** work the other direction: Claude can read and maintain your
knowledge base itself. Turn them on, and Claude answers questions straight from your notes using
Obsidian's own link graph (backlinks, wikilink resolution, frontmatter, and metadata search) and
makes link-preserving changes (create, append, rename, delete to trash), each shown for your
approval before it applies. The companion MCP server runs locally, on the desktop, and sets itself
up automatically.

Code Workbench speaks the Claude Code CLI protocol rather than one model's API, so it's
model-agnostic: use it with Claude, Kimi K2, DeepSeek, GLM, or any Anthropic-compatible endpoint
your CLI points at.

> Other Claude plugins for Obsidian put an agent in a chat sidebar. They don't open, highlight, or
> format your code files. Code Workbench is the editor, not another chat.

<img src="docs/workbench.png" alt="A code file open in the Code Workbench editor" width="100%">

## What makes it different

- **Edit non-Markdown files.** Obsidian only edits Markdown. Code Workbench opens `.rs`, `.py`,
  `.ts`, `.go`, `.json`, `.yaml` and dozens more in an editable, highlighted view, and saves your
  changes back to the file.
- **Syntax highlighting** for about 50 languages via tree-sitter, colored to match your Obsidian
  theme.
- **Diagnostics:** syntax errors are underlined where they occur, for about 48 languages.
- **One-command formatting** for about 28 languages, including JSON, XML, YAML, TOML, JavaScript,
  TypeScript, Python, Go, Rust, Ruby, PHP, and C/C++.
- **Accept or reject Claude's edits.** A proposed change opens as a side-by-side diff. Keep it or
  reject it, and edit the proposed side first if you want. Nothing is written until you keep it.
- **Works with any model.** It speaks the Claude Code CLI protocol, not a model API, so it runs with
  Claude, Kimi K2, DeepSeek, GLM, or any Anthropic-compatible endpoint you use through the CLI.
- **Launch Claude in one click.** Start the CLI in your vault from the status bar or settings; it
  opens your terminal in the right folder.
- **File-type icons.** Material file and folder icons in the explorer.
- **Vault tools for Claude.** Turn it on to let Claude read and maintain the vault through
  model-callable tools — backlinks, search, frontmatter, link-preserving rename, trash delete —
  with every write shown for your approval. See [Vault tools for Claude](#vault-tools-for-claude).
- **Edit hidden files.** A *Hidden files* sidebar panel lists the dot-files Obsidian normally hides
  (`.mcp.json`, `.gitignore`, `.obsidian/…`) as a tree and opens them in the editor.
- **Git branch in the status bar.** A status-bar indicator shows the current branch (or `no git`),
  with the branch icon colored by working-tree state: green when clean, yellow with uncommitted
  changes, orange on a detached HEAD.
- **Git graph.** A sidebar panel draws the repository history as a branch graph — commits
  newest-first, a lane per branch with merge and branch edges, ref labels. Click a commit to see the
  branches that contain it and the files it changed; click a file for a read-only side-by-side diff.

<img src="docs/diff.png" alt="A Claude edit shown as a Keep / Reject diff" width="100%">

<img src="docs/file-icons.png" alt="Material file-type icons in the file explorer" width="100%">

<img src="docs/hidden-files.png" alt="The Hidden files panel listing a vault's dot-files as a tree" width="330">

<img src="docs/git-branch.png" alt="The current git branch shown in the status bar, color-coded by working-tree status" width="420">

<img src="docs/git-graph-panel.png" alt="The repository history drawn as a branch graph in a sidebar panel" width="330">

## Language support

Highlighting for 52 languages, diagnostics for 48, formatting for 28. Each grammar and formatter
downloads the first time you open that language, then stays cached.

| Language | Highlighting | Diagnostics | Formatting |
|---|:---:|:---:|:---:|
| Astro | ✅ | ✅ | ✅ |
| Blade | ✅ | ✅ | — |
| C | ✅ | ✅ | ✅ |
| C# | ✅ | ✅ | — |
| C++ | ✅ | ✅ | ✅ |
| Clojure | ✅ | ✅ | — |
| CSS | ✅ | ✅ | ✅ |
| Dart | ✅ | ✅ | ✅ |
| Diff | ✅ | — | — |
| EJS | ✅ | ✅ | — |
| Elixir | ✅ | ✅ | — |
| ERB | ✅ | ✅ | — |
| ETLua | ✅ | ✅ | — |
| Gherkin | ✅ | ✅ | — |
| Go | ✅ | ✅ | ✅ |
| Haml | ✅ | ✅ | — |
| Handlebars | ✅ | ✅ | — |
| Haskell | ✅ | ✅ | — |
| HTML | ✅ | ✅ | ✅ |
| INI | ✅ | ✅ | — |
| Java | ✅ | ✅ | ✅ |
| JavaScript | ✅ | ✅ | ✅ |
| Jinja2 | ✅ | ✅ | ✅ |
| JSON | ✅ | ✅ | ✅ |
| Julia | ✅ | ✅ | — |
| Kotlin | ✅ | ✅ | — |
| Less | ✅ | — | ✅ |
| Liquid | ✅ | ✅ | — |
| Lua | ✅ | ✅ | ✅ |
| Objective-C | ✅ | ✅ | ✅ |
| Perl | ✅ | ✅ | — |
| PHP | ✅ | ✅ | ✅ |
| Pug | ✅ | ✅ | — |
| Python | ✅ | ✅ | ✅ |
| R | ✅ | ✅ | — |
| Ruby | ✅ | ✅ | ✅ |
| Rust | ✅ | ✅ | ✅ |
| Scala | ✅ | ✅ | — |
| SCSS | ✅ | — | ✅ |
| Shell | ✅ | ✅ | ✅ |
| Slim | ✅ | ✅ | — |
| SQL | ✅ | ✅ | ✅ |
| Svelte | ✅ | ✅ | ✅ |
| Swift | ✅ | ✅ | — |
| TOML | ✅ | ✅ | ✅ |
| Twig | ✅ | ✅ | — |
| TypeScript | ✅ | ✅ | ✅ |
| Vue | ✅ | ✅ | ✅ |
| WebAssembly (WAT) | ✅ | — | — |
| XML | ✅ | ✅ | ✅ |
| YAML | ✅ | ✅ | ✅ |
| Zig | ✅ | ✅ | ✅ |

A simple highlighter is always on. Turn on **Settings → Code Workbench → Enable syntax highlighting**
for the richer tree-sitter highlighting and the diagnostics above.

## Using it

1. Open a code file in your vault. It opens in an editable, highlighted editor.
2. Turn on **Enable syntax highlighting** in the plugin settings for tree-sitter colors and error
   underlines.
3. To format, open the Command Palette (`Ctrl/Cmd+P`), type **Format code file**, and run it. You
   can assign a hotkey under **Settings → Hotkeys**.
4. Launch Claude: click **▶ Launch Claude** in the status bar (or **Run Claude in this vault** in
   the plugin settings). It opens a terminal in the vault and starts `claude`, already connected to
   Obsidian — the status bar shows `Claude ●`. Run `/ide` and pick **Obsidian** only if you start
   `claude` yourself in a separate terminal, or to reconnect after updating or reloading the plugin
   (the server restarts on a new port).
5. Share a selection: select text and run **Add selection to Claude context** from the Command
   Palette to send it as an `@`-mention. With **Share selection automatically** on, the current
   selection is sent as it changes.
6. Claude's edits open as a **Keep/Reject** diff you accept or reject.

<img src="docs/connect.png" alt="Claude Code's /ide picker with Obsidian connected" width="100%">

## Try it

Once the plugin is installed, open **Settings → Code Workbench** and click **Add demo files to this
vault**. It drops a `Code Workbench demo` folder of samples into your vault and opens one. Open a
language folder:

- `sample-*` shows highlighting on a realistic snippet.
- `messy-*` shows error diagnostics (a red underline at the spot marked in a comment).
- `format-me-*` shows formatting: run **Format code file** and watch the layout fix itself.

## Install

### Community plugins (recommended)

1. Open **Settings → Community plugins → Browse** and search for **Code Workbench**.
2. Install it, then enable it. Desktop only.

### Manual

1. Download `manifest.json`, `main.js`, and `styles.css` from the latest
   [release](https://github.com/vitaly-andr/obsidian-code-workbench/releases).
2. Copy them into `<vault>/.obsidian/plugins/code-workbench/` (`.obsidian` is hidden).
3. Enable **Code Workbench** in Settings → Community plugins. Desktop only.

Then open a terminal in the vault folder and run `claude`.

## Development

```sh
git clone https://github.com/vitaly-andr/obsidian-code-workbench
cd obsidian-code-workbench
npm install
npm run dev      # watch build
npm run build    # production build
```

Copy `manifest.json`, `main.js`, and `styles.css` into
`<vault>/.obsidian/plugins/code-workbench/`, or symlink the folder.

## Requirements

- The [Claude Code CLI](https://docs.claude.com/en/docs/claude-code), or a compatible CLI/endpoint.
- Obsidian 1.5+, desktop only. It needs Node for the loopback server and filesystem access.

## Sharing context with Claude

- **Automatic** (default): the plugin sends your current selection to Claude as it changes.
- **On demand:** Command Palette (`Ctrl/Cmd+P`) → **Add selection to Claude context** attaches the
  current selection as an `@`-mention (file path and line range).

Claude also reads the current selection, the open notes, and the workspace root through the
connection.

## Vault tools for Claude

Turn on **Vault tools (Claude)** in settings to let Claude read and maintain this vault through
model-callable tools, alongside the editor integration. Off by default, desktop only. The plugin
runs a second local server (loopback HTTP, separate from the editor's WebSocket) and writes a project
`.mcp.json` in the vault folder, so a `claude` session started there picks the tools up after a
one-time approval. The settings panel also shows a manual `claude mcp add` command as a fallback.

Read tools use Obsidian's own link resolver and live cache, so they are accurate where `grep` is not:
`getBacklinks`, `getOutgoingLinks`, `resolveWikilink`, `getFrontmatter`, `searchVault`,
`listFilesInFolder`, `getDailyNote`, `getActiveNoteContent`. `searchVault` ranks notes by title,
heading, tag, and frontmatter; full text inside note bodies stays with `ripgrep`, which `claude`
already runs well.

Write tools go through the Obsidian vault API and are **shown for your approval before they apply**:
`createNote`, `appendToNote`, `updateFrontmatter`, `renameNote` (updates every inbound `[[link]]`),
and `deleteNote` (to trash, recoverable). There is no full-body overwrite tool — rewriting a note's
contents stays on the editor's Keep/Reject diff.

Safety: the server binds to loopback only, requires a per-session bearer token (rejected even on
loopback when missing or wrong), and checks the request origin. Writes are confined to the vault, run
only through Obsidian, and never apply without your approval.

## How it works

The plugin runs a loopback WebSocket server and writes a discovery lock file to
`~/.claude/ide/<port>.lock` (honoring `CLAUDE_CONFIG_DIR`). The CLI reads that file, connects with a
per-session token, and speaks JSON-RPC 2.0 / MCP. On an accepted diff the plugin returns the approved
content and the CLI performs the write, so there is a single writer and no race.

The optional vault-tools integration is a second, separate MCP server over loopback HTTP with its own
per-session token. It runs only while **Vault tools (Claude)** is on, and its token store stays in the
plugin's data folder, not in the editor's discovery directory.

## Privacy

No telemetry. Your code stays on your machine. The only network use is downloading language grammars
and formatters once, on demand, from this project's GitHub releases. Turn off **Enable syntax
highlighting** to avoid even that. The vault-tools server, when enabled, is loopback-only and
token-authenticated; nothing it exposes leaves your machine.

## Scope

Highlighting, diagnostics, formatting, and the accept/reject diff. There is no language server,
autocomplete, or go-to-definition; code understanding stays with Claude. It depends on no other
Obsidian plugin.

## Support

Code Workbench is free. If it's useful to you, you can support it at a fraction of your Claude
subscription. See [SUPPORT.md](SUPPORT.md) for ways to donate.

## Sponsorship

No sponsors yet. To sponsor development or place your logo here, get in touch:

- Telegram: [@VITALY_ANDR](https://t.me/VITALY_ANDR)
- Email: vitaly@andrianoff.online

<a href="https://t.me/VITALY_ANDR"><img src="docs/telegram-qr.png" width="180" alt="Telegram @VITALY_ANDR"></a>

## Acknowledgements

The file-type icons are derived from
[material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) by Material
Extensions (MIT). The icon-name mapping is distilled into the plugin; the SVGs are fetched on demand
from jsDelivr and cached, not bundled.

## License

Source-available under the [PolyForm Shield License 1.0.0](LICENSE): free to use, study, and modify,
but not to build a competing product. It is not an OSI "open source" license. Bundled third-party
components keep their own licenses; see [THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES).
