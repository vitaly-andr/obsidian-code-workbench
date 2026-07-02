// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { mapSymbols, type LspDocumentSymbol, type LspSymbolInformation } from "../../../src/lsp/outline";

function pos(line: number, character: number) {
  return { line, character };
}

function range(startLine: number, startChar: number, endLine: number, endChar: number) {
  return { start: pos(startLine, startChar), end: pos(endLine, endChar) };
}

describe("mapSymbols — hierarchical DocumentSymbol[]", () => {
  it("nests methods under their class, using selectionRange.start as the jump target", () => {
    const raw: LspDocumentSymbol[] = [
      {
        name: "User",
        kind: 5, // class
        range: range(0, 0, 10, 1),
        selectionRange: range(0, 6, 0, 10),
        children: [
          {
            name: "greet",
            kind: 6, // method
            range: range(1, 2, 3, 5),
            selectionRange: range(1, 6, 1, 11),
          },
          {
            name: "farewell",
            kind: 6,
            range: range(4, 2, 6, 5),
            selectionRange: range(4, 6, 4, 14),
          },
        ],
      },
    ];
    const tree = mapSymbols(raw);
    expect(tree).toEqual([
      {
        name: "User",
        kind: "class",
        range: pos(0, 6),
        children: [
          { name: "greet", kind: "method", range: pos(1, 6), children: [] },
          { name: "farewell", kind: "method", range: pos(4, 6), children: [] },
        ],
      },
    ]);
  });

  it("preserves order and deep nesting", () => {
    const raw: LspDocumentSymbol[] = [
      { name: "b", kind: 12, range: range(1, 0, 1, 1), selectionRange: range(1, 0, 1, 1) },
      {
        name: "a",
        kind: 5,
        range: range(0, 0, 5, 0),
        selectionRange: range(0, 6, 0, 7),
        children: [
          {
            name: "nested",
            kind: 6,
            range: range(2, 0, 2, 1),
            selectionRange: range(2, 0, 2, 1),
            children: [{ name: "deep", kind: 13, range: range(3, 0, 3, 1), selectionRange: range(3, 0, 3, 1) }],
          },
        ],
      },
    ];
    const tree = mapSymbols(raw);
    expect(tree.map((s) => s.name)).toEqual(["b", "a"]);
    expect(tree[1].children[0].children[0]).toEqual({
      name: "deep",
      kind: "variable",
      range: pos(3, 0),
      children: [],
    });
  });
});

describe("mapSymbols — flat SymbolInformation[]", () => {
  it("maps to a single level using location.range.start as the jump target", () => {
    const raw: LspSymbolInformation[] = [
      { name: "User", kind: 5, location: { uri: "file:///a.rb", range: range(0, 6, 0, 10) } },
      {
        name: "greet",
        kind: 6,
        location: { uri: "file:///a.rb", range: range(1, 6, 1, 11) },
        containerName: "User",
      },
    ];
    const tree = mapSymbols(raw);
    expect(tree).toEqual([
      { name: "User", kind: "class", range: pos(0, 6), children: [] },
      { name: "greet", kind: "method", range: pos(1, 6), children: [] },
    ]);
  });
});

describe("mapSymbols — SymbolKind labels", () => {
  it("maps known kinds to their label and unknown kinds to a fallback", () => {
    const raw: LspSymbolInformation[] = [
      { name: "x", kind: 14, location: { uri: "u", range: range(0, 0, 0, 1) } }, // constant
      { name: "y", kind: 999, location: { uri: "u", range: range(0, 0, 0, 1) } }, // unknown
    ];
    const tree = mapSymbols(raw);
    expect(tree[0].kind).toBe("constant");
    expect(tree[1].kind).toBe("symbol");
  });
});

describe("mapSymbols — empty result", () => {
  it("returns an empty array for no symbols", () => {
    expect(mapSymbols([])).toEqual([]);
  });
});
