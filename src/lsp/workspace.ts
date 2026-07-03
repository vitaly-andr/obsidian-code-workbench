// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// A Workspace for @codemirror/lsp-client that tolerates re-opening a URI that is still open.
//
// The library's DefaultWorkspace (not exported, so this reimplements it) ties each open file to a
// single editor view and THROWS "Default workspace implementation doesn't support multiple views on
// the same file" on a second openFile for the same URI. Our attach flow re-opens a file whenever the
// LSP layer is (re)built — on a settings toggle (reapplyLsp), a file switch/reopen (renderEditor), or
// an async race between two attaches. Because openFile runs inside the LSPPlugin constructor, that
// throw surfaces as a CodeMirror "plugin crashed": the view loses ALL language features, AND the
// server's document is left unsynced (a stale didOpen with no matching didClose), which then makes
// every position-based request diverge — e.g. ruby-lsp raising InvalidLocationError / a nil range on
// the next didChange.
//
// The one behavioral change vs DefaultWorkspace: openFile closes any still-open entry for the URI
// first (a clean didClose), then opens fresh (didOpen re-syncs the server's copy to the current doc).
// closeFile is view-scoped so a superseded view's late close — its editor destroyed AFTER another view
// already reopened the same file — does not close the current view's file. Everything else mirrors the
// reference implementation (per-URI version counter, syncFiles reads each view's LSPPlugin changes).
//
// This is NOT full multi-view support (two live editors of one file at once): each Obsidian leaf holds
// its own CodeMirror document for the file, so there is no single shared model to sync (unlike VS
// Code's one TextModel across splits). The single-view-per-URI guard (uriOwners in index.ts) still
// keeps one view driving the LSP; this workspace just makes the re-open path robust instead of fatal.

import { Workspace, LSPPlugin, type WorkspaceFile } from "@codemirror/lsp-client";
import type { EditorView } from "@codemirror/view";
import type { ChangeSet, Text } from "@codemirror/state";

class CwWorkspaceFile implements WorkspaceFile {
  constructor(
    readonly uri: string,
    readonly languageId: string,
    public version: number,
    public doc: Text,
    private readonly view: EditorView,
  ) {}

  getView(): EditorView {
    return this.view;
  }
}

interface FileUpdate {
  file: WorkspaceFile;
  prevDoc: Text;
  changes: ChangeSet;
}

export class ReopenTolerantWorkspace extends Workspace {
  files: WorkspaceFile[] = [];
  private readonly fileVersions = new Map<string, number>();

  private nextFileVersion(uri: string): number {
    const next = (this.fileVersions.get(uri) ?? -1) + 1;
    this.fileVersions.set(uri, next);
    return next;
  }

  // Mirrors DefaultWorkspace.syncFiles: collect each file's pending editor changes for a didChange.
  syncFiles(): readonly FileUpdate[] {
    const result: FileUpdate[] = [];
    for (const file of this.files) {
      const view = file.getView();
      if (!view) continue;
      const plugin = LSPPlugin.get(view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        result.push({ file, prevDoc: file.doc, changes });
        file.doc = view.state.doc;
        file.version = this.nextFileVersion(file.uri);
        plugin.clear();
      }
    }
    return result;
  }

  openFile(uri: string, languageId: string, view: EditorView): void {
    const existing = this.getFile(uri);
    if (existing) {
      // Still open (async re-attach / reopen). DefaultWorkspace throws here; close it first instead.
      this.files = this.files.filter((f) => f !== existing);
      this.client.didClose(uri);
    }
    const file = new CwWorkspaceFile(uri, languageId, this.nextFileVersion(uri), view.state.doc, view);
    this.files.push(file);
    this.client.didOpen(file);
  }

  closeFile(uri: string, view: EditorView): void {
    // Only close the file this exact view holds — a superseded view must not close the current one's.
    const file = this.files.find((f) => f.uri === uri && f.getView() === view);
    if (!file) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(uri);
  }
}
