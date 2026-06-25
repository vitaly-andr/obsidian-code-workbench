// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { Menu } from "obsidian";
import { EditorView } from "@codemirror/view";
import type { SelectionPayload } from "../context";

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
export function showEditorContextMenu(
  evt: MouseEvent,
  editor: EditorView,
  opts: {
    payload: () => SelectionPayload | null;
    absPath: string | null; // null disables "Diff against last commit" (path unknown)
    displayName: string;
    host: EditorMenuHost;
  },
): void {
  const state = editor.state;
  const range = state.selection.main;
  const hasSelection = !range.empty;
  const clip = electronClipboard();
  const menu = new Menu();

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
  evt.preventDefault();
  menu.showAtMouseEvent(evt);
}
