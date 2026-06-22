// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type { TFile } from "obsidian";
import { indexingGuard, resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

const BACKLINK_CAP = 100;

interface BacklinkEntry {
  path: string;
  count: number;
  positions?: { start: number; end: number }[];
}

// Optional position enrichment via the undocumented metadataCache.getBacklinksForFile. Its return
// container is a private class whose shape has changed across versions, so this is fully defensive:
// any mismatch returns an empty map and the caller falls back to resolvedLinks counts only (R4).
function backlinkPositions(app: { metadataCache: unknown }, file: TFile): Map<string, { start: number; end: number }[]> {
  const out = new Map<string, { start: number; end: number }[]>();
  const mc = app.metadataCache as { getBacklinksForFile?: (f: TFile) => unknown };
  if (typeof mc.getBacklinksForFile !== "function") return out;
  try {
    const result = mc.getBacklinksForFile(file) as { data?: unknown };
    const data = result?.data;
    const entries: [string, unknown][] =
      data instanceof Map ? [...data.entries()] : data && typeof data === "object" ? Object.entries(data) : [];
    for (const [srcPath, refs] of entries) {
      if (!Array.isArray(refs)) continue;
      const positions = refs
        .map((ref: { position?: { start?: { offset?: number }; end?: { offset?: number } } }) => ref?.position)
        .filter((p): p is { start: { offset: number }; end: { offset: number } } =>
          typeof p?.start?.offset === "number" && typeof p?.end?.offset === "number",
        )
        .map((p) => ({ start: p.start.offset, end: p.end.offset }));
      if (positions.length > 0) out.set(srcPath, positions);
    }
  } catch {
    return new Map();
  }
  return out;
}

// Notes that link to a given note. Primary source is the public reverse map over
// metadataCache.resolvedLinks (source -> { dest: count }); link positions are added when the
// undocumented API is available. Gated on indexing; capped with `truncated`.
export const getBacklinks: ToolHandler = async (args, ctx) => {
  const indexing = indexingGuard(ctx);
  if (indexing) return indexing;

  const { app } = ctx;
  const file = resolveVaultFile(app, String(args.path ?? ""));
  if (!file) return fail("not found");

  const positions = backlinkPositions(app, file);
  const resolved = app.metadataCache.resolvedLinks;
  const all: BacklinkEntry[] = [];
  for (const [src, dests] of Object.entries(resolved)) {
    const count = dests[file.path];
    if (!count) continue;
    const pos = positions.get(src);
    all.push({ path: src, count, ...(pos ? { positions: pos } : {}) });
  }
  all.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  const truncated = all.length > BACKLINK_CAP;
  return ok({ path: file.path, backlinks: all.slice(0, BACKLINK_CAP), truncated });
};
