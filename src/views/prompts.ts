// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, Modal, Setting } from "obsidian";

// A small text-prompt modal (Obsidian ships no generic prompt). Used to rename a hidden file.
export class RenameModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly initial: string,
    private readonly onSubmit: (value: string) => void,
  ) {
    super(app);
    this.value = initial;
  }

  onOpen(): void {
    this.titleEl.setText("Rename");
    let inputEl: HTMLInputElement | null = null;
    new Setting(this.contentEl).setName("New name").addText((t) => {
      inputEl = t.inputEl;
      t.setValue(this.value).onChange((v) => (this.value = v));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setCta().setButtonText("Rename").onClick(() => this.submit()));
    // Focus and select the name (minus extension would be nicer, but keep it simple/robust).
    window.setTimeout(() => inputEl?.focus(), 0);
  }

  private submit(): void {
    const v = this.value.trim();
    if (!v || v === this.initial) {
      this.close();
      return;
    }
    this.close();
    this.onSubmit(v);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// A confirm modal with a destructive (red) action button, for delete and similar.
export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmText: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      // setWarning() (red) works back to minAppVersion 1.7.2; setDestructive() is @since 1.13.0.
      .addButton((b) =>
        b
          .setWarning()
          .setButtonText(this.confirmText)
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
