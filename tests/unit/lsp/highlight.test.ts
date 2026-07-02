// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { mapHighlights, type LspDocumentHighlight } from "../../../src/lsp/highlight";

function pos(line: number, character: number) {
  return { line, character };
}

function range(startLine: number, startChar: number, endLine: number, endChar: number) {
  return { start: pos(startLine, startChar), end: pos(endLine, endChar) };
}

describe("mapHighlights — kinds", () => {
  const doc = "value = 1\nputs value\nputs value\n";

  it("maps kind 3 to write, kind 2 to read, and a missing kind to text", () => {
    const raw: LspDocumentHighlight[] = [
      { range: range(0, 0, 0, 5), kind: 3 },
      { range: range(1, 5, 1, 10), kind: 2 },
      { range: range(2, 5, 2, 10) }, // no kind
    ];
    const spans = mapHighlights(raw, doc);
    expect(spans.map((s) => s.kind)).toEqual(["write", "read", "text"]);
  });

  it("maps kind 1 (Text) to text explicitly", () => {
    const raw: LspDocumentHighlight[] = [{ range: range(0, 0, 0, 5), kind: 1 }];
    expect(mapHighlights(raw, doc)[0].kind).toBe("text");
  });
});

describe("mapHighlights — offsets", () => {
  it("computes correct from/to offsets on a single line", () => {
    const doc = "value = 1\n";
    const raw: LspDocumentHighlight[] = [{ range: range(0, 0, 0, 5), kind: 3 }];
    const spans = mapHighlights(raw, doc);
    expect(spans).toEqual([{ from: 0, to: 5, kind: "write" }]);
  });

  it("is correct past a multibyte (astral) character earlier in the document (SC-007-style)", () => {
    // "😀" is a surrogate pair (2 UTF-16 code units), matching offsets.ts's own convention.
    const doc = "# 😀 comment\nvalue = 1\n";
    // Line 1, "value" starts at character 0.
    const raw: LspDocumentHighlight[] = [{ range: range(1, 0, 1, 5), kind: 2 }];
    const spans = mapHighlights(raw, doc);
    const lineOneStart = doc.indexOf("value");
    expect(spans).toEqual([{ from: lineOneStart, to: lineOneStart + 5, kind: "read" }]);
  });
});

describe("mapHighlights — stale / out-of-range spans", () => {
  it("drops a span whose line no longer exists in the current (shrunk) document", () => {
    const doc = "a = 1\n"; // one line only
    const raw: LspDocumentHighlight[] = [
      { range: range(0, 0, 0, 1), kind: 3 }, // still valid
      { range: range(5, 0, 5, 3), kind: 2 }, // line 5 does not exist anymore
    ];
    const spans = mapHighlights(raw, doc);
    expect(spans).toEqual([{ from: 0, to: 1, kind: "write" }]);
  });

  it("drops a span whose character is past the end of its (now-shorter) line", () => {
    const doc = "ab\n";
    const raw: LspDocumentHighlight[] = [{ range: range(0, 0, 0, 50), kind: 3 }];
    expect(mapHighlights(raw, doc)).toEqual([]);
  });
});

describe("mapHighlights — empty result", () => {
  it("returns an empty array for no highlights", () => {
    expect(mapHighlights([], "value = 1\n")).toEqual([]);
  });
});
