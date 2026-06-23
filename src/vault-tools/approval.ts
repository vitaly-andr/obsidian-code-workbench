// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, Modal, Setting } from "obsidian";
import { DiffManager } from "../diff-manager";
import { absoluteForVaultPath } from "../util/paths";
import { Approval } from "./types";

// User approval for vault mutations. Content changes (create/append/frontmatter) reuse the existing
// Keep/Reject diff view; rename/delete use a small confirm modal. A rejected or closed prompt leaves
// the vault unchanged (FR-016a). Nothing is written here — the tool applies via the vault API only
// after this returns approval.
export class VaultApproval implements Approval {
  constructor(
    private readonly app: App,
    private readonly diffs: DiffManager,
  ) {}

  async reviewContent(
    opts: { path: string; oldContent: string; newContent: string; tabName: string },
    signal: AbortSignal,
  ): Promise<{ approved: boolean; finalContent: string }> {
    const abs = absoluteForVaultPath(this.app, opts.path);
    if (!abs) return { approved: false, finalContent: opts.newContent };
    // openDiff bases the "old" side on the file's on-disk contents (empty for a new file) and returns
    // the kept verdict plus the possibly-edited content from the diff editor.
    const result = await this.diffs.openDiff(
      { oldFilePath: abs, newContents: opts.newContent, tabName: opts.tabName },
      signal,
    );
    return { approved: result.kept, finalContent: result.content };
  }

  confirm(opts: { title: string; message: string; cta: string; destructive?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      new ConfirmModal(this.app, opts, resolve).open();
    });
  }
}

// A yes/no modal. Closing it any other way counts as cancel, so a write never applies by default.
class ConfirmModal extends Modal {
  private decided = false;

  constructor(
    app: App,
    private readonly opts: { title: string; message: string; cta: string; destructive?: boolean },
    private readonly resolve: (value: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    this.contentEl.createEl("p", { text: this.opts.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.decide(false)))
      .addButton((b) => {
        b.setButtonText(this.opts.cta).setCta().onClick(() => this.decide(true));
        if (this.opts.destructive) b.setDestructive();
        return b;
      });
  }

  onClose(): void {
    this.decide(false);
  }

  private decide(value: boolean): void {
    if (this.decided) return;
    this.decided = true;
    this.resolve(value);
    this.close();
  }
}
