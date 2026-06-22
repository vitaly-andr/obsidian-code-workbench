// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { resolveVaultFile, scopeVaultPath } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// Rename/move a note. Goes through fileManager.renameFile, so Obsidian rewrites every inbound
// [[link]] — the link-preserving headline. Confirmed by the user; refuses if the destination exists.
export const renameNote: ToolHandler = async (args, ctx) => {
  const { app } = ctx;
  const file = resolveVaultFile(app, String(args.path ?? ""));
  if (!file) return fail("not found");

  const newPath = scopeVaultPath(app, String(args.newPath ?? ""));
  if (newPath === null || newPath === "") return fail("invalid path");
  if (app.vault.getAbstractFileByPath(newPath)) return fail("destination exists");

  const approved = await ctx.approval.confirm({
    title: "Rename note",
    message: `Rename "${file.path}" to "${newPath}"? Inbound [[links]] will be updated.`,
    cta: "Rename",
  });
  if (!approved) return ok({ cancelled: true });

  // Re-check after the approval wait: the destination may have appeared meanwhile. Guard + try/catch
  // so a late collision is a clean tool error, not an uncaught throw surfaced as INTERNAL_ERROR.
  if (app.vault.getAbstractFileByPath(newPath)) return fail("destination exists");
  try {
    await app.fileManager.renameFile(file, newPath);
  } catch {
    return fail("rename failed");
  }
  return ok({ oldPath: file.path, newPath, linksUpdated: true });
};
