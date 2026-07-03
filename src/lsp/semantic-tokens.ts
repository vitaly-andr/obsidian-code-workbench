// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure decoder for the LSP textDocument/semanticTokens relative encoding (010, data-model.md). No
// CodeMirror / Obsidian import, so this is unit-testable without a live server.

import { isCurrentPosition, lspPositionToOffset, type LspPosition } from "./offsets";

// The server's advertised legend (serverCapabilities.semanticTokensProvider.legend) — the only way
// to interpret the numeric tokenType/tokenModifiers indices in the response.
export interface SemanticTokensLegend {
  tokenTypes: string[];
  tokenModifiers: string[];
}

// The decoder's output (data-model.md → SemanticSpan).
export interface SemanticSpan {
  from: number;
  to: number;
  type: string;
  modifiers: string[];
}

// Decode the flat, relative-encoded `data` array (groups of 5: deltaLine, deltaStartChar, length,
// tokenType, tokenModifiers) against the server's legend, into editor-ready spans. Per the LSP
// encoding: the (line, char) cursor accumulates deltaLine; char is `char + deltaStartChar` when the
// token stays on the same line (deltaLine === 0) or resets to the absolute `deltaStartChar` on a new
// line. tokenModifiers is a bitset — each set bit i names `legend.tokenModifiers[i]`.
//
// An out-of-range tokenType index is dropped (data-model.md allows dropping or "unknown"; dropping
// avoids inventing a token that was never in the legend). A span whose start/end no longer address
// real content in the current doc (a stale response under an edited doc) is dropped via the same
// round-trip check 009/010 use (isCurrentPosition, shared in offsets.ts). Server order is preserved.
export function decodeSemanticTokens(
  data: readonly number[],
  legend: SemanticTokensLegend,
  doc: string,
): SemanticSpan[] {
  const spans: SemanticSpan[] = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStartChar = data[i + 1];
    const length = data[i + 2];
    const tokenType = data[i + 3];
    const tokenModifierBits = data[i + 4];

    line += deltaLine;
    char = deltaLine === 0 ? char + deltaStartChar : deltaStartChar;

    const type = legend.tokenTypes[tokenType];
    if (type === undefined) continue; // out-of-range legend index — drop rather than mislabel

    const start: LspPosition = { line, character: char };
    const end: LspPosition = { line, character: char + length };
    if (!isCurrentPosition(doc, start) || !isCurrentPosition(doc, end)) continue;

    const modifiers: string[] = [];
    for (let bit = 0; bit < legend.tokenModifiers.length; bit++) {
      if (tokenModifierBits & (1 << bit)) modifiers.push(legend.tokenModifiers[bit]);
    }

    spans.push({
      from: lspPositionToOffset(doc, start),
      to: lspPositionToOffset(doc, end),
      type,
      modifiers,
    });
  }
  return spans;
}
