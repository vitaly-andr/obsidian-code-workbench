// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it, vi } from "vitest";
import { createLspController, type ControllerDeps } from "../../../src/lsp";
import type { LspSettings } from "../../../src/lsp/settings";
import type { ResolvedEnvironment } from "../../../src/lsp/env";

function settings(over: Partial<LspSettings> = {}): LspSettings {
  return { enabled: true, perLanguage: {}, customServers: {}, exposeToAgent: true, ...over };
}

function env(pathStr = "/usr/bin"): ResolvedEnvironment {
  return { path: pathStr, env: { PATH: pathStr }, resolvedAt: 0 };
}

// A fake LSP client whose initialize resolves immediately. Cast loosely — the controller only needs
// the SessionClient surface, and the test never touches the real CM/LSP graph.
function fakeClient() {
  return {
    connected: true,
    initializing: Promise.resolve(),
    connect: () => {},
    disconnect: () => {},
  } as unknown as ReturnType<NonNullable<ControllerDeps["makeClient"]>>;
}

function fakeTransport() {
  return {
    process: {},
    send: () => {},
    subscribe: () => {},
    unsubscribe: () => {},
    dispose: () => {},
  } as unknown as ReturnType<NonNullable<ControllerDeps["makeTransport"]>>;
}

function deps(over: Partial<ControllerDeps> = {}): ControllerDeps {
  return {
    settings: () => settings(),
    vaultRoot: () => "/vault",
    notify: vi.fn(),
    resolveEnv: vi.fn(async () => env()),
    fileExists: () => false,
    makeClient: () => fakeClient(),
    makeTransport: () => fakeTransport(),
    ...over,
  };
}

const RB = { filePath: "/vault/proj/app.rb", language: "ruby" };

describe("LspController.resolve — off = unchanged (SC-003)", () => {
  it("returns disabled and does NO discovery work when the master switch is off", async () => {
    const resolveEnv = vi.fn(async () => env());
    const c = createLspController(deps({ settings: () => settings({ enabled: false }), resolveEnv }));
    const r = await c.resolve(RB);
    expect(r.kind).toBe("disabled");
    // No environment resolution, no discovery, no spawn — the editor behaves exactly as today.
    expect(resolveEnv).not.toHaveBeenCalled();
  });

  it("returns disabled when the language is turned off per-language", async () => {
    const resolveEnv = vi.fn(async () => env());
    const c = createLspController(
      deps({ settings: () => settings({ perLanguage: { ruby: false } }), resolveEnv }),
    );
    expect((await c.resolve(RB)).kind).toBe("disabled");
    expect(resolveEnv).not.toHaveBeenCalled();
  });
});

describe("LspController.resolve — graceful degrade (FR-008)", () => {
  it("returns no-server with an install hint and notifies exactly once per language", async () => {
    const notify = vi.fn();
    const c = createLspController(deps({ notify, fileExists: () => false }));
    const r1 = await c.resolve(RB);
    expect(r1).toMatchObject({ kind: "no-server" });
    if (r1.kind === "no-server") expect(r1.installHint).toContain("ruby-lsp");
    // Re-opening another Ruby file must not repeat the same notice.
    await c.resolve({ filePath: "/vault/proj/other.rb", language: "ruby" });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("reports no-server status to the editor", async () => {
    const onStatus = vi.fn();
    const c = createLspController(deps());
    await c.resolve({ ...RB, onStatus });
    expect(onStatus).toHaveBeenCalledWith({ state: "no-server", origin: null });
  });
});

describe("LspController.resolve — attached", () => {
  it("creates a session and returns the attachment when a server is found", async () => {
    const onStatus = vi.fn();
    // Only the global ruby-lsp exists on PATH.
    const c = createLspController(deps({ fileExists: (p) => p === "/usr/bin/ruby-lsp" }));
    const r = await c.resolve({ ...RB, onStatus });
    expect(r.kind).toBe("attached");
    if (r.kind === "attached") {
      expect(r.origin).toBe("path");
      expect(r.languageId).toBe("ruby");
      expect(r.uri).toBe("file:///vault/proj/app.rb");
      expect(r.session.openDocs.has(r.uri)).toBe(true);
    }
    // Status reported with the origin.
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ origin: "path" }));
  });

  it("reuses one session across files in the same project/language", async () => {
    const made: unknown[] = [];
    const c = createLspController(
      deps({
        fileExists: (p) => p === "/usr/bin/ruby-lsp",
        makeClient: () => {
          const cl = fakeClient();
          made.push(cl);
          return cl;
        },
      }),
    );
    const a = await c.resolve(RB);
    const b = await c.resolve({ filePath: "/vault/proj/lib/x.rb", language: "ruby" });
    expect(a.kind).toBe("attached");
    expect(b.kind).toBe("attached");
    if (a.kind === "attached" && b.kind === "attached") expect(b.session).toBe(a.session);
    expect(made).toHaveLength(1); // one client for the (ruby, /vault) session
  });

  it("honours a user-configured custom server (FR-025)", async () => {
    const c = createLspController(
      deps({
        settings: () => settings({ customServers: { ruby: { command: "/custom/rl", args: ["--lsp"] } } }),
        fileExists: () => false, // nothing on PATH; the custom server still wins
      }),
    );
    const r = await c.resolve(RB);
    expect(r.kind).toBe("attached");
    if (r.kind === "attached") expect(r.origin).toBe("user");
  });
});

describe("LspController.resolve — single-view-per-file guard", () => {
  const found = (over: Partial<ControllerDeps> = {}) =>
    deps({ fileExists: (p) => p === "/usr/bin/ruby-lsp", ...over });

  it("a second view of the same file stays highlighting-only (attached-elsewhere) and reports status", async () => {
    const c = createLspController(found());
    const o1 = {};
    const o2 = {};
    const onStatus = vi.fn();
    expect((await c.resolve({ ...RB, owner: o1 })).kind).toBe("attached");
    expect((await c.resolve({ ...RB, owner: o2, onStatus })).kind).toBe("attached-elsewhere");
    expect(onStatus).toHaveBeenCalledWith({ state: "attached-elsewhere", origin: "path" });
  });

  it("the same view re-resolving its own file re-attaches (re-claim allowed)", async () => {
    const c = createLspController(found());
    const o1 = {};
    expect((await c.resolve({ ...RB, owner: o1 })).kind).toBe("attached");
    expect((await c.resolve({ ...RB, owner: o1 })).kind).toBe("attached");
  });

  it("releaseOwner frees the file for another view", async () => {
    const c = createLspController(found());
    const o1 = {};
    const o2 = {};
    await c.resolve({ ...RB, owner: o1 });
    expect((await c.resolve({ ...RB, owner: o2 })).kind).toBe("attached-elsewhere");
    c.releaseOwner(o1);
    expect((await c.resolve({ ...RB, owner: o2 })).kind).toBe("attached");
  });

  it("different files never collide — each view owns its own file", async () => {
    const c = createLspController(found());
    const o1 = {};
    const o2 = {};
    expect((await c.resolve({ ...RB, owner: o1 })).kind).toBe("attached");
    const other = { filePath: "/vault/proj/lib/x.rb", language: "ruby", owner: o2 };
    expect((await c.resolve(other)).kind).toBe("attached");
  });
});
