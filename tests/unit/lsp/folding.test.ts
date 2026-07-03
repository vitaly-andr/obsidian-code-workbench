// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { mapFoldingRanges, type LspFoldingRange } from "../../../src/lsp/folding";

describe("mapFoldingRanges — line-based (no character offsets)", () => {
  it("folds from the end of startLine to the end of endLine", () => {
    const doc = "function foo() {\n  return 1;\n}\n";
    // Line 0: "function foo() {" (16 chars); line 2: "}" (1 char, starting at offset 29).
    const raw: LspFoldingRange[] = [{ startLine: 0, endLine: 2 }];
    const ranges = mapFoldingRanges(raw, doc);
    expect(ranges).toEqual([{ from: 16, to: 30, kind: undefined }]);
    // Sanity: from lands right after "{", to lands right after the closing "}".
    expect(doc.slice(0, 16)).toBe("function foo() {");
    expect(doc.slice(0, 30)).toBe("function foo() {\n  return 1;\n}");
  });
});

describe("mapFoldingRanges — character offsets honored", () => {
  it("uses startCharacter/endCharacter when the server provides them", () => {
    const doc = "const x = { a: 1, b: 2 };\n";
    const raw: LspFoldingRange[] = [{ startLine: 0, startCharacter: 11, endLine: 0, endCharacter: 24 }];
    expect(mapFoldingRanges(raw, doc)).toEqual([{ from: 11, to: 24, kind: undefined }]);
  });

  it("mixes a character offset on one side with a whole-line default on the other", () => {
    const doc = "a(\n  1,\n  2\n);\n";
    const raw: LspFoldingRange[] = [{ startLine: 0, startCharacter: 2, endLine: 2 }];
    const [range] = mapFoldingRanges(raw, doc);
    expect(range.from).toBe(2);
    expect(doc.slice(0, range.to)).toBe("a(\n  1,\n  2");
  });
});

describe("mapFoldingRanges — kind carried through", () => {
  it("carries a known kind", () => {
    const doc = "// a\n// b\n// c\n";
    const raw: LspFoldingRange[] = [{ startLine: 0, endLine: 2, kind: "comment" }];
    expect(mapFoldingRanges(raw, doc)[0].kind).toBe("comment");
  });

  it("carries an absent kind as undefined (still foldable, FR-007)", () => {
    const doc = "a\nb\nc\n";
    const raw: LspFoldingRange[] = [{ startLine: 0, endLine: 2 }];
    expect(mapFoldingRanges(raw, doc)[0].kind).toBeUndefined();
  });
});

describe("mapFoldingRanges — multibyte offsets", () => {
  it("is correct past a multibyte (astral) character earlier in the document", () => {
    // "😀" is a surrogate pair (2 UTF-16 code units), matching offsets.ts's own convention.
    const doc = "# 😀 comment\nfunction foo() {\n  return 1;\n}\n";
    const raw: LspFoldingRange[] = [{ startLine: 1, endLine: 3 }];
    const [range] = mapFoldingRanges(raw, doc);
    const lineOneStart = doc.indexOf("function");
    expect(range.from).toBe(lineOneStart + "function foo() {".length);
  });
});

describe("mapFoldingRanges — dropped ranges", () => {
  it("drops a range whose line no longer exists in the current (shrunk) document", () => {
    const doc = "a\n"; // one line only
    const raw: LspFoldingRange[] = [{ startLine: 0, endLine: 5 }]; // line 5 does not exist anymore
    expect(mapFoldingRanges(raw, doc)).toEqual([]);
  });

  it("drops a range whose character offset is past the end of a (now-shorter) line", () => {
    const doc = "ab\ncd\n";
    const raw: LspFoldingRange[] = [{ startLine: 0, startCharacter: 50, endLine: 1 }];
    expect(mapFoldingRanges(raw, doc)).toEqual([]);
  });

  it("drops a degenerate range (to <= from, nothing to hide)", () => {
    const doc = "a\nb\nc\n";
    // startLine and endLine both 0, no character offsets -> from === to (both "end of line 0").
    const raw: LspFoldingRange[] = [{ startLine: 0, endLine: 0 }];
    expect(mapFoldingRanges(raw, doc)).toEqual([]);
  });
});

describe("mapFoldingRanges — empty result", () => {
  it("returns an empty array for no ranges", () => {
    expect(mapFoldingRanges([], "a\nb\n")).toEqual([]);
  });
});
