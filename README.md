# Code Workbench for Obsidian

Connect the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI to Obsidian as an
IDE. Run `claude` in a terminal at your vault folder and it discovers Obsidian over Claude Code's
native WebSocket + MCP protocol — the same way it connects to VS Code, JetBrains.

It speaks the CLI's protocol, not a model API, so it works with any model you run through Claude
Code: Claude, Kimi K2, or another Anthropic-compatible endpoint.

**Accept/reject Claude's edits as a diff, right in Obsidian**

![Keep / Reject diff](docs/diff.png)

**`claude` discovers Obsidian over `/ide`**

![/ide lists Obsidian](docs/connect.png)

**Syntax highlighting for code files**

![Code highlighting](docs/highlight.png)

**Installed as a community plugin**

![Settings](docs/settings.png)

## What it does

- **Auto-connect**: launch `claude` from the vault folder; `/ide` lists **Obsidian**. No manual setup.
- **Editing context**: Claude can read your current selection, the list of open notes, and the active note.
- **Open and navigate**: Claude can open a note and jump to a line range.
- **Accept/reject diffs**: Claude's proposed change opens as a side-by-side diff with **Keep** / **Reject**. Nothing is written to disk unless you keep it, and you can edit the proposed side before accepting.
- **Code highlighting and editing**: non-Markdown files open in a syntax-highlighted view for
  ~40 languages (70+ file extensions). You can edit them directly and your changes are saved to the
  file. Basic editing only: no language server, linter, or autocomplete.

<details>
<summary>Supported languages</summary>

JavaScript · TypeScript · JSX/TSX · Python · Rust · Go · Java · Kotlin · Scala · C · C++ · C# ·
Objective-C · Dart · Swift · PHP · Ruby · Perl · Lua · R · Julia · Haskell · Clojure · SQL · HTML ·
CSS · SCSS/Sass · Less · Vue · Liquid · XML · JSON · YAML · TOML · INI · Markdown · Shell ·
WebAssembly (WAT) · diff/patch

</details>

## Install

### BRAT (recommended until it's in the Community store)

1. Install the **BRAT** plugin from Community plugins.
2. BRAT → *Add beta plugin* → `vitaly-andr/obsidian-code-workbench`.
3. Enable **Code Workbench** in Settings → Community plugins. Desktop only.

### Manual

1. Download `manifest.json`, `main.js`, and `styles.css` from the latest [release](https://github.com/vitaly-andr/obsidian-code-workbench/releases).
2. Copy them into `<vault>/.obsidian/plugins/code-workbench/` (`.obsidian` is a hidden folder).
3. Enable **Code Workbench** in Settings → Community plugins. Desktop only.

Then open a terminal in the vault folder and run `claude`.

## Sharing context with Claude

- **Automatic**: with *Share selection automatically* on (Settings → Code Workbench, default on),
  the plugin sends your selection to Claude as it changes and keeps the most recent one available.
- **On demand**: open the Command Palette (`Ctrl/Cmd+P`) and run **Add selection to Claude
  context** to attach the current selection as an `@`-mention (file path and line range).

Claude also reads context through the connection on its own: the current selection, the list of
open notes, and the workspace root.

## How it works

The plugin runs a loopback WebSocket server and writes a discovery lock file to
`~/.claude/ide/<port>.lock` (honoring `CLAUDE_CONFIG_DIR`). The CLI reads that file, connects with
a per-session token, and speaks JSON-RPC 2.0 / MCP. On an accepted diff the plugin returns the
approved content and the CLI performs the write, so there is a single writer and no race.

## Scope

It is intentionally minimal: syntax highlighting and basic text editing, but no language server,
autocomplete, linter, go-to-definition, or debugger — code understanding stays with Claude. The
plugin depends on no other Obsidian plugin and is desktop-only (it needs Node for the server and
filesystem access).

## Support

The plugin is free. If it's useful, you can [support development](SUPPORT.md). Never required.

## License

Source-available under the [PolyForm Shield License 1.0.0](LICENSE): free to use, study, and
modify, but not to build a competing product. Not an OSI "open source" license. Third-party
components retain their own licenses — see [THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES).
