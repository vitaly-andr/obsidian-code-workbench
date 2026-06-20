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
      // On large files, fold long unchanged stretches so every change is visible at once
      // (3 context lines around each; collapse runs of 4+ unchanged lines). Click to expand.
      collapseUnchanged: { margin: 3, minSize: 4 },
      // Per-chunk revert on the editable side: revert a single proposed hunk back to the original
      // (reject just that change). "a-to-b" writes into b, leaving the read-only a intact. Keep then
      // commits whatever remains in b (= all changes if you reverted none).
      revertControls: "a-to-b",
      // The default glyph is a rightward arrow that reads like "apply", but the action rejects the
      // proposed hunk. Use a red ✕ (reject) with an explicit tooltip instead.
      renderRevertControl: () => {
        const b = document.createElement("button");
        b.className = "cw-revert-reject";
        // aria-label alone: Obsidian renders its own styled tooltip from it. Setting `title` too
        // would also trigger the native browser tooltip — two tooltips on hover.
        b.setAttribute("aria-label", "Reject this change");
        b.textContent = "✕";
        return b;
      },
    });

    // Put the cursor on the first change (editable side) and scroll to it, not the top of the file.
    // Also re-run after layout: a freshly opened leaf may be unmeasured, so an immediate
    // scrollIntoView has nothing to measure against.
    const toFirstChange = (): void => {
      const chunk = this.merge?.chunks[0];
      if (!chunk || !this.merge) return;
      try {
        this.merge.b.dispatch({ selection: { anchor: chunk.fromB }, scrollIntoView: true });
        this.merge.b.focus();
      } catch {
        // Best-effort positioning.
      }
    };
    toFirstChange();
    window.requestAnimationFrame(toFirstChange);
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
