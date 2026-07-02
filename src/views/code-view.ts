// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
import { Compartment, EditorState, Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers, tooltips } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { forceLinting } from "@codemirror/lint";
import { SelectionPayload } from "../context";
import { SelectionProvider } from "../tools/selection";
import { showEditorContextMenu } from "./editor-context-menu";
import type { EditorMenuHost } from "./editor-context-menu";
import { grammarKeyForPath } from "../util/languages";
import { absoluteForVaultPath, toFileUri, vaultBasePath } from "../util/paths";
import { CODE_VIEW_TYPE } from "./view-types";
import { indentGuides, languageExtension, obsidianEditorTheme, obsidianHighlighting } from "./cm-theme";
import { syntaxDiagnostics } from "./lezer-lint";
import { blameAnnotation, setBlame } from "./blame-annotation";
import { formatCode } from "../format/prettier-format";
import { grammarForExtension } from "../treesitter/registry";
import { treeSitterExtensions } from "../treesitter/tree-extensions";
import { loadBlame, resolveRepository } from "../git/log";
import type { GrammarLoader } from "../treesitter/loader";
import type { FormatService } from "../format/format-service";

// §9: renders non-markdown files with CodeMirror 6 syntax highlighting, editable (basic editing
// only — no LSP/linter/autocomplete), using the host's CM6 singleton (R2). Reports its selection
// like a note; edits persist through Obsidian's save.
// Optional tree-sitter wiring handed in by the plugin: the grammar loader plus a live read of the
// "enable tree-sitter" setting. Absent => CodeView stays on the bundled Lezer/legacy highlighter.
export interface TreeSitterConfig {
  loader: GrammarLoader;
  enabled: () => boolean;
}

// Optional git-blame wiring: a live read of the "git blame" setting. Absent or disabled => no
// inline annotation. The blame read itself runs here (refreshBlame), lazily, never at plugin load.
export interface BlameConfig {
  enabled: () => boolean;
}

// Connection status reported by the LSP layer for the editor indicator (FR-013).
export interface LspStatus {
  state: "starting" | "ready" | "restarting" | "failed" | "disposed" | "no-server" | "disabled" | "attached-elsewhere";
  origin: "user" | "project-local" | "version-manager" | "path" | null;
}

// Optional editor-LSP wiring (005-editor-lsp). `enabled` is a cheap gate (master + per-language) read
// BEFORE any LSP code loads, so a disabled feature never imports the runtime (SC-003). `attach` lazily
// loads the module, discovers/connects a server for the file, and returns the CM extension to drop
// into the LSP compartment — or null to stay highlighting-only (no server found / disabled).
export interface LspEditorConfig {
  enabled: (language: string) => boolean;
  attach: (input: {
    filePath: string;
    language: string;
    owner: object;
    onStatus: (status: LspStatus) => void;
  }) => Promise<Extension | null>;
  // Drop any file URI this view claimed, so another view may drive the LSP plugin for it.
  release?: (owner: object) => void;
}

