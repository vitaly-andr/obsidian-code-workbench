// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type { Setting } from "obsidian";

// A narrowed mirror of Obsidian's setting definitions (@since 1.13.0).
//
// Obsidian 1.13 builds its settings search index from the array a tab returns from
// `getSettingDefinitions()` — it indexes `name`, `desc` and `aliases` of every definition — and
// renders the tab from that same array. The plugin still supports Obsidian 1.7.2, which knows
// nothing about definitions and calls `display()` instead, so the array declared with these types
// drives both paths (`legacy.ts` paints it for old versions). Declaring the content once is what
// keeps the two renderings from drifting apart.
//
// Only the subset the tab actually uses is modelled: toggles, one text area, buttons, and blocks
// that paint themselves. The shapes match Obsidian's own, so the array passes as
// `SettingDefinitionItem[]` at the tab boundary.

/**
 * Paints a row's content into the `Setting` Obsidian (or `legacy.ts`) has already created and
 * given its name and description. May return a cleanup function, called before the row is torn
 * down.
 */
export type CwRender = (setting: Setting) => void | (() => void);

export interface CwDefBase {
  /** Rendered as the row's name, and the first thing settings search matches on. */
  name: string;
  /** Rendered under the name; also indexed for search. */
  desc?: string;
  /** Search-only synonyms — never rendered. The terms a user types but the row does not say. */
  aliases?: string[];
  /** `false` keeps the row out of the search index while still rendering it. Default: true. */
  searchable?: boolean;
  /** Re-evaluated on every render: `false` hides the row and drops it from the index. */
  visible?: () => boolean;
}

/** A value bound to a settings key, read and written through the tab's control accessors. */
export interface CwToggleControl {
  type: "toggle";
  /** Dotted path into the plugin's settings, e.g. `lsp.enabled`. */
  key: string;
  defaultValue?: boolean;
}

export type CwControl = CwToggleControl;

export interface CwControlDef extends CwDefBase {
  control: CwControl;
  render?: never;
}

export interface CwRenderDef extends CwDefBase {
  render: CwRender;
  control?: never;
}

/** A row that only states something, e.g. the live connection status. */
export interface CwEmptyDef extends CwDefBase {
  control?: never;
  render?: never;
}

export type CwDef = CwControlDef | CwRenderDef | CwEmptyDef;

/** A heading with its rows. Note that Obsidian does not index the heading itself. */
export interface CwGroup {
  type: "group";
  heading?: string;
  /** Class for the group's container element, e.g. the accent card around the support block. */
  cls?: string;
  items: CwDef[];
  visible?: () => boolean;
}

export type CwItem = CwDef | CwGroup;

export function isGroup(item: CwItem): item is CwGroup {
  return "type" in item && item.type === "group";
}

/**
 * What a definition needs from the tab that owns it: a repaint after a change that alters which
 * rows are visible. Obsidian 1.13 re-evaluates `visible` through `update()`; older versions
 * repaint through `display()`. The tab hides that difference behind this one call.
 */
export interface SettingsHost {
  refresh(): void;
}
