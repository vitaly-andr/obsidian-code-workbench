// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Map between LSP positions and editor offsets so diagnostics/hovers/navigation land on the right
// characters in multibyte text (FR-021, SC-007).
//
// LSP `Position` is { line, character } with both 0-based and `character` counted in UTF-16 code
// units. CodeMirror document offsets are JS string indices, which are also UTF-16 code units, so the
// mapping is done entirely in UTF-16 units — no byte<->char remap is needed. (The spec/tasks name a
// `byte-offsets.ts`; the tree-sitter path already works in UTF-16 string indices, src/treesitter/
// diagnostics.ts, and so does this. The naming differs; the unit is the same.) Working in UTF-16
// units makes astral characters — emoji are two code units (a surrogate pair) — fall out correctly.

export interface LspPosition {
  line: number; // 0-based
  character: number; // 0-based, UTF-16 code units within the line
}

// Offsets in the text at which each line begins (index 0 = line 0). A new line starts after each
// "\n"; a "\r" before it stays part of the preceding line (its UTF-16 index is unaffected).
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return starts;
}

// LSP position -> document offset (UTF-16 index). Out-of-range lines/characters are clamped to the
// document, matching how editors tolerate a stale position from the server.
export function lspPositionToOffset(text: string, pos: LspPosition): number {
  const starts = lineStarts(text);
  if (pos.line < 0) return 0;
  if (pos.line >= starts.length) return text.length;
  const lineStart = starts[pos.line];
  // Clamp an over-long character to the line's content end, i.e. before the terminating "\n"
  // (LSP `character` does not count the line break).
  const lineEnd = pos.line + 1 < starts.length ? starts[pos.line + 1] - 1 : text.length;
  const offset = lineStart + Math.max(0, pos.character);
  return Math.min(offset, lineEnd);
}

// Document offset (UTF-16 index) -> LSP position.
export function offsetToLspPosition(text: string, offset: number): LspPosition {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const starts = lineStarts(text);
  // Largest line whose start is <= offset.
  let line = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= clamped) line = i;
    else break;
  }
  return { line, character: clamped - starts[line] };
}

// 1-based line/column for human/agent-facing rendering (the getDiagnostics reference format and the
// editor status both present 1-based positions).
export function toOneBased(pos: LspPosition): { line: number; column: number } {
  return { line: pos.line + 1, column: pos.character + 1 };
}
