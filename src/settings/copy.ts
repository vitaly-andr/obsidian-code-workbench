// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Text and content tables for the settings tab, kept apart from the DOM that renders them
// (blocks.ts) and from the definitions that structure it (definitions.ts).

// Language coverage shown on the settings page: [name, highlighting, diagnostics, formatting].
export const LANGS: ReadonlyArray<readonly [string, boolean, boolean, boolean]> = [
  ["Astro", true, true, true],
  ["Blade", true, true, false],
  ["C", true, true, true],
  ["C#", true, true, false],
  ["C++", true, true, true],
  ["Clojure", true, true, false],
  ["CSS", true, true, true],
  ["Dart", true, true, true],
  ["Diff", true, false, false],
  ["EJS", true, true, false],
  ["Elixir", true, true, false],
  ["ERB", true, true, false],
  ["ETLua", true, true, false],
  ["Gherkin", true, true, false],
  ["Go", true, true, true],
  ["Haml", true, true, false],
  ["Handlebars", true, true, false],
  ["Haskell", true, true, false],
  ["HTML", true, true, true],
  ["INI", true, true, false],
  ["Java", true, true, true],
  ["JavaScript", true, true, true],
  ["Jinja2", true, true, true],
  ["JSON", true, true, true],
  ["Julia", true, true, false],
  ["Kotlin", true, true, false],
  ["Less", true, false, true],
  ["Liquid", true, true, false],
  ["Lua", true, true, true],
  ["Objective-C", true, true, true],
  ["Perl", true, true, false],
  ["PHP", true, true, true],
  ["Pug", true, true, false],
  ["Python", true, true, true],
  ["R", true, true, false],
  ["Ruby", true, true, true],
  ["Rust", true, true, true],
  ["Scala", true, true, false],
  ["SCSS", true, false, true],
  ["Shell", true, true, true],
  ["Slim", true, true, false],
  ["SQL", true, true, true],
  ["Svelte", true, true, true],
  ["Swift", true, true, false],
  ["TOML", true, true, true],
  ["Twig", true, true, false],
  ["TypeScript", true, true, true],
  ["Vue", true, true, true],
  ["WebAssembly (WAT)", true, false, false],
  ["XML", true, true, true],
  ["YAML", true, true, true],
  ["Zig", true, true, true],
];

// Human-readable label for a canonical grammar id (src/lsp/registry.ts), for the "Detected language
// servers" list (006). Falls back to a capitalized id for anything not listed here.
export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ruby: "Ruby", typescript: "TypeScript", javascript: "JavaScript", tsx: "TSX", python: "Python",
  rust: "Rust", go: "Go", c: "C", cpp: "C++", objc: "Objective-C", csharp: "C#", java: "Java",
  php: "PHP", scala: "Scala", haskell: "Haskell", elixir: "Elixir", zig: "Zig", lua: "Lua",
  bash: "Bash", swift: "Swift", r: "R", perl: "Perl", clojure: "Clojure", dart: "Dart",
  julia: "Julia", kotlin: "Kotlin", vue: "Vue", svelte: "Svelte", html: "HTML", css: "CSS",
  json: "JSON", yaml: "YAML", toml: "TOML", xml: "XML", sql: "SQL", astro: "Astro",
};

export const INTRO_PARAGRAPHS: readonly string[] = [
  "Code Workbench gives Claude the tools to maintain your vault from inside Obsidian, plus a " +
    "real editor for code and config files: syntax highlighting, error diagnostics, and one-command " +
    "formatting for 50+ languages, with a Keep/Reject diff for every edit Claude makes.",
  "One click in the status bar opens a terminal in your vault with the Claude Code CLI already " +
    "connected, no /ide. Because it drives the CLI you already run, it uses your Claude subscription " +
    "instead of a metered API key, so letting Claude work across a whole vault doesn't run up an API " +
    "bill. It works with other Claude Code compatible models too, like Kimi K2 or DeepSeek.",
  "Turn on the vault tools and Claude reads and edits notes through Obsidian's own link graph " +
    "(backlinks, wikilinks, frontmatter) and makes link-preserving changes, filing new notes where " +
    "they belong and holding your PARA or Zettelkasten system together without breaking links. Every " +
    "change is shown for your approval first, so you don't need to write code to use it.",
];

export const INTRO_PITCH =
  "Other Claude plugins give you a chat. This gives Claude tools to maintain your vault, and you an editor to review it.";

