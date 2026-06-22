// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// Append (or prepend) text to a note. The diff previews old vs old+inserted for approval; on Keep the
// change is applied with vault.process as a concatenation, so the existing body is never overwritten.
export const appendToNote: ToolHandler = async (args, ctx, signal) => {
  const { app } = ctx;
  const file = resolveVaultFile(app, String(args.path ?? ""));
  if (!file) return fail("not found");

  const content = String(args.content ?? "");
  const position = args.position === "prepend" ? "prepend" : "append";
  const current = await app.vault.cachedRead(file);
  const preview = position === "prepend" ? content + current : current + content;

  const review = await ctx.approval.reviewContent(
    { path: file.path, oldContent: current, newContent: preview, tabName: `Append ${file.path}` },
    signal,
  );
  if (!review.approved) return ok({ cancelled: true });

  // Apply through the vault API, writing exactly what the user approved in the diff. vault.process
  // hands us the live on-disk content: if the note changed during the approval wait (sync, another
  // pane), the approved text is stale, so refuse rather than silently overwrite those edits.
  let conflict = false;
  await app.vault.process(file, (data) => {
    if (data !== current) {
      conflict = true;
      return data;
    }
    return review.finalContent;
  });
  if (conflict) return fail("note changed during approval; re-run");
  return ok({ path: file.path, appended: true });
};
