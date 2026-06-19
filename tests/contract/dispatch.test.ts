// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { Dispatcher } from "../../src/protocol/jsonrpc";
import { CancelledError } from "../../src/protocol/errors";
import { makeContext } from "../mocks/context";

function reply(d: Dispatcher, msg: unknown): Promise<Record<string, unknown> | null> {
  return d.handle(JSON.stringify(msg)).then((s) => (s === null ? null : JSON.parse(s)));
}

describe("dispatcher + tool contracts (T018)", () => {
  it("initialize returns MCP 2024-11-05", async () => {
    const r = (await reply(new Dispatcher(makeContext()), { jsonrpc: "2.0", id: 1, method: "initialize" })) as any;
    expect(r.result.protocolVersion).toBe("2024-11-05");
    expect(r.result.serverInfo.name).toBe("obsidian");
  });

  it("§6.5 wrapper: getWorkspaceFolders payload is a JSON string in a text block", async () => {
    const r = (await reply(new Dispatcher(makeContext()), {
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "getWorkspaceFolders", arguments: {} },
    })) as any;
    expect(r.result.content[0].type).toBe("text");
    expect(typeof r.result.content[0].text).toBe("string");
    expect(JSON.parse(r.result.content[0].text).rootPath).toBe("/vault");
  });

  it("getDiagnostics special form is empty content", async () => {
    const r = (await reply(new Dispatcher(makeContext()), {
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "getDiagnostics", arguments: {} },
    })) as any;
    expect(r.result.content).toEqual([]);
  });

  it("openDiff Keep -> FILE_SAVED + final contents", async () => {
    const diffs = { openDiff: async () => ({ kept: true, content: "NEW" }), closeAll: () => 0 };
    const r = (await reply(new Dispatcher(makeContext(diffs)), {
      jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "openDiff", arguments: { old_file_path: "/vault/a.md", new_file_contents: "NEW" } },
    })) as any;
    expect(r.result.content).toEqual([{ type: "text", text: "FILE_SAVED" }, { type: "text", text: "NEW" }]);
  });

  it("openDiff Reject -> DIFF_REJECTED", async () => {
    const diffs = { openDiff: async () => ({ kept: false, content: "" }), closeAll: () => 0 };
    const r = (await reply(new Dispatcher(makeContext(diffs)), {
      jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "openDiff", arguments: { old_file_path: "/vault/x", new_file_contents: "y" } },
    })) as any;
    expect(r.result.content).toEqual([{ type: "text", text: "DIFF_REJECTED" }]);
  });

  it("openDiff rejects an old_file_path outside the vault (M1)", async () => {
    const diffs = { openDiff: async () => ({ kept: true, content: "NEW" }), closeAll: () => 0 };
    const r = (await reply(new Dispatcher(makeContext(diffs)), {
      jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "openDiff", arguments: { old_file_path: "/etc/passwd", new_file_contents: "y" } },
    })) as any;
    expect(r.error.code).toBe(-32600);
    expect(r.error.message).toMatch(/outside the vault/);
  });

  it("openDiff cancellation -> no response (§8.5)", async () => {
    const diffs = {
      openDiff: (_p: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new CancelledError()))),
      closeAll: () => 0,
    };
    const d = new Dispatcher(makeContext(diffs as never));
    const pending = reply(d, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "openDiff", arguments: { old_file_path: "/vault/x", new_file_contents: "y" } } });
    const cancelAck = await reply(d, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 6 } });
    expect(cancelAck).toBeNull();
    expect(await pending).toBeNull();
  });

  it("error codes: parse / method-not-found / missing arg", async () => {
    const d = new Dispatcher(makeContext());
    const parse = JSON.parse(await d.handle("{bad json"));
    expect(parse.error.code).toBe(-32700);
    const notFound = (await reply(d, { jsonrpc: "2.0", id: 7, method: "nope" })) as any;
    expect(notFound.error.code).toBe(-32601);
    const missing = (await reply(d, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "openDiff", arguments: {} } })) as any;
    expect(missing.error.code).toBe(-32600);
  });
});
