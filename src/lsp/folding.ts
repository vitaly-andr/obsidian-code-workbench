// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure mapping from an LSP textDocument/foldingRange response to the editor's fold ranges (012,
// data-model.md). No CodeMirror / Obsidian import, so this is unit-testable without a live server.

import { isCurrentPosition, lspPositionToOffset } from "./offsets";

// LSP FoldingRange (line/character values 0-based, character in UTF-16 code units like every other
// LSP position). `collapsedText` (a server-provided placeholder label, LSP 3.17) is not used in v1
// (contract's non-goals) so it is not declared here.
export interface LspFoldingRange {
  startLine: number;
  startCharacter?: number;
  endLine: number;
  endCharacter?: number;
  kind?: string;
}

// The mapper's output (data-model.md → LspFoldRange).
export interface LspFoldRange {
  from: number;
  to: number;
  kind?: string;
}

// A character value that lspPositionToOffset clamps down to the actual end of the given line (before
// its terminating "\n") — this is exactly "end of line" without duplicating offsets.ts's line-end
// lookup. Do NOT round-trip-check a position built with this sentinel (isCurrentPosition would always
// report it as "changed"; staleness must be checked on the real position below instead).
const LINE_END_SENTINEL = Number.MAX_SAFE_INTEGER;

// Resolve one side of a range (start or end) to a document offset, or null if it no longer addresses
// real content in the current doc (a stale response under an edited doc). When `character` is given,
// this is a real, meaningful position and is round-trip-checked directly (isCurrentPosition, the same
// technique 009/010/011 use). When it is absent (whole-line fold), the check instead targets character
// 0 of that line — trivially valid for any line that still exists — and the actual offset is the
// clamped "end of line" sentinel, which is not itself a meaningful position to stale-check.
function resolveSide(doc: string, line: number, character: number | undefined): number | null {
  if (character !== undefined) {
    const pos = { line, character };
    return isCurrentPosition(doc, pos) ? lspPositionToOffset(doc, pos) : null;
  }
  if (!isCurrentPosition(doc, { line, character: 0 })) return null;
  return lspPositionToOffset(doc, { line, character: LINE_END_SENTINEL });
}

// Convert the raw server response + the current document into editor-ready fold ranges
// (data-model.md): `from` = end of `startLine` (or `startCharacter` when given), `to` = end of
// `endLine` (or `endCharacter` when given), via offsets.ts. A stale range or a degenerate one
// (`to <= from` — nothing to hide) is dropped. `kind` is carried through unchanged; server order
// (already the server's own ordering) is preserved.
export function mapFoldingRanges(raw: readonly LspFoldingRange[], doc: string): LspFoldRange[] {
  const ranges: LspFoldRange[] = [];
  for (const r of raw) {
    const from = resolveSide(doc, r.startLine, r.startCharacter);
    const to = resolveSide(doc, r.endLine, r.endCharacter);
    if (from === null || to === null) continue;
    if (to <= from) continue; // degenerate — nothing to hide
    ranges.push({ from, to, kind: r.kind });
  }
  return ranges;
}
