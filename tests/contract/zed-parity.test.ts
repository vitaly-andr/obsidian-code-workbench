// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { initializeResult, wrap } from "../../src/protocol/mcp";
import { TOOL_DESCRIPTORS } from "../../src/tools/registry";

// Byte-shape parity with the Zed claude_code_ide reference (T031).
describe("Zed reference parity (T031)", () => {
  it("initialize result matches the reference shape exactly", () => {
    expect(initializeResult("9.9.9")).toEqual({
      protocolVersion: "2024-11-05",
      capabilities: {
        logging: {},
        prompts: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        tools: { listChanged: true },
      },
      serverInfo: { name: "obsidian", version: "9.9.9" },
    });
  });

  it("publishes exactly the documented tool catalog", () => {
    const names = TOOL_DESCRIPTORS.map((t) => t.name).sort();
    expect(names).toEqual([
      "checkDocumentDirty",
      "closeAllDiffTabs",
      "getCurrentSelection",
      "getDiagnostics",
      "getLatestSelection",
      "getOpenEditors",
      "getWorkspaceFolders",
      "openDiff",
      "openFile",
      "saveDocument",
    ]);
  });

  it("§6.5 wrapper serializes the payload to a JSON string", () => {
    expect(wrap({ a: 1 })).toEqual({ content: [{ type: "text", text: '{"a":1}' }] });
  });
});
