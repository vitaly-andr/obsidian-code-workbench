// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import {
  discoverServer,
  findProjectRoot,
  installHintFor,
  resolveOnPath,
  type DiscoveryInput,
} from "../../../src/lsp/discovery";
import type { ResolvedEnvironment } from "../../../src/lsp/env";
import type { LspSettings } from "../../../src/lsp/settings";

// A fake filesystem: a set of paths that "exist".
function fs(paths: string[]): (p: string) => boolean {
  const set = new Set(paths);
  return (p) => set.has(p);
}

function env(pathStr: string, extra: Record<string, string> = {}): ResolvedEnvironment {
  return { path: pathStr, env: { PATH: pathStr, ...extra }, resolvedAt: 0 };
}

const baseSettings: LspSettings = {
  enabled: true,
  perLanguage: {},
  customServers: {},
  exposeToAgent: true,
};

function input(over: Partial<DiscoveryInput>): DiscoveryInput {
  return {
    filePath: "/vault/proj/app/models/user.rb",
    language: "ruby",
    settings: baseSettings,
    env: env("/usr/bin"),
    vaultRoot: "/vault",
    ...over,
  };
}

describe("findProjectRoot", () => {
  it("returns the nearest enclosing directory with a marker", () => {
    const exists = fs(["/vault/proj/Gemfile"]);
    const root = findProjectRoot("/vault/proj/app/models/user.rb", ["Gemfile", ".git"], "/vault", exists);
    expect(root).toBe("/vault/proj");
  });

  it("prefers the nearest marker in a monorepo (nested project wins)", () => {
    const exists = fs(["/vault/Gemfile", "/vault/proj/Gemfile"]);
    const root = findProjectRoot("/vault/proj/app/user.rb", ["Gemfile", ".git"], "/vault", exists);
    expect(root).toBe("/vault/proj");
  });

  it("falls back to the vault root when no marker is found", () => {
    const exists = fs([]);
    const root = findProjectRoot("/vault/proj/app/user.rb", ["Gemfile", ".git"], "/vault", exists);
    expect(root).toBe("/vault");
  });
});

describe("resolveOnPath", () => {
  it("finds a bin on the POSIX PATH", () => {
    const exists = fs(["/opt/homebrew/bin/ruby-lsp"]);
    const found = resolveOnPath("ruby-lsp", env("/usr/bin:/opt/homebrew/bin"), exists, "linux");
    expect(found).toBe("/opt/homebrew/bin/ruby-lsp");
  });

  it("applies PATHEXT on Windows", () => {
    const exists = fs(["C:\\tools\\ruby-lsp.CMD"]);
    const found = resolveOnPath(
      "ruby-lsp",
      env("C:\\tools", { PATHEXT: ".EXE;.CMD" }),
      exists,
      "win32",
    );
    expect(found).toBe("C:\\tools\\ruby-lsp.CMD");
  });

  it("returns null when not on PATH", () => {
    expect(resolveOnPath("ruby-lsp", env("/usr/bin"), fs([]), "linux")).toBeNull();
  });
});

describe("discoverServer", () => {
  const deps = (paths: string[]) => ({ fileExists: fs(paths), platform: "linux" as const });

  it("prefers a project-local bundler install over a global one (FR-007)", () => {
    // Both a Gemfile (→ bundle exec) and a global ruby-lsp exist; project-local must win.
    const result = discoverServer(
      input({ env: env("/usr/bin") }),
      deps(["/vault/proj/Gemfile", "/usr/bin/bundle", "/usr/bin/ruby-lsp"]),
    );
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("project-local");
    expect(result!.command).toBe("/usr/bin/bundle");
    expect(result!.args).toEqual(["exec", "ruby-lsp"]);
    expect(result!.projectRoot).toBe("/vault/proj");
  });

  it("prefers a node_modules/.bin project-local server (FR-007)", () => {
    const result = discoverServer(
      input({ filePath: "/vault/web/src/a.ts", language: "typescript", env: env("/usr/bin") }),
      deps([
        "/vault/web/package.json",
        "/vault/web/node_modules/.bin/typescript-language-server",
        "/usr/bin/typescript-language-server",
      ]),
    );
    expect(result!.origin).toBe("project-local");
    expect(result!.command).toBe("/vault/web/node_modules/.bin/typescript-language-server");
    expect(result!.args).toEqual(["--stdio"]);
  });

  it("falls back to a global PATH install and labels the origin", () => {
    const result = discoverServer(
      input({ env: env("/usr/bin") }),
      deps(["/vault/proj/Gemfile", "/usr/bin/ruby-lsp"]),
    );
    // Gemfile present but no `bundle` on PATH → not project-local; global ruby-lsp wins.
    expect(result!.origin).toBe("path");
    expect(result!.command).toBe("/usr/bin/ruby-lsp");
    expect(result!.args).toEqual([]);
  });

  it("labels a version-manager shim origin", () => {
    const result = discoverServer(
      input({ env: env("/home/me/.rbenv/shims") }),
      deps(["/home/me/.rbenv/shims/ruby-lsp"]),
    );
    expect(result!.origin).toBe("version-manager");
  });

  it("uses the second candidate when the first is absent (preference order)", () => {
    const result = discoverServer(
      input({ env: env("/usr/bin") }),
      deps(["/usr/bin/solargraph"]),
    );
    expect(result!.command).toBe("/usr/bin/solargraph");
    expect(result!.args).toEqual(["stdio"]);
  });

  it("returns null when no server is installed, with an install hint available (FR-008)", () => {
    const result = discoverServer(input({ env: env("/usr/bin") }), deps([]));
    expect(result).toBeNull();
    expect(installHintFor("ruby")).toContain("gem install ruby-lsp");
  });

  it("honours a user-configured custom server, overriding discovery (FR-025)", () => {
    const settings: LspSettings = {
      ...baseSettings,
      customServers: { ruby: { command: "/custom/my-ruby-lsp", args: ["--lsp"] } },
    };
    const result = discoverServer(
      input({ settings, env: env("/usr/bin") }),
      // Even with a global ruby-lsp present, the user's choice wins.
      deps(["/usr/bin/ruby-lsp"]),
    );
    expect(result!.origin).toBe("user");
    expect(result!.command).toBe("/custom/my-ruby-lsp");
    expect(result!.args).toEqual(["--lsp"]);
  });

  it("never auto-runs a command dictated by a project file (FR-023)", () => {
    // A project may ship its own ".ruby-lsp-command" etc.; discovery ignores any such file and only
    // resolves registry-known binaries. With no registry bin on PATH and no custom server, the
    // result is null regardless of project contents.
    const result = discoverServer(
      input({ env: env("/usr/bin") }),
      deps(["/vault/proj/Gemfile", "/vault/proj/.evil-lsp-command"]),
    );
    expect(result).toBeNull();
  });

  it("returns null for a template-only language with no registry entry", () => {
    const result = discoverServer(
      input({ filePath: "/vault/v.erb", language: "erb", env: env("/usr/bin") }),
      deps(["/usr/bin/anything"]),
    );
    expect(result).toBeNull();
    expect(installHintFor("erb")).toBeNull();
  });
});
