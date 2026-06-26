// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";
import { randomUUID } from "crypto";
import * as path from "path";
import { IdeContext } from "./src/context";
import { DiffManager } from "./src/diff-manager";
import { LockFile } from "./src/server/lockfile";
import { IdeServer } from "./src/server/websocket-server";
import { activeSelection } from "./src/tools/selection";
import { error, info, warn } from "./src/util/log";
import { launchClaude } from "./src/util/launch";
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
} from "./src/views/view-types";
import { absoluteForVaultPath, vaultBasePath, vaultPathForAbsolute } from "./src/util/paths";
import { IconLoader } from "./src/icons/icon-loader";
import { ExplorerIcons } from "./src/icons/explorer-icons";
import { GitDecorations } from "./src/decorations/git-decorations";
import { Companion } from "./src/mcp-http/companion";
import { HiddenFileView } from "./src/views/hidden-file-view";
import { HiddenFilesView } from "./src/views/hidden-files-view";
import { GitGraphView } from "./src/views/git-graph-view";
import { GitDiffView } from "./src/views/git-diff-view";
import type { EditorMenuHost } from "./src/views/editor-context-menu";
import { HiddenEntry, listHiddenFiles } from "./src/views/hidden-files";
import { getCurrentBranch, loadBlame, loadHeadBlob, resolveRepository } from "./src/git/log";
import { watchGitRefs } from "./src/git/watch";
import type { CurrentBranch } from "./src/git/types";

// window.open is unreliable in Obsidian's renderer; open external URLs through Electron's shell,
// falling back to window.open.
function openExternal(url: string): void {
  try {
    const req = (window as unknown as { require?: (m: string) => unknown }).require;
    if (req) {
      const electron = req("electron") as { shell?: { openExternal?: (u: string) => void } };
      if (electron.shell?.openExternal) {
        void electron.shell.openExternal(url);
        return;
      }
    }
  } catch {
    // fall through to window.open
  }
  window.open(url, "_blank");
}

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
}

