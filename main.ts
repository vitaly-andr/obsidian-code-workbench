// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { EditorView } from "@codemirror/view";
import { randomUUID } from "crypto";
import * as path from "path";
import { IdeContext } from "./src/context";
import { DiffManager } from "./src/diff-manager";
import { LockFile } from "./src/server/lockfile";
import { IdeServer } from "./src/server/websocket-server";
import { activeSelection } from "./src/tools/selection";
import { error, info, warn } from "./src/util/log";
import { launchCommand } from "./src/util/launch";
import { CLAUDE_PROFILE, normalizeLaunchProfiles } from "./src/util/launch-profiles";
import type { LaunchProfile } from "./src/util/launch-profiles";
import { AgentBackends, BACKEND_PRESETS, seedBackendConfig } from "./src/util/agent-backends";
import { DEMO_FILES } from "./src/util/demo-files";
import { CODE_VIEW_EXTENSIONS, CodeView } from "./src/views/code-view";
import { blameAnnotation, setBlame } from "./src/views/blame-annotation";
import { GrammarLoader } from "./src/treesitter/loader";
import { FormatService } from "./src/format/format-service";
import { DiffView } from "./src/views/diff-view";
import {
  CODE_VIEW_TYPE,
  DIFF_VIEW_TYPE,
  GIT_DIFF_VIEW_TYPE,
  GIT_GRAPH_VIEW_TYPE,
  HIDDEN_FILE_VIEW_TYPE,
  HIDDEN_TREE_VIEW_TYPE,
  OUTLINE_VIEW_TYPE,
} from "./src/views/view-types";
import { absoluteForVaultPath, fromFileUri, vaultBasePath, vaultPathForAbsolute } from "./src/util/paths";
import { IconLoader } from "./src/icons/icon-loader";
import { ExplorerIcons } from "./src/icons/explorer-icons";
import { GitDecorations } from "./src/decorations/git-decorations";
import { Companion } from "./src/mcp-http/companion";
import { HiddenFileView } from "./src/views/hidden-file-view";
import { HiddenFilesView } from "./src/views/hidden-files-view";
import { GitGraphView } from "./src/views/git-graph-view";
import { GitDiffView } from "./src/views/git-diff-view";
import { OutlineView } from "./src/views/outline-view";
import { WorkspaceSymbolsModal } from "./src/views/workspace-symbols-modal";
import { LaunchProfileModal } from "./src/views/launch-profile-modal";
import type { EditorMenuHost } from "./src/views/editor-context-menu";
import { HiddenEntry, listHiddenFiles } from "./src/views/hidden-files";
import { getCurrentBranch, loadBlame, loadHeadBlob, resolveRepository } from "./src/git/log";
import { watchGitRefs } from "./src/git/watch";
import type { CurrentBranch } from "./src/git/types";
// Editor-LSP persisted settings only. The type and defaults are plain data (no CM6 / child_process),
// so importing them does not pull the lazy LSP runtime (src/lsp/index.ts) into startup.
import { DEFAULT_LSP_SETTINGS, isLanguageEnabled } from "./src/lsp/settings";
import type { LspSettings } from "./src/lsp/settings";
// Type-only imports are erased at build, so naming the LSP controller/config here does NOT pull the
// lazy runtime into the base bundle — that only happens at the dynamic import() in lspAttach.
import type { LspController } from "./src/lsp";
import type { LspEditorConfig } from "./src/views/code-view";
import type { Extension } from "@codemirror/state";
import { buildSettingDefinitions, getByPath, renderLegacy, setByPath } from "./src/settings";

// Obsidian's Editor wraps a CodeMirror 6 EditorView on desktop; that view is not in the public
// typings. Reach it through a narrow cast (no `any`) and degrade gracefully if it is ever absent.
function markdownEditorView(view: MarkdownView): EditorView | null {
  const cm = (view.editor as unknown as { cm?: EditorView }).cm;
  return cm ?? null;
}

interface CodeWorkbenchSettings {
  // Whether to push selection_changed automatically as the selection changes.
  shareSelection: boolean;
  // Opt-in: use tree-sitter for highlighting + diagnostics. Grammars download on first use.
  treeSitter: boolean;
  // Draw vertical indentation guides in the code editor and diffs. On by default (editor chrome).
  indentGuides: boolean;
  // Show the author/commit of the current line as an inline git blame annotation in the editor.
  gitBlame: boolean;
  // Show Material file/folder icons in the explorer. SVGs download on first use.
  fileIcons: boolean;
  // VS Code-style git status in the explorer: tint changed files/folders and badge them (M/A/D/R/U).
  gitDecorations: boolean;
  // Opt-in: expose vault read/write tools to the Claude model over the companion MCP server.
  vaultTools: boolean;
  // Opt-in: surface the vault's hidden (dot) files in settings so they can be opened and edited.
  showHiddenFiles: boolean;
  // Opt-in editor language intelligence via discovered LSP servers (005-editor-lsp). Disabled by
  // default; the LSP runtime is lazily imported only when enabled (FR-001/FR-024).
  lsp: LspSettings;
  // Launch profiles (016): named terminal commands for the status-bar/palette launcher. A profile
  // is a command only — backend credentials live in the user's own wrapper scripts.
  launchProfiles: LaunchProfile[];
  defaultLaunchProfile: string;
}

const DEFAULT_SETTINGS: CodeWorkbenchSettings = {
  shareSelection: true,
  treeSitter: true,
  indentGuides: true,
  gitBlame: true,
  fileIcons: true,
  gitDecorations: true,
  vaultTools: false,
  showHiddenFiles: false,
  lsp: DEFAULT_LSP_SETTINGS,
  launchProfiles: [{ ...CLAUDE_PROFILE }],
  defaultLaunchProfile: CLAUDE_PROFILE.id,
};

