// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { IdeContext } from "../context";
import { McpResult, wrap } from "../protocol/mcp";
import { toFileUri, vaultBasePath } from "../util/paths";

// §7.3: report the open vault root as the workspace.
export function getWorkspaceFolders(_args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const base = vaultBasePath(ctx.app);
  if (!base) {
    return wrap({ success: true, folders: [], rootPath: "" });
  }
  const trimmed = base.replace(/[\\/]+$/, "");
  const name = trimmed.split(/[\\/]/).pop() ?? trimmed;
  return wrap({
    success: true,
    folders: [{ name, uri: toFileUri(base), path: base }],
    rootPath: base,
  });
}
