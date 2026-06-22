// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { prepareSimpleSearch, TFile } from "obsidian";
import { ok, ToolHandler } from "../types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const EXCERPT_RADIUS = 40;

type MatchedIn = "title" | "headings" | "frontmatter";
type Scorer = (text: string) => { score: number; matches: [number, number][] } | null;

interface Scored {
  path: string;
  score: number;
  excerpt: string;
  matchedIn: MatchedIn;
}

// A short window of `text` around its first match.
function excerptFor(text: string, matches: [number, number][]): string {
  if (matches.length === 0) return text.slice(0, EXCERPT_RADIUS * 2);
  const [from, to] = matches[0];
  const start = Math.max(0, from - EXCERPT_RADIUS);
  const end = Math.min(text.length, to + EXCERPT_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

// Score one labelled text and return a candidate, or null if it doesn't match.
function scoreText(search: Scorer, text: string, matchedIn: MatchedIn): Omit<Scored, "path"> | null {
  if (!text) return null;
  const res = search(text);
  if (!res) return null;
  return { score: res.score, excerpt: excerptFor(text, res.matches), matchedIn };
}

// Metadata search across the whole vault: titles, headings, tags, and frontmatter, ranked. It does
// NOT read note bodies — full-text search of bodies is grep/ripgrep's job, which runs outside
// Obsidian's UI thread and is what the `claude` CLI already does well. This searches only what the
// metadata cache already holds in memory, so it is synchronous, never touches disk, and stays fast
// regardless of vault size (no per-query body reads). The best-scoring field per file wins.
export const searchVault: ToolHandler = async (args, ctx) => {
  const { app } = ctx;
  const query = String(args.query ?? "");
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(args.limit)))
      : DEFAULT_LIMIT;

  if (query.trim().length === 0) return ok({ query, results: [], truncated: false });
  const search = prepareSimpleSearch(query) as Scorer;

  const files = app.vault.getMarkdownFiles();
  const best = new Map<string, Scored>();
  const consider = (file: TFile, candidate: Omit<Scored, "path"> | null): void => {
    if (!candidate) return;
    const prev = best.get(file.path);
    if (!prev || candidate.score > prev.score) best.set(file.path, { path: file.path, ...candidate });
  };

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    consider(file, scoreText(search, `${file.path} ${file.basename}`, "title"));
    const headings = (cache?.headings ?? []).map((h) => h.heading).join(" ");
    consider(file, scoreText(search, headings, "headings"));
    const tags = (cache?.tags ?? []).map((t) => t.tag).join(" ");
    const frontmatter = cache?.frontmatter ? JSON.stringify(cache.frontmatter) : "";
    consider(file, scoreText(search, `${tags} ${frontmatter}`.trim(), "frontmatter"));
  }

  const ranked = [...best.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const truncated = ranked.length > limit;
  return ok({ query, results: ranked.slice(0, limit), truncated });
};
