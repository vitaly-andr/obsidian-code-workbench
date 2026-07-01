// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateEnvironmentCache,
  parsePrintenv,
  resolveEnvironment,
} from "../../../src/lsp/env";

afterEach(() => invalidateEnvironmentCache());

describe("parsePrintenv", () => {
  it("parses KEY=VALUE lines", () => {
    const env = parsePrintenv("PATH=/usr/bin:/bin\nHOME=/home/me\nSHELL=/bin/zsh\n");
    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env.HOME).toBe("/home/me");
    expect(env.SHELL).toBe("/bin/zsh");
  });

  it("keeps '=' inside values intact", () => {
    const env = parsePrintenv("FOO=a=b=c\n");
    expect(env.FOO).toBe("a=b=c");
  });

  it("attaches continuation lines to a multi-line value", () => {
    const env = parsePrintenv("PATH=/usr/bin\nSCRIPT=line1\nline2\nNEXT=ok\n");
    expect(env.SCRIPT).toBe("line1\nline2");
    expect(env.NEXT).toBe("ok");
  });

  it("ignores leading noise that is not an assignment", () => {
    const env = parsePrintenv("some shell banner\nPATH=/usr/bin\n");
    expect(env.PATH).toBe("/usr/bin");
    expect(Object.keys(env)).toEqual(["PATH"]);
  });
});

describe("resolveEnvironment — POSIX", () => {
  it("uses the login-shell PATH over the truncated process PATH", async () => {
    const runner = vi.fn(async () => "PATH=/opt/homebrew/bin:/usr/bin\nGEM_HOME=/home/me/.gem\n");
    const resolved = await resolveEnvironment({
      platform: "darwin",
      procEnv: { PATH: "/usr/bin", SHELL: "/bin/zsh" },
      runLoginShell: runner,
      now: () => 1000,
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("/bin/zsh");
    expect(resolved.path).toBe("/opt/homebrew/bin:/usr/bin");
    expect(resolved.env.GEM_HOME).toBe("/home/me/.gem");
    expect(resolved.resolvedAt).toBe(1000);
  });

  it("falls back to the host env when the shell yields nothing", async () => {
    const resolved = await resolveEnvironment({
      platform: "linux",
      procEnv: { PATH: "/usr/bin", HOME: "/home/me" },
      runLoginShell: async () => "",
      now: () => 1,
    });
    expect(resolved.path).toBe("/usr/bin");
    expect(resolved.env.HOME).toBe("/home/me");
  });

  it("falls back to the host env when the shell spawn throws", async () => {
    const resolved = await resolveEnvironment({
      platform: "linux",
      procEnv: { PATH: "/usr/bin" },
      runLoginShell: async () => {
        throw new Error("ENOENT");
      },
      now: () => 1,
    });
    expect(resolved.path).toBe("/usr/bin");
  });
});

describe("resolveEnvironment — Windows", () => {
  it("uses the process env directly and ensures PATHEXT", async () => {
    const runner = vi.fn();
    const resolved = await resolveEnvironment({
      platform: "win32",
      procEnv: { Path: "C:\\Windows;C:\\bin" },
      runLoginShell: runner,
      now: () => 5,
    });
    expect(runner).not.toHaveBeenCalled();
    expect(resolved.path).toBe("C:\\Windows;C:\\bin");
    expect(resolved.env.PATHEXT).toBe(".COM;.EXE;.BAT;.CMD");
  });

  it("keeps a user-provided PATHEXT", async () => {
    const resolved = await resolveEnvironment({
      platform: "win32",
      procEnv: { Path: "C:\\bin", PATHEXT: ".EXE;.PS1" },
      now: () => 5,
    });
    expect(resolved.env.PATHEXT).toBe(".EXE;.PS1");
  });
});

describe("resolveEnvironment — caching", () => {
  it("resolves once and reuses the cache until invalidated", async () => {
    const runner = vi.fn(async () => "PATH=/a\n");
    const first = await resolveEnvironment({
      platform: "linux",
      procEnv: { PATH: "/x" },
      runLoginShell: runner,
      now: () => 1,
    });
    const second = await resolveEnvironment({
      platform: "linux",
      procEnv: { PATH: "/y" },
      runLoginShell: runner,
      now: () => 2,
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second.path).toBe("/a");

    invalidateEnvironmentCache();
    const third = await resolveEnvironment({
      platform: "linux",
      procEnv: { PATH: "/z" },
      runLoginShell: runner,
      now: () => 3,
    });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(third.path).toBe("/a");
    expect(third.resolvedAt).toBe(3);
  });
});
