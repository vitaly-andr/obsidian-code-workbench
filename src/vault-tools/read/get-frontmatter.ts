// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// The parsed YAML frontmatter of a note (null when it has none).
export const getFrontmatter: ToolHandler = async (args, ctx) => {
  const file = resolveVaultFile(ctx.app, typeof args.path === "string" ? args.path : "");
  if (!file) return fail("not found");
  const frontmatter = ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
  return ok({ path: file.path, frontmatter });
};
