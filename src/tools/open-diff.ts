// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { IdeContext } from "../context";
import { McpResult, textBlock } from "../protocol/mcp";
import { ERROR_CODES, RpcError } from "../protocol/errors";
import { vaultPathForAbsolute } from "../util/paths";

// §8: blocking diff. Keep -> two text blocks (FILE_SAVED + final contents);
// Reject -> one block (DIFF_REJECTED). Cancellation throws CancelledError from the
// manager (the dispatcher then suppresses the response). The plugin never writes.
export async function openDiff(
  args: Record<string, unknown>,
  ctx: IdeContext,
  signal: AbortSignal,
): Promise<McpResult> {
  const oldFilePath = args.old_file_path;
  if (typeof oldFilePath !== "string") {
    throw new RpcError(ERROR_CODES.INVALID_REQUEST, "missing old_file_path");
  }
  // M1: old_file_path is peer-controlled and read off disk as the diff base.
  // Confine it to the vault so a prompt-injected agent can't load arbitrary
  // local files (e.g. ~/.ssh/id_rsa) into the diff. Fails closed without a vault root.
  if (vaultPathForAbsolute(ctx.app, oldFilePath) === null) {
    throw new RpcError(ERROR_CODES.INVALID_REQUEST, "old_file_path is outside the vault");
  }
  const newContents = args.new_file_contents;
  if (typeof newContents !== "string") {
    throw new RpcError(ERROR_CODES.INVALID_REQUEST, "missing new_file_contents");
  }
  const tabName = typeof args.tab_name === "string" && args.tab_name.length > 0
    ? args.tab_name
    : "Proposed changes";

  const result = await ctx.diffs.openDiff({ oldFilePath, newContents, tabName }, signal);
  if (result.kept) {
    return { content: [textBlock("FILE_SAVED"), textBlock(result.content)] };
  }
  return { content: [textBlock("DIFF_REJECTED")] };
}

// §7.10: direct content with the JSON-string payload { closedCount }.
export function closeAllDiffTabs(_args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const closedCount = ctx.diffs.closeAll();
  return { content: [textBlock(JSON.stringify({ closedCount }))] };
}

// §7.11 compat: wrapped payload { success, closed }.
export function closeTab(_args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const closed = ctx.diffs.closeAll();
  return { content: [textBlock(JSON.stringify({ success: true, closed }))] };
}
