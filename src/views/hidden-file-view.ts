// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { promises as fs } from "fs";
import * as path from "path";
import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { error } from "../util/log";
import { vaultPathForAbsolute } from "../util/paths";
import { languageExtension, obsidianEditorTheme, obsidianHighlighting } from "./cm-theme";
import { HIDDEN_FILE_VIEW_TYPE } from "./view-types";

// The leaf state is just the absolute on-disk path, so the leaf can restore after a restart.
// The index signature satisfies Obsidian's Record<string, unknown> view-state contract.
export interface HiddenFileState {
  path: string;
  [key: string]: unknown;
}

type ViewStateResult = Parameters<ItemView["setState"]>[1];

function extensionOf(filePath: string): string {
  return (filePath.toLowerCase().split(".").pop() ?? "").trim();
}

// An editable CodeMirror view for files Obsidian doesn't index as notes (anything under a dotted
// path). Reads and writes the file directly on disk by absolute path — desktop only, like the rest
// of the plugin. Save with Mod+S (or the "Save hidden file" command). Mirrors CodeView's editor
// setup but is not a TextFileView, so it doesn't need a vault TFile.
export class HiddenFileView extends ItemView {
  private editor: EditorView | null = null;
  private filePath = "";

  constructor(leaf: WorkspaceLeaf) {
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

  getState(): HiddenFileState {
    return { path: this.filePath };
  }

  // A hidden file is a dot-file INSIDE the vault folder. Reject any absolute path that resolves
  // outside the vault root — reuses the confinement the companion vault tools rely on, so a
  // persisted/restored leaf state can't point the editor at a file beyond the vault.
  private inVault(absPath: string): boolean {
    return vaultPathForAbsolute(this.app, absPath) !== null;
  }

  async setState(state: HiddenFileState, result: ViewStateResult): Promise<void> {
    if (state && typeof state.path === "string") {
      if (this.inVault(state.path)) {
        this.filePath = state.path;
        await this.loadFile(state.path);
      } else {
        error("hidden file outside the vault refused", state.path);
        new Notice("Code Workbench: that file is outside the vault");
      }
    }
    return super.setState(state, result);
  }

  private async loadFile(absPath: string): Promise<void> {
    let data = "";
    try {
      data = await fs.readFile(absPath, "utf8");
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

  // Write the editor contents back to disk.
  async save(): Promise<void> {
    if (!this.editor || !this.filePath) return;
    // Re-check on write: never overwrite a file outside the vault, even if filePath was set somehow.
    if (!this.inVault(this.filePath)) {
      new Notice("Code Workbench: refusing to save outside the vault");
      return;
    }
    const content = this.editor.state.doc.toString();
    try {
      await fs.writeFile(this.filePath, content, "utf8");
      new Notice(`Code Workbench: saved ${path.basename(this.filePath)}`);
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
