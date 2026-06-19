// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, MarkdownView } from "obsidian";
import { IdeContext, SelectionPayload, SelectionRange } from "../context";
import { McpResult, wrap } from "../protocol/mcp";
import { absoluteForVaultPath, toFileUri } from "../util/paths";

// Our CodeView implements this so its selection is reported like a note's (§9).
export interface SelectionProvider {
  getSelectionPayload(): SelectionPayload | null;
}

function fromMarkdown(app: App): SelectionPayload | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.file) return null;
  const editor = view.editor;
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const abs = absoluteForVaultPath(app, view.file.path) ?? view.file.path;
  const selection: SelectionRange = {
    start: { line: from.line, character: from.ch },
    end: { line: to.line, character: to.ch },
    isEmpty: from.line === to.line && from.ch === to.ch,
  };
  return { success: true, text: editor.getSelection(), filePath: abs, fileUrl: toFileUri(abs), selection };
}

function fromActiveCodeView(app: App): SelectionPayload | null {
  const view = app.workspace.activeLeaf?.view as Partial<SelectionProvider> | undefined;
  if (view && typeof view.getSelectionPayload === "function") {
    return view.getSelectionPayload();
  }
  return null;
}

// 0-based line/character coordinates, per §7.1.
export function activeSelection(app: App): SelectionPayload | null {
  return fromMarkdown(app) ?? fromActiveCodeView(app);
}

export function getCurrentSelection(_args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const sel = activeSelection(ctx.app);
  if (!sel) return wrap({ success: false, message: "No active editor found" });
  if (!sel.selection.isEmpty) ctx.lastSelection = sel;
  return wrap(sel);
}

// §7.2: most recent selection, even when no editor is active right now.
export function getLatestSelection(_args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const sel = activeSelection(ctx.app);
  if (sel) {
    if (!sel.selection.isEmpty) ctx.lastSelection = sel;
    return wrap(sel);
  }
  if (ctx.lastSelection) return wrap(ctx.lastSelection);
  return wrap({ success: false, message: "No active editor found" });
}
