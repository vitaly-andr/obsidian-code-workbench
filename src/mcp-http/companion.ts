// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { randomUUID } from "crypto";
import { App, EventRef } from "obsidian";
import { DiffManager } from "../diff-manager";
import { CompanionConfig } from "../server/companion-config";
import { error, info, warn } from "../util/log";
import { VaultApproval } from "../vault-tools/approval";
import { registerReadTools } from "../vault-tools/read";
import { ToolRegistry } from "../vault-tools/registry";
import { VaultToolContext } from "../vault-tools/types";
import { registerWriteTools } from "../vault-tools/write";
import { CompanionDispatcher } from "./dispatcher";
import { CompanionServer } from "./server";
import { SessionManager } from "./session";

export interface CompanionOptions {
  app: App;
  diffs: DiffManager;
  pluginVersion: string;
  // Absolute plugin data folder — token store + helper live here.
  pluginDir: string;
  // Absolute vault root — resolved once by main.ts (the companion never starts without it).
  vaultRoot: string;
}

const SERVER_NAME = "obsidian-vault";

// Owns the companion MCP server lifecycle: builds the tool context (read + write groups), the loopback
// HTTP server, the token store, and the auto-config. Started/stopped from main.ts on the vaultTools
// toggle and on load/unload. Restarting on a new port refreshes the config (FR-025).
export class Companion {
  private server: CompanionServer | null = null;
  private config: CompanionConfig | null = null;
  private readonly sessions = new SessionManager();
  private indexed = false;
  private resolvedRef: EventRef | null = null;
  private port = 0;
  private authToken: string | null = null;
  // Notified after start/stop so the settings panel can show the live port + connection command.
  onStatusChange: (() => void) | null = null;

  constructor(private readonly opts: CompanionOptions) {}

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number {
    return this.port;
  }

  // The documented manual fallback command, or null when not running.
  manualAddCommand(): string | null {
    if (!this.server || !this.authToken) return null;
    return (
      `claude mcp add --transport http ${SERVER_NAME} http://127.0.0.1:${this.port}/mcp ` +
      `--header "Authorization: Bearer ${this.authToken}"`
    );
  }

  async start(): Promise<void> {
    if (this.server) return;
    const { app, diffs, pluginVersion, pluginDir, vaultRoot } = this.opts;

    // Link maps are trustworthy only after metadataCache emits `resolved`. We may start after that
    // event already fired (toggled on mid-session), so also treat a populated link map as resolved.
    this.indexed = Object.keys(app.metadataCache.resolvedLinks ?? {}).length > 0;
    this.resolvedRef = app.metadataCache.on("resolved", () => {
      this.indexed = true;
    });

    const approval = new VaultApproval(app, diffs);
    const ctx: VaultToolContext = { app, approval, isIndexed: () => this.indexed };

    const registry = new ToolRegistry();
    registerReadTools(registry);
    registerWriteTools(registry);

    const authToken = randomUUID();
    const dispatcher = new CompanionDispatcher(registry, this.sessions, ctx, {
      name: SERVER_NAME,
      version: pluginVersion,
    });
    const server = new CompanionServer(dispatcher, authToken);

    let port: number;
    try {
      port = await server.start();
    } catch (e) {
      error("companion failed to start", e);
      this.detachResolved();
      return;
    }
    this.server = server;
    this.authToken = authToken;
    this.port = port;

    const config = new CompanionConfig({ pluginDir, vaultRoot });
    this.config = config;
    try {
      await config.writeTokenStore({ port, authToken });
      await config.writeHelper();
      await config.writeMcpJson(port);
      await config.addGitExclude();
    } catch (e) {
      warn("companion auto-config failed; manual connection still works", e);
    }

    info(`companion ready — vault tools available to Claude in ${vaultRoot}`);
    this.onStatusChange?.();
  }

  async stop(): Promise<void> {
    this.detachResolved();
    this.sessions.clear();
    await this.server?.stop().catch((e) => warn("companion stop failed", e));
    await this.config?.clearTokenStore().catch((e) => warn("token store cleanup failed", e));
    await this.config?.removeMcpEntry().catch((e) => warn("mcp.json cleanup failed", e));
    this.server = null;
    this.config = null;
    this.authToken = null;
    this.port = 0;
    this.indexed = false;
    this.onStatusChange?.();
  }

  private detachResolved(): void {
    if (this.resolvedRef) {
      this.opts.app.metadataCache.offref(this.resolvedRef);
      this.resolvedRef = null;
    }
  }
}
