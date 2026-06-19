// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { EditorState } from "@codemirror/state";
import { MergeView } from "@codemirror/merge";
import { extensionOf } from "../util/languages";
import { languageExtension, obsidianEditorTheme, obsidianHighlighting } from "./cm-theme";
import { DIFF_VIEW_TYPE } from "./view-types";

export interface DiffRequest {
  oldFilePath: string;
  oldContents: string;
  newContents: string;
  tabName: string;
  // Called exactly once on Keep/Reject (or leaf close = Reject), unless cancelled.
  onDecision: (kept: boolean, finalContents: string) => void;
}

// A side-by-side diff leaf (old on the left/read-only, new on the right/editable)
// with Keep/Reject controls. The CLI's openDiff blocks on the user's decision.
export class DiffView extends ItemView {
  private merge: MergeView | null = null;
  private request: DiffRequest | null = null;
  private decided = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return DIFF_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.request?.tabName ?? "Proposed changes";
  }

  getIcon(): string {
    return "git-compare";
  }

  setRequest(request: DiffRequest): void {
    this.request = request;
    this.render();
  }

  // Marks the decision as already handled so onClose won't emit a (spurious)
  // Reject — used by the cancellation path (§8.5), which must send no verdict.
  markResolved(): void {
    this.decided = true;
  }

  private render(): void {
    const req = this.request;
    if (!req) return;
    const root = this.contentEl;
    root.empty();
    root.addClass("code-workbench-diff");

    const bar = root.createDiv({ cls: "code-workbench-diff-bar" });
    bar.createSpan({ text: `Claude proposes changes to ${req.oldFilePath}` });
    const keep = bar.createEl("button", { text: "Keep", cls: "mod-cta" });
    const reject = bar.createEl("button", { text: "Reject", cls: "mod-warning" });
    keep.onclick = () => this.decide(true);
    reject.onclick = () => this.decide(false);

    const host = root.createDiv({ cls: "code-workbench-diff-merge" });
    const lang = languageExtension(extensionOf(req.oldFilePath));
    const common = [obsidianEditorTheme, obsidianHighlighting, ...(lang ? [lang] : [])];
    this.merge = new MergeView({
      a: { doc: req.oldContents, extensions: [...common, EditorState.readOnly.of(true)] },
      b: { doc: req.newContents, extensions: [...common] },
      parent: host,
    });

    // Center the view on the first change rather than the top of the file.
    try {
      const chunk = this.merge.chunks[0];
      if (chunk) {
        this.merge.b.dispatch({ selection: { anchor: chunk.fromB }, scrollIntoView: true });
      }
    } catch {
      // Best-effort positioning.
    }
  }

  private finalContents(): string {
    return this.merge ? this.merge.b.state.doc.toString() : this.request?.newContents ?? "";
  }

  private decide(kept: boolean): void {
    if (this.decided) return;
    this.decided = true;
    this.request?.onDecision(kept, this.finalContents());
  }

  async onClose(): Promise<void> {
    // Closing the leaf without an explicit choice counts as Reject (§8.2.5).
    if (!this.decided) {
      this.decided = true;
      this.request?.onDecision(false, this.finalContents());
    }
    this.merge?.destroy();
    this.merge = null;
  }
}
