// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { IdeServer } from "../../src/server/websocket-server";
import { makeContext } from "../mocks/context";

const TOKEN = "push-token";

// IDE -> CLI push notifications (extension beyond the Zed reference).
describe("push notifications", () => {
  it("broadcasts selection_changed to connected clients", async () => {
    const server = new IdeServer(makeContext(), TOKEN);
    const port = await server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { "x-claude-code-ide-authorization": TOKEN },
    });
    await new Promise<void>((res, rej) => {
      ws.on("open", () => res());
      ws.on("error", rej);
    });

    const received = new Promise<any>((resolve) => ws.on("message", (d) => resolve(JSON.parse(String(d)))));
    server.broadcast({
      jsonrpc: "2.0",
      method: "selection_changed",
      params: { selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, text: "test", filePath: "/v/a.md" },
    });
    const msg = await received;

    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.id).toBeUndefined(); // a notification has no id
    expect(msg.method).toBe("selection_changed");
    expect(msg.params.text).toBe("test");
    expect(msg.params.selection.end.character).toBe(4);

    ws.close();
    await server.stop();
  });
});
