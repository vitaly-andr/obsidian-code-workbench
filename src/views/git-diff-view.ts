// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { EditorState } from "@codemirror/state";
import { MergeView } from "@codemirror/merge";
import { extensionOf } from "../util/languages";
import { languageExtension, obsidianEditorTheme, obsidianHighlighting } from "./cm-theme";
import { GIT_DIFF_VIEW_TYPE } from "./view-types";

export interface GitDiffData {
  title: string;
  path: string;
  oldContents: string;
  newContents: string;
}

// A read-only side-by-side diff of one file at one commit (old = parent, new = commit). Reuses the
// same CodeMirror theme/highlighting as the Keep/Reject diff, but both sides are read-only and there
// are no Keep/Reject controls — this is history, not a pending change.
export class GitDiffView extends ItemView {
  private data: GitDiffData | null = null;
  private merge: MergeView | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return GIT_DIFF_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.data?.title ?? "Commit diff";
  }

  getIcon(): string {
    return "git-compare";
  }

  setData(data: GitDiffData): void {
    this.data = data;
    this.render();
  }

  private render(): void {
    const d = this.data;
    if (!d) return;
    const root = this.contentEl;
    root.empty();
    root.addClass("code-workbench-diff");
    root.createDiv({ cls: "code-workbench-diff-bar" }).createSpan({ text: d.title });
    const host = root.createDiv({ cls: "code-workbench-diff-merge" });
    const lang = languageExtension(extensionOf(d.path));
    const common = [
      obsidianEditorTheme,
      obsidianHighlighting,
      ...(lang ? [lang] : []),
      EditorState.readOnly.of(true),
    ];
    this.merge?.destroy();
    this.merge = new MergeView({
      a: { doc: d.oldContents, extensions: common },
      b: { doc: d.newContents, extensions: common },
      parent: host,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });
  }

  async onClose(): Promise<void> {
    this.merge?.destroy();
    this.merge = null;
  }
}
