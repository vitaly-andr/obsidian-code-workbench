// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import * as http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CompanionDispatcher } from "../../src/mcp-http/dispatcher";
import { CompanionServer } from "../../src/mcp-http/server";
import { SessionManager } from "../../src/mcp-http/session";
import { registerReadTools } from "../../src/vault-tools/read";
import { ToolRegistry } from "../../src/vault-tools/registry";
import { registerWriteTools } from "../../src/vault-tools/write";
import { makeVaultContext, MockVault, stubApproval } from "../mocks/vault";

const TOKEN = "companion-token-abc";

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: { jsonrpc?: string; id?: unknown; result?: any; error?: any } | string | null;
}

function post(port: number, payload: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    const auth = "authorization" in headers ? {} : { Authorization: `Bearer ${TOKEN}` };
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...auth, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: Reply["body"] = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = text;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

describe("companion MCP transport (T012)", () => {
  let server: CompanionServer;
  let port: number;

  beforeAll(async () => {
    const vault = new MockVault();
    const ctx = makeVaultContext(vault, stubApproval({}), true);
    const registry = new ToolRegistry();
    registerReadTools(registry);
    registerWriteTools(registry);
    const dispatcher = new CompanionDispatcher(registry, new SessionManager(), ctx, {
      name: "obsidian-vault",
      version: "1.2.1",
    });
    server = new CompanionServer(dispatcher, TOKEN);
    port = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  async function initialize(proposed = "2025-11-25"): Promise<{ sessionId: string; result: any }> {
    const reply = await post(port, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: proposed } });
    const sessionId = String(reply.headers["mcp-session-id"]);
    return { sessionId, result: (reply.body as { result: any }).result };
  }

  it("initialize negotiates protocol, advertises capabilities + instructions, assigns a session", async () => {
    const { sessionId, result } = await initialize("2025-06-18");
    expect(result.protocolVersion).toBe("2025-06-18"); // echoed (within supported range)
    expect(result.capabilities.tools.listChanged).toBe(false);
    expect(typeof result.instructions).toBe("string");
    expect(result.instructions).toContain("Obsidian vault tools");
    expect(result.serverInfo.name).toBe("obsidian-vault");
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it("counters an unsupported (too-old) protocol version with the server max", async () => {
    const { result } = await initialize("2024-11-05");
    expect(result.protocolVersion).toBe("2025-11-25");
  });

  it("lists all 13 vault tools", async () => {
    const { sessionId } = await initialize();
    const reply = await post(
      port,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { "Mcp-Session-Id": sessionId },
    );
    const result = (reply.body as { result: any }).result;
    const names = result.tools.map((t: { name: string }) => t.name);
    expect(result.tools.length).toBe(13);
    expect(names).toContain("getBacklinks");
    expect(names).toContain("renameNote");
    // nextCursor must be a string or omitted — never null (the MCP client rejects null on its schema).
    expect(result.nextCursor ?? undefined).toBeUndefined();
  });

  it("answers ping with an empty result", async () => {
    const { sessionId } = await initialize();
    const reply = await post(port, { jsonrpc: "2.0", id: 3, method: "ping" }, { "Mcp-Session-Id": sessionId });
    expect((reply.body as { result: any }).result).toEqual({});
  });

  it("returns 202 for notifications/initialized", async () => {
    const reply = await post(port, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(reply.status).toBe(202);
    expect(reply.body).toBeNull();
  });

  it("rejects a missing/wrong token with 401", async () => {
    const reply = await post(port, { jsonrpc: "2.0", id: 4, method: "ping" }, { authorization: "Bearer wrong" });
    expect(reply.status).toBe(401);
  });

  it("rejects a non-loopback Origin with 403", async () => {
    const reply = await post(port, { jsonrpc: "2.0", id: 5, method: "ping" }, { Origin: "http://evil.example.com" });
    expect(reply.status).toBe(403);
  });

  it("rejects a non-initialize request without a valid session (404)", async () => {
    const reply = await post(port, { jsonrpc: "2.0", id: 6, method: "tools/list", params: {} });
    expect(reply.status).toBe(404);
  });

  it("returns -32601 for an unknown method", async () => {
    const { sessionId } = await initialize();
    const reply = await post(
      port,
      { jsonrpc: "2.0", id: 7, method: "does/not/exist" },
      { "Mcp-Session-Id": sessionId },
    );
    expect((reply.body as { error: any }).error.code).toBe(-32601);
  });

  it("rejects non-POST methods with 405", async () => {
    const reply = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "GET" }, (res) =>
        resolve(res.statusCode ?? 0),
      );
      req.on("error", reject);
      req.end();
    });
    expect(reply).toBe(405);
  });
});
