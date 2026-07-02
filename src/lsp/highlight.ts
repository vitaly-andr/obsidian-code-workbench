// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure mapping from an LSP textDocument/documentHighlight response to the editor's decoration spans
// (009, data-model.md). No CodeMirror / Obsidian import, so this is unit-testable without a live
// server. Local, minimal LSP type declaration (same approach as extensions.ts's DiagnosticReport and
// outline.ts's DocumentSymbol/SymbolInformation) so the bundle does not pull the full
// vscode-languageserver-protocol types for one shape.

import { lspPositionToOffset, offsetToLspPosition, type LspPosition } from "./offsets";

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

// DocumentHighlightKind (LSP): 1 Text, 2 Read, 3 Write. `kind` is optional — a server may not classify.
export interface LspDocumentHighlight {
  range: LspRange;
  kind?: number;
}

export type HighlightKind = "text" | "read" | "write";

// The mapper's output (data-model.md → HighlightSpan).
export interface HighlightSpan {
  from: number;
  to: number;
  kind: HighlightKind;
}

function toKind(kind: number | undefined): HighlightKind {
  if (kind === 2) return "read";
  if (kind === 3) return "write";
  return "text"; // missing or kind 1 (Text)
}

// True when `pos` addresses real content in the current `doc` — lspPositionToOffset clamps an
// out-of-range position instead of failing, so round-tripping it back through offsetToLspPosition is
// how a clamp (and therefore a stale position) is detected without re-implementing line counting.
function isCurrentPosition(doc: string, pos: LspPosition): boolean {
  const roundTripped = offsetToLspPosition(doc, lspPositionToOffset(doc, pos));
  return roundTripped.line === pos.line && roundTripped.character === pos.character;
}

// Convert the raw server response + the current document into editor-ready spans (data-model.md):
// positions via offsets.ts (multibyte-safe, FR-007); a span whose start/end no longer address real
// content in the current doc is dropped (the doc changed under a stale response); server order
// preserved.
export function mapHighlights(raw: readonly LspDocumentHighlight[], doc: string): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  for (const h of raw) {
    if (!isCurrentPosition(doc, h.range.start) || !isCurrentPosition(doc, h.range.end)) continue;
    const from = lspPositionToOffset(doc, h.range.start);
    const to = lspPositionToOffset(doc, h.range.end);
    if (from >= to) continue; // drop empty/inverted ranges — a zero-width mark decoration throws in CM6
    spans.push({ from, to, kind: toKind(h.kind) });
  }
  return spans;
}
