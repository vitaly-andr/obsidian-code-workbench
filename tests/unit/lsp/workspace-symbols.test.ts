// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { mapWorkspaceSymbols, type LspWorkspaceSymbol } from "../../../src/lsp/workspace-symbols";

function pos(line: number, character: number) {
  return { line, character };
}

function range(startLine: number, startChar: number, endLine: number, endChar: number) {
  return { start: pos(startLine, startChar), end: pos(endLine, endChar) };
}

describe("mapWorkspaceSymbols — SymbolInformation shape (always a range)", () => {
  it("maps name/kind/containerName/uri/range through", () => {
    const raw: LspWorkspaceSymbol[] = [
      {
        name: "User",
        kind: 5,
        containerName: "models",
        location: { uri: "file:///vault/proj/user.rb", range: range(0, 0, 10, 3) },
      },
    ];
    expect(mapWorkspaceSymbols(raw)).toEqual([
      {
        name: "User",
        kind: 5,
        containerName: "models",
        uri: "file:///vault/proj/user.rb",
        range: range(0, 0, 10, 3),
      },
    ]);
  });
});

describe("mapWorkspaceSymbols — WorkspaceSymbol (3.17) shapes", () => {
  it("maps a Location form (with range)", () => {
    const raw: LspWorkspaceSymbol[] = [
      { name: "greet", kind: 6, location: { uri: "file:///vault/proj/user.rb", range: range(1, 2, 1, 20) } },
    ];
    expect(mapWorkspaceSymbols(raw)[0].range).toEqual(range(1, 2, 1, 20));
  });

  it("maps the URI-only form with no range", () => {
    const raw: LspWorkspaceSymbol[] = [{ name: "greet", kind: 6, location: { uri: "file:///vault/proj/user.rb" } }];
    const [item] = mapWorkspaceSymbols(raw);
    expect(item.uri).toBe("file:///vault/proj/user.rb");
    expect(item.range).toBeUndefined();
  });
});

describe("mapWorkspaceSymbols — missing containerName", () => {
  it("leaves containerName undefined when the server omits it (no error)", () => {
    const raw: LspWorkspaceSymbol[] = [{ name: "top", kind: 12, location: { uri: "file:///a.rb" } }];
    expect(mapWorkspaceSymbols(raw)[0].containerName).toBeUndefined();
  });
});

describe("mapWorkspaceSymbols — malformed entries dropped", () => {
  it("drops an entry with no name", () => {
    const raw = [{ kind: 5, location: { uri: "file:///a.rb" } }] as unknown as LspWorkspaceSymbol[];
    expect(mapWorkspaceSymbols(raw)).toEqual([]);
  });

  it("drops an entry with no location", () => {
    const raw: LspWorkspaceSymbol[] = [{ name: "orphan", kind: 5 }];
    expect(mapWorkspaceSymbols(raw)).toEqual([]);
  });

  it("drops an entry whose location has no uri", () => {
    const raw = [{ name: "x", kind: 5, location: {} }] as unknown as LspWorkspaceSymbol[];
    expect(mapWorkspaceSymbols(raw)).toEqual([]);
  });
});

describe("mapWorkspaceSymbols — order preserved", () => {
  it("keeps the server's own ranking, mixing valid and malformed entries", () => {
    const raw = [
      { name: "b", kind: 6, location: { uri: "file:///a.rb" } },
      { kind: 5, location: { uri: "file:///bad.rb" } }, // malformed — dropped, no gap in the rest
      { name: "a", kind: 12, location: { uri: "file:///c.rb" } },
    ] as unknown as LspWorkspaceSymbol[];
    expect(mapWorkspaceSymbols(raw).map((i) => i.name)).toEqual(["b", "a"]);
  });
});

describe("mapWorkspaceSymbols — empty / null", () => {
  it("returns an empty array for an empty response", () => {
    expect(mapWorkspaceSymbols([])).toEqual([]);
  });

  it("returns an empty array for a null response", () => {
    expect(mapWorkspaceSymbols(null)).toEqual([]);
  });

  it("returns an empty array for an undefined response", () => {
    expect(mapWorkspaceSymbols(undefined)).toEqual([]);
  });
});
