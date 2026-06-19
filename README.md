# Code Workbench for Obsidian

[![Release](https://img.shields.io/github/v/release/vitaly-andr/obsidian-code-workbench?sort=semver)](https://github.com/vitaly-andr/obsidian-code-workbench/releases)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm%20Shield%201.0.0-blue)](LICENSE)
![Platform: desktop](https://img.shields.io/badge/platform-desktop-lightgrey)

Obsidian only opens Markdown. Code Workbench adds an editor for code files: syntax highlighting,
error diagnostics, and one-command formatting for 50+ languages. It also connects the
[Claude Code](https://docs.claude.com/en/docs/claude-code) CLI, so Claude's edits arrive as a
Keep/Reject diff you control.

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
  Claude, Kimi K2, or any Anthropic-compatible endpoint you use through the CLI.
- **Launch Claude in one click.** Start the CLI in your vault from the status bar or settings; it
  opens your terminal in the right folder.

<img src="docs/diff.png" alt="A Claude edit shown as a Keep / Reject diff" width="100%">

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
4. Connect Claude: click **▶ Launch Claude** in the status bar (or **Run Claude in this vault** in
   the plugin settings) to open a terminal in the vault and start `claude` (or run `claude`
   yourself). Then run `/ide` and pick **Obsidian**; the status bar shows `Claude ●` once connected.
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

Prefer git? Clone the repo and open its `demo/` folder as a vault instead:

```sh
git clone https://github.com/vitaly-andr/obsidian-code-workbench
```

## Install

### BRAT (until it's in the Community store)

1. Install **BRAT** from Community plugins.
2. BRAT → *Add beta plugin* → `vitaly-andr/obsidian-code-workbench`.
3. Enable **Code Workbench** in Settings → Community plugins. Desktop only.

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

## How it works

The plugin runs a loopback WebSocket server and writes a discovery lock file to
`~/.claude/ide/<port>.lock` (honoring `CLAUDE_CONFIG_DIR`). The CLI reads that file, connects with a
per-session token, and speaks JSON-RPC 2.0 / MCP. On an accepted diff the plugin returns the approved
content and the CLI performs the write, so there is a single writer and no race.

## Privacy

No telemetry. Your code stays on your machine. The only network use is downloading language grammars
and formatters once, on demand, from this project's GitHub releases. Turn off **Enable syntax
highlighting** to avoid even that.

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

## License

Source-available under the [PolyForm Shield License 1.0.0](LICENSE): free to use, study, and modify,
but not to build a competing product. It is not an OSI "open source" license. Bundled third-party
components keep their own licenses; see [THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES).
