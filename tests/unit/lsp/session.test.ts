// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it, vi } from "vitest";
import {
  RESTART_LIMIT,
  ServerSession,
  SessionManager,
  sessionKey,
  type SessionClient,
  type SessionTransport,
  type TransportHooks,
} from "../../../src/lsp/client";
import type { DiscoveredServer } from "../../../src/lsp/discovery";

function server(over: Partial<DiscoveredServer> = {}): DiscoveredServer {
  return {
    language: "ruby",
    command: "/usr/bin/ruby-lsp",
    args: [],
    origin: "path",
    projectRoot: "/vault/proj",
    env: {},
    ...over,
  };
}

// A controllable fake transport: records its hooks so the test can fire exit/error, and tracks
// whether it was disposed (the "no orphan" check).
function fakeTransport() {
  let hooks: TransportHooks | null = null;
  const t: SessionTransport & { hooks: () => TransportHooks; disposed: boolean } = {
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    dispose: vi.fn(() => {
      t.disposed = true;
    }),
    disposed: false,
    hooks: () => {
      if (!hooks) throw new Error("transport not wired");
      return hooks;
    },
  };
  return { t, setHooks: (h: TransportHooks) => (hooks = h) };
}

// A controllable fake client: the initialize promise is resolved/rejected by the test.
function fakeClient() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const make = () =>
    new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  const client: SessionClient & { connectCount: number; disconnected: boolean } = {
    connected: false,
    initializing: make(),
    connect: vi.fn(() => {
      client.connectCount++;
      return client;
    }),
    disconnect: vi.fn(() => {
      client.disconnected = true;
    }),
    connectCount: 0,
    disconnected: false,
  };
  return { client, ready: () => resolve(), failInit: (e: unknown) => reject(e) };
}

describe("ServerSession lifecycle", () => {
  it("goes starting → ready when the client initializes", async () => {
    const { t, setHooks } = fakeTransport();
    const { client, ready } = fakeClient();
    const states: string[] = [];
    const s = new ServerSession({
      server: server(),
      createTransport: (_srv, hooks) => {
        setHooks(hooks);
        return t;
      },
      createClient: () => client,
      onStateChange: (st) => states.push(st),
    });
    s.start();
    expect(s.state).toBe("starting");
    expect(client.connectCount).toBe(1);
    ready();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.state).toBe("ready");
    // The session is constructed already in "starting" (read directly by the view), so the first
    // emitted transition is "ready".
    expect(states).toEqual(["ready"]);
  });

  it("restarts a crashed server up to RESTART_LIMIT, then goes failed", async () => {
    const transports: ReturnType<typeof fakeTransport>[] = [];
    const { client } = fakeClient();
    const s = new ServerSession({
      server: server(),
      createTransport: (_srv, hooks) => {
        const ft = fakeTransport();
        ft.setHooks(hooks);
        transports.push(ft);
        return ft.t;
      },
      createClient: () => client,
      backoff: async () => {}, // instant restarts in the test
    });
    s.start();
    // Crash repeatedly. Each crash should restart while under the limit, then fail.
    for (let i = 0; i < RESTART_LIMIT; i++) {
      transports[transports.length - 1].t.hooks().onExit(1, null);
      await Promise.resolve();
      await Promise.resolve();
      expect(s.state).toBe("restarting");
    }
    expect(s.restarts).toBe(RESTART_LIMIT);
    // One more crash exhausts the limit → failed.
    transports[transports.length - 1].t.hooks().onExit(1, null);
    await Promise.resolve();
    await Promise.resolve();
    expect(s.state).toBe("failed");
    // Started once + restarted RESTART_LIMIT times.
    expect(client.connectCount).toBe(RESTART_LIMIT + 1);
  });

  it("dispose kills the transport, disconnects the client, and prevents further restarts", async () => {
    const { t, setHooks } = fakeTransport();
    const { client } = fakeClient();
    const s = new ServerSession({
      server: server(),
      createTransport: (_srv, hooks) => {
        setHooks(hooks);
        return t;
      },
      createClient: () => client,
      backoff: async () => {},
    });
    s.start();
    s.dispose();
    expect(s.state).toBe("disposed");
    expect(t.disposed).toBe(true);
    expect(client.disconnected).toBe(true);
    // A late exit from the dead transport must NOT spawn a replacement.
    const before = client.connectCount;
    t.hooks().onExit(null, "SIGTERM");
    await Promise.resolve();
    await Promise.resolve();
    expect(client.connectCount).toBe(before);
    expect(s.state).toBe("disposed");
  });

  it("ignores a late init rejection from a superseded transport after dispose", async () => {
    const { t, setHooks } = fakeTransport();
    const { client, failInit } = fakeClient();
    const s = new ServerSession({
      server: server(),
      createTransport: (_srv, hooks) => {
        setHooks(hooks);
        return t;
      },
      createClient: () => client,
      backoff: async () => {},
    });
    s.start();
    s.dispose();
    failInit(new Error("connection closed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(s.state).toBe("disposed");
  });
});

describe("SessionManager", () => {
  it("reuses one session per (language, projectRoot) and creates per distinct key", () => {
    const created: string[] = [];
    const mgr = new SessionManager({
      createTransport: (_srv, _hooks) => fakeTransport().t,
      createClient: () => {
        const { client } = fakeClient();
        return client;
      },
      onStateChange: (key) => created.push(key),
    });
    const a1 = mgr.getOrCreate(server());
    const a2 = mgr.getOrCreate(server());
    expect(a2).toBe(a1); // reused
    const b = mgr.getOrCreate(server({ projectRoot: "/vault/other" }));
    expect(b).not.toBe(a1);
    expect(mgr.get(sessionKey("ruby", "/vault/proj"))).toBe(a1);
  });

  it("disposeAll tears every session down", () => {
    const clients: ReturnType<typeof fakeClient>["client"][] = [];
    const mgr = new SessionManager({
      createTransport: (_srv, _hooks) => fakeTransport().t,
      createClient: () => {
        const { client } = fakeClient();
        clients.push(client);
        return client;
      },
    });
    mgr.getOrCreate(server());
    mgr.getOrCreate(server({ projectRoot: "/vault/other" }));
    mgr.disposeAll();
    expect(clients).toHaveLength(2);
    expect(clients.every((c) => c.disconnected)).toBe(true);
    expect(mgr.get(sessionKey("ruby", "/vault/proj"))).toBeUndefined();
  });
});