export const FEATURES: ReadonlyArray<readonly [string, string]> = [
  [
    "Edit non-Markdown files",
    "Obsidian only edits Markdown. Code Workbench opens .rs, .py, .ts, .go, .json, .yaml and " +
      "dozens more in an editable, highlighted view, and saves your changes back to the file.",
  ],
  ["Syntax highlighting", "about 50 languages via tree-sitter, colored to match your Obsidian theme."],
  ["Diagnostics", "syntax errors are underlined where they occur, for about 48 languages."],
  [
    "One-command formatting",
    "the Format code file command reformats about 28 languages, including JSON, XML, YAML, TOML, " +
      "JavaScript, TypeScript, Python, Go, Rust, Ruby, PHP, and C/C++.",
  ],
  [
    "Accept or reject Claude's edits",
    "a proposed change opens as a side-by-side diff. Keep it or reject it, and edit the proposed " +
      "side first if you want. Nothing is written until you keep it.",
  ],
  [
    "Works with any model",
    "it speaks the Claude Code CLI protocol rather than a model API, so it runs with Claude, " +
      "Kimi K2, or any Anthropic-compatible endpoint you use through the CLI.",
  ],
  [
    "Launch Claude in one click",
    "start the Claude Code CLI in this vault from the status bar or settings; it opens your " +
      "terminal in the right folder.",
  ],
  [
    "Maintain the vault with Claude",
    "turn on Vault tools to let Claude read and edit notes through Obsidian's own link graph " +
      "(backlinks, frontmatter) and make link-preserving changes, each shown for your approval.",
  ],
  [
    "Git review",
    "a branch indicator in the status bar, a branch-graph panel with click-to-diff, inline git " +
      "blame on the current line, and VS Code-style status marks in the explorer. Right-click a file " +
      "to diff its uncommitted changes against the last commit, all without leaving Obsidian.",
  ],
  ["File-type icons", "Material file and folder icons in the explorer, fetched on demand and cached."],
  [
    "Edit hidden files",
    "a Hidden files panel lists the dot-files Obsidian normally hides (.mcp.json, .gitignore, and " +
      "the config folder) as a tree and opens them in the editor.",
  ],
];

/** Screenshot key → alt text and the caption printed under it. */
export const SHOTS: ReadonlyArray<readonly [string, string, string]> = [
  ["DIFF_SHOT", "A Claude edit shown as a Keep / Reject diff", "A Claude edit, shown as a Keep / Reject diff."],
  [
    "GIT_BRANCH_SHOT",
    "The current git branch in the status bar",
    "The current branch in the status bar, colored by working-tree state.",
  ],
  [
    "GIT_GRAPH_SHOT",
    "Repository history drawn as a branch graph",
    "The repository history as a branch graph; click a commit for its files, a file for a diff.",
  ],
  [
    "GIT_BLAME_SHOT",
    "Inline git blame on the current line",
    "Inline git blame on the current line, in code files and Markdown notes.",
  ],
  ["ICONS_SHOT", "Material file-type icons in the file explorer", "Material file and folder icons in the explorer."],
  [
    "HIDDEN_SHOT",
    "The Hidden files panel listing a vault's dot-files",
    "The Hidden files panel: edit the dot-files Obsidian normally hides.",
  ],
];

export const USING_IT_STEPS: readonly string[] = [
  "Open a code file in your vault. It opens in an editable, highlighted editor.",
  "Turn on Enable syntax highlighting below for tree-sitter colors and error underlines.",
  'Format a file: open the Command Palette (Ctrl/Cmd+P), type "Format code file", and run it. You can assign a hotkey under Settings → Hotkeys.',
  'Connect Claude: run "claude" in the vault folder, then run /ide in the CLI and pick Obsidian. The status bar shows "Claude ●" once connected (and "Claude ○" while it waits).',
  'Share a selection: select text in a file and run "Add selection to Claude context" from the Command Palette to send it as an @-mention. With "Share selection automatically" on, the current selection is sent as it changes.',
  "Claude's edits then open as a Keep / Reject diff you accept or reject.",
];

export const CONNECT_CAPTION = "Running /ide in the CLI: pick Obsidian to connect.";

export const LANGUAGE_SUPPORT_INTRO =
  "Highlighting for 52 languages, diagnostics for 48, formatting for 28. Each grammar and " +
  "formatter downloads the first time you open that language, then stays cached.";

export const OPTIONAL_NOTE =
  "Every feature is optional; turn off what you don't use. The vault tools stay off until you " +
  "switch them on.";

export const LAUNCHER_INTRO =
  "Clicking the status-bar button launches the Claude Code CLI. Add a backend below to run " +
  "Claude Code on a Kimi or GLM subscription instead — paste an API key and the plugin " +
  "writes the wrapper script for you. Once added, right-click the status-bar button to " +
  "launch it.";

export const SUPPORT_TEXT =
  "Code Workbench is free. If it's useful to you, you can support it at a fraction of your " +
  "Claude subscription.";

export const DONATE_TEXT = "If it helps your work, you can support the coffee and tools behind it.";

export const SPONSORSHIP_TEXT =
  "No sponsors yet. To sponsor development or place your logo here, reach me on Telegram " +
  "(@VITALY_ANDR) or by email (vitaly@andrianoff.online).";

export const LICENSE_TEXT =
  "Source-available under the PolyForm Shield License 1.0.0: free to use, study, and modify, " +
  "but not to build a competing product.";
