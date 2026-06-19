// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type { App } from "obsidian";
import type { DiffManager } from "./diff-manager";

export interface SelectionRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
  isEmpty: boolean;
}

export interface SelectionPayload {
  success: true;
  text: string;
  filePath: string;
  fileUrl: string;
  selection: SelectionRange;
}

// Shared state and handles passed to every tool handler.
export interface IdeContext {
  app: App;
  pluginVersion: string;
  // Cache of the most recent non-empty selection, for getLatestSelection.
  lastSelection: SelectionPayload | null;
  // Orchestrates blocking diff leaves (openDiff / closeAllDiffTabs).
  diffs: DiffManager;
  // Push a JSON-RPC notification to connected CLIs (e.g. selection_changed, at_mentioned).
  notify: (method: string, params: unknown) => void;
}
