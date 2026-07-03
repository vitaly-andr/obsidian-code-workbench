// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { decodeSemanticTokens, type SemanticTokensLegend } from "../../../src/lsp/semantic-tokens";

const LEGEND: SemanticTokensLegend = {
  tokenTypes: ["variable", "function"],
  tokenModifiers: ["declaration", "readonly"],
};

describe("decodeSemanticTokens — relative encoding", () => {
  it("decodes two tokens on the same line, deltaStartChar relative to the previous token's start", () => {
    const doc = "aa bb\n";
    // token1: line0 char0 len2 type0(variable) mods0; token2: same line, absolute char3, len2, type0
    const data = [0, 0, 2, 0, 0, 0, 3, 2, 0, 0];
    const spans = decodeSemanticTokens(data, LEGEND, doc);
    expect(spans).toEqual([
      { from: 0, to: 2, type: "variable", modifiers: [] },
      { from: 3, to: 5, type: "variable", modifiers: [] },
    ]);
  });

  it("resets the character cursor to the absolute deltaStartChar on a new line (deltaLine > 0)", () => {
    const doc = "aa\nbb\n";
    // token1: line0 char0 len2; token2: deltaLine1 (new line), absolute char0, len2
    const data = [0, 0, 2, 0, 0, 1, 0, 2, 0, 0];
    const spans = decodeSemanticTokens(data, LEGEND, doc);
    expect(spans).toEqual([
      { from: 0, to: 2, type: "variable", modifiers: [] },
      { from: 3, to: 5, type: "variable", modifiers: [] }, // line 1 starts at offset 3
    ]);
  });

  it("accumulates deltaLine across more than one line jump", () => {
    const doc = "a\nb\nfoo\n";
    // token1 on line0 char0 len1; token2 two lines later (deltaLine2) at char0 len3 ("foo" on line2)
    const data = [0, 0, 1, 0, 0, 2, 0, 3, 1, 0];
    const spans = decodeSemanticTokens(data, LEGEND, doc);
    expect(spans[1]).toEqual({ from: 4, to: 7, type: "function", modifiers: [] });
  });
});

describe("decodeSemanticTokens — type and modifier resolution", () => {
  it("resolves tokenType and every set modifier bit from the legend", () => {
    const doc = "value\n";
    // type index 1 ("function"), modifiers bits 0+1 set (0b11 = 3) -> ["declaration", "readonly"]
    const data = [0, 0, 5, 1, 3];
    const spans = decodeSemanticTokens(data, LEGEND, doc);
    expect(spans).toEqual([{ from: 0, to: 5, type: "function", modifiers: ["declaration", "readonly"] }]);
  });

  it("resolves a single modifier bit", () => {
    const doc = "value\n";
    const data = [0, 0, 5, 0, 2]; // bit 1 only -> "readonly"
    expect(decodeSemanticTokens(data, LEGEND, doc)[0].modifiers).toEqual(["readonly"]);
  });

  it("drops a span whose tokenType index is out of range for the legend", () => {
    const doc = "value\n";
    const data = [0, 0, 5, 99, 0]; // no legend.tokenTypes[99]
    expect(decodeSemanticTokens(data, LEGEND, doc)).toEqual([]);
  });
});

describe("decodeSemanticTokens — offsets", () => {
  it("is correct past a multibyte (astral) character earlier in the document", () => {
    // "😀" is a surrogate pair (2 UTF-16 code units), matching offsets.ts's own convention.
    const doc = "# 😀 comment\nvalue\n";
    const lineOneStart = doc.indexOf("value");
    const data = [1, 0, 5, 0, 0]; // deltaLine 1 (new line), char 0, length 5
    expect(decodeSemanticTokens(data, LEGEND, doc)).toEqual([
      { from: lineOneStart, to: lineOneStart + 5, type: "variable", modifiers: [] },
    ]);
  });
});

describe("decodeSemanticTokens — stale position dropped", () => {
  it("drops a token whose line no longer exists in the current (shrunk) document", () => {
    const doc = "a\n"; // one line only
    // token1 valid (line0 char0 len1); token2 on line5, which does not exist anymore
    const data = [0, 0, 1, 0, 0, 5, 0, 1, 0, 0];
    const spans = decodeSemanticTokens(data, LEGEND, doc);
    expect(spans).toEqual([{ from: 0, to: 1, type: "variable", modifiers: [] }]);
  });
});

describe("decodeSemanticTokens — empty result", () => {
  it("returns an empty array for no tokens", () => {
    expect(decodeSemanticTokens([], LEGEND, "value\n")).toEqual([]);
  });
});
