// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type CodeWorkbenchPlugin from "../../main";
import { BACKEND_PRESETS } from "../util/agent-backends";
import { LAUNCHER_INTRO } from "./copy";
import {
  addBackendButton,
  backendConsoleBlock,
  backendRow,
  backendTiersBlock,
  companionBlock,
  connectionStatus,
  contactButtons,
  customServersBlock,
  demoButton,
  donateBlock,
  featuresBlock,
  formatButton,
  graphButton,
  introBlock,
  languageTableBlock,
  launchButton,
  licenseBlock,
  linkButton,
  optionalNoteBlock,
  paragraphBlock,
  scanBlock,
  sponsorshipBlock,
  supportIntroBlock,
  telegramQrBlock,
  tryItBlock,
  usingItBlock,
} from "./blocks";
import type { CwDef, CwItem, CwRender, SettingsHost } from "./types";

// The settings tab as data. Obsidian ≥ 1.13 renders this array and builds its settings search
// index from it; older versions get the same array painted by legacy.ts. Declaring it once is what
// keeps the two in step.
//
// This function runs at plugin load — Obsidian calls `update()` from `addSettingTab()` so the
// index is ready before the tab is ever opened. It must therefore stay allocation-only: anything
// that scans, fetches or imports belongs inside a `render` callback (blocks.ts), which runs only
// when the tab is on screen.

/** A row whose whole content is painted by a block: no name, and nothing to index. */
function prose(render: CwRender): CwDef {
  return { name: "", searchable: false, render };
}

