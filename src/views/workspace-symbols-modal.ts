// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, Notice, SuggestModal, TFile } from "obsidian";
// Type-only import of the controller: erased at build, so this does NOT pull the lazy LSP runtime
// into the base bundle (same convention main.ts/outline-view.ts use for LspController).
import type { LspController, WorkspaceSymbolItem } from "../lsp";
import { kindLabel } from "../lsp/outline";
import { CodeView } from "./code-view";
import { fromFileUri, vaultPathForAbsolute } from "../util/paths";

// What the palette needs from the plugin, kept narrow (same shape as OutlineHost) to avoid a
// plugin <-> view import cycle. `ensureLspController` is the plugin's existing lazy-load seam
// (005/006) — the palette never imports src/lsp/index.ts itself, so the base bundle stays
// unchanged off (FR-008).
export interface WorkspaceSymbolsHost {
  ensureLspController: () => Promise<LspController>;
}

// Debounce delay for a workspace/symbol re-request per keystroke (FR-003) — same short window as the
// 009-012 editor-layer debounces, so the list feels responsive without spamming every connected server
// on every keystroke.
const WORKSPACE_SYMBOLS_DEBOUNCE_MS = 200;

// Project-wide symbol search (013): the reader types a name, results come from every connected
// capable server (LspController.workspaceSymbols), and choosing one opens its file and reveals the
// cursor there (008's revealPosition). Read-only navigation only. No settings toggle — on demand, like
// the 008 outline; the empty-state text covers both "no matches" and "no capable server connected"
// (FR-005), so the modal opens immediately with no pre-check delay.
export class WorkspaceSymbolsModal extends SuggestModal<WorkspaceSymbolItem> {
  // Bumped on every getSuggestions call; a response is applied only if it is still the latest (drops
  // a stale result from a superseded query, contract B3).
  private generation = 0;

  constructor(
    app: App,
    private readonly host: WorkspaceSymbolsHost,
  ) {
    super(app);
    this.setPlaceholder("Search workspace symbols…");
    this.emptyStateText = "No language server with workspace symbols is connected.";
  }

  async getSuggestions(query: string): Promise<WorkspaceSymbolItem[]> {
    const gen = ++this.generation;
    await new Promise<void>((resolve) => window.setTimeout(resolve, WORKSPACE_SYMBOLS_DEBOUNCE_MS));
    if (gen !== this.generation) return []; // a newer keystroke superseded this one
    const controller = await this.host.ensureLspController();
    if (gen !== this.generation) return [];
    const items = await controller.workspaceSymbols(query);
    if (gen !== this.generation) return [];
    return items;
  }

  renderSuggestion(item: WorkspaceSymbolItem, el: HTMLElement): void {
    // Same kind-badge classes as the 008 outline (cw-outline-kind/-name) — one visual language for
    // an LSP symbol row whether it's per-file or project-wide.
    const main = el.createDiv({ cls: "cw-wsym-main" });
    main.createSpan({ cls: "cw-outline-kind", text: kindLabel(item.kind) });
    main.createSpan({ cls: "cw-outline-name", text: item.name });
    el.createDiv({ cls: "cw-wsym-detail", text: this.describeLocation(item) });
  }

  // containerName + file basename, so same-named symbols are distinguishable (FR-004); degrades to
  // just the file basename when the server omits a container.
  private describeLocation(item: WorkspaceSymbolItem): string {
    const abs = fromFileUri(item.uri);
    const rel = abs !== null ? vaultPathForAbsolute(this.app, abs) : null;
    const fileLabel = rel ?? abs ?? item.uri;
    const base = fileLabel.split("/").pop() || fileLabel;
    return item.containerName ? `${item.containerName} — ${base}` : base;
  }

  onChooseSuggestion(item: WorkspaceSymbolItem): void {
    void this.openAndReveal(item);
  }

  // Open the symbol's file and reveal the cursor at its range start (008's revealPosition), or just
  // open the file when the location has no range (a URI-only WorkspaceSymbol, R5 — no
  // workspaceSymbol/resolve in v1). A file outside the vault is reported, never crashing (FR-007).
  private async openAndReveal(item: WorkspaceSymbolItem): Promise<void> {
    const abs = fromFileUri(item.uri);
    const rel = abs !== null ? vaultPathForAbsolute(this.app, abs) : null;
    const file = rel !== null ? this.app.vault.getAbstractFileByPath(rel) : null;
    if (!(file instanceof TFile)) {
      new Notice("Code Workbench: this symbol's file is outside the vault");
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const range = item.range;
    if (!range) return;
    const view = leaf.view;
    if (!(view instanceof CodeView)) return;
    view.revealPosition(range.start);
    // A freshly opened leaf may be unmeasured on the first layout pass; retry once after a frame so
    // scrollIntoView measures against the laid-out editor (same precedent as the 008 outline's jumpTo).
    window.requestAnimationFrame(() => {
      if (leaf.view instanceof CodeView) leaf.view.revealPosition(range.start);
    });
  }
}
