// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { makeByteToChar, utf8ByteLength } from "../../src/treesitter/byte-offsets";

describe("byte-offset mapping (tree-sitter UTF-8 -> CodeMirror UTF-16)", () => {
  it("is identity for ASCII", () => {
    const m = makeByteToChar("abc");
    expect(m(0)).toBe(0);
    expect(m(1)).toBe(1);
    expect(m(3)).toBe(3);
    expect(utf8ByteLength("abc")).toBe(3);
  });

  it("handles 2-byte code points (cyrillic, latin-1)", () => {
    // "café" -> c a f é(U+00E9, 2 bytes). char indices 0..4, byte offsets 0..5.
    const m = makeByteToChar("café");
    expect(utf8ByteLength("café")).toBe(5);
    expect(m(3)).toBe(3); // start of é (byte 3 -> char 3)
    expect(m(5)).toBe(4); // end of string
    const cyr = "привет";
    expect(utf8ByteLength(cyr)).toBe(12); // 6 chars * 2 bytes
    expect(makeByteToChar(cyr)(12)).toBe(6);
  });

  it("handles 3-byte code points (CJK)", () => {
    const m = makeByteToChar("日本");
    expect(utf8ByteLength("日本")).toBe(6);
    expect(m(0)).toBe(0);
    expect(m(3)).toBe(1); // second char starts at byte 3
    expect(m(6)).toBe(2);
  });

  it("handles 4-byte surrogate pairs (emoji)", () => {
    // "a😀b": a(1B) 😀(U+1F600, 4B over 2 UTF-16 units) b(1B). chars: a@0, hi@1, lo@2, b@3.
    const text = "a😀b";
    expect(text.length).toBe(4);
    expect(utf8ByteLength(text)).toBe(6);
    const m = makeByteToChar(text);
    expect(m(0)).toBe(0); // a
    expect(m(1)).toBe(1); // emoji start = code unit 1
    expect(m(5)).toBe(3); // 'b' after the 4-byte emoji
    expect(m(6)).toBe(4); // end
  });

  it("clamps out-of-range offsets", () => {
    const m = makeByteToChar("hi");
    expect(m(-5)).toBe(0);
    expect(m(999)).toBe(2);
  });
});
