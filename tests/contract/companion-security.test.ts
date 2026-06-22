// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import * as http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CompanionDispatcher } from "../../src/mcp-http/dispatcher";
import { CompanionServer } from "../../src/mcp-http/server";
import { SessionManager } from "../../src/mcp-http/session";
import { createNote } from "../../src/vault-tools/write/create-note";
import { deleteNote } from "../../src/vault-tools/write/delete-note";
import { renameNote } from "../../src/vault-tools/write/rename-note";
import { registerReadTools } from "../../src/vault-tools/read";
import { ToolRegistry } from "../../src/vault-tools/registry";
import { registerWriteTools } from "../../src/vault-tools/write";
import { ToolResult } from "../../src/vault-tools/types";
import { makeVaultContext, MockVault, stubApproval } from "../mocks/vault";

const TOKEN = "security-token-xyz";
const signal = new AbortController().signal;
function out(result: ToolResult): any {
  return JSON.parse(result.content[0].text);
}

function rawPost(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
    const req = http.request(
      { host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { "Content-Type": "application/json", ...headers } },
      (res) => {
        res.on("data", () => undefined);
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

describe("companion security surface (T038)", () => {
  describe("transport gates", () => {
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

    it("rejects a non-loopback Origin with 403", async () => {
      expect(await rawPost(port, { Authorization: `Bearer ${TOKEN}`, Origin: "http://attacker.example" })).toBe(403);
    });

    it("rejects a missing token with 401 (even on loopback)", async () => {
      expect(await rawPost(port, {})).toBe(401);
    });

    it("rejects a wrong token with 401", async () => {
      expect(await rawPost(port, { Authorization: "Bearer nope" })).toBe(401);
    });
  });

  describe("write safety", () => {
    it("refuses writes outside the vault boundary", async () => {
      const vault = new MockVault();
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true, confirmApproved: true }));
      expect(out(await createNote({ path: "../../etc/evil.md" }, ctx, signal))).toEqual({ error: "invalid path" });
      vault.addFile("Note.md");
      expect(out(await renameNote({ path: "Note.md", newPath: "../escape.md" }, ctx, signal))).toEqual({
        error: "invalid path",
      });
      // Nothing left the vault API.
      expect(vault.created).toEqual([]);
      expect(vault.renamed).toEqual([]);
    });

    it("deletes only to trash (recoverable), never a permanent unlink", async () => {
      const vault = new MockVault();
      vault.addFile("Doomed.md");
      const ctx = makeVaultContext(vault, stubApproval({ confirmApproved: true }));
      const res = out(await deleteNote({ path: "Doomed.md" }, ctx, signal));
      expect(res.trashed).toBe(true);
      expect(vault.trashed).toEqual(["Doomed.md"]);
    });

    it("a cancelled approval leaves the vault unchanged", async () => {
      const vault = new MockVault();
      vault.addFile("Keep.md", { content: "original" });
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: false, confirmApproved: false }));
      expect(out(await createNote({ path: "New.md", content: "x" }, ctx, signal))).toEqual({ cancelled: true });
      expect(out(await deleteNote({ path: "Keep.md" }, ctx, signal))).toEqual({ cancelled: true });
      expect(vault.created).toEqual([]);
      expect(vault.trashed).toEqual([]);
      expect(vault.content.get("Keep.md")).toBe("original");
    });
  });
});
