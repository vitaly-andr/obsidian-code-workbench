// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import * as path from "path";
import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { error } from "../util/log";
import { toFileUri, vaultPathForAbsolute } from "../util/paths";
import { languageExtension, obsidianEditorTheme, obsidianHighlighting } from "./cm-theme";
import { HIDDEN_FILE_VIEW_TYPE } from "./view-types";
import { showEditorContextMenu } from "./editor-context-menu";
import type { EditorMenuHost } from "./editor-context-menu";
import type { SelectionPayload } from "../context";
import type { SelectionProvider } from "../tools/selection";

// The leaf state is just the absolute on-disk path, so the leaf can restore after a restart.
// The index signature satisfies Obsidian's Record<string, unknown> view-state contract.
export interface HiddenFileState {
  path: string;
  [key: string]: unknown;
}

// What the editor needs from the plugin to take part in the IDE/git features, kept narrow to avoid a
// plugin <-> view import cycle. A hidden file has no vault TFile, so Obsidian's own editor-menu and
// selection plumbing skip it; the plugin wires these explicitly instead.
export interface HiddenFileHost extends EditorMenuHost {
  onSaved(): void; // re-read git status after a save (vault events don't fire for dot-files)
}

type ViewStateResult = Parameters<ItemView["setState"]>[1];

function extensionOf(filePath: string): string {
  return (filePath.toLowerCase().split(".").pop() ?? "").trim();
}