export default class CodeWorkbenchPlugin extends Plugin {
  settings: CodeWorkbenchSettings = { ...DEFAULT_SETTINGS };
  private server: IdeServer | null = null;
  private lock: LockFile | null = null;
  private ctx: IdeContext | null = null;
  private statusEl: HTMLElement | null = null;
  private port = 0;
  private connected = false;
  private explorerIcons: ExplorerIcons | null = null;
  private gitDecorations: GitDecorations | null = null;
  private companion: Companion | null = null;
  private iconLoader: IconLoader | null = null;
  private gitBranchEl: HTMLElement | null = null;
  private gitRefreshTimer: number | null = null;
  private gitStatusTimer: number | null = null;
  private mdBlameTimer: number | null = null;
  private gitWatchDispose: (() => void) | null = null;
  // Editor-LSP controller, loaded lazily on first enable so the base bundle/startup are untouched
  // when the feature is off (FR-024 / SC-003).
  private lspController: LspController | null = null;
  private lspLoading: Promise<LspController> | null = null;
  // Managed agent backends (016): writes the 0600 key JSON + 0700 wrapper script per backend.
  backends: AgentBackends | null = null;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<CodeWorkbenchSettings>);
    // The top-level assign is shallow, so a stored partial `lsp` would drop the nested defaults
    // (perLanguage/customServers). Merge the LSP object on its own so new sub-fields keep defaults.
    this.settings.lsp = Object.assign({}, DEFAULT_LSP_SETTINGS, this.settings.lsp);
    // Launch profiles: normalize whatever was persisted (seed on first load, drop malformed
    // rows, repoint a dangling default) — lossless upgrade migration (016 FR-002).
    const launchState = normalizeLaunchProfiles(this.settings.launchProfiles, this.settings.defaultLaunchProfile);
    this.settings.launchProfiles = launchState.profiles;
    this.settings.defaultLaunchProfile = launchState.defaultId;

    // Managed backends: the wrapper scripts live in the plugin data folder. Regenerate them on
    // load from each backend's stored JSON so a template change (or lost script) is repaired and
    // the API key survives restarts without ever entering data.json.
    const backendsRoot = vaultBasePath(this.app);
    if (backendsRoot) {
      this.backends = new AgentBackends(
        path.join(backendsRoot, this.app.vault.configDir, "plugins", this.manifest.id),
      );
      for (const p of this.settings.launchProfiles) {
        if (!p.backend) continue;
        const cfg = await this.backends.readConfig(p.id);
        if (cfg) await this.backends.write(p.id, cfg).catch(() => undefined);
      }
    }

    const authToken = randomUUID();
    const ctx: IdeContext = {
      app: this.app,
      pluginVersion: this.manifest.version,
      lastSelection: null,
      diffs: new DiffManager(this.app),
      notify: () => {},
    };
    this.ctx = ctx;

    // The right-click menu shared by the code-file and hidden-file editors (neither is a TFile view,
    // so Obsidian's own editor-menu skips them): @-mention a selection, and diff against the last commit.
    const editorMenuHost: EditorMenuHost = {
      addToContext: (payload) =>
        this.ctx?.notify("at_mentioned", {
          filePath: payload.filePath,
          lineStart: payload.selection.start.line + 1,
          lineEnd: payload.selection.end.line + 1,
        }),
      openWorkingDiff: (absPath, name) => void this.openWorkingDiffAbs(absPath, name),
    };

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("mod-clickable");
    this.registerDomEvent(this.statusEl, "click", () => void this.launchProfile());
    this.registerDomEvent(this.statusEl, "contextmenu", (e) => this.showLaunchProfileMenu(e));
    this.refreshStatus();
    this.addSettingTab(new CodeWorkbenchSettingTab(this.app, this));

    this.addCommand({
      id: "launch-claude",
      name: "Launch Claude in terminal",
      callback: () => void this.launchProfile(),
    });
    this.addCommand({
      id: "launch-backend-picker",
      name: "Launch agent backend…",
      callback: () => {
        const backends = this.settings.launchProfiles.filter((p) => p.backend);
        if (backends.length === 0) {
          new Notice("Code Workbench: no agent backend configured — add one in settings");
          return;
        }
        new LaunchProfileModal(this.app, backends, (p) => void this.launchProfile(p)).open();
      },
    });

    // Second status-bar item: the current git branch (or "no git"). Read lazily on relevant
    // events, never on a timer.
    this.gitBranchEl = this.addStatusBarItem();
    this.gitBranchEl.addClass("cw-gitbranch");
    this.registerDomEvent(window, "focus", () => this.scheduleGitBranchRefresh());
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleGitBranchRefresh()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleGitBranchRefresh()));
    void this.refreshGitBranch();

    this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf, () => this.settings.indentGuides));
    this.registerView(
      HIDDEN_FILE_VIEW_TYPE,
      (leaf) =>
        new HiddenFileView(leaf, {
          ...editorMenuHost,
          // Re-read git status after a save: dot-files don't fire vault events or move a git ref.
          onSaved: () => void this.gitDecorations?.update(),
        }),
    );
    this.registerView(HIDDEN_TREE_VIEW_TYPE, (leaf) => new HiddenFilesView(leaf, this));
    this.registerView(GIT_GRAPH_VIEW_TYPE, (leaf) => new GitGraphView(leaf));
    this.registerView(GIT_DIFF_VIEW_TYPE, (leaf) => new GitDiffView(leaf, () => this.settings.indentGuides));
    this.addRibbonIcon("git-branch", "Open git graph", () => void this.openGitGraphPanel());
    this.addCommand({
      id: "open-git-graph",
      name: "Open git graph",
      callback: () => void this.openGitGraphPanel(),
    });
    // tree-sitter grammars are cached under the plugin's own data folder.
    const grammarLoader = new GrammarLoader(
      this.app.vault.adapter,
      `${this.app.vault.configDir}/plugins/${this.manifest.id}/grammars`,
    );
    const formatService = new FormatService(
      this.app.vault.adapter,
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`,
    );
    const tsConfig = { loader: grammarLoader, enabled: () => this.settings.treeSitter };
    const blameConfig = { enabled: () => this.settings.gitBlame };
    // Editor-LSP wiring. `enabled` is a cheap data-only check (no runtime import); `attach` lazily
    // loads src/lsp on first use, so a disabled feature never pulls the LSP runtime (SC-003).
    const lspConfig: LspEditorConfig = {
      enabled: (language) => isLanguageEnabled(this.settings.lsp, language),
      attach: (input) => this.lspAttach(input),
      release: (owner) => this.lspController?.releaseOwner(owner),
    };
    this.registerView(
      CODE_VIEW_TYPE,
      (leaf) =>
        new CodeView(
          leaf,
          tsConfig,
          formatService,
          blameConfig,
          editorMenuHost,
          lspConfig,
          () => this.settings.indentGuides,
          (filePath) => this.refreshOutlineFor(filePath),
        ),
    );
    try {
      // One batched call instead of ~95 — far less file-explorer churn on enable.
      this.registerExtensions(CODE_VIEW_EXTENSIONS, CODE_VIEW_TYPE);
    } catch {
      // Another plugin already owns one of these extensions; register the rest individually.
      for (const ext of CODE_VIEW_EXTENSIONS) {
        try {
          this.registerExtensions([ext], CODE_VIEW_TYPE);
        } catch {
          // extension already registered elsewhere
        }
      }
    }
    // Document outline (008): a read-only sidebar panel over the same lazy LSP seam as lspConfig
    // above. ensureLspController/isLanguageEnabled are the only two things the panel needs from the
    // plugin, so it never imports src/lsp/index.ts itself (FR-009).
    this.registerView(
      OUTLINE_VIEW_TYPE,
      (leaf) =>
        new OutlineView(leaf, {
          ensureLspController: () => this.ensureLspController(),
          isLanguageEnabled: (language) => isLanguageEnabled(this.settings.lsp, language),
        }),
    );
    this.addRibbonIcon("list-tree", "Open code outline", () => void this.openOutlinePanel());
    this.addCommand({
      id: "open-code-outline",
      name: "Open code outline",
      callback: () => void this.openOutlinePanel(),
    });
    // Follow the active file (US3): re-target/refresh any open outline panel on every leaf/file
    // switch. The debounced-edit trigger is wired through CodeView's onDocumentSettled above.
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshOutlineViews()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshOutlineViews()));

    // LSP hover/documentation links to another file arrive as `file://` URIs (e.g. clangd's
    // "provided by util.h"). A raw file:// navigation is blocked by Electron ("Not allowed to load
    // local resource"), so the link looks dead. Intercept a click on such a link inside LSP-rendered
    // content (tooltips / signature / message) and open the file in the vault instead — like
    // go-to-definition; ordinary (http) links are left to their normal handling.
    this.registerDomEvent(activeDocument, "click", (evt) => {
      const el = evt.target instanceof HTMLElement ? evt.target : null;
      const anchor = el?.closest("a[href^='file:']") as HTMLAnchorElement | null;
      if (!anchor || !anchor.closest(".cm-tooltip, .cm-lsp-documentation, .cm-lsp-message")) return;
      evt.preventDefault();
      void this.openLspFileLink(anchor.getAttribute("href") ?? "");
    });

    // Workspace symbols (013): the project-wide companion to the outline above — a command-invoked
    // palette instead of a panel, since a search is a one-off action rather than something to keep
    // open. Same lazy seam (ensureLspController only), no settings toggle.
    this.addCommand({
      id: "search-workspace-symbols",
      name: "Search workspace symbols",
      callback: () => {
        new WorkspaceSymbolsModal(this.app, {
          ensureLspController: () => this.ensureLspController(),
        }).open();
      },
    });

    // File-type icons in the explorer. Material icons are fetched on demand (same lazy/cached
    // pattern as grammars) and painted onto the nav rows.
    this.iconLoader = new IconLoader(
      this.app.vault.adapter,
      `${this.app.vault.configDir}/plugins/${this.manifest.id}/icons`,
    );
    this.explorerIcons = new ExplorerIcons(this.app, this.iconLoader);
    if (this.settings.fileIcons) this.explorerIcons.enable();
    // The explorer leaf is built after onload and can be rebuilt later; repaint once the workspace
    // is ready and whenever the layout or the file tree changes.
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.fileIcons) this.explorerIcons?.refresh();
    });
    const repaintIcons = () => {
      if (this.settings.fileIcons) this.explorerIcons?.refresh();
    };
    this.registerEvent(this.app.workspace.on("layout-change", repaintIcons));
    this.registerEvent(this.app.vault.on("create", repaintIcons));
    this.registerEvent(this.app.vault.on("rename", repaintIcons));
    this.registerEvent(this.app.vault.on("delete", repaintIcons));

    // VS Code-style git status in the explorer: tint changed files/folders and badge them (M/A/D/R/U).
    // Status is re-read on git ref changes (onGitChanged) and on vault file events; the DOM repaint is
    // cheap and also runs on layout changes. onChange repaints the hidden-files panel from the same map.
    this.gitDecorations = new GitDecorations(this.app);
    this.gitDecorations.onChange = () => this.repaintHiddenGit();
    if (this.settings.gitDecorations) this.gitDecorations.enable();
    this.app.workspace.onLayoutReady(() => this.gitDecorations?.refresh());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.gitDecorations?.refresh()));
    const restatus = () => this.scheduleGitStatus();
    this.registerEvent(this.app.vault.on("create", restatus));
    this.registerEvent(this.app.vault.on("delete", restatus));
    this.registerEvent(this.app.vault.on("rename", restatus));
    this.registerEvent(this.app.vault.on("modify", restatus));
    // Obsidian's vault events fire only for visible files; they miss hidden dot-files (.obsidian,
    // .gitignore) and anything changed outside Obsidian. Re-read status when the window regains focus
    // so those changes are picked up on return, the same no-polling trick the branch indicator uses.
    this.registerDomEvent(window, "focus", () => this.scheduleGitStatus());

    // Right-click a file (in the explorer, a tab, or the editor) to diff its working-tree copy against
    // the last commit. The /ide diff and the git-graph diff only cover committed changes; this covers
    // the not-yet-committed ones.
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) this.addWorkingDiffItem(menu, file);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, _editor, info) => {
        menu.addItem((item) =>
          item
            .setTitle("Add selection to Claude context")
            .setIcon("at-sign")
            .onClick(() => this.addSelectionToContext()),
        );
        if (info.file instanceof TFile) this.addWorkingDiffItem(menu, info.file);
      }),
    );

    // Inline git blame in markdown notes goes through Obsidian's own editor: install the (inert)
    // blame fields in every markdown editor, then feed the active note's blame on navigation and
    // after edits. CodeView blames itself; this covers markdown only.
    this.registerEditorExtension([blameAnnotation()]);
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleMarkdownBlame()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleMarkdownBlame()));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleMarkdownBlame(1200)));
    this.app.workspace.onLayoutReady(() => this.scheduleMarkdownBlame());
    void this.setupGitWatch();

    // Track selection: cache it (for getLatestSelection) and push selection_changed to the CLI.
    let selectionTimer: number | null = null;
    const pushSelection = () => {
      if (selectionTimer !== null) window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(() => {
        const sel = activeSelection(this.app);
        // Focus moved to a pane with no editor selection (e.g. the diff pane Claude
        // opens, or a non-note view). Keep the last selection instead of clobbering
        // Claude's context with selection: null.
        if (!sel) return;
        if (!sel.selection.isEmpty) ctx.lastSelection = sel;
        if (!this.settings.shareSelection) return;
        ctx.notify("selection_changed", {
          selection: { start: sel.selection.start, end: sel.selection.end },
          text: sel.text,
          filePath: sel.filePath,
        });
      }, 120);
    };
    this.registerEvent(this.app.workspace.on("active-leaf-change", pushSelection));
    this.registerEditorExtension([
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) pushSelection();
      }),
    ]);

    this.addCommand({
      id: "add-selection-to-context",
      name: "Add selection to Claude context",
      callback: () => this.addSelectionToContext(),
    });

    this.addCommand({
      id: "format-code-file",
      name: "Format code file",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) this.formatActiveCodeFile();
        return true;
      },
    });

    // Fold-all / unfold-all (012 US2): a discoverable command atop foldKeymap's own bindings. A
    // harmless no-op when nothing is foldable (folding off, or no connected server yet).
    this.addCommand({
      id: "fold-all",
      name: "Fold all",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.foldAll();
        return true;
      },
    });
    this.addCommand({
      id: "unfold-all",
      name: "Unfold all",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.unfoldAll();
        return true;
      },
    });

    // Go-to-definition / find-references (US4): first-class Obsidian commands — they show in the
    // palette and their hotkey is assignable in Settings → Hotkeys (nothing is bound to a key in the
    // editor). The primary, discoverable entry point is the editor right-click menu; these commands
    // are the keyboard/palette path. A no-op when the file has no language server for the action.
    this.addCommand({
      id: "lsp-go-to-definition",
      name: "Go to definition",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.goToDefinition();
        return true;
      },
    });
    this.addCommand({
      id: "lsp-go-to-declaration",
      name: "Go to declaration",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.goToDeclaration();
        return true;
      },
    });
    this.addCommand({
      id: "lsp-go-to-type-definition",
      name: "Go to type definition",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.goToTypeDefinition();
        return true;
      },
    });
    this.addCommand({
      id: "lsp-go-to-implementation",
      name: "Go to implementation",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.goToImplementation();
        return true;
      },
    });
    this.addCommand({
      id: "lsp-find-references",
      name: "Find references",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(CodeView);
        if (!view) return false;
        if (!checking) view.findReferences();
        return true;
      },
    });

    this.addCommand({
      id: "save-hidden-file",
      name: "Save hidden file",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(HiddenFileView);
        if (!view) return false;
        if (!checking) void view.save();
        return true;
      },
    });

    try {
      const server = new IdeServer(ctx, authToken);
      server.onClientChange = (count) => {
        this.connected = count > 0;
        this.refreshStatus();
      };
      const port = await server.start();
      this.server = server;
      this.port = port;
      this.refreshStatus();
      ctx.notify = (method, params) => server.broadcast({ jsonrpc: "2.0", method, params });

      await LockFile.sweepStale();
      const base = vaultBasePath(this.app);
      const lock = new LockFile(port);
      await lock.write({
        pid: process.pid,
        workspaceFolders: base ? [base] : [],
        ideName: "Obsidian",
        transport: "ws",
        authToken,
      });
      this.lock = lock;
      info(`ready — run "claude" in ${base ?? "the vault folder"}; /ide will list Obsidian`);
    } catch (e) {
      error("failed to start IDE integration; it will retry on next load", e);
    }

    // Companion MCP server: exposes vault read/write tools to the Claude model over a separate
    // loopback HTTP server. Opt-in via the "Vault tools (Claude)" setting; independent of /ide.
    const vaultRoot = vaultBasePath(this.app);
    if (vaultRoot) {
      const companion = new Companion({
        app: this.app,
        diffs: ctx.diffs,
        pluginVersion: this.manifest.version,
        pluginDir: path.join(vaultRoot, this.app.vault.configDir, "plugins", this.manifest.id),
        vaultRoot,
      });
      companion.onStatusChange = () => this.refreshStatus();
      this.companion = companion;
      if (this.settings.vaultTools) {
        await companion.start().catch((e) => warn("companion start failed", e));
      }
    }

    // Restore the hidden-files panel if it was left on.
    if (this.settings.showHiddenFiles) {
      this.app.workspace.onLayoutReady(() => void this.openHiddenFilesPanel());
    }
  }

  // Lazily build the LSP controller on first enable. The dynamic import() is what pulls the LSP
  // runtime + @codemirror/lsp-client in, so nothing loads while the feature is off. Not `private`:
  // the settings tab calls this to scan for servers (006) without duplicating the lazy-load seam.
  async ensureLspController(): Promise<LspController> {
    if (this.lspController) return this.lspController;
    if (!this.lspLoading) {
      this.lspLoading = import("./src/lsp").then((m) =>
        m.createLspController({
          settings: () => this.settings.lsp,
          vaultRoot: () => vaultBasePath(this.app),
          notify: (message) => new Notice(message),
          toRelativePath: (absPath) => vaultPathForAbsolute(this.app, absPath),
          // Cross-file go-to-definition / find-references: open the target file in the vault and hand
          // the LSP client its editor to position the cursor (Workspace.displayFile). Non-destructive —
          // does not replace the source file (see leafForLspTarget). Null for a file outside the vault.
          openFileForLsp: async (uri: string): Promise<EditorView | null> => {
            const abs = fromFileUri(uri);
            const rel = abs !== null ? vaultPathForAbsolute(this.app, abs) : null;
            const file = rel !== null ? this.app.vault.getAbstractFileByPath(rel) : null;
            if (!(file instanceof TFile)) return null;
            const leaf = this.leafForLspTarget(file);
            await leaf.openFile(file);
            void this.app.workspace.revealLeaf(leaf);
            return leaf.view instanceof CodeView ? leaf.view.getEditorView() : null;
          },
        }),
      );
    }
    this.lspController = await this.lspLoading;
    return this.lspController;
  }

  // Pick the leaf a cross-file LSP target (go-to-definition, reference, hover link) opens in WITHOUT
  // clobbering the source file: reuse a tab already showing that file, otherwise a new tab. Never
  // replaces the active editor — the reader keeps their place.
  private leafForLspTarget(file: TFile): WorkspaceLeaf {
    let existing: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!existing && leaf.view instanceof CodeView && leaf.view.file?.path === file.path) existing = leaf;
    });
    return existing ?? this.app.workspace.getLeaf("tab");
  }

  // Open an LSP `file://` hover/documentation link in the vault (a raw file:// nav is blocked by
  // Electron). Same open path as cross-file go-to-definition; a trailing "#L<line>" fragment is a
  // best-effort cursor reveal (line numbers in such fragments are 1-based).
  private async openLspFileLink(href: string): Promise<void> {
    if (!href) return;
    const hash = href.indexOf("#");
    const abs = fromFileUri(hash >= 0 ? href.slice(0, hash) : href);
    const rel = abs !== null ? vaultPathForAbsolute(this.app, abs) : null;
    const file = rel !== null ? this.app.vault.getAbstractFileByPath(rel) : null;
    if (!(file instanceof TFile)) {
      new Notice("Code Workbench: that file is outside the vault");
      return;
    }
    const leaf = this.leafForLspTarget(file);
    await leaf.openFile(file);
    await this.app.workspace.revealLeaf(leaf);
    const lineMatch = hash >= 0 ? href.slice(hash + 1).match(/^L(\d+)/) : null;
    if (lineMatch && leaf.view instanceof CodeView) {
      const pos = { line: Math.max(0, parseInt(lineMatch[1], 10) - 1), character: 0 };
      const view = leaf.view;
      view.revealPosition(pos);
      window.requestAnimationFrame(() => {
        if (leaf.view instanceof CodeView) leaf.view.revealPosition(pos);
      });
    }
  }

  // Resolve a file to its LSP editor extension (or null to stay highlighting-only). Called by the
  // CodeView only after its cheap `enabled` gate passes.
  private async lspAttach(...args: Parameters<LspEditorConfig["attach"]>): Promise<Extension | null> {
    const [input] = args;
    const controller = await this.ensureLspController();
    const result = await controller.resolve({
      filePath: input.filePath,
      language: input.language,
      owner: input.owner,
      onStatus: input.onStatus,
    });
    return result.kind === "attached" ? controller.buildEditorExtension(result) : null;
  }

  // Re-evaluate the LSP layer on every open code view (used when the master toggle changes). Turning
  // it off disposes all sessions (no orphan processes); both directions re-render the views so the
  // layer reflects the new setting.
  refreshLspViews(): void {
    if (!this.settings.lsp.enabled) {
      this.lspController?.dispose();
      this.lspController = null;
      this.lspLoading = null;
    }
    for (const leaf of this.app.workspace.getLeavesOfType(CODE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CodeView) view.reapplyLsp();
    }
  }

  // Re-apply the tree-sitter highlighting layer to every open code view (used when "Enable syntax
  // highlighting" toggles), so the change shows immediately instead of only on the next file open.
  refreshCodeViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CODE_VIEW_TYPE)) {
      if (leaf.view instanceof CodeView) leaf.view.applyTreeSitter();
    }
  }

  onunload(): void {
    // Fire-and-forget cleanup: Obsidian does not await onunload, and the lock/server teardown
    // is best-effort.
    this.lspController?.dispose();
    this.lspController = null;
    void this.lock?.remove().catch((e) => warn("lock removal failed", e));
    void this.server?.stop().catch((e) => warn("server stop failed", e));
    void this.companion?.stop().catch((e) => warn("companion stop failed", e));
    // Don't detach our leaves here: Obsidian resets a detached leaf to its default location on the
    // next load, even if the user moved it. Obsidian tears the views down on unload by itself.
    this.ctx?.diffs.closeAll();
    this.explorerIcons?.disable();
    this.explorerIcons = null;
    this.gitDecorations?.disable();
    this.gitDecorations = null;
    this.lock = null;
    this.server = null;
    this.companion = null;
    this.iconLoader = null;
    if (this.gitRefreshTimer !== null) window.clearTimeout(this.gitRefreshTimer);
    if (this.gitStatusTimer !== null) window.clearTimeout(this.gitStatusTimer);
    if (this.mdBlameTimer !== null) window.clearTimeout(this.mdBlameTimer);
    this.gitBranchEl = null;
    this.ctx = null;
  }

  statusText(): string {
    if (!this.port) return "not started";
    return `127.0.0.1:${this.port} — ${this.connected ? "connected" : "waiting for Claude"}`;
  }

  // Live toggle from the settings tab: attach + paint, or strip the explorer icons immediately.
  // Also repaint the hidden-files panel so its icons match.
  setFileIcons(on: boolean): void {
    if (on) this.explorerIcons?.enable();
    else this.explorerIcons?.disable();
    this.refreshHiddenTree();
  }

  // Live toggle from the settings tab: paint or strip the explorer git status decorations, in both
  // the file explorer and the hidden-files panel.
  setGitDecorations(on: boolean): void {
    if (on) this.gitDecorations?.enable();
    else this.gitDecorations?.disable();
    this.repaintHiddenGit();
  }

  // Live toggle from the settings tab: start or stop the companion vault-tools server.
  async setVaultTools(on: boolean): Promise<void> {
    try {
      if (on) await this.companion?.start();
      else await this.companion?.stop();
    } catch (e) {
      warn("companion toggle failed", e);
      new Notice("Code Workbench: the vault-tools server could not be started");
    }
  }

  // Live toggle from the settings tab: open or close the hidden-files sidebar panel.
  async setShowHiddenFiles(on: boolean): Promise<void> {
    try {
      if (on) await this.openHiddenFilesPanel();
      else this.app.workspace.detachLeavesOfType(HIDDEN_TREE_VIEW_TYPE);
    } catch (e) {
      warn("hidden-files panel toggle failed", e);
    }
  }

  // Reveal the hidden-files panel in the left sidebar (reusing an existing one if already open).
  async openHiddenFilesPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HIDDEN_TREE_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: HIDDEN_TREE_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  // Format the open code file. Shared by the "Format code file" command and the settings button,
  // which is why the missing-view case says so out loud instead of staying silent: from settings
  // the editor is behind the modal, and a button that appears to do nothing is worse than a notice.
  formatActiveCodeFile(): void {
    const view = this.app.workspace.getActiveViewOfType(CodeView);
    if (!view) {
      new Notice("Code Workbench: open a code file first");
      return;
    }
    void view.format().then((ok) => {
      if (!ok) new Notice("Code Workbench: nothing to format here");
    });
  }

  // Reveal the git-graph panel in the left sidebar (reusing an existing one if already open).
  async openGitGraphPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(GIT_GRAPH_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: GIT_GRAPH_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  // Reveal the code outline panel in the left sidebar (reusing an existing one if already open).
  async openOutlinePanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: OUTLINE_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  // Re-target every open outline panel to the (possibly new) active file (US3).
  private refreshOutlineViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      if (leaf.view instanceof OutlineView) void leaf.view.refresh();
    }
  }

  // Refresh any open outline panel that is currently showing this file, after its document settles
  // (debounced by CodeView, US3/FR-006).
  private refreshOutlineFor(filePath: string): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      if (leaf.view instanceof OutlineView) leaf.view.maybeRefreshFor(filePath);
    }
  }

  // Re-scan any open hidden-files panel — used when the file-icons setting changes.
  refreshHiddenTree(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(HIDDEN_TREE_VIEW_TYPE)) {
      if (leaf.view instanceof HiddenFilesView) void leaf.view.refresh();
    }
  }

  // HiddenFilesHost: the explorer git decorations, so the hidden-files panel can paint the same
  // status onto its own rows. Null before onload finishes.
  getGitDecorations(): GitDecorations | null {
    return this.gitDecorations;
  }

  // Repaint git status on any open hidden-files panel (a cheap DOM pass, no filesystem re-scan).
  private repaintHiddenGit(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(HIDDEN_TREE_VIEW_TYPE)) {
      if (leaf.view instanceof HiddenFilesView) leaf.view.repaintGitStatus();
    }
  }

  // HiddenFilesHost: the vault's hidden (dot) files for the panel. Obsidian hides these from the
  // explorer; only editable text files are listed (binary/oversized are filtered out).
  async listHiddenFiles(): Promise<HiddenEntry[]> {
    const base = vaultBasePath(this.app);
    return base ? listHiddenFiles(base) : [];
  }

  // HiddenFilesHost: the icon loader (null before onload finishes) and whether file icons are on.
  getIconLoader(): IconLoader | null {
    return this.iconLoader;
  }

  fileIconsEnabled(): boolean {
    return this.settings.fileIcons;
  }

  // Open one hidden text file in the in-app editor: a new tab (default), a split to the right, or a
  // new window — matching the file explorer's "Open in new tab / Open to the right" actions.
  async openHiddenFile(abs: string, mode: "tab" | "split" | "window" = "tab"): Promise<void> {
    try {
      const leaf =
        mode === "split"
          ? this.app.workspace.getLeaf("split")
          : mode === "window"
            ? this.app.workspace.getLeaf("window")
            : this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: HIDDEN_FILE_VIEW_TYPE, active: true, state: { path: abs } });
      await this.app.workspace.revealLeaf(leaf);
    } catch (e) {
      warn("opening hidden file failed", e);
      new Notice(`Code Workbench: couldn't open ${abs}`);
    }
  }

  // The companion port, or 0 when it is not running.
  companionPort(): number {
    return this.companion?.getPort() ?? 0;
  }

  // The manual `claude mcp add` command for the companion, or null when not running.
  companionCommand(): string | null {
    return this.companion?.manualAddCommand() ?? null;
  }

  // Send the active editor's current selection to Claude as an @-mention. Shared by the command and
  // the editor context menu (a markdown note, a code file, or a hidden file).
  private addSelectionToContext(): void {
    const sel = activeSelection(this.app);
    if (!sel) {
      new Notice("Code Workbench: no active selection");
      return;
    }
    this.ctx?.notify("at_mentioned", {
      filePath: sel.filePath,
      lineStart: sel.selection.start.line + 1,
      lineEnd: sel.selection.end.line + 1,
    });
    new Notice("Added selection to Claude context");
  }

  // Add a "Diff against last commit" entry to a file's context menu.
  private addWorkingDiffItem(menu: Menu, file: TFile): void {
    menu.addItem((item) =>
      item
        .setTitle("Diff against last commit")
        .setIcon("git-compare")
        .onClick(() => void this.openWorkingDiff(file)),
    );
  }

  // Diff a vault file's working-tree copy against the last commit. Resolves the absolute path and
  // hands off to openWorkingDiffAbs (shared with the hidden-file editor).
  async openWorkingDiff(file: TFile): Promise<void> {
    const abs = absoluteForVaultPath(this.app, file.path);
    if (abs) await this.openWorkingDiffAbs(abs, file.name);
  }

  // Open a read-only diff of a file's working-tree copy (new, on the right) against its last committed
  // version (HEAD, on the left), by absolute path so it works for vault files and hidden dot-files
  // alike. A new file shows as fully added; an unchanged file reports there is nothing uncommitted.
  async openWorkingDiffAbs(absPath: string, displayName: string): Promise<void> {
    const base = vaultBasePath(this.app);
    if (!base) return;
    const repo = await resolveRepository(base);
    if (repo.state !== "ok" || !repo.root) {
      new Notice("Code Workbench: not a git repository, or no commits yet");
      return;
    }
    const rel = path.relative(repo.root, absPath).split(path.sep).join("/");
    const vaultRel = vaultPathForAbsolute(this.app, absPath);
    const oldText = await loadHeadBlob(repo, rel);
    let newText = "";
    if (vaultRel !== null) {
      try {
        newText = await this.app.vault.adapter.read(vaultRel);
      } catch {
        newText = "";
      }
    }
    if (oldText === newText) {
      new Notice("Code Workbench: no uncommitted changes in this file");
      return;
    }
    const existing = this.app.workspace.getLeavesOfType(GIT_DIFF_VIEW_TYPE);
    const leaf = existing[0] ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: GIT_DIFF_VIEW_TYPE, active: true });
    if (leaf.view instanceof GitDiffView) {
      leaf.view.setData({
        title: `${displayName} — working tree vs HEAD`,
        path: vaultRel ?? displayName,
        oldContents: oldText,
        newContents: newText,
      });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  // Coalesce bursts of events into a single git read.
  private scheduleGitBranchRefresh(): void {
    if (this.gitRefreshTimer !== null) window.clearTimeout(this.gitRefreshTimer);
    this.gitRefreshTimer = window.setTimeout(() => {
      this.gitRefreshTimer = null;
      void this.refreshGitBranch();
    }, 300);
  }

  // Coalesce vault file events into one git-status read for the explorer decorations.
  private scheduleGitStatus(): void {
    if (!this.gitDecorations) return;
    if (this.gitStatusTimer !== null) window.clearTimeout(this.gitStatusTimer);
    this.gitStatusTimer = window.setTimeout(() => {
      this.gitStatusTimer = null;
      void this.gitDecorations?.update();
    }, 500);
  }

  private async refreshGitBranch(): Promise<void> {
    if (!this.gitBranchEl) return;
    const base = vaultBasePath(this.app);
    if (!base) {
      this.setGitBranch({ kind: "none", label: "no git", dirty: false });
      return;
    }
    try {
      const repo = await resolveRepository(base);
      this.setGitBranch(await getCurrentBranch(repo));
    } catch (e) {
      warn("git branch refresh failed", e);
      this.setGitBranch({ kind: "none", label: "no git", dirty: false });
    }
  }

  private setGitBranch(branch: CurrentBranch): void {
    if (!this.gitBranchEl) return;
    const el = this.gitBranchEl;
    el.empty();
    el.classList.remove("is-branch", "is-detached", "is-dirty", "is-none");
    setIcon(el.createSpan({ cls: "cw-gitbranch-icon" }), "git-branch");
    el.createSpan({ cls: "cw-gitbranch-label", text: branch.label });
    const status =
      branch.kind === "none"
        ? "is-none"
        : branch.kind === "detached"
          ? "is-detached"
          : branch.dirty
            ? "is-dirty"
            : "is-branch";
    el.classList.add(status);
    el.setAttr(
      "aria-label",
      branch.kind === "none"
        ? "Not a git repository"
        : `Git branch: ${branch.label}` +
            (branch.kind === "detached"
              ? " (detached HEAD)"
              : branch.dirty
                ? " (uncommitted changes)"
                : " (clean)"),
    );
  }

  // Coalesce navigation/edit bursts into a single markdown blame read.
  private scheduleMarkdownBlame(delay = 250): void {
    if (this.mdBlameTimer !== null) window.clearTimeout(this.mdBlameTimer);
    this.mdBlameTimer = window.setTimeout(() => {
      this.mdBlameTimer = null;
      void this.refreshMarkdownBlame();
    }, delay);
  }

  // Inline blame for the active markdown note, mirroring CodeView but dispatching into Obsidian's
  // own editor. Clears when the setting is off; leaves nothing when git/repo is unavailable or the
  // note is untracked.
  private async refreshMarkdownBlame(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return;
    let cm = markdownEditorView(view);
    if (!cm) return;
    if (!this.settings.gitBlame) {
      cm.dispatch({ effects: setBlame.of(null) });
      return;
    }
    const abs = absoluteForVaultPath(this.app, view.file.path);
    if (!abs) return;
    // Resolve the repository on every refresh (no caching) so a `git init` after load is picked up,
    // like the status-bar branch indicator. A non-"ok" repo yields no lines, which clears any stale
    // blame rather than leaving the previous note's annotation on screen.
    const base = vaultBasePath(this.app);
    const repo = base ? await resolveRepository(base) : null;
    const lines = repo && repo.state === "ok" ? await loadBlame(repo, abs) : [];
    if (this.app.workspace.getActiveViewOfType(MarkdownView) !== view) return; // note switched meanwhile
    // The editor can be swapped under the same view (Reading <-> Live Preview) during the awaits;
    // re-fetch it and dispatch into the current instance, never a destroyed one.
    cm = markdownEditorView(view);
    if (!cm) return;
    cm.dispatch({ effects: setBlame.of(lines.length ? lines : null) });
  }

  // Re-apply the blame setting everywhere visible (used when the toggle changes): every open code
  // view plus the active markdown note.
  refreshAllBlame(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CODE_VIEW_TYPE)) {
      if (leaf.view instanceof CodeView) leaf.view.applyBlame();
    }
    void this.refreshMarkdownBlame();
  }

  // A git ref moved (commit, checkout, merge, reset), possibly from outside Obsidian — a terminal,
  // or Claude Code. Re-read everything that reflects history: open graph panels, the status-bar
  // branch, inline blame, and the explorer git decorations.
  private onGitChanged(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(GIT_GRAPH_VIEW_TYPE)) {
      if (leaf.view instanceof GitGraphView) void leaf.view.refresh();
    }
    this.scheduleGitBranchRefresh();
    this.refreshAllBlame();
    void this.gitDecorations?.update();
  }

  // Watch the repo's ref log so the graph, branch, and blame refresh themselves when git changes
  // under us. Best-effort: no repo, or no watchable log, simply means no auto-refresh.
  private async setupGitWatch(): Promise<void> {
    const base = vaultBasePath(this.app);
    if (!base) return;
    let root: string | null = null;
    try {
      const repo = await resolveRepository(base);
      root = repo.state === "ok" ? repo.root : null;
    } catch (e) {
      warn("git watch: could not resolve repository", e);
    }
    if (!root) return;
    this.gitWatchDispose = await watchGitRefs(root, () => this.onGitChanged());
    this.register(() => {
      this.gitWatchDispose?.();
      this.gitWatchDispose = null;
    });
  }

  refreshStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.setText(this.connected ? "Claude ●" : "▶ Launch Claude");
    this.statusEl.setAttr(
      "aria-label",
      this.connected
        ? `Code Workbench — ${this.statusText()}`
        : "Code Workbench — click to launch Claude in this vault; right-click for other backends",
    );
  }

  // Persist a managed profile's backend into its 0600 JSON + 0700 script. The key (when given)
  // and the chosen model live in the JSON only — never in data.json. Called on key/model change.
  async syncBackend(profile: LaunchProfile, newKey?: string): Promise<void> {
    if (!profile.backend || !this.backends) return;
    const preset = BACKEND_PRESETS[profile.backend.presetId];
    if (!preset) return;
    const cfg = (await this.backends.readConfig(profile.id)) ?? seedBackendConfig(preset);
    cfg.name = profile.name || preset.name;
    cfg.model = profile.backend.model;
    cfg.models = preset.models;
    cfg.baseUrl = preset.baseUrl;
    if (newKey !== undefined) cfg.authToken = newKey;
    await this.backends.write(profile.id, cfg);
  }

  // Launch a profile's command in a terminal opened in the vault folder. Every launch entry
  // point (status bar, context menu, palette, settings button) routes through here, so the
  // blank-command refusal and the no-terminal fallback stay in one place.
  async launchProfile(profile?: LaunchProfile): Promise<void> {
    // No profile = the status-bar click: always launch the plain Claude CLI. A profile is passed
    // only from the right-click menu / palette picker (the configured backends).
    const p = profile ?? { ...CLAUDE_PROFILE };
    // A managed backend launches its generated wrapper script; a plain profile its command.
    let command: string;
    if (p.backend) {
      const cfg = this.backends ? await this.backends.readConfig(p.id) : null;
      if (!cfg || !cfg.authToken.trim()) {
        new Notice(`Code Workbench: add an API key for "${p.name || p.id}" in settings first`);
        return;
      }
      command = this.backends!.scriptPath(p.id);
    } else {
      command = p.command.trim();
      if (!command) {
        new Notice(`Code Workbench: profile "${p.name || p.id}" has no command configured`);
        return;
      }
    }
    const base = vaultBasePath(this.app);
    if (!base) {
      new Notice("Code Workbench: couldn't resolve the vault folder");
      return;
    }
    const ok = await launchCommand(base, command);
    if (ok) {
      new Notice(`Code Workbench: launching ${p.name || command}…`);
    } else {
      new Notice(`Code Workbench: couldn't open a terminal. Run "${command}" in ${base}`);
    }
  }

  // Right-click on the status-bar launcher: pick a configured agent backend (Kimi, …). Claude is
  // the left-click, so it is not listed here; with no backends there is nothing to show.
  private showLaunchProfileMenu(e: MouseEvent): void {
    const backends = this.settings.launchProfiles.filter((p) => p.backend);
    if (backends.length === 0) return;
    const menu = new Menu();
    for (const profile of backends) {
      menu.addItem((item) =>
        item
          .setTitle(profile.name || profile.id)
          .setIcon("play")
          .onClick(() => void this.launchProfile(profile)),
      );
    }
    menu.showAtMouseEvent(e);
  }

  // Write the bundled sample files into a folder in the current vault and open one of them.
  async installDemo(): Promise<void> {
    const root = "Code Workbench demo";
    const { vault } = this.app;
    const ensureFolder = async (dir: string): Promise<void> => {
      let cur = "";
      for (const part of dir.split("/")) {
        cur = cur ? `${cur}/${part}` : part;
        if (!vault.getAbstractFileByPath(cur)) await vault.createFolder(cur);
      }
    };
    try {
      let count = 0;
      for (const [rel, content] of Object.entries(DEMO_FILES)) {
        const full = `${root}/${rel}`;
        await ensureFolder(full.slice(0, full.lastIndexOf("/")));
        const existing = vault.getAbstractFileByPath(full);
        if (existing instanceof TFile) await vault.modify(existing, content);
        else await vault.create(full, content);
        count++;
      }
      new Notice(`Code Workbench: added ${count} demo files to "${root}"`);
      const sample = vault.getAbstractFileByPath(`${root}/rust/sample-rust.rs`);
      if (sample instanceof TFile) await this.app.workspace.getLeaf(true).openFile(sample);
    } catch (e) {
      error("demo install failed", e);
      new Notice("Code Workbench: couldn't add demo files");
    }
  }
}

class CodeWorkbenchSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CodeWorkbenchPlugin) {
    super(app, plugin);
    // Everything in styles.css hangs off this class. It belongs on the container itself, not in a
    // render pass: Obsidian 1.13 paints the tab from the definitions and never calls display().
    this.containerEl.addClass("cw-settings");
  }

  // Obsidian >= 1.13 renders a settings tab from the array this returns and builds its settings
  // search index from the same array — which is the point: an imperative display() is invisible to
  // that search. Called once from addSettingTab(), at plugin load, so it stays allocation-only;
  // anything that scans or fetches lives in a render callback (src/settings/blocks.ts).
  getSettingDefinitions(): SettingDefinitionItem[] {
    return buildSettingDefinitions(this.plugin, this);
  }

  // Obsidian < 1.13 knows nothing about definitions and calls this instead — a non-empty
  // getSettingDefinitions() switches it off. Both paths paint the same array, so neither can
  // drift away from the other.
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    renderLegacy(containerEl, buildSettingDefinitions(this.plugin, this), this);
  }

  /**
   * Repaint after a change that alters which rows are visible. Obsidian 1.13 re-evaluates the
   * `visible` predicates through update(); older versions have no such method and repaint whole.
   */
  refresh(): void {
    // Reached through a narrowed view of the tab rather than as this.update(): the method arrived
    // in 1.13 and the plugin still supports 1.7.2, where it is genuinely absent.
    const tab = this as unknown as { update?: () => void };
    if (typeof tab.update === "function") tab.update();
    else this.display();
  }

  /** Reads a definition's key from the plugin's settings (dotted for the nested LSP ones). */
  getControlValue(key: string): unknown {
    return getByPath(this.plugin.settings, key);
  }

  /**
   * Persists a definition's key and runs whatever that setting does beyond being stored. Setting
   * controls carry no onChange of their own, so this is where the toggles' side effects live.
   */
  setControlValue(key: string, value: unknown): Promise<void> {
    return this.applySetting(key, value);
  }

  private async applySetting(key: string, value: unknown): Promise<void> {
    setByPath(this.plugin.settings, key, value);
    await this.plugin.saveData(this.plugin.settings);
    const on = value === true;
    switch (key) {
      case "treeSitter":
      case "indentGuides":
        this.plugin.refreshCodeViews();
        break;
      case "gitBlame":
        this.plugin.refreshAllBlame();
        break;
      case "gitDecorations":
        this.plugin.setGitDecorations(on);
        break;
      case "fileIcons":
        this.plugin.setFileIcons(on);
        break;
      case "showHiddenFiles":
        await this.plugin.setShowHiddenFiles(on);
        break;
      case "vaultTools":
        await this.plugin.setVaultTools(on);
        this.refresh();
        break;
      case "lsp.enabled":
        this.plugin.refreshLspViews();
        this.refresh();
        break;
      case "lsp.inlayHints":
      case "lsp.semanticTokens":
      case "lsp.folding":
        this.plugin.refreshLspViews();
        break;
      default:
        break;
    }
  }
}
