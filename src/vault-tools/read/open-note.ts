// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// Open a note in the Obsidian editor and bring it to the foreground. Non-destructive: it changes only
// which note is focused, never the vault — so it stays in the read group, with no approval gate.
// `newLeaf:true` opens the note in a new tab instead of reusing the active one.
export const openNote: ToolHandler = async (args, ctx) => {
  const file = resolveVaultFile(ctx.app, typeof args.path === "string" ? args.path : "");
  if (!file) return fail("not found");
  const leaf = ctx.app.workspace.getLeaf(args.newLeaf === true ? "tab" : false);
  await leaf.openFile(file);
  return ok({ path: file.path, opened: true });
};
