// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { Menu } from "obsidian";
import { EditorView, closeHoverTooltips } from "@codemirror/view";
import {
  LSPPlugin,
  type LSPClient,
  jumpToDefinition,
  jumpToDeclaration,
  jumpToTypeDefinition,
  jumpToImplementation,
  findReferences,
} from "@codemirror/lsp-client";
import type { SelectionPayload } from "../context";

// The location request behind each go-to capability, used to test per-symbol relevance.
const NAV_METHOD: Record<string, string> = {
  definitionProvider: "textDocument/definition",
  declarationProvider: "textDocument/declaration",
  typeDefinitionProvider: "textDocument/typeDefinition",
  implementationProvider: "textDocument/implementation",
};

// Which navigations to show for the symbol under the click. Capabilities are file-level (clangd
// advertises them for the whole file), so a per-symbol query is the only way to know a jump actually
// leads somewhere — otherwise every menu lists all of them, most dead. Returns the capability keys to
// show; empty when the click is not on a word, no server is attached, or every query times out.
async function relevantNavigations(
  editor: EditorView,
  lsp: LSPPlugin | null,
  clickPos: number | null,
): Promise<Set<string>> {
  const shown = new Set<string>();
  if (!lsp || clickPos === null || !editor.state.wordAt(clickPos)) return shown;
  const caps = lsp.client.serverCapabilities as unknown as Record<string, unknown> | null;
  const position = lsp.toPosition(clickPos) as { line: number; character: number };
  const jumps = Object.keys(NAV_METHOD).filter((cap) => caps?.[cap]);
  const hits = await Promise.all(jumps.map((cap) => navResolves(lsp.client, NAV_METHOD[cap], lsp.uri, position)));
  jumps.forEach((cap, i) => {
    if (hits[i]) shown.add(cap);
  });
  // References is worth showing once the click is a real symbol (some jump resolved) and the server
  // offers it — enumerating references just to decide would be far more expensive than a jump probe.
  if (shown.size > 0 && caps?.referencesProvider) shown.add("referencesProvider");
  return shown;
}

// True when a location request returns at least one target within a short budget. A slow/cold server
// yields false rather than stalling the menu; the action still works from the command palette.
async function navResolves(
  client: LSPClient,
  method: string,
  uri: string,
  position: { line: number; character: number },
): Promise<boolean> {
  const timedOut = Symbol("timeout");
  try {
    const result = await Promise.race<unknown>([
      client.request<{ textDocument: { uri: string }; position: typeof position }, unknown>(method, {
        textDocument: { uri },
        position,
      }),
      new Promise<unknown>((resolve) => window.setTimeout(() => resolve(timedOut), 250)),
    ]);
    if (result === timedOut) return false;
    return Array.isArray(result) ? result.length > 0 : result != null;
  } catch {
    return false;
  }
}

// What the editor context menu needs from the plugin to run its Claude/git items.
export interface EditorMenuHost {
  addToContext(payload: SelectionPayload): void; // @-mention the current selection to Claude
  openWorkingDiff(absPath: string, displayName: string): void; // diff against the last commit
}

// Electron's clipboard, for the cut/copy/paste items. Null if unavailable (then those items are
// disabled; Mod+C/V still work through CodeMirror). Reached the same way as openExternal in main.
function electronClipboard(): { readText(): string; writeText(s: string): void } | null {
  try {
    const req = (window as unknown as { require?: (m: string) => unknown }).require;
    const electron = req?.("electron") as
      | { clipboard?: { readText(): string; writeText(s: string): void } }
      | undefined;
    return electron?.clipboard ?? null;
  } catch {
    return null;
  }
}

