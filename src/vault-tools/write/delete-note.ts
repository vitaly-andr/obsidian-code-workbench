// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// Delete a note. Goes through fileManager.trashFile, which moves it to trash per the user's setting —
// never a permanent unlink, always recoverable. Confirmed by the user.
export const deleteNote: ToolHandler = async (args, ctx) => {
  const { app } = ctx;
  const file = resolveVaultFile(app, typeof args.path === "string" ? args.path : "");
  if (!file) return fail("not found");

  const approved = await ctx.approval.confirm({
    title: "Delete note",
    message: `Move "${file.path}" to trash? It stays recoverable from trash.`,
    cta: "Delete",
    destructive: true,
  });
  if (!approved) return ok({ cancelled: true });

  await app.fileManager.trashFile(file);
  return ok({ path: file.path, trashed: true });
};
