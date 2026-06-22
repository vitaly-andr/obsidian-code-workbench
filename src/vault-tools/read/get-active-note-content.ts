// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { fail, ok, ToolHandler } from "../types";

// The note open in the active editor. Prefers the live editor buffer (which may be ahead of disk)
// and falls back to the cached on-disk read.
export const getActiveNoteContent: ToolHandler = async (_args, ctx) => {
  const { app } = ctx;
  const file = app.workspace.getActiveFile();
  if (!file) return fail("no active note");

  const active = app.workspace.activeEditor;
  const editor = active?.editor;
  if (editor && active?.file?.path === file.path) {
    return ok({ path: file.path, content: editor.getValue() });
  }
  const content = await app.vault.cachedRead(file);
  return ok({ path: file.path, content });
};