export class CodeView extends TextFileView implements SelectionProvider {
  private editor: EditorView | null = null;
  // Swappable language layer: Lezer/legacy first, upgraded to tree-sitter once a grammar loads.
  private readonly langLayer = new Compartment();
  // Opt-in LSP layer: empty until a server is discovered and connected for this file (005-editor-lsp).
  private readonly lspLayer = new Compartment();
  // Stable identity for this view, used by the LSP controller's single-view-per-file guard.
  private readonly lspOwner = {};
  // The view-header status indicator for the LSP connection (FR-013), created lazily on first attach.
  private lspStatusEl: HTMLElement | null = null;
  // Debounce handle for re-blaming after edits.
  private blameTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly ts?: TreeSitterConfig,
    private readonly formatService?: FormatService,
    private readonly blame?: BlameConfig,
    private readonly menuHost?: EditorMenuHost,
    private readonly lsp?: LspEditorConfig,
    // Live read of the "Show indentation guides" setting (007). Absent => on (default).
    private readonly indentGuidesEnabled?: () => boolean,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CODE_VIEW_TYPE;
  }

  getIcon(): string {
    return "file-code";
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    // Obsidian's editor-menu never fires for this non-TFile code editor, so build our own right-click
    // menu (same one as the hidden-file editor): edit actions plus share-selection and diff.
    this.registerDomEvent(this.contentEl, "contextmenu", (evt) => this.showContextMenu(evt));
  }

  async onClose(): Promise<void> {
    // Release this view's LSP claim on close. clear()/renderEditor cover data clears and file switches,
    // but a plain tab close goes through onClose — without this the single-view-per-file guard keeps the
    // URI "owned" by this dead view, and reopening the file degrades to highlighting-only (attached-elsewhere).
    this.lsp?.release?.(this.lspOwner);
    await super.onClose();
  }

  private showContextMenu(evt: MouseEvent): void {
    if (!this.editor || !this.file || !this.menuHost) return;
    showEditorContextMenu(evt, this.editor, {
      payload: () => this.getSelectionPayload(),
      absPath: absoluteForVaultPath(this.app, this.file.path),
      displayName: this.file.name,
      host: this.menuHost,
    });
  }

  getViewData(): string {
    return this.editor ? this.editor.state.doc.toString() : this.data;
  }

  setViewData(data: string, _clear: boolean): void {
    this.data = data;
    this.renderEditor(data);
  }

  clear(): void {
    this.data = "";
    if (this.blameTimer !== null) {
      window.clearTimeout(this.blameTimer);
      this.blameTimer = null;
    }
    this.editor?.destroy();
    this.editor = null;
    this.lsp?.release?.(this.lspOwner);
    this.lspStatusEl?.remove();
    this.lspStatusEl = null;
    this.contentEl.empty();
  }

  private renderEditor(data: string): void {
    this.editor?.destroy();
    // On a file switch, drop the previous file's LSP claim so maybeAttachLsp can claim the new file
    // (and another view can take over the old one).
    this.lsp?.release?.(this.lspOwner);
    this.contentEl.empty();
    // Drop any prior file's LSP status indicator; maybeAttachLsp recreates it for the new file.
    this.lspStatusEl?.remove();
    this.lspStatusEl = null;
    // Highlighting key (blade-aware); formatting still keys off the raw extension below.
    const ext = this.file ? grammarKeyForPath(this.file.path) : "";
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      // Vertical guide at each indentation level (007). Editor chrome like lineNumbers(); on by
      // default, and the "Show indentation guides" setting can turn it off (refreshCodeViews
      // re-renders open views on change).
      ...(this.indentGuidesEnabled?.() !== false ? [indentGuides] : []),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      obsidianEditorTheme,
      obsidianHighlighting,
      // Render hover/lint/LSP tooltips into the editor window's body. Obsidian puts `contain: strict`
      // on every workspace-leaf; that makes the leaf a containing block and clips paint, so a tooltip
      // rendered inside the editor is positioned against (and cut off at) the leaf, landing at the top
      // instead of by the cursor. Re-parenting to the body escapes the containment so CM6 positions it
      // correctly. Use the contentEl's own document so it still works in a popped-out window.
      tooltips({ parent: this.contentEl.ownerDocument.body }),
      EditorView.lineWrapping,
      // Editable; persist edits through Obsidian's save, and re-blame once the edits settle.
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          this.requestSave();
          this.scheduleBlame();
        }
      }),
      // Inline current-line git blame (inert until refreshBlame delivers data).
      blameAnnotation(),
      // Highlighting + diagnostics layer. Starts on the bundled Lezer/legacy grammar (instant), and
      // is swapped for tree-sitter once that grammar finishes downloading (maybeUpgradeToTreeSitter).
      this.langLayer.of(this.lezerLayer(ext)),
      // Opt-in LSP layer: empty (a true no-op) until maybeAttachLsp connects a server for this file.
      this.lspLayer.of([]),
    ];

    this.editor = new EditorView({
      state: EditorState.create({ doc: data, extensions }),
      parent: this.contentEl,
    });
    void this.maybeUpgradeToTreeSitter(ext, this.editor);
    void this.refreshBlame(this.editor);
    void this.maybeAttachLsp(this.editor);
  }

  // When the LSP feature is enabled for this file's language, lazily load the module, discover and
  // connect a server, and swap the LSP compartment to the server-backed extension set. Stays a no-op
  // (highlighting only) when the feature is off, no server is found, or the language has no grammar
  // id. The cheap `enabled` gate is checked first so a disabled feature never imports the runtime.
  private async maybeAttachLsp(view: EditorView): Promise<void> {
    if (!this.lsp || !this.file) return;
    const language = grammarForExtension(grammarKeyForPath(this.file.path))?.id;
    if (!language || !this.lsp.enabled(language)) return;
    const filePath = absoluteForVaultPath(this.app, this.file.path);
    if (!filePath) return;
    const extension = await this.lsp.attach({
      filePath,
      language,
      owner: this.lspOwner,
      onStatus: (status) => {
        this.showLspStatus(status);
        // The pull-diagnostics linter ran once at mount, before the server finished connecting (it
        // returns nothing until `diagnosticProvider` is known). Re-run it the moment the session is
        // ready, so diagnostics appear without the user having to make an edit first.
        // Cast: @codemirror/lint resolves a separate nested @codemirror/view type at compile time, but
        // CM6 is the external host singleton at runtime (one EditorView), so this is sound.
        if (status.state === "ready" && this.editor) {
          forceLinting(this.editor as unknown as Parameters<typeof forceLinting>[0]);
        }
      },
    });
    if (!extension || this.editor !== view) return; // no server, or the file was switched meanwhile
    view.dispatch({ effects: this.lspLayer.reconfigure(extension) });
  }

  // Re-evaluate the LSP layer for the current file (used when the master/per-language toggle
  // changes). Resets the compartment to empty first, then re-attaches if the feature is now on.
  reapplyLsp(): void {
    if (!this.editor) return;
    this.editor.dispatch({ effects: this.lspLayer.reconfigure([]) });
    this.lspStatusEl?.remove();
    this.lspStatusEl = null;
    void this.maybeAttachLsp(this.editor);
  }

  // Show the LSP connection state in the view header (FR-013). One reused action element; its icon
  // and tooltip reflect the current state and the server's origin.
  private showLspStatus(status: LspStatus): void {
    const label: Record<LspStatus["state"], string> = {
      starting: "Language server: starting…",
      ready: "Language server: connected",
      restarting: "Language server: reconnecting…",
      failed: "Language server: unavailable",
      disposed: "Language server: stopped",
      "no-server": "Language server: none found",
      disabled: "Language server: off",
      "attached-elsewhere": "Language server: active in another view",
    };
    const icon: Record<LspStatus["state"], string> = {
      starting: "loader",
      ready: "circle-check",
      restarting: "loader",
      failed: "circle-x",
      disposed: "circle-slash",
      "no-server": "circle-help",
      disabled: "circle-slash",
      "attached-elsewhere": "circle-dot",
    };
    const text = status.origin && status.state === "ready" ? `${label.ready} (${status.origin})` : label[status.state];
    if (!this.lspStatusEl) this.lspStatusEl = this.addAction(icon[status.state], text, () => {});
    else setIcon(this.lspStatusEl, icon[status.state]);
    this.lspStatusEl.setAttribute("aria-label", text);
  }

  // Bundled Lezer/legacy highlighter plus its syntax-error underlines (the latter for lang-* only).
  private lezerLayer(ext: string): Extension {
    const lang = languageExtension(ext);
    if (!lang) return [];
    // Lezer's sass grammar misparses modern SCSS (maps, map-get, division), and HTML parsing of
    // astro frontmatter is noisy — skip Lezer diagnostics there to avoid false errors. tree-sitter,
    // when enabled, is accurate.
    const noisyDiagnostics = ext === "scss" || ext === "sass" || ext === "astro";
    return noisyDiagnostics ? [lang] : [lang, syntaxDiagnostics];
  }

  // When tree-sitter is enabled and a grammar exists for this file, download it (cached after the
  // first time) and swap the language layer over. Grammars with no highlights query keep the Lezer
  // colors and gain only tree-sitter diagnostics.
  private async maybeUpgradeToTreeSitter(ext: string, view: EditorView): Promise<void> {
    if (!this.ts?.enabled()) return;
    const src = grammarForExtension(ext);
    if (!src) return;
    const grammar = await this.ts.loader.load(src);
    if (!grammar || this.editor !== view) return; // unavailable, or the file was switched meanwhile
    // Does the query actually highlight this document? Some grammars ship incomplete queries that
    // yield no captures — keep the Lezer colours then, and use tree-sitter only for diagnostics,
    // rather than blanking the file.
    let highlights = false;
    if (grammar.query) {
      const tree = grammar.parser.parse(view.state.doc.toString());
      if (tree) {
        highlights = grammar.query.captures(tree.rootNode).length > 0;
        tree.delete();
      }
    }
    const layer: Extension = highlights
      ? treeSitterExtensions(grammar)
      : [languageExtension(ext) ?? [], treeSitterExtensions({ parser: grammar.parser, query: null })];
    view.dispatch({ effects: this.langLayer.reconfigure(layer) });
  }

  // Re-apply the highlighting layer to the live editor when the tree-sitter setting toggles: reset to
  // the Lezer/legacy base (dropping any tree-sitter layer and its error underlines), then upgrade again
  // if the feature is now on. Without this the open editor keeps the previous layer until it is reopened.
  applyTreeSitter(): void {
    if (!this.editor || !this.file) return;
    const ext = grammarKeyForPath(this.file.path);
    this.editor.dispatch({ effects: this.langLayer.reconfigure(this.lezerLayer(ext)) });
    void this.maybeUpgradeToTreeSitter(ext, this.editor);
  }

  // Load `git blame` for the open file and push it into the editor. When blame is disabled it clears
  // any annotation; when git/repo is unavailable or the file is untracked it simply leaves none.
  private async refreshBlame(view: EditorView): Promise<void> {
    if (!this.file) return;
    if (!this.blame?.enabled()) {
      view.dispatch({ effects: setBlame.of(null) });
      return;
    }
    const abs = absoluteForVaultPath(this.app, this.file.path);
    if (!abs) return;
    // Resolve the repository on every refresh (no caching) so a `git init` after load is picked up,
    // matching the status-bar branch indicator. The cost is one `git rev-parse` next to the blame.
    const base = vaultBasePath(this.app);
    const repo = base ? await resolveRepository(base) : null;
    if (this.editor !== view) return; // the file was switched while resolving
    // A non-"ok" repo yields no lines, which clears any stale blame rather than leaving it on screen.
    const lines = repo && repo.state === "ok" ? await loadBlame(repo, abs) : [];
    if (this.editor !== view) return; // the file was switched while blaming
    view.dispatch({ effects: setBlame.of(lines.length ? lines : null) });
  }

  // Re-apply the current blame setting to the live editor (used when the setting toggles).
  applyBlame(): void {
    if (this.editor) void this.refreshBlame(this.editor);
  }

  // Re-blame shortly after edits settle (line numbers shift; new lines read as uncommitted). The
  // delay also lets Obsidian's save flush to disk, which `git blame` reads from.
  private scheduleBlame(): void {
    if (!this.blame?.enabled()) return;
    if (this.blameTimer !== null) window.clearTimeout(this.blameTimer);
    this.blameTimer = window.setTimeout(() => {
      this.blameTimer = null;
      if (this.editor) void this.refreshBlame(this.editor);
    }, 1200);
  }

  getSelectionPayload(): SelectionPayload | null {
    if (!this.editor || !this.file) return null;
    const state = this.editor.state;
    const range = state.selection.main;
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    const abs = absoluteForVaultPath(this.app, this.file.path) ?? this.file.path;
    return {
      success: true,
      text: state.sliceDoc(range.from, range.to),
      filePath: abs,
      fileUrl: toFileUri(abs),
      selection: {
        start: { line: fromLine.number - 1, character: range.from - fromLine.from },
        end: { line: toLine.number - 1, character: range.to - toLine.from },
        isEmpty: range.empty,
      },
    };
  }

  // Format the open file with Prettier (in-process). Returns false if unsupported or invalid.
  async format(): Promise<boolean> {
    if (!this.editor || !this.file) return false;
    // Blade-aware key so ".blade.php" routes to the blade formatter, not php (.liquid/.twig/.j2 map
    // to themselves). The wasm/dprint formatters still match on these keys too.
    const ext = grammarKeyForPath(this.file.path);
    const current = this.editor.state.doc.toString();
    // FormatService chains Prettier (web+xml) -> rust -> @wasm-fmt -> dprint; downloads cache on first use.
    const formatted = this.formatService
      ? await this.formatService.format(current, ext)
      : await formatCode(current, ext);
    if (formatted == null || formatted === current) return false;
    this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: formatted } });
    this.requestSave();
    return true;
  }
}

export { CODE_VIEW_EXTENSIONS } from "./cm-theme";
