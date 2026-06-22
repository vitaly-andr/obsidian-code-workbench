// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompanionConfig } from "../../src/server/companion-config";

describe("companion auto-config (T035)", () => {
  let root: string;
  let pluginDir: string;
  let vaultRoot: string;
  let config: CompanionConfig;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "cw-companion-"));
    pluginDir = path.join(root, "plugin");
    vaultRoot = path.join(root, "vault");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.mkdir(vaultRoot, { recursive: true });
    config = new CompanionConfig({ pluginDir, vaultRoot });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writes a 0600 token store and reads it back", async () => {
    await config.writeTokenStore({ port: 5000, authToken: "tok-1" });
    expect(await config.readTokenStore()).toEqual({ port: 5000, authToken: "tok-1" });
    if (process.platform !== "win32") {
      const stat = await fs.stat(config.tokenStorePath());
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  it("creates .mcp.json with the obsidian-vault entry pointing at the current port", async () => {
    await config.writeMcpJson(5123);
    const parsed = JSON.parse(await fs.readFile(config.mcpJsonPath(), "utf8"));
    expect(parsed.mcpServers["obsidian-vault"].type).toBe("http");
    expect(parsed.mcpServers["obsidian-vault"].url).toBe("http://127.0.0.1:5123/mcp");
    expect(parsed.mcpServers["obsidian-vault"].headersHelper).toContain(config.helperPath());
  });

  it("merges into an existing .mcp.json, preserving other servers and backing up the original", async () => {
    const original = { mcpServers: { other: { type: "stdio", command: "foo" } } };
    await fs.writeFile(config.mcpJsonPath(), JSON.stringify(original, null, 2));

    await config.writeMcpJson(6000);
    const parsed = JSON.parse(await fs.readFile(config.mcpJsonPath(), "utf8"));
    expect(parsed.mcpServers.other).toEqual({ type: "stdio", command: "foo" });
    expect(parsed.mcpServers["obsidian-vault"]).toBeDefined();

    const backup = JSON.parse(await fs.readFile(`${config.mcpJsonPath()}.bak`, "utf8"));
    expect(backup).toEqual(original);
  });

  it("removeMcpEntry drops only our server, keeping others", async () => {
    await fs.writeFile(
      config.mcpJsonPath(),
      JSON.stringify({ mcpServers: { other: { type: "stdio", command: "foo" } } }),
    );
    await config.writeMcpJson(6000);
    await config.removeMcpEntry();
    const parsed = JSON.parse(await fs.readFile(config.mcpJsonPath(), "utf8"));
    expect(parsed.mcpServers["obsidian-vault"]).toBeUndefined();
    expect(parsed.mcpServers.other).toBeDefined();
  });

  it("reconnect: after a port change, config + helper resolve the new port and token (FR-025)", async () => {
    await config.writeHelper();
    await config.writeTokenStore({ port: 7001, authToken: "tok-old" });
    await config.writeMcpJson(7001);

    const firstHeader = JSON.parse(execFileSync("node", [config.helperPath()], { encoding: "utf8" }));
    expect(firstHeader.Authorization).toBe("Bearer tok-old");

    // Simulate a restart on a fresh ephemeral port with a new token.
    await config.writeTokenStore({ port: 7002, authToken: "tok-new" });
    await config.writeMcpJson(7002);

    const url = JSON.parse(await fs.readFile(config.mcpJsonPath(), "utf8")).mcpServers["obsidian-vault"].url;
    expect(url).toBe("http://127.0.0.1:7002/mcp");
    const secondHeader = JSON.parse(execFileSync("node", [config.helperPath()], { encoding: "utf8" }));
    expect(secondHeader.Authorization).toBe("Bearer tok-new");
  });

  it("adds .mcp.json + helper + store to .git/info/exclude when the vault is a git repo", async () => {
    await fs.mkdir(path.join(vaultRoot, ".git"), { recursive: true });
    // Put the plugin dir inside the vault so the relative exclude paths are computed.
    const innerPlugin = path.join(vaultRoot, ".obsidian", "plugins", "code-workbench");
    await fs.mkdir(innerPlugin, { recursive: true });
    const innerConfig = new CompanionConfig({ pluginDir: innerPlugin, vaultRoot });

    await innerConfig.addGitExclude();
    const exclude = await fs.readFile(path.join(vaultRoot, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain(".mcp.json");
    expect(exclude).toContain(".obsidian/plugins/code-workbench/companion.json");
  });
});
