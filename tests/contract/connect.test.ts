// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { IdeServer } from "../../src/server/websocket-server";
import { makeContext } from "../mocks/context";

const TOKEN = "test-token-123";

function call(ws: WebSocket, msg: { id: number; method: string; params?: unknown }): Promise<any> {
  return new Promise((resolve) => {
    const onMessage = (data: unknown) => {
      const parsed = JSON.parse(String(data));
      if (parsed.id === msg.id) {
        ws.off("message", onMessage);
        resolve(parsed);
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ jsonrpc: "2.0", ...msg }));
  });
}

describe("connection handshake (T013)", () => {
  it("authenticates, initializes, lists tools, returns the workspace root", async () => {
    const server = new IdeServer(makeContext(), TOKEN);
    const port = await server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { "x-claude-code-ide-authorization": TOKEN },
    });
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    const init = await call(ws, { id: 1, method: "initialize", params: {} });
    expect(init.result.protocolVersion).toBe("2024-11-05");

    const list = await call(ws, { id: 2, method: "tools/list", params: {} });
    const names = list.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("openDiff");
    expect(names).toContain("getCurrentSelection");
    expect(list.result.tools.length).toBe(10);

    const wsf = await call(ws, { id: 3, method: "tools/call", params: { name: "getWorkspaceFolders", arguments: {} } });
    expect(JSON.parse(wsf.result.content[0].text).rootPath).toBe("/vault");

    ws.close();
    await server.stop();
  });

  it("rejects a missing/wrong token with 401", async () => {
    const server = new IdeServer(makeContext(), TOKEN);
    const port = await server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { "x-claude-code-ide-authorization": "wrong" },
    });
    const rejected = await new Promise<boolean>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode === 401));
      ws.on("open", () => resolve(false));
      ws.on("error", () => resolve(true));
    });
    expect(rejected).toBe(true);
    await server.stop();
  });
});