export function buildSettingDefinitions(plugin: CodeWorkbenchPlugin, host: SettingsHost): CwItem[] {
  const lsp = (): boolean => plugin.settings.lsp.enabled;

  return [
    prose(introBlock(plugin)),

    { type: "group", heading: "What makes it different", items: [prose(featuresBlock())] },
    { type: "group", heading: "Using it", items: [prose(usingItBlock())] },
    { type: "group", heading: "Language support", items: [prose(languageTableBlock())] },
    {
      type: "group",
      heading: "Try it",
      items: [
        prose(tryItBlock()),
        {
          name: "Demo files",
          desc: 'Copies a "Code Workbench demo" folder into this vault and opens a sample.',
          aliases: ["examples", "try it"],
          render: demoButton(plugin),
        },
      ],
    },

    prose(optionalNoteBlock()),

    {
      name: "Share selection automatically",
      desc: 'Notify Claude as your selection changes. Turn off to share only via the "Add selection to Claude context" command.',
      aliases: ["at-mention", "send to claude"],
      control: { type: "toggle", key: "shareSelection" },
    },
    {
      name: "Enable syntax highlighting",
      desc:
        "Richer highlighting and syntax-error underlines for ~50 languages. Each language downloads a " +
        "small grammar (~0.5–2 MB) once on first use and stays cached, so the internet is only needed " +
        "that first time. Off keeps the simple highlighter.",
      aliases: ["tree-sitter", "colors", "syntax colors"],
      control: { type: "toggle", key: "treeSitter" },
    },
    {
      name: "Show indentation guides",
      desc: "Draw faint vertical lines at each indentation level in the code editor and in diffs. On by default.",
      aliases: ["indent rulers", "whitespace", "alignment"],
      control: { type: "toggle", key: "indentGuides" },
    },
    {
      name: "Inline git blame",
      desc:
        'On the current line, show who last changed it and when ("commit · author · age · summary"), ' +
        "read from git blame, in both the code editor and Markdown notes. The line you are editing " +
        'reads as "You · uncommitted". Shows nothing when the vault is not a git repository. Desktop only.',
      aliases: ["annotate", "authorship", "who changed", "last commit"],
      control: { type: "toggle", key: "gitBlame" },
    },
    {
      name: "Git status in the explorer",
      desc:
        'Mark changed files in the file explorer, like VS Code: a modified file is tinted with an "M", ' +
        'a new (untracked) file with a "U", and folders that contain changes are tinted too. Hidden ' +
        "dot-files carry the same marks in the Hidden files panel. Status is read from git when the " +
        "repository or your files change. Shows nothing when the vault is not a git repository. Desktop only.",
      aliases: ["decorations", "source control", "vcs", "dirty"],
      control: { type: "toggle", key: "gitDecorations" },
    },
    {
      name: "File type icons",
      desc:
        "Show Material file and folder icons in the file explorer. Each icon downloads once on first " +
        "use, then stays cached.",
      aliases: ["material icons", "explorer icons"],
      control: { type: "toggle", key: "fileIcons" },
    },
    {
      name: "Show hidden files",
      desc:
        "Obsidian hides dot-files (.mcp.json, .gitignore, your config folder…) from the explorer. Turn this on " +
        "to open a Hidden files panel in the left sidebar: a tree of the editable dot-files; click one " +
        "to edit it. Hidden files are not auto-saved, so press Mod+S to save your changes. Uses the same " +
        "file icons as the explorer when those are on. Desktop only.",
      aliases: ["dotfiles"],
      control: { type: "toggle", key: "showHiddenFiles" },
    },

    {
      type: "group",
      heading: "Vault tools for Claude",
      items: [
        {
          name: "Vault tools (Claude)",
          desc:
            "Let Claude read and safely maintain this vault (backlinks, search, frontmatter, " +
            "link-preserving rename, and trash delete) as model-callable tools. Off by default. Every write " +
            "is shown for your approval before anything changes. Local-only and desktop-only.",
          aliases: ["mcp", "model context protocol", "agent tools", "wikilinks", "companion"],
          control: { type: "toggle", key: "vaultTools" },
        },
        { ...prose(companionBlock(plugin)), visible: () => plugin.settings.vaultTools },
      ],
    },

    // Editor-LSP (005-editor-lsp): the master switch, then the sub-settings it gates. The
    // persisted shape and the discovery/runtime already honour these; this is the user surface.
    {
      type: "group",
      heading: "Language servers (LSP)",
      items: [
        {
          // Named for what the audience calls it. The old name is kept as a search term, and so are
          // the server names: a user who types "pyright" wants this switch, and while it is off the
          // detected-servers rows below are hidden and therefore out of the index entirely.
          name: "Language server (LSP)",
          desc:
            "Opt-in. When on, the editor discovers a language server you already have installed (it never " +
            "installs one) and adds diagnostics, completion, hover, and code navigation (right-click to " +
            "go to a definition or find references, across files) on top of highlighting. Off by " +
            "default; nothing runs and startup is unchanged while it is off. Desktop-only.",
          aliases: [
            "intellisense",
            "autocomplete",
            "editor language intelligence",
            "ruby-lsp",
            "pyright",
            "gopls",
            "rust-analyzer",
            "clangd",
            "typescript-language-server",
          ],
          control: { type: "toggle", key: "lsp.enabled" },
        },
        {
          // Agent diagnostics (FR-026): route the editor's LSP diagnostics into the IDE
          // getDiagnostics tool so Claude gets an edit → verify → fix loop.
          name: "Send diagnostics to Claude",
          desc:
            "Let the Claude agent read the same errors and warnings the editor shows, through the IDE " +
            "getDiagnostics tool, for an edit → verify → fix loop. Read-only; off leaves getDiagnostics empty.",
          aliases: ["problems", "lint"],
          control: { type: "toggle", key: "lsp.exposeToAgent" },
          visible: lsp,
        },
        {
          // Inlay hints (010): the server's inferred-type and parameter-name hints, inline.
          name: "Show inlay hints",
          desc:
            "Show the language server's inline hints — inferred types and parameter names — in the code " +
            "editor. Depends on the server providing them (some enable inlay hints only when configured).",
          aliases: ["type hints", "signature"],
          control: { type: "toggle", key: "lsp.inlayHints", defaultValue: true },
          visible: lsp,
        },
        {
          // Semantic highlighting (011): recolor tokens by the server's classification.
          name: "Semantic highlighting",
          desc:
            "Recolor code by the language server's understanding of it — a parameter vs. a local " +
            "variable, a type, a deprecated symbol — layered over the existing syntax highlighting. " +
            "Depends on the server providing semantic tokens.",
          aliases: ["symbol colors"],
          control: { type: "toggle", key: "lsp.semanticTokens", defaultValue: true },
          visible: lsp,
        },
        {
          // Code folding (012): a fold gutter driven by the server's structural regions.
          name: "Code folding",
          desc:
            "Show a fold gutter for the regions the language server reports (functions, blocks, " +
            "import groups) so you can collapse and expand them. Depends on the server providing " +
            "folding ranges.",
          aliases: ["outline"],
          control: { type: "toggle", key: "lsp.folding", defaultValue: true },
          visible: lsp,
        },
      ],
    },
    {
      // Detected language servers (006). The scan itself runs from the block, not from here.
      type: "group",
      heading: "Detected language servers",
      visible: lsp,
      items: [
        prose(scanBlock(plugin)),
        {
          name: "Custom servers (advanced)",
          desc:
            'One per line as "language = command args", e.g. "ruby = /opt/ruby-lsp". A server you ' +
            "configure here is trusted and used instead of auto-discovery for that language.",
          aliases: ["lsp command", "server path", "override discovery"],
          render: customServersBlock(plugin),
        },
      ],
    },

    {
      name: "Connection",
      desc: "Which loopback port this vault listens on for Claude Code, and whether a session is attached.",
      aliases: ["websocket", "ide", "lock file", "status"],
      render: connectionStatus(plugin),
    },

    { type: "group", heading: "Agent launcher", items: launcherItems(plugin, host) },

    // Three capabilities that have no setting of their own, and were therefore unreachable from
    // settings search. Named here so a search for "prettier", "branch" or "diff" lands somewhere
    // that says what the plugin does and how to reach it (017 US4).
    {
      type: "group",
      heading: "Commands and panels",
      items: [
        {
          name: "Format code file",
          desc:
            "Reformat the open code file with the bundled formatter for its language. Run it from the " +
            "command palette as \"Format code file\", or from the code editor's right-click menu.",
          aliases: ["prettier", "dprint", "clang-format", "rustfmt", "gofmt", "ruff", "beautify"],
          render: formatButton(plugin),
        },
        {
          name: "Git graph",
          desc: "The vault's commit history as a graph, with the branches it belongs to. Opens in a panel.",
          aliases: ["log", "commits"],
          render: graphButton(plugin),
        },
        {
          name: "Keep/Reject diff",
          desc:
            "Every edit Claude makes to a file in this vault opens as a side-by-side diff you keep or " +
            "reject, in the same editor. Nothing to switch on — it is how the agent's edits arrive.",
          aliases: ["accept", "review changes", "side by side", "merge"],
          render: linkButton(
            "How it works",
            "https://github.com/vitaly-andr/obsidian-code-workbench#git-review",
          ),
        },
      ],
    },

    {
      type: "group",
      heading: "Support",
      cls: "cw-support",
      items: [
        prose(supportIntroBlock()),
        prose(donateBlock()),
        {
          name: "Star on GitHub",
          desc: "A star improves karma :)",
          render: linkButton("★ Star on GitHub", "https://github.com/vitaly-andr/obsidian-code-workbench"),
        },
        {
          name: "Changelog",
          desc: `What changed in each release. Current version ${plugin.manifest.version}.`,
          render: linkButton(
            "View changelog",
            "https://github.com/vitaly-andr/obsidian-code-workbench/blob/main/CHANGELOG.md",
          ),
        },
        prose(sponsorshipBlock()),
        {
          name: "Contact",
          desc: "Questions, feedback, or sponsorship.",
          render: contactButtons(),
        },
        prose(telegramQrBlock()),
      ],
    },

    prose(licenseBlock()),
  ];
}

