// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Per-(language, projectRoot) server session: own one @codemirror/lsp-client LSPClient over the
// stdio transport, drive the lifecycle state machine, restart a crashed server up to a bounded
// number of times with a short backoff, and dispose cleanly with no orphan process
// (data-model.md → ServerSession; FR-010/FR-011/FR-012). T013.
//
// The LSPClient instance is kept stable across restarts: on a crash we spawn a fresh transport and
// reconnect the same client, so the editor's `client.plugin(...)` extension stays valid and the
// editor never has to be rebuilt. Transport and client are injected, which keeps the state machine
// (start → ready, crash → restart → ready | failed, dispose) fully unit-testable (T014).

import type { DiscoveredServer } from "./discovery";

// SessionState transitions (data-model.md, FR-011/FR-013):
//   starting → ready → (crash) restarting → ready | (exhausted) failed; failed/disabled → disposed.
export type SessionState = "starting" | "ready" | "restarting" | "failed" | "disposed";

// Automatic-restart limit before a session goes to `failed` (FR-011).
export const RESTART_LIMIT = 3;

export function sessionKey(language: string, projectRoot: string): string {
  return `${language}::${projectRoot}`;
}

// Hooks the transport reports lifecycle events through.
export interface TransportHooks {
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError: (error: Error) => void;
}

// The minimal transport surface a session needs (satisfied by transport.ts SpawnedTransport).
export interface SessionTransport {
  send(message: string): void;
  subscribe(handler: (value: string) => void): void;
  unsubscribe(handler: (value: string) => void): void;
  dispose(): void;
}

// The minimal LSP-client surface a session drives (satisfied by @codemirror/lsp-client LSPClient).
export interface SessionClient {
  readonly connected: boolean;
  initializing: Promise<unknown>;
  connect(transport: SessionTransport): unknown;
  disconnect(): void;
}

export interface SessionOptions {
  server: DiscoveredServer;
  // Spawn a server and return a transport wired to the given lifecycle hooks.
  createTransport: (server: DiscoveredServer, hooks: TransportHooks) => SessionTransport;
  // Create the LSP client (wraps @codemirror/lsp-client). Called once per session; receives the
  // server so the client can be configured with the project rootUri.
  createClient: (server: DiscoveredServer) => SessionClient;
  // Wait before a restart attempt (attempt is 1-based). Injected in tests; defaults to a short
  // capped backoff via window.setTimeout.
  backoff?: (attempt: number) => Promise<void>;
  // Notified on every state transition (FR-013 — surfaced to the view/status).
  onStateChange?: (state: SessionState) => void;
}

function defaultBackoff(attempt: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.min(200 * attempt, 1000)));
}

export class ServerSession {
  readonly key: string;
  readonly server: DiscoveredServer;
  state: SessionState = "starting";
  restarts = 0;
  // File URIs currently attached to this session.
  readonly openDocs = new Set<string>();

  private readonly client: SessionClient;
  private transport: SessionTransport | null = null;
  // Bumped on every (re)connect so a late exit/init from a superseded transport is ignored.
  private generation = 0;
  private disposed = false;

  constructor(private readonly opts: SessionOptions) {
    this.server = opts.server;
    this.key = sessionKey(opts.server.language, opts.server.projectRoot);
    this.client = opts.createClient(opts.server);
  }

  // The LSP client to hand to the editor extension (client.plugin(uri, languageId)).
  get lspClient(): SessionClient {
    return this.client;
  }

  // Spawn the server and begin the initialize handshake.
  start(): void {
    this.connect();
  }

  private setState(next: SessionState): void {
    if (this.state === next) return;
    this.state = next;
    this.opts.onStateChange?.(next);
  }

  private connect(): void {
    const gen = ++this.generation;
    this.setState(this.restarts === 0 ? "starting" : "restarting");
    const hooks: TransportHooks = {
      onExit: () => void this.handleExit(gen),
      // Spawn/IO errors manifest as an exit or an initialize timeout; route through the same path.
      onError: () => void this.handleExit(gen),
    };
    this.transport = this.opts.createTransport(this.opts.server, hooks);
    this.client.connect(this.transport);
    this.client.initializing.then(
      () => {
        if (!this.disposed && gen === this.generation) this.setState("ready");
      },
      () => {
        if (!this.disposed && gen === this.generation) void this.handleExit(gen);
      },
    );
  }

  private async handleExit(gen: number): Promise<void> {
    // Ignore exits from a superseded transport, or after dispose.
    if (this.disposed || gen !== this.generation) return;
    if (this.restarts >= RESTART_LIMIT) {
      this.setState("failed");
      return;
    }
    this.restarts++;
    this.setState("restarting");
    await (this.opts.backoff ?? defaultBackoff)(this.restarts);
    if (this.disposed || gen !== this.generation) return;
    // Tear down the dead transport before spawning a fresh one (no orphan).
    this.transport?.dispose();
    this.transport = null;
    this.connect();
  }

  // Clean shutdown: kill the process, drop the client, no orphan, no further restarts (FR-012).
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++; // invalidate any in-flight exit/init handlers
    this.setState("disposed");
    this.transport?.dispose();
    this.transport = null;
    try {
      this.client.disconnect();
    } catch {
      // already disconnected
    }
    this.openDocs.clear();
  }
}

export interface ManagerOptions {
  createTransport: (server: DiscoveredServer, hooks: TransportHooks) => SessionTransport;
  createClient: (server: DiscoveredServer) => SessionClient;
  backoff?: (attempt: number) => Promise<void>;
  onStateChange?: (key: string, state: SessionState) => void;
}

// Owns one ServerSession per (language, projectRoot), reused across files (FR-010).
export class SessionManager {
  private readonly sessions = new Map<string, ServerSession>();

  constructor(private readonly opts: ManagerOptions) {}

  get(key: string): ServerSession | undefined {
    return this.sessions.get(key);
  }

  // Find the session that already has this file URI open (didOpen sent) — used by read-only queries
  // (e.g. documentSymbols, 008) that must not start a session of their own.
  findByOpenDoc(uri: string): ServerSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.openDocs.has(uri)) return session;
    }
    return undefined;
  }

  // Return the existing session for the server's (language, projectRoot), or create + start one.
  getOrCreate(server: DiscoveredServer): ServerSession {
    const key = sessionKey(server.language, server.projectRoot);
    let session = this.sessions.get(key);
    if (!session) {
      session = new ServerSession({
        server,
        createTransport: this.opts.createTransport,
        createClient: this.opts.createClient,
        backoff: this.opts.backoff,
        onStateChange: (state) => this.opts.onStateChange?.(key, state),
      });
      this.sessions.set(key, session);
      session.start();
    }
    return session;
  }

  dispose(key: string): void {
    const session = this.sessions.get(key);
    if (session) {
      session.dispose();
      this.sessions.delete(key);
    }
  }

  // Tear down every session (plugin unload / feature disabled). No orphan processes (FR-012).
  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
  }
}
