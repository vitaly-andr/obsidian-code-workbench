// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// SC-008 / FR-026 contract test for the populated getDiagnostics behaviour
// (contracts/getdiagnostics-parity.md). Asserts:
//  1. each diagnostic renders to the GCC/Clang line `<path>:<line>:<col>: <severity>: <message>`
//     exactly, against our golden fixture;
//  2. the response SHAPE is the SPEC §7.5 special form `{ content: [ { type:"text", text } ] }`;
//  3. with the module off (no provider / exposeToAgent off), the response is `{ content: [] }`.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DiagnosticsBridge,
  renderDiagnosticLine,
  severityWord,
  type LspDiagnostic,
} from "../../src/lsp/diagnostics-bridge";
import { getDiagnostics, setDiagnosticsProvider } from "../../src/tools/diagnostics";

interface Case {
  name: string;
  path: string;
  diagnostic: LspDiagnostic;
  expected: string;
}
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/getdiagnostics.json", import.meta.url)), "utf8"),
) as { cases: Case[] };

// The documented GCC/Clang line: <path>:<line>:<col>: <severity>: <message>
const GCC_LINE = /^(.+):(\d+):(\d+): (error|warning|info|hint): (.*)$/;

afterEach(() => setDiagnosticsProvider(null));

describe("getDiagnostics format — golden fixture (SC-008)", () => {
  for (const c of fixture.cases) {
    it(`renders: ${c.name}`, () => {
      const line = renderDiagnosticLine(c.path, c.diagnostic);
      expect(line).toBe(c.expected);
      expect(line).toMatch(GCC_LINE);
    });
  }

  it("maps every LSP severity to the documented word", () => {
    expect(severityWord(1)).toBe("error");
    expect(severityWord(2)).toBe("warning");
    expect(severityWord(3)).toBe("info");
    expect(severityWord(4)).toBe("hint");
    expect(severityWord(undefined)).toBe("error");
  });
});

describe("getDiagnostics response shape (SPEC §7.5 special form)", () => {
  it("returns one text item per diagnostic, in the special form", () => {
    const bridge = new DiagnosticsBridge();
    bridge.record("file:///vault/src/foo.rb", [
      { range: { start: { line: 11, character: 4 } }, severity: 1, message: "undefined method 'bar'" },
      { range: { start: { line: 0, character: 0 } }, severity: 2, message: "imported but unused" },
    ]);
    // Provider renders with a vault-relative mapping, exactly as the controller installs it.
    setDiagnosticsProvider((uri) => bridge.render((abs) => abs.replace(/^\/vault\//, ""), uri));

    const res = getDiagnostics({});
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content).toHaveLength(2);
    for (const item of res.content) {
      expect(item.type).toBe("text");
      expect(typeof item.text).toBe("string");
      expect(item.text).toMatch(GCC_LINE);
    }
    expect(res.content[0].text).toBe("src/foo.rb:12:5: error: undefined method 'bar'");
  });

  it("filters to a single uri when one is given", () => {
    const bridge = new DiagnosticsBridge();
    bridge.record("file:///vault/a.rb", [{ range: { start: { line: 0, character: 0 } }, severity: 1, message: "a" }]);
    bridge.record("file:///vault/b.rb", [{ range: { start: { line: 0, character: 0 } }, severity: 1, message: "b" }]);
    setDiagnosticsProvider((uri) => bridge.render((abs) => abs.replace(/^\/vault\//, ""), uri));

    const res = getDiagnostics({ uri: "file:///vault/b.rb" });
    expect(res.content).toHaveLength(1);
    expect(res.content[0].text).toBe("b.rb:1:1: error: b");
  });
});

describe("getDiagnostics off = empty (no regression to existing parity)", () => {
  it("returns { content: [] } when no provider is installed (module off)", () => {
    setDiagnosticsProvider(null);
    expect(getDiagnostics({})).toEqual({ content: [] });
  });

  it("returns { content: [] } when exposeToAgent is off (provider yields nothing)", () => {
    // Mirrors the controller: provider returns [] when exposeToAgent is false.
    let exposeToAgent = false;
    const bridge = new DiagnosticsBridge();
    bridge.record("file:///vault/a.rb", [{ range: { start: { line: 0, character: 0 } }, severity: 1, message: "a" }]);
    setDiagnosticsProvider((uri) => (exposeToAgent ? bridge.render((a) => a, uri) : []));
    expect(getDiagnostics({})).toEqual({ content: [] });
    exposeToAgent = true;
    expect(getDiagnostics({}).content).toHaveLength(1);
  });
});