/**
 * One block per backend preset — the configured backend or the button that adds it — followed by
 * the launch buttons. At most one backend per preset: a second would only duplicate the same
 * endpoint and models.
 */
function launcherItems(plugin: CodeWorkbenchPlugin, host: SettingsHost): CwDef[] {
  const items: CwDef[] = [prose(paragraphBlock(LAUNCHER_INTRO))];
  const profiles = plugin.settings.launchProfiles;

  for (const preset of Object.values(BACKEND_PRESETS)) {
    items.push(prose(backendConsoleBlock(preset.id)));
    const profile = profiles.find((p) => p.backend?.presetId === preset.id);
    if (!profile) {
      items.push({
        name: `Add ${preset.name} backend`,
        desc: preset.tagline,
        render: addBackendButton(plugin, preset.id, host),
      });
      continue;
    }
    items.push({ name: profile.name || preset.name, render: backendRow(plugin, profile, host) });
    items.push(prose(backendTiersBlock(preset.id)));
  }

  items.push({
    name: "Launch Claude",
    desc: "Open a terminal in this vault folder and start the Claude Code CLI.",
    aliases: ["start session", "run"],
    render: launchButton(plugin),
  });
  // A launch button per configured backend, next to the Claude one.
  for (const backend of profiles.filter((p) => p.backend)) {
    items.push({
      name: `Launch ${backend.name}`,
      desc: "Open a terminal in this vault folder and start Claude Code on this backend.",
      render: launchButton(plugin, backend),
    });
  }

  return items;
}
