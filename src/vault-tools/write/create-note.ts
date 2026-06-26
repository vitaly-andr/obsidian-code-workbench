// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { scopeVaultPath } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// Create a new note. Previews the proposed file as a diff (empty -> content, editable), then writes
// via vault.create after approval. Refuses to overwrite an existing file; vault-scoped.
export const createNote: ToolHandler = async (args, ctx, signal) => {
  const { app } = ctx;
  const scoped = scopeVaultPath(app, typeof args.path === "string" ? args.path : "");
  if (scoped === null || scoped === "") return fail("invalid path");
  if (app.vault.getAbstractFileByPath(scoped)) return fail("already exists");

  const content = typeof args.content === "string" ? args.content : "";
  const review = await ctx.approval.reviewContent(
    { path: scoped, oldContent: "", newContent: content, tabName: `Create ${scoped}` },
    signal,
  );
  if (!review.approved) return ok({ cancelled: true });

  // The file may have appeared during the approval wait — re-check for a clear "already exists".
  if (app.vault.getAbstractFileByPath(scoped)) return fail("already exists");
  try {
    await app.vault.create(scoped, review.finalContent);
  } catch {
    return fail("invalid path");
  }
  return ok({ path: scoped, created: true });
};
