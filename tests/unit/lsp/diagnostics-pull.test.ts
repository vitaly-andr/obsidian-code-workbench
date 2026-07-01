// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { lspToCmDiagnostic } from "../../../src/lsp/extensions";

// US1/FR-026 pull diagnostics: the LSP→CM6 mapping (offsets.ts positions + severity word). The request
// loop / capability gate is verified live; this covers the per-diagnostic transform that is easy to
// get wrong (multibyte offsets, severity, missing end).
describe("lspToCmDiagnostic — LSP pull diagnostic → CM6 lint diagnostic", () => {
  const doc = "def foo\n  bar\nend\n";

  it("maps the range to UTF-16 offsets and the severity word", () => {
    // "bar" sits on line 1 (0-based), characters 2..5.
    const d = lspToCmDiagnostic(doc, {
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } },
      severity: 2,
      message: "undefined local variable bar",
    });
    expect(doc.slice(d.from, d.to)).toBe("bar");
    expect(d.severity).toBe("warning");
    expect(d.message).toBe("undefined local variable bar");
  });

  it("defaults severity to error when absent and collapses a missing end", () => {
    const d = lspToCmDiagnostic(doc, { range: { start: { line: 0, character: 0 } }, message: "x" });
    expect(d.severity).toBe("error");
    expect(d.from).toBe(0);
    expect(d.to).toBe(0);
  });

  it("maps multibyte (emoji) positions correctly — UTF-16 units (SC-007)", () => {
    const m = "x = '🙂'\n"; // 🙂 is two UTF-16 code units at indices 5..7
    const d = lspToCmDiagnostic(m, {
      range: { start: { line: 0, character: 5 }, end: { line: 0, character: 7 } },
      severity: 1,
      message: "emoji",
    });
    expect(m.slice(d.from, d.to)).toBe("🙂");
  });

  it("maps every LSP severity to its CM6 word", () => {
    const r = { range: { start: { line: 0, character: 0 } }, message: "m" };
    expect(lspToCmDiagnostic(doc, { ...r, severity: 1 }).severity).toBe("error");
    expect(lspToCmDiagnostic(doc, { ...r, severity: 2 }).severity).toBe("warning");
    expect(lspToCmDiagnostic(doc, { ...r, severity: 3 }).severity).toBe("info");
    expect(lspToCmDiagnostic(doc, { ...r, severity: 4 }).severity).toBe("hint");
  });
});