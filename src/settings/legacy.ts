// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { Setting } from "obsidian";
import { isGroup } from "./types";
import type { CwDef, CwItem } from "./types";

// Renders setting definitions the way Obsidian < 1.13 needs them: as plain `Setting` rows.
//
// Obsidian 1.13 renders the same array itself, from `getSettingDefinitions()`. This walker exists
// so the plugin can keep supporting 1.7.2 without describing the tab twice. It deliberately
// mirrors the order the framework uses — name, then description, then the control or the block —
// so a definition looks the same on both paths. `SettingGroup` is not used: it only exists from
// 1.11.0, below the plugin's minimum.

/** What the walker needs from the tab: the same value accessors Obsidian 1.13 calls. */
export interface ControlAccess {
  getControlValue(key: string): unknown;
  setControlValue(key: string, value: unknown): void | Promise<void>;
}

export function renderLegacy(containerEl: HTMLElement, items: CwItem[], tab: ControlAccess): void {
  for (const item of items) {
    if (!isGroup(item)) {
      renderDef(containerEl, item, tab);
      continue;
    }
    if (item.visible && !item.visible()) continue;
    // A group's class marks its container — the accent card around the support block, for one.
    const parent = item.cls ? containerEl.createDiv({ cls: item.cls }) : containerEl;
    if (item.heading) new Setting(parent).setName(item.heading).setHeading();
    for (const def of item.items) renderDef(parent, def, tab);
  }
}

function renderDef(parent: HTMLElement, def: CwDef, tab: ControlAccess): void {
  if (def.visible && !def.visible()) return;

  const setting = new Setting(parent);
  setting.setName(def.name);
  if (def.desc) setting.setDesc(def.desc);

  if (def.control) {
    const { key, defaultValue } = def.control;
    // `stored ?? defaultValue` is the framework's own rule, repeated here on purpose: only an
    // absent value falls back, a stored `false` stays off, and a settings file holding something
    // other than a boolean (an older shape, a hand-edit) reads the same on both render paths.
    const stored = tab.getControlValue(key) ?? defaultValue ?? false;
    setting.addToggle((toggle) =>
      toggle.setValue(Boolean(stored)).onChange((value) => {
        void tab.setControlValue(key, value);
      }),
    );
    return;
  }

  // A block owns the row from here. Obsidian keeps the cleanup function a block may return and
  // calls it when tearing the row down; this path repaints the whole tab instead, so there is
  // nothing to hold on to.
  if (def.render) def.render(setting);
}