// Obsidian builds the editor context menu only for its own MarkdownView/Editor, and other plugins'
// entries bind to editor-menu/file-menu — both of which expect a real Editor/TFile that our custom
// CodeMirror views (the code-file and hidden-file editors) don't have; faking those would break
// those plugins. So this reproduces the standard editing actions (cut/copy/paste/select all) plus
// our own (share selection, diff against the last commit) as a normal Obsidian menu, so a right-click
// reads the same in those editors as everywhere else.
export async function showEditorContextMenu(
  evt: MouseEvent,
  editor: EditorView,
  opts: {
    payload: () => SelectionPayload | null;
    absPath: string | null; // null disables "Diff against last commit" (path unknown)
    displayName: string;
    host: EditorMenuHost;
  },
): Promise<void> {
  // Suppress the native menu synchronously — the relevance queries below await, and without an early
  // preventDefault the browser context menu would flash before ours is shown.
  evt.preventDefault();
  const state = editor.state;
  const range = state.selection.main;
  const hasSelection = !range.empty;
  const clip = electronClipboard();
  const menu = new Menu();

  // A right-click over a symbol leaves the LSP hover tooltip open, which then overlaps this menu.
  // Dismiss it so only the menu shows.
  editor.dispatch({ effects: closeHoverTooltips });

  // Go-to-definition / find-references: the discoverable, primary entry point for these LSP actions
  // (they are also plain commands, so a hotkey stays user-assignable — nothing is bound to a key here).
  // Shown only when a language server is attached and advertises the capability; each acts on the symbol
  // under the right-click, not the old caret, so the reader points and navigates.
  const lsp = LSPPlugin.get(editor);
  const clickPos = editor.posAtCoords({ x: evt.clientX, y: evt.clientY });
  const relevant = await relevantNavigations(editor, lsp, clickPos);
  const atClick = (run: (v: EditorView) => void) => () => {
    if (clickPos !== null) editor.dispatch({ selection: { anchor: clickPos } });
    editor.focus();
    run(editor);
  };
  // Only the navigations that actually resolve for this symbol, in the conventional editor order. All
  // are read-only jumps; rename/code-actions (writes) stay out.
  const navItems: Array<[string, string, string, (v: EditorView) => void]> = [
    ["definitionProvider", "Go to definition", "arrow-right-to-line", jumpToDefinition],
    ["declarationProvider", "Go to declaration", "file-symlink", jumpToDeclaration],
    ["typeDefinitionProvider", "Go to type definition", "shapes", jumpToTypeDefinition],
    ["implementationProvider", "Go to implementation", "git-fork", jumpToImplementation],
    ["referencesProvider", "Find references", "search", findReferences],
  ];
  let anyNav = false;
  for (const [cap, title, icon, run] of navItems) {
    if (!relevant.has(cap)) continue;
    anyNav = true;
    menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(atClick(run)));
  }
  if (anyNav) menu.addSeparator();

  menu.addItem((item) =>
    item
      .setTitle("Cut")
      .setIcon("scissors")
      .setDisabled(!hasSelection || !clip)
      .onClick(() => {
        if (!hasSelection || !clip) return;
        clip.writeText(state.sliceDoc(range.from, range.to));
        editor.dispatch({ changes: { from: range.from, to: range.to, insert: "" } });
        editor.focus();
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle("Copy")
      .setIcon("copy")
      .setDisabled(!hasSelection || !clip)
      .onClick(() => {
        if (hasSelection && clip) clip.writeText(state.sliceDoc(range.from, range.to));
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle("Paste")
      .setIcon("clipboard-paste")
      .setDisabled(!clip)
      .onClick(() => {
        if (!clip) return;
        const text = clip.readText();
        editor.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
        });
        editor.focus();
      }),
  );
  menu.addItem((item) =>
    item
      .setTitle("Select all")
      .setIcon("text-select")
      .onClick(() => {
        editor.dispatch({ selection: { anchor: 0, head: state.doc.length } });
        editor.focus();
      }),
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Add selection to Claude context")
      .setIcon("at-sign")
      .onClick(() => {
        const payload = opts.payload();
        if (payload) opts.host.addToContext(payload);
      }),
  );
  if (opts.absPath !== null) {
    const abs = opts.absPath;
    menu.addItem((item) =>
      item
        .setTitle("Diff against last commit")
        .setIcon("git-compare")
        .onClick(() => opts.host.openWorkingDiff(abs, opts.displayName)),
    );
  }
  menu.showAtMouseEvent(evt);
}
