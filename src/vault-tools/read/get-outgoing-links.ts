// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { getLinkpath } from "obsidian";
import { indexingGuard, resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

interface OutgoingLink {
  link: string;
  resolvedPath: string | null;
  displayText?: string;
  kind: "link" | "embed" | "frontmatter";
}

// Links leaving a note: regular wikilinks/markdown links, embeds, and frontmatter links. Each is
// resolved through Obsidian's own resolver; targets it can't resolve are listed in `unresolved`.
export const getOutgoingLinks: ToolHandler = async (args, ctx) => {
  // Resolution and the unresolved-links map are only trustworthy once the cache has resolved —
  // gate the same way getBacklinks does, so the link tools answer consistently.
  const indexing = indexingGuard(ctx);
  if (indexing) return indexing;

  const { app } = ctx;
  const file = resolveVaultFile(app, String(args.path ?? ""));
  if (!file) return fail("not found");

  const cache = app.metadataCache.getFileCache(file);
  const links: OutgoingLink[] = [];
  const collect = (
    items: { link: string; displayText?: string }[] | undefined,
    kind: OutgoingLink["kind"],
  ): void => {
    for (const item of items ?? []) {
      const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(item.link), file.path);
      links.push({
        link: item.link,
        resolvedPath: dest ? dest.path : null,
        ...(item.displayText !== undefined ? { displayText: item.displayText } : {}),
        kind,
      });
    }
  };
  collect(cache?.links, "link");
  collect(cache?.embeds, "embed");
  collect(cache?.frontmatterLinks, "frontmatter");

  const unresolved = Object.keys(app.metadataCache.unresolvedLinks[file.path] ?? {});
  return ok({ path: file.path, links, unresolved });
};
