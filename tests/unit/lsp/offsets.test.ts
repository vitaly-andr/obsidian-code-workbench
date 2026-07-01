// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import {
  lspPositionToOffset,
  offsetToLspPosition,
  toOneBased,
} from "../../../src/lsp/offsets";

describe("lspPositionToOffset / offsetToLspPosition — round trip", () => {
  it("maps simple ASCII positions", () => {
    const text = "def foo\n  bar\nend\n";
    expect(lspPositionToOffset(text, { line: 0, character: 4 })).toBe(4); // 'f' of foo
    expect(lspPositionToOffset(text, { line: 1, character: 2 })).toBe(10); // 'b' of bar
    expect(offsetToLspPosition(text, 10)).toEqual({ line: 1, character: 2 });
  });

  it("is correct after Cyrillic text (BMP, 1 UTF-16 unit each)", () => {
    // "привет" is 6 code units; the diagnostic points at the char right after it on the same line.
    const text = "x = 'привет' + y\n";
    const offset = lspPositionToOffset(text, { line: 0, character: 12 });
    // offset 12 = after the closing quote of the Cyrillic string literal.
    expect(text[offset]).toBe(" ");
    expect(offsetToLspPosition(text, offset)).toEqual({ line: 0, character: 12 });
  });

  it("is correct after CJK text", () => {
    const text = "label = '日本語'\n";
    // '日本語' = 3 code units; position after the three CJK chars + closing quote.
    const offset = lspPositionToOffset(text, { line: 0, character: 13 });
    expect(text.slice(0, offset)).toBe("label = '日本語'");
    expect(offsetToLspPosition(text, offset)).toEqual({ line: 0, character: 13 });
  });

  it("treats an emoji as two UTF-16 code units (surrogate pair), like the server", () => {
    const text = "s = '🚀'\n";
    // '🚀' occupies characters 5 and 6 (two code units). The char after the emoji is the quote at 7.
    const offset = lspPositionToOffset(text, { line: 0, character: 7 });
    expect(text[offset]).toBe("'");
    // And the position of the closing quote round-trips.
    expect(offsetToLspPosition(text, offset)).toEqual({ line: 0, character: 7 });
  });

  it("maps positions on a line that follows a multibyte line", () => {
    const text = "コメント\nvalue = 42\n";
    const offset = lspPositionToOffset(text, { line: 1, character: 8 });
    expect(text.slice(offset, offset + 2)).toBe("42");
    expect(offsetToLspPosition(text, offset)).toEqual({ line: 1, character: 8 });
  });

  it("clamps out-of-range lines and characters", () => {
    const text = "a\nbb\n";
    expect(lspPositionToOffset(text, { line: 99, character: 0 })).toBe(text.length);
    expect(lspPositionToOffset(text, { line: -1, character: 0 })).toBe(0);
    // A character past the end of a line clamps to the line end (before the newline's next line).
    expect(lspPositionToOffset(text, { line: 1, character: 99 })).toBe(4);
  });

  it("handles CRLF line endings (the \\r stays on the preceding line)", () => {
    const text = "one\r\ntwo\r\n";
    // Line 1 starts after the first \n (index 5); 't' of "two".
    expect(lspPositionToOffset(text, { line: 1, character: 0 })).toBe(5);
    expect(text[5]).toBe("t");
  });
});

describe("toOneBased", () => {
  it("converts 0-based LSP position to 1-based line/column", () => {
    expect(toOneBased({ line: 0, character: 0 })).toEqual({ line: 1, column: 1 });
    expect(toOneBased({ line: 4, character: 9 })).toEqual({ line: 5, column: 10 });
  });
});