const DEFAULT_SETTINGS: CodeWorkbenchSettings = {
  shareSelection: true,
  treeSitter: true,
  gitBlame: true,
  fileIcons: true,
  gitDecorations: true,
  vaultTools: false,
  showHiddenFiles: false,
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

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<CodeWorkbenchSettings>);

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
    this.registerDomEvent(this.statusEl, "click", () => void this.runClaude());
    this.refreshStatus();
    this.addSettingTab(new CodeWorkbenchSettingTab(this.app, this));

    // Second status-bar item: the current git branch (or "no git"). Read lazily on relevant
    // events, never on a timer.
    this.gitBranchEl = this.addStatusBarItem();
    this.gitBranchEl.addClass("cw-gitbranch");
    this.registerDomEvent(window, "focus", () => this.scheduleGitBranchRefresh());
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleGitBranchRefresh()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleGitBranchRefresh()));
    void this.refreshGitBranch();

    this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf));
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
    this.registerView(GIT_DIFF_VIEW_TYPE, (leaf) => new GitDiffView(leaf));
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
    this.registerView(
      CODE_VIEW_TYPE,
      (leaf) => new CodeView(leaf, tsConfig, formatService, blameConfig, editorMenuHost),
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
        if (!checking) {
          void view.format().then((ok) => {
            if (!ok) new Notice("Code Workbench: nothing to format here");
          });
        }
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

  onunload(): void {
    // Fire-and-forget cleanup: Obsidian does not await onunload, and the lock/server teardown
    // is best-effort.
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

  private refreshStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.setText(this.connected ? "Claude ●" : "▶ Launch Claude");
    this.statusEl.setAttr(
      "aria-label",
      this.connected
        ? `Code Workbench — ${this.statusText()}`
        : "Code Workbench — click to run Claude in this vault",
    );
  }

  // Open a terminal in the vault folder and start the Claude Code CLI. Falls back to copying the
  // command if no terminal could be launched.
  async runClaude(): Promise<void> {
    const base = vaultBasePath(this.app);
    if (!base) {
      new Notice("Code Workbench: couldn't resolve the vault folder");
      return;
    }
    const ok = await launchClaude(base);
    if (ok) {
      new Notice("Code Workbench: launching Claude…");
    } else {
      new Notice(`Code Workbench: couldn't open a terminal. Run "claude" in ${base}`);
    }
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

// Language coverage shown on the settings page: [name, highlighting, diagnostics, formatting].
const LANGS: ReadonlyArray<readonly [string, boolean, boolean, boolean]> = [
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

class CodeWorkbenchSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CodeWorkbenchPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("cw-settings");

    // Screenshots live in qr.ts (~0.5MB base64). Load that module only when settings open, not on
    // plugin load: create the <img> now (correct layout slot) and fill its src once it resolves.
    // Crypto/contact QR codes are tiny and bundled (qr.ts, filled below). Settings screenshots are
    // fetched from the repo via jsDelivr (CDN, browser-cached) instead of inlined — the same lazy
    // pattern as grammars and icons, so they stay full-quality and off the main.js bundle.
    const pendingShots: Array<[HTMLImageElement, string]> = [];
    const SHOT_CDN = "https://cdn.jsdelivr.net/gh/vitaly-andr/obsidian-code-workbench@main/docs/";
    const SHOTS: Record<string, string> = {
      WORKBENCH_SHOT: "workbench.png",
      DIFF_SHOT: "keep-reject-diff.png",
      GIT_BRANCH_SHOT: "git-branch.png",
      GIT_GRAPH_SHOT: "git-graph-panel.png",
      GIT_BLAME_SHOT: "git-blame.png",
      ICONS_SHOT: "file-icons.png",
      HIDDEN_SHOT: "hidden-files.png",
      CONNECT_SHOT: "connect.png",
    };
    const addShot = (key: string, alt: string): void => {
      containerEl.createEl("img", {
        cls: "cw-shot",
        attr: { alt, src: SHOT_CDN + SHOTS[key], loading: "lazy" },
      });
    };

    const badges = containerEl.createDiv({ cls: "cw-badges" });
    const badge = (text: string, color: string): void => {
      badges.createSpan({ cls: `cw-badge cw-badge-${color}`, text });
    };
    badge(`v${this.plugin.manifest.version}`, "green");
    badge("PolyForm Shield 1.0.0", "blue");
    badge("Desktop only", "grey");

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Code Workbench gives Claude the tools to maintain your vault from inside Obsidian, plus a " +
        "real editor for code and config files: syntax highlighting, error diagnostics, and one-command " +
        "formatting for 50+ languages, with a Keep/Reject diff for every edit Claude makes.",
    });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "One click in the status bar opens a terminal in your vault with the Claude Code CLI already " +
        "connected, no /ide. Because it drives the CLI you already run, it uses your Claude subscription " +
        "instead of a metered API key, so letting Claude work across a whole vault doesn't run up an API " +
        "bill. It works with other Claude Code compatible models too, like Kimi K2 or DeepSeek.",
    });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Turn on the vault tools and Claude reads and edits notes through Obsidian's own link graph " +
        "(backlinks, wikilinks, frontmatter) and makes link-preserving changes, filing new notes where " +
        "they belong and holding your PARA or Zettelkasten system together without breaking links. Every " +
        "change is shown for your approval first, so you don't need to write code to use it.",
    });
    containerEl
      .createEl("p", { cls: "setting-item-description" })
      .createEl("em", {
        text: "Other Claude plugins give you a chat. This gives Claude tools to maintain your vault, and you an editor to review it.",
      });

    addShot("WORKBENCH_SHOT", "A code file open in the Code Workbench editor");

    new Setting(containerEl).setName("What makes it different").setHeading();
    const feats = containerEl.createEl("ul");
    const feat = (lead: string, rest: string): void => {
      const li = feats.createEl("li");
      li.createEl("strong", { text: lead });
      li.createSpan({ text: `: ${rest}` });
    };
    feat(
      "Edit non-Markdown files",
      "Obsidian only edits Markdown. Code Workbench opens .rs, .py, .ts, .go, .json, .yaml and " +
        "dozens more in an editable, highlighted view, and saves your changes back to the file.",
    );
    feat("Syntax highlighting", "about 50 languages via tree-sitter, colored to match your Obsidian theme.");
    feat("Diagnostics", "syntax errors are underlined where they occur, for about 48 languages.");
    feat(
      "One-command formatting",
      "the Format code file command reformats about 28 languages, including JSON, XML, YAML, TOML, " +
        "JavaScript, TypeScript, Python, Go, Rust, Ruby, PHP, and C/C++.",
    );
    feat(
      "Accept or reject Claude's edits",
      "a proposed change opens as a side-by-side diff. Keep it or reject it, and edit the proposed " +
        "side first if you want. Nothing is written until you keep it.",
    );
    feat(
      "Works with any model",
      "it speaks the Claude Code CLI protocol rather than a model API, so it runs with Claude, " +
        "Kimi K2, or any Anthropic-compatible endpoint you use through the CLI.",
    );
    feat(
      "Launch Claude in one click",
      "start the Claude Code CLI in this vault from the status bar or settings; it opens your " +
        "terminal in the right folder.",
    );
    feat(
      "Maintain the vault with Claude",
      "turn on Vault tools to let Claude read and edit notes through Obsidian's own link graph " +
        "(backlinks, frontmatter) and make link-preserving changes, each shown for your approval.",
    );
    feat(
      "Git review",
      "a branch indicator in the status bar, a branch-graph panel with click-to-diff, inline git " +
        "blame on the current line, and VS Code-style status marks in the explorer. Right-click a file " +
        "to diff its uncommitted changes against the last commit, all without leaving Obsidian.",
    );
    feat("File-type icons", "Material file and folder icons in the explorer, fetched on demand and cached.");
    feat(
      "Edit hidden files",
      "a Hidden files panel lists the dot-files Obsidian normally hides (.mcp.json, .gitignore, and " +
        "the config folder) as a tree and opens them in the editor.",
    );

    addShot("DIFF_SHOT", "A Claude edit shown as a Keep / Reject diff");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "A Claude edit, shown as a Keep / Reject diff.",
    });

    addShot("GIT_BRANCH_SHOT", "The current git branch in the status bar");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "The current branch in the status bar, colored by working-tree state.",
    });

    addShot("GIT_GRAPH_SHOT", "Repository history drawn as a branch graph");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "The repository history as a branch graph; click a commit for its files, a file for a diff.",
    });

    addShot("GIT_BLAME_SHOT", "Inline git blame on the current line");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Inline git blame on the current line, in code files and Markdown notes.",
    });

    addShot("ICONS_SHOT", "Material file-type icons in the file explorer");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Material file and folder icons in the explorer.",
    });

    addShot("HIDDEN_SHOT", "The Hidden files panel listing a vault's dot-files");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "The Hidden files panel: edit the dot-files Obsidian normally hides.",
    });

    new Setting(containerEl).setName("Using it").setHeading();
    const steps = containerEl.createEl("ol");
    [
      "Open a code file in your vault. It opens in an editable, highlighted editor.",
      "Turn on Enable syntax highlighting below for tree-sitter colors and error underlines.",
      'Format a file: open the Command Palette (Ctrl/Cmd+P), type "Format code file", and run it. You can assign a hotkey under Settings → Hotkeys.',
      'Connect Claude: run "claude" in the vault folder, then run /ide in the CLI and pick Obsidian. The status bar shows "Claude ●" once connected (and "Claude ○" while it waits).',
      'Share a selection: select text in a file and run "Add selection to Claude context" from the Command Palette to send it as an @-mention. With "Share selection automatically" on, the current selection is sent as it changes.',
      "Claude's edits then open as a Keep / Reject diff you accept or reject.",
    ].forEach((t) => steps.createEl("li", { text: t }));

    addShot("CONNECT_SHOT", "Claude Code's /ide picker with Obsidian connected");
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Running /ide in the CLI: pick Obsidian to connect.",
    });

    new Setting(containerEl).setName("Language support").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Highlighting for 52 languages, diagnostics for 48, formatting for 28. Each grammar and " +
        "formatter downloads the first time you open that language, then stays cached.",
    });
    const tableWrap = containerEl.createDiv({ cls: "cw-lang-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "cw-lang-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of ["Language", "Highlighting", "Diagnostics", "Formatting"]) {
      head.createEl("th", { text: h });
    }
    const body = table.createEl("tbody");
    for (const [name, hi, di, fo] of LANGS) {
      const tr = body.createEl("tr");
      tr.createEl("td", { text: name });
      tr.createEl("td", { text: hi ? "✅" : "—" });
      tr.createEl("td", { text: di ? "✅" : "—" });
      tr.createEl("td", { text: fo ? "✅" : "—" });
    }

    new Setting(containerEl).setName("Try it").setHeading();
    const tryP = containerEl.createEl("p", { cls: "setting-item-description" });
    tryP.createSpan({ text: "Add the sample files to this vault, then open a language folder: " });
    tryP.createEl("code", { text: "sample-*" });
    tryP.createSpan({ text: " for highlighting, " });
    tryP.createEl("code", { text: "messy-*" });
    tryP.createSpan({ text: " for a diagnostic (a red underline at the spot marked in a comment), and " });
    tryP.createEl("code", { text: "format-me-*" });
    tryP.createSpan({ text: " for formatting (run Format code file and watch the layout fix itself)." });

    new Setting(containerEl)
      .setName("Demo files")
      .setDesc('Copies a "Code Workbench demo" folder into this vault and opens a sample.')
      .addButton((b) =>
        b
          .setCta()
          .setButtonText("Add demo files to this vault")
          .onClick(() => {
            void this.plugin.installDemo();
          }),
      );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Every feature is optional; turn off what you don't use. The vault tools stay off until you " +
        "switch them on.",
    });

    new Setting(containerEl)
      .setName("Share selection automatically")
      .setDesc("Notify Claude as your selection changes. Turn off to share only via the \"Add selection to Claude context\" command.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.shareSelection).onChange(async (value) => {
          this.plugin.settings.shareSelection = value;
          await this.plugin.saveData(this.plugin.settings);
        }),
      );

    new Setting(containerEl)
      .setName("Enable syntax highlighting")
      .setDesc(
        "Richer highlighting and syntax-error underlines for ~50 languages. Each language downloads a " +
          "small grammar (~0.5–2 MB) once on first use and stays cached, so the internet is only needed " +
          "that first time. Off keeps the simple highlighter.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.treeSitter).onChange(async (value) => {
          this.plugin.settings.treeSitter = value;
          await this.plugin.saveData(this.plugin.settings);
        }),
      );

    new Setting(containerEl)
      .setName("Inline git blame")
      .setDesc(
        "On the current line, show who last changed it and when (\"commit · author · age · summary\"), " +
          "read from git blame, in both the code editor and Markdown notes. The line you are editing " +
          "reads as \"You · uncommitted\". Shows nothing when the vault is not a git repository. Desktop only.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.gitBlame).onChange(async (value) => {
          this.plugin.settings.gitBlame = value;
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.refreshAllBlame();
        }),
      );

    new Setting(containerEl)
      .setName("Git status in the explorer")
      .setDesc(
        "Mark changed files in the file explorer, like VS Code: a modified file is tinted with an \"M\", " +
          "a new (untracked) file with a \"U\", and folders that contain changes are tinted too. Hidden " +
          "dot-files carry the same marks in the Hidden files panel. Status is read from git when the " +
          "repository or your files change. Shows nothing when the vault is not a git repository. Desktop only.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.gitDecorations).onChange(async (value) => {
          this.plugin.settings.gitDecorations = value;
          this.plugin.setGitDecorations(value);
          await this.plugin.saveData(this.plugin.settings);
        }),
      );

    new Setting(containerEl)
      .setName("File type icons")
      .setDesc(
        "Show Material file and folder icons in the file explorer. Each icon downloads once on first " +
          "use, then stays cached.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.fileIcons).onChange(async (value) => {
          this.plugin.settings.fileIcons = value;
          this.plugin.setFileIcons(value);
          await this.plugin.saveData(this.plugin.settings);
        }),
      );

    new Setting(containerEl)
      .setName("Show hidden files")
      .setDesc(
        "Obsidian hides dot-files (.mcp.json, .gitignore, your config folder…) from the explorer. Turn this on " +
          "to open a Hidden files panel in the left sidebar: a tree of the editable dot-files; click one " +
          "to edit it. Hidden files are not auto-saved, so press Mod+S to save your changes. Uses the same " +
          "file icons as the explorer when those are on. Desktop only.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHiddenFiles).onChange(async (value) => {
          this.plugin.settings.showHiddenFiles = value;
          await this.plugin.saveData(this.plugin.settings);
          await this.plugin.setShowHiddenFiles(value);
        }),
      );

    new Setting(containerEl).setName("Vault tools for Claude").setHeading();
    new Setting(containerEl)
      .setName("Vault tools (Claude)")
      .setDesc(
        "Let Claude read and safely maintain this vault (backlinks, search, frontmatter, " +
          "link-preserving rename, and trash delete) as model-callable tools. Off by default. Every write " +
          "is shown for your approval before anything changes. Local-only and desktop-only.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.vaultTools).onChange(async (value) => {
          this.plugin.settings.vaultTools = value;
          await this.plugin.saveData(this.plugin.settings);
          await this.plugin.setVaultTools(value);
          this.display();
        }),
      );
    if (this.plugin.settings.vaultTools) {
      const cmd = this.plugin.companionCommand();
      const vt = containerEl.createEl("p", { cls: "setting-item-description" });
      if (cmd) {
        vt.createSpan({
          text:
            `Connected automatically: a project .mcp.json is written to this vault, so a fresh ` +
            `"claude" session in the vault folder lists the obsidian-vault tools after a one-time ` +
            `approval. Manual fallback:`,
        });
        containerEl.createEl("pre", { cls: "cw-mcp-cmd" }).createEl("code", { text: cmd });
      } else {
        vt.setText("Starting the companion server…");
      }
    }

    new Setting(containerEl).setName("Connection").setDesc(this.plugin.statusText());

    new Setting(containerEl)
      .setName("Run Claude")
      .setDesc("Open a terminal in this vault folder and start the Claude Code CLI.")
      .addButton((b) =>
        b
          .setCta()
          .setButtonText("▶ Run Claude in this vault")
          .onClick(() => {
            void this.plugin.runClaude();
          }),
      );

    const support = containerEl.createDiv({ cls: "cw-support" });

    new Setting(support).setName("Support").setHeading();
    support.createEl("p", {
      cls: "setting-item-description",
      text:
        "Code Workbench is free. If it's useful to you, you can support it at a fraction of your " +
        "Claude subscription.",
    });

    const donate = support.createEl("details", { cls: "cw-donate" });
    donate.createEl("summary", { text: "♥ Support with crypto" });
    donate.createEl("p", {
      cls: "setting-item-description",
      text: "If it helps you, a crypto tip is welcome (any amount). Click an address to select it.",
    });
    const coin = (label: string, addr: string, qrKey: string): void => {
      const row = donate.createDiv({ cls: "cw-coin" });
      row.createEl("div", { cls: "cw-coin-label", text: label });
      row.createEl("code", { cls: "cw-coin-addr", text: addr });
      const img = row.createEl("img", { cls: "cw-coin-qr", attr: { alt: `${label} QR` } });
      pendingShots.push([img, qrKey]);
    };
    coin(
      "EVM — USDT / USDC / ETH (Polygon, Base, BSC, Arbitrum)",
      "0x3F0ce81a099D8e8dDbfADa0350a933fBA967b63F",
      "QR_EVM",
    );
    coin("USDT — TRON / TRC20", "TSmwsds6rj9LtiFdPrx6k7yan96B5VEt9x", "QR_TRON");
    coin("Bitcoin", "bc1qgh6hnuldrnvyjqrka3m0rfmznxjzmkkp8g9jrg", "QR_BTC");

    new Setting(support)
      .setName("Star on GitHub")
      .setDesc("A star improves karma :)")
      .addButton((b) =>
        b.setButtonText("★ Star on GitHub").onClick(() => {
          openExternal("https://github.com/vitaly-andr/obsidian-code-workbench");
        }),
      );

    new Setting(support).setName("Sponsorship").setHeading();
    support.createEl("p", {
      cls: "setting-item-description",
      text:
        "No sponsors yet. To sponsor development or place your logo here, reach me on Telegram " +
        "(@VITALY_ANDR) or by email (vitaly@andrianoff.online).",
    });

    new Setting(support)
      .setName("Contact")
      .setDesc("Questions, feedback, or sponsorship.")
      .addButton((b) =>
        b.setButtonText("Telegram @VITALY_ANDR").onClick(() => {
          openExternal("https://t.me/VITALY_ANDR");
        }),
      )
      .addButton((b) =>
        b.setButtonText("Email").onClick(() => {
          openExternal("mailto:vitaly@andrianoff.online");
        }),
      );

    const qr = support.createDiv({ cls: "cw-qr" });
    const link = qr.createEl("a", { href: "https://t.me/VITALY_ANDR" });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openExternal("https://t.me/VITALY_ANDR");
    });
    const qrImg = link.createEl("img", { cls: "cw-qr-img", attr: { alt: "Telegram @VITALY_ANDR" } });

    containerEl.createEl("p", {
      cls: "setting-item-description cw-license",
      text:
        "Source-available under the PolyForm Shield License 1.0.0: free to use, study, and modify, " +
        "but not to build a competing product.",
    });

    // Fill the screenshot/QR images now that the settings tab is open (qr.ts is ~0.5MB, kept off
    // the onload path).
    void import("./src/util/qr").then((qr) => {
      const assets = qr as unknown as Record<string, string>;
      for (const [img, key] of pendingShots) img.src = assets[key];
      qrImg.src = assets.TELEGRAM_QR;
    });
  }
}