// An editable CodeMirror view for files Obsidian doesn't index as notes (anything under a dotted
// path). Reads and writes through the vault adapter, confined to the vault root — desktop only, like
// the rest of the plugin. Save with the toolbar button, the "Save hidden file" command, or Mod+S.
// Implements SelectionProvider so its selection reaches Claude (/ide) like a note's, and adds a
// right-click menu (shared with the code editor) to edit, share a selection, or diff against the last
// commit — none of which Obsidian gives a non-TFile view for free.
export class HiddenFileView extends ItemView implements SelectionProvider {
  private editor: EditorView | null = null;
  private filePath = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: HiddenFileHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return HIDDEN_FILE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.filePath ? path.basename(this.filePath) : "Hidden file";
  }

  getIcon(): string {
    return "eye";
  }

  async onOpen(): Promise<void> {
    // A visible Save control: hidden files are not auto-saved, and a keyboard-only Mod+S is easy to miss.
    this.addAction("save", "Save hidden file", () => void this.save());
    // Right-click menu: Obsidian's editor-menu never fires for this non-TFile view, so build our own.
    this.registerDomEvent(this.contentEl, "contextmenu", (evt) => this.showContextMenu(evt));
  }

  getState(): HiddenFileState {
    return { path: this.filePath };
  }

  // Show the file in the header like a normal note: folder breadcrumbs plus the name. Obsidian builds
  // the header from getDisplayText() at view load — before setState set the path — and doesn't build
  // breadcrumbs for a non-TFile view, so do both directly. The structure mirrors Obsidian 1.12.7:
  // `.view-header-title-parent` holds `.view-header-breadcrumb` segments separated by
  // `.view-header-breadcrumb-separator` ("/"), and `.view-header-title` holds the file name. The tab
  // still uses getDisplayText() (the name only); updateHeader() refreshes it.
  private refreshTitle(): void {
    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    const titleEl = this.containerEl.querySelector<HTMLElement>(".view-header-title");
    if (!titleEl) return;
    const rel = vaultPathForAbsolute(this.app, this.filePath) ?? path.basename(this.filePath);
    const segments = rel.split("/");
    const name = segments.pop() ?? rel;
    titleEl.setText(name);
    const parentEl = this.containerEl.querySelector<HTMLElement>(".view-header-title-parent");
    if (!parentEl) return;
    parentEl.empty();
    for (const seg of segments) {
      parentEl.createSpan({ cls: "view-header-breadcrumb", text: seg });
      parentEl.createSpan({ cls: "view-header-breadcrumb-separator", text: "/" });
    }
  }

  // A hidden file is a dot-file INSIDE the vault folder. Map an absolute path to its vault-relative
  // form, or null if it resolves outside the vault — so a persisted/restored leaf state can't point
  // the editor at a file beyond the vault root.
  private relInVault(absPath: string): string | null {
    return vaultPathForAbsolute(this.app, absPath);
  }

  async setState(state: HiddenFileState, result: ViewStateResult): Promise<void> {
    if (state && typeof state.path === "string") {
      if (this.relInVault(state.path) !== null) {
        this.filePath = state.path;
        await this.loadFile(state.path);
        // Obsidian builds the view header from getDisplayText() at load — before setState set the path
        // — and exposes no public refresh. Do it after the header element exists (deferred a tick).
        window.setTimeout(() => this.refreshTitle(), 0);
      } else {
        error("hidden file outside the vault refused", state.path);
        new Notice("Code Workbench: that file is outside the vault");
      }
    }
    return super.setState(state, result);
  }

  private async loadFile(absPath: string): Promise<void> {
    const rel = this.relInVault(absPath);
    if (rel === null) {
      error("hidden file outside the vault refused", absPath);
      new Notice("Code Workbench: that file is outside the vault");
      return;
    }
    let data = "";
    try {
      data = await this.app.vault.adapter.read(rel);
    } catch (e) {
      error("hidden file read failed", e);
      new Notice(`Code Workbench: could not read ${absPath}`);
      return;
    }
    this.renderEditor(absPath, data);
  }

  private renderEditor(absPath: string, data: string): void {
    this.editor?.destroy();
    this.contentEl.empty();
    this.contentEl.addClass("cw-hidden-file");

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        { key: "Mod-s", preventDefault: true, run: () => (void this.save(), true) },
      ]),
      obsidianEditorTheme,
      obsidianHighlighting,
      EditorView.lineWrapping,
    ];
    const lang = languageExtension(extensionOf(absPath));
    if (lang) extensions.push(lang);

    this.editor = new EditorView({
      state: EditorState.create({ doc: data, extensions }),
      parent: this.contentEl,
    });
  }

  // SelectionProvider: report the current selection like a note's, so activeSelection() finds this
  // view when it is active — that drives selection_changed (/ide sees the open file), getCurrent/
  // getLatestSelection, and the "Add selection to Claude context" command.
  getSelectionPayload(): SelectionPayload | null {
    if (!this.editor || !this.filePath) return null;
    const state = this.editor.state;
    const range = state.selection.main;
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    return {
      success: true,
      text: state.sliceDoc(range.from, range.to),
      filePath: this.filePath,
      fileUrl: toFileUri(this.filePath),
      selection: {
        start: { line: fromLine.number - 1, character: range.from - fromLine.from },
        end: { line: toLine.number - 1, character: range.to - toLine.from },
        isEmpty: range.empty,
      },
    };
  }

  private showContextMenu(evt: MouseEvent): void {
    if (!this.editor || !this.filePath) return;
    showEditorContextMenu(evt, this.editor, {
      payload: () => this.getSelectionPayload(),
      absPath: this.filePath,
      displayName: path.basename(this.filePath),
      host: this.host,
    });
  }

  // Write the editor contents back through the vault adapter.
  async save(): Promise<void> {
    if (!this.editor || !this.filePath) return;
    // Re-check on write: never overwrite a file outside the vault, even if filePath was set somehow.
    const rel = this.relInVault(this.filePath);
    if (rel === null) {
      new Notice("Code Workbench: refusing to save outside the vault");
      return;
    }
    const content = this.editor.state.doc.toString();
    try {
      await this.app.vault.adapter.write(rel, content);
      new Notice(`Code Workbench: saved ${path.basename(this.filePath)}`);
      this.host.onSaved();
    } catch (e) {
      error("hidden file save failed", e);
      new Notice(`Code Workbench: could not save ${path.basename(this.filePath)}`);
    }
  }

  async onClose(): Promise<void> {
    // Hidden files are not auto-saved — unsaved edits are dropped on close (save with Mod+S). This
    // avoids silently overwriting config dot-files the user only meant to look at.
    this.editor?.destroy();
    this.editor = null;
  }
}
