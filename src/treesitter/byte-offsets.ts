// tree-sitter reports positions as UTF-8 byte offsets (it parses UTF-8 text). CodeMirror
// addresses the document in UTF-16 code units (JS string indices). The two coincide for ASCII
// but diverge on any multi-byte text (cyrillic, CJK, emoji), so every offset that crosses from
// the parse tree into the editor must be translated. This module builds that map once per parse.

// Builds a translator from UTF-8 byte offset -> UTF-16 code-unit index for `text`.
// One linear pass; lookups are O(log n) via binary search over the prefix-byte table.
export function makeByteToChar(text: string): (byteOffset: number) => number {
  const len = text.length;
  // byteAt[i] = number of UTF-8 bytes in text.slice(0, i). Length len+1 so the end is addressable.
  const byteAt = new Uint32Array(len + 1);
  let bytes = 0;
  for (let i = 0; i < len; i++) {
    byteAt[i] = bytes;
    const c = text.charCodeAt(i);
    if (c < 0x80) {
      bytes += 1;
    } else if (c < 0x800) {
      bytes += 2;
    } else if (
      c >= 0xd800 &&
      c <= 0xdbff &&
      i + 1 < len &&
      text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff
    ) {
      // A surrogate pair is one code point of 4 UTF-8 bytes spanning two UTF-16 units.
      bytes += 4;
      byteAt[++i] = bytes;
    } else {
      // BMP char (3 bytes), or a lone surrogate which tree-sitter never splits — treat as 3.
      bytes += 3;
    }
  }
  byteAt[len] = bytes;
  const totalBytes = bytes;

  // Largest code-unit index i with byteAt[i] <= byteOffset. tree-sitter never points inside a
  // code point, so a byte offset always lands on a unit boundary.
  return (byteOffset: number): number => {
    if (byteOffset <= 0) return 0;
    if (byteOffset >= totalBytes) return len;
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (byteAt[mid] <= byteOffset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

// UTF-8 byte length of a JS string — the size tree-sitter sees. Useful for bounds/guards.
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
