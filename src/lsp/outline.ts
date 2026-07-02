// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure mapping from an LSP textDocument/documentSymbol response to the outline panel's tree model
// (008, data-model.md). No Obsidian / CodeMirror import, so this is unit-testable without a live
// server. Local, minimal LSP type declarations (same approach as extensions.ts's DiagnosticReport)
// so the bundle does not pull the full vscode-languageserver-protocol types for a couple of shapes.

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

// Hierarchical shape (LSP 3.17 preferred): a container with its members nested under `children`.
export interface LspDocumentSymbol {
  name: string;
  kind: number; // SymbolKind
  range: LspRange;
  // The range of the symbol's name — the jump target (data-model.md), not the full body range.
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

// Flat shape (older servers): no nesting, a uri + range wrapped in `location`.
export interface LspSymbolInformation {
  name: string;
  kind: number; // SymbolKind
  location: { uri: string; range: LspRange };
  containerName?: string;
}

export type DocumentSymbolResponse = LspDocumentSymbol[] | LspSymbolInformation[];

// The panel's tree node (data-model.md → OutlineSymbol).
export interface OutlineSymbol {
  name: string;
  kind: string;
  range: LspPosition;
  children: OutlineSymbol[];
}

// LSP `SymbolKind` (1-26) -> a short, human label. Unknown kinds fall back to "symbol".
const SYMBOL_KIND_LABELS: Record<number, string> = {
  1: "file",
  2: "module",
  3: "namespace",
  4: "package",
  5: "class",
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  15: "string",
  16: "number",
  17: "boolean",
  18: "array",
  19: "object",
  20: "key",
  21: "null",
  22: "enum member",
  23: "struct",
  24: "event",
  25: "operator",
  26: "type parameter",
};

function kindLabel(kind: number): string {
  return SYMBOL_KIND_LABELS[kind] ?? "symbol";
}

function isSymbolInformation(
  s: LspDocumentSymbol | LspSymbolInformation,
): s is LspSymbolInformation {
  return "location" in s;
}

// Convert the raw server response into the panel's tree, per data-model.md's mapping rules:
// hierarchical DocumentSymbol[] maps recursively (selectionRange.start is the jump target); flat
// SymbolInformation[] maps to a single level (location.range.start is the jump target); order is
// preserved as the server returned it.
export function mapSymbols(raw: DocumentSymbolResponse): OutlineSymbol[] {
  return raw.map((s) => {
    if (isSymbolInformation(s)) {
      return { name: s.name, kind: kindLabel(s.kind), range: s.location.range.start, children: [] };
    }
    return {
      name: s.name,
      kind: kindLabel(s.kind),
      range: s.selectionRange.start,
      children: s.children ? mapSymbols(s.children) : [],
    };
  });
}
