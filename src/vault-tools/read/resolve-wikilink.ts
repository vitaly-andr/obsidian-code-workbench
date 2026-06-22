// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { getLinkpath } from "obsidian";
import { indexingGuard } from "../guards";
import { ok, ToolHandler } from "../types";

// Resolve a wikilink to its target note. Strips a `|alias`, `#heading`, and `^block` first, then uses
// Obsidian's resolver. When the same basename exists in several folders, lists the candidates.
export const resolveWikilink: ToolHandler = async (args, ctx) => {
  // The resolver returns null for valid links until the cache resolves — gate like the other link tools.
  const indexing = indexingGuard(ctx);
  if (indexing) return indexing;

  const { app } = ctx;
  const raw = String(args.linkpath ?? "");
  const fromPath = typeof args.fromPath === "string" ? args.fromPath : "";

  // Drop the display alias, then let getLinkpath strip the #heading / ^block subpath.
  const withoutAlias = raw.split("|")[0];
  const linkpath = getLinkpath(withoutAlias);

  const dest = app.metadataCache.getFirstLinkpathDest(linkpath, fromPath);

  const base = linkpath.split("/").pop() ?? linkpath;
  const collisions = app.vault
    .getMarkdownFiles()
    .filter((f) => f.basename === base || f.path === linkpath || f.path === `${linkpath}.md`)
    .map((f) => f.path);
  const candidates = collisions.length > 1 ? collisions : undefined;

  return ok({
    linkpath,
    target: dest ? dest.path : null,
    ...(candidates ? { candidates } : {}),
  });
};
