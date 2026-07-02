// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { mapInlayHints, type LspInlayHint } from "../../../src/lsp/inlay";

function pos(line: number, character: number) {
  return { line, character };
}

describe("mapInlayHints — kinds", () => {
  const doc = "total := 1\ndouble(3)\n";

  it("maps kind 1 to type, kind 2 to parameter, and a missing kind to other", () => {
    const raw: LspInlayHint[] = [
      { position: pos(0, 5), label: ": int", kind: 1 },
      { position: pos(1, 8), label: "n:", kind: 2 },
      { position: pos(0, 0), label: "?" }, // no kind
    ];
    const kinds = mapInlayHints(raw, doc).map((h) => h.kind);
    expect(kinds).toEqual(["type", "parameter", "other"]);
  });
});

describe("mapInlayHints — labels", () => {
  it("uses a string label as-is", () => {
    const raw: LspInlayHint[] = [{ position: pos(0, 5), label: ": int", kind: 1 }];
    expect(mapInlayHints(raw, "total := 1\n")[0].label).toBe(": int");
  });

  it("flattens an InlayHintLabelPart[] by concatenating each part's value", () => {
    const raw: LspInlayHint[] = [
      { position: pos(0, 5), label: [{ value: ": " }, { value: "int" }], kind: 1 },
    ];
    expect(mapInlayHints(raw, "total := 1\n")[0].label).toBe(": int");
  });
});

describe("mapInlayHints — padding", () => {
  it("carries paddingLeft/paddingRight when present", () => {
    const raw: LspInlayHint[] = [
      { position: pos(0, 8), label: "n:", kind: 2, paddingLeft: true, paddingRight: false },
    ];
    const [hint] = mapInlayHints(raw, "double(3)\n");
    expect(hint.paddingLeft).toBe(true);
    expect(hint.paddingRight).toBe(false);
  });

  it("defaults both padding flags to false when absent", () => {
    const raw: LspInlayHint[] = [{ position: pos(0, 5), label: ": int", kind: 1 }];
    const [hint] = mapInlayHints(raw, "total := 1\n");
    expect(hint.paddingLeft).toBe(false);
    expect(hint.paddingRight).toBe(false);
  });
});

describe("mapInlayHints — offsets", () => {
  it("computes the correct offset on a single line", () => {
    const doc = "total := 1\n";
    const raw: LspInlayHint[] = [{ position: pos(0, 5), label: ": int", kind: 1 }];
    expect(mapInlayHints(raw, doc)[0].offset).toBe(5);
  });

  it("is correct past a multibyte (astral) character earlier in the document", () => {
    // "😀" is a surrogate pair (2 UTF-16 code units), matching offsets.ts's own convention.
    const doc = "# 😀 comment\ntotal := 1\n";
    const raw: LspInlayHint[] = [{ position: pos(1, 5), label: ": int", kind: 1 }];
    const lineOneStart = doc.indexOf("total");
    expect(mapInlayHints(raw, doc)[0].offset).toBe(lineOneStart + 5);
  });
});

describe("mapInlayHints — stale position dropped", () => {
  it("drops a hint whose line no longer exists in the current (shrunk) document", () => {
    const doc = "a := 1\n"; // one line only
    const raw: LspInlayHint[] = [
      { position: pos(0, 1), label: ": int", kind: 1 }, // still valid
      { position: pos(5, 0), label: ": int", kind: 1 }, // line 5 does not exist anymore
    ];
    const hints = mapInlayHints(raw, doc);
    expect(hints).toHaveLength(1);
    expect(hints[0].offset).toBe(1);
  });
});

describe("mapInlayHints — empty result", () => {
  it("returns an empty array for no hints", () => {
    expect(mapInlayHints([], "total := 1\n")).toEqual([]);
  });
});
