// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { TFolder } from "obsidian";
import { resolveVaultFolder } from "../guards";
import { fail, ok, ToolHandler } from "../types";

const ENTRY_CAP = 500;

// Direct children (files and subfolders) of a vault folder. Bounded with `truncated`.
export const listFilesInFolder: ToolHandler = async (args, ctx) => {
  const folder = resolveVaultFolder(ctx.app, String(args.folder ?? ""));
  if (!folder) return fail("not found");

  const all = folder.children.map((child) => ({
    path: child.path,
    type: child instanceof TFolder ? ("folder" as const) : ("file" as const),
  }));
  all.sort((a, b) => a.path.localeCompare(b.path));

  const truncated = all.length > ENTRY_CAP;
  return ok({ folder: folder.path, entries: all.slice(0, ENTRY_CAP), truncated });
};
