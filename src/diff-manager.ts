// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App } from "obsidian";
import { CancelledError } from "./protocol/errors";
import { vaultPathForAbsolute } from "./util/paths";
import { DiffRequest, DiffView } from "./views/diff-view";
import { DIFF_VIEW_TYPE } from "./views/view-types";

export interface OpenDiffParams {
  oldFilePath: string;
  newContents: string;
  tabName: string;
}

export interface DiffResult {
  kept: boolean;
  content: string;
}

// Orchestrates blocking diff leaves. The plugin never writes the target file —
// it returns the approved content and the CLI performs the write (§8.4).
export class DiffManager {
  constructor(private readonly app: App) {}

  async openDiff(params: OpenDiffParams, signal: AbortSignal): Promise<DiffResult> {
    // The current on-disk contents are the diff base (the "old" side). Read through the vault
    // adapter, which is scoped to the vault; the CLI only diffs files inside the open workspace.
    // A path outside the vault, or a missing file, falls back to an empty base.
    let oldContents = "";
    const rel = vaultPathForAbsolute(this.app, params.oldFilePath);
    if (rel !== null) {
      try {
        oldContents = await this.app.vault.adapter.read(rel);
      } catch {
        oldContents = "";
      }
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: DIFF_VIEW_TYPE, active: true });
    const view = leaf.view as DiffView;

    return new Promise<DiffResult>((resolve, reject) => {
      let settled = false;
      const closeLeaf = () => {
        try {
          leaf.detach();
        } catch {
          // leaf already gone
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        // Cancellation (§8.5): suppress the leaf's Reject verdict and close it.
        view.markResolved?.();
        closeLeaf();
        reject(new CancelledError());
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);

      const onDecision = (kept: boolean, content: string): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        closeLeaf();
        resolve({ kept, content });
      };

      const request: DiffRequest = {
        oldFilePath: params.oldFilePath,
        oldContents,
        newContents: params.newContents,
        tabName: params.tabName,
        onDecision,
      };

      if (typeof view.setRequest === "function") {
        view.setRequest(request);
      } else {
        settled = true;
        signal.removeEventListener("abort", onAbort);
        closeLeaf();
        reject(new Error("diff view unavailable"));
      }
    });
  }

  // §7.10/§7.11: close all diff leaves. A pending diff resolves as Reject via onClose.
  closeAll(): number {
    const leaves = this.app.workspace.getLeavesOfType(DIFF_VIEW_TYPE);
    for (const leaf of leaves) {
      leaf.detach();
    }
    return leaves.length;
  }
}
