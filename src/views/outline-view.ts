// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ItemView, WorkspaceLeaf } from "obsidian";
// Type-only import of the controller: erased at build, so this does NOT pull the lazy LSP runtime
// into the base bundle (same convention main.ts uses for LspController/LspEditorConfig).
import type { LspController } from "../lsp";
// outline.ts is a dependency-free pure module (no Obsidian/CM import), so importing it here eagerly
// is the same cost as main.ts eagerly importing src/lsp/settings.ts — negligible, and it does NOT
// reach @codemirror/lsp-client or the session runtime (that stays behind ensureLspController()'s
// existing import("./src/lsp")).
import { mapSymbols, type OutlineSymbol } from "../lsp/outline";
import { CodeView } from "./code-view";
import { CODE_VIEW_TYPE, OUTLINE_VIEW_TYPE } from "./view-types";
import { grammarForExtension } from "../treesitter/registry";
import { grammarKeyForPath } from "../util/languages";
import { absoluteForVaultPath, vaultPathForAbsolute } from "../util/paths";

// What the panel needs from the plugin, kept narrow (same shape as HiddenFilesHost) to avoid a
// plugin <-> view import cycle. `ensureLspController` is the plugin's existing lazy-load seam
// (005/006) — the panel never imports src/lsp/index.ts itself, so the base bundle stays unchanged
// off (FR-009); only this file's dependency-free outline.ts import is eager.
export interface OutlineHost {
  ensureLspController: () => Promise<LspController>;
  isLanguageEnabled: (language: string) => boolean;
}

// A sidebar panel (git-graph-view pattern) that shows the active code file's symbols from the
// connected language server as a read-only, always-expanded tree. Read-only: it queries
// documentSymbols on the file's existing session and, on click, only moves the editor's cursor
// (US2) — it never starts a server and never writes the file (FR-002/FR-007).
export class OutlineView extends ItemView {
  // The vault-relative path this panel is currently showing (or null when on a placeholder).
  private currentPath: string | null = null;
  // Bumped on every refresh so a stale async response from a superseded refresh is dropped.
  private refreshToken = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: OutlineHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return OUTLINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Code outline";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  // The code view to outline. Prefer the active editor; when the active leaf is this panel itself or
  // a Markdown note, fall back to the CodeView showing the active file — so the outline follows the
  // file (and populates on panel open) without the user having to click back into the editor.
  private resolveCodeView(): CodeView | null {
    const active = this.app.workspace.getActiveViewOfType(CodeView);
    if (active?.file) return active;
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    for (const leaf of this.app.workspace.getLeavesOfType(CODE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CodeView && view.file?.path === file.path) return view;
    }
    return null;
  }

  // Re-target the panel to the active code file (or its placeholder) and re-query its symbols.
  async refresh(): Promise<void> {
    const token = ++this.refreshToken;
    try {
      const view = this.resolveCodeView();
      if (!view || !view.file) {
        this.currentPath = null;
        return this.renderPlaceholder("Open a code file to see its outline.");
      }
      const language = grammarForExtension(grammarKeyForPath(view.file.path))?.id;
      if (!language) {
        this.currentPath = null;
        return this.renderPlaceholder("No outline for this file type.");
      }
      if (!this.host.isLanguageEnabled(language)) {
        this.currentPath = null;
        return this.renderPlaceholder("Turn on language intelligence (Settings) to see an outline.");
      }
      const filePath = absoluteForVaultPath(this.app, view.file.path);
      if (!filePath) {
        this.currentPath = null;
        return this.renderPlaceholder("Could not resolve this file.");
      }
      this.currentPath = view.file.path;
      this.renderLoading();
      const controller = await this.host.ensureLspController();
      if (token !== this.refreshToken) return; // a newer refresh started meanwhile
      const raw = await controller.documentSymbols(filePath);
      if (token !== this.refreshToken) return;
      if (!raw) return this.renderPlaceholder("No connected language server for this file.");
      const symbols = mapSymbols(raw);
      if (symbols.length === 0) return this.renderPlaceholder("No symbols in this file.");
      this.renderTree(symbols);
    } catch {
      if (token === this.refreshToken) this.renderPlaceholder("Could not load the outline.");
    }
  }

  private renderPlaceholder(text: string): void {
    this.contentEl.empty();
    this.contentEl.addClass("cw-outline");
    this.contentEl.createDiv({ cls: "pane-empty", text });
  }

  private renderLoading(): void {
    this.contentEl.empty();
    this.contentEl.addClass("cw-outline");
    this.contentEl.createDiv({ cls: "pane-empty", text: "Loading outline…" });
  }

  private renderTree(symbols: OutlineSymbol[]): void {
    this.contentEl.empty();
    this.contentEl.addClass("cw-outline");
    const root = this.contentEl.createDiv({ cls: "nav-files-container" });
    for (const symbol of symbols) this.renderNode(symbol, root);
  }

  // Reuses Obsidian's own tree-item/nav CSS classes (same pattern as the hidden-files tree) so
  // nesting indentation matches the theme with no custom layout CSS.
  private renderNode(symbol: OutlineSymbol, parentEl: HTMLElement): void {
    const item = parentEl.createDiv({ cls: "tree-item cw-outline-item" });
    const self = item.createDiv({ cls: "tree-item-self is-clickable cw-outline-row" });
    self.createSpan({ cls: "cw-outline-kind", text: symbol.kind });
    self.createDiv({ cls: "tree-item-inner cw-outline-name", text: symbol.name });
    self.addEventListener("click", () => void this.jumpTo(symbol));
    if (symbol.children.length > 0) {
      const childrenEl = item.createDiv({ cls: "tree-item-children" });
      for (const child of symbol.children) this.renderNode(child, childrenEl);
    }
  }

  // Focus the outlined file's editor and move the cursor to the symbol's start (US2). No file write
  // (FR-004/FR-007). Looks up the CodeView by the panel's remembered path rather than "the active
  // view" — clicking into the sidebar panel itself does not change which file we mean to jump to.
  private async jumpTo(symbol: OutlineSymbol): Promise<void> {
    const path = this.currentPath;
    if (!path) return;
    for (const leaf of this.app.workspace.getLeavesOfType(CODE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CodeView && view.file?.path === path) {
        await this.app.workspace.revealLeaf(leaf);
        view.revealPosition(symbol.range);
        // A tab that was just unhidden may report zero-height until the next layout tick; retry once
        // after a frame so scrollIntoView measures against the laid-out editor (DiffView precedent).
        window.requestAnimationFrame(() => view.revealPosition(symbol.range));
        return;
      }
    }
  }

  // Refresh only if the edited file is the one this panel is currently showing (US3/FR-006) — a
  // debounced edit elsewhere in the vault should not trigger an unrelated documentSymbol request.
  maybeRefreshFor(absPath: string): void {
    if (!this.currentPath) return;
    const rel = vaultPathForAbsolute(this.app, absPath);
    if (rel && rel === this.currentPath) void this.refresh();
  }
}
