// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { scanInstalledServers } from "../../../src/lsp/scan";
import type { ResolvedEnvironment } from "../../../src/lsp/env";
import type { LspSettings } from "../../../src/lsp/settings";

function fs(paths: string[]): (p: string) => boolean {
  const set = new Set(paths);
  return (p) => set.has(p);
}

function env(pathStr: string): ResolvedEnvironment {
  return { path: pathStr, env: { PATH: pathStr }, resolvedAt: 0 };
}

const baseSettings: LspSettings = {
  enabled: true,
  perLanguage: {},
  customServers: {},
  exposeToAgent: true,
};

describe("scanInstalledServers", () => {
  it("splits registry languages into detected and not-detected", () => {
    const result = scanInstalledServers(env("/usr/bin"), {
      fileExists: fs(["/usr/bin/ruby-lsp"]),
      platform: "linux",
      settings: baseSettings,
    });
    const ruby = result.detected.find((d) => d.language === "ruby");
    expect(ruby).toEqual({ language: "ruby", serverId: "ruby-lsp", command: "/usr/bin/ruby-lsp", origin: "path" });
    const go = result.notDetected.find((d) => d.language === "go");
    expect(go).toBeDefined();
    expect(go!.installHint).toContain("gopls");
    // Every registry language is in exactly one of the two sets.
    const detectedLangs = new Set(result.detected.map((d) => d.language));
    const notDetectedLangs = new Set(result.notDetected.map((d) => d.language));
    for (const lang of detectedLangs) expect(notDetectedLangs.has(lang)).toBe(false);
  });

  it("first candidate wins when multiple are installed (preference order)", () => {
    const result = scanInstalledServers(env("/usr/bin"), {
      fileExists: fs(["/usr/bin/ruby-lsp", "/usr/bin/solargraph"]),
      platform: "linux",
      settings: baseSettings,
    });
    const ruby = result.detected.find((d) => d.language === "ruby");
    expect(ruby!.serverId).toBe("ruby-lsp");
    expect(ruby!.command).toBe("/usr/bin/ruby-lsp");
  });

  it("uses the second candidate when the first is absent", () => {
    const result = scanInstalledServers(env("/usr/bin"), {
      fileExists: fs(["/usr/bin/solargraph"]),
      platform: "linux",
      settings: baseSettings,
    });
    const ruby = result.detected.find((d) => d.language === "ruby");
    expect(ruby!.serverId).toBe("solargraph");
  });

  it("overrides a detected candidate with a custom server (origin user)", () => {
    const settings: LspSettings = {
      ...baseSettings,
      customServers: { ruby: { command: "/custom/my-ruby-lsp", args: ["--lsp"] } },
    };
    const result = scanInstalledServers(env("/usr/bin"), {
      fileExists: fs(["/usr/bin/ruby-lsp"]),
      platform: "linux",
      settings,
    });
    const ruby = result.detected.find((d) => d.language === "ruby");
    expect(ruby).toEqual({ language: "ruby", serverId: "ruby", command: "/custom/my-ruby-lsp", origin: "user" });
    expect(result.notDetected.some((d) => d.language === "ruby")).toBe(false);
  });

  it("adds a custom server for a language with no installed candidate (never in notDetected)", () => {
    const settings: LspSettings = {
      ...baseSettings,
      customServers: { go: { command: "/custom/gopls" } },
    };
    const result = scanInstalledServers(env("/usr/bin"), {
      fileExists: fs([]),
      platform: "linux",
      settings,
    });
    const go = result.detected.find((d) => d.language === "go");
    expect(go).toEqual({ language: "go", serverId: "go", command: "/custom/gopls", origin: "user" });
    expect(result.notDetected.some((d) => d.language === "go")).toBe(false);
  });

  it("classifies a version-manager shim origin", () => {
    const result = scanInstalledServers(env("/home/me/.rbenv/shims"), {
      fileExists: fs(["/home/me/.rbenv/shims/ruby-lsp"]),
      platform: "linux",
      settings: baseSettings,
    });
    const ruby = result.detected.find((d) => d.language === "ruby");
    expect(ruby!.origin).toBe("version-manager");
  });
});
