import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { randomUUID } from "crypto";
import { IdeContext } from "./src/context";
import { DiffManager } from "./src/diff-manager";
import { LockFile } from "./src/server/lockfile";
import { IdeServer } from "./src/server/websocket-server";
import { activeSelection } from "./src/tools/selection";
import { error, info, warn } from "./src/util/log";
import { CODE_VIEW_EXTENSIONS, CodeView } from "./src/views/code-view";
import { GrammarLoader } from "./src/treesitter/loader";
import { FormatService } from "./src/format/format-service";
import { DiffView } from "./src/views/diff-view";
import { CODE_VIEW_TYPE, DIFF_VIEW_TYPE } from "./src/views/view-types";
import { vaultBasePath } from "./src/util/paths";

interface CodeWorkbenchSettings {
  // Whether to push selection_changed automatically as the selection changes.
  shareSelection: boolean;
  // Opt-in: use tree-sitter for highlighting + diagnostics. Grammars download on first use.
  treeSitter: boolean;
}

const DEFAULT_SETTINGS: CodeWorkbenchSettings = { shareSelection: true, treeSitter: false };

export default class CodeWorkbenchPlugin extends Plugin {
  settings: CodeWorkbenchSettings = { ...DEFAULT_SETTINGS };
  private server: IdeServer | null = null;
  private lock: LockFile | null = null;
  private ctx: IdeContext | null = null;
  private statusEl: HTMLElement | null = null;
  private port = 0;
  private connected = false;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    const authToken = randomUUID();
    const ctx: IdeContext = {
      app: this.app,
      pluginVersion: this.manifest.version,
      lastSelection: null,
      diffs: new DiffManager(this.app),
      notify: () => {},
    };
    this.ctx = ctx;

    this.statusEl = this.addStatusBarItem();
    this.refreshStatus();
    this.addSettingTab(new CodeWorkbenchSettingTab(this.app, this));

    this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf));
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
    this.registerView(CODE_VIEW_TYPE, (leaf) => new CodeView(leaf, tsConfig, formatService));
    for (const ext of CODE_VIEW_EXTENSIONS) {
      try {
        this.registerExtensions([ext], CODE_VIEW_TYPE);
      } catch {
        // extension already registered elsewhere
      }
    }

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
      callback: () => {
        const sel = activeSelection(this.app);
        if (!sel) {
          new Notice("Code Workbench: no active selection");
          return;
        }
        ctx.notify("at_mentioned", {
          filePath: sel.filePath,
          lineStart: sel.selection.start.line + 1,
          lineEnd: sel.selection.end.line + 1,
        });
        new Notice("Added selection to Claude context");
      },
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
  }

  async onunload(): Promise<void> {
    try {
      await this.lock?.remove();
    } catch (e) {
      warn("lock removal failed", e);
    }
    try {
      await this.server?.stop();
    } catch (e) {
      warn("server stop failed", e);
    }
    this.ctx?.diffs.closeAll();
    this.lock = null;
    this.server = null;
    this.ctx = null;
  }

  statusText(): string {
    if (!this.port) return "not started";
    return `127.0.0.1:${this.port} — ${this.connected ? "connected" : "waiting for Claude"}`;
  }

  private refreshStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.setText(this.connected ? "Claude ●" : "Claude ○");
    this.statusEl.setAttr("aria-label", `Code Workbench — ${this.statusText()}`);
  }
}

class CodeWorkbenchSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CodeWorkbenchPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

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
      .setName("Enable tree-sitter (experimental)")
      .setDesc(
        "Richer highlighting and syntax-error underlines for many more languages, via tree-sitter. " +
          "Each language's grammar (~0.5–2 MB) downloads once on first use and is cached — the internet " +
          "is only needed that first time. Off keeps the built-in highlighter.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.treeSitter).onChange(async (value) => {
          this.plugin.settings.treeSitter = value;
          await this.plugin.saveData(this.plugin.settings);
        }),
      );

    new Setting(containerEl).setName("Connection").setDesc(this.plugin.statusText());

    new Setting(containerEl)
      .setName("Support")
      .setDesc("This plugin is free. If it's useful, you can support development.")
      .addButton((b) =>
        b.setButtonText("♥ Donate").onClick(() => {
          window.open("https://github.com/vitaly-andr/obsidian-code-workbench/blob/main/SUPPORT.md");
        }),
      );
  }
}
