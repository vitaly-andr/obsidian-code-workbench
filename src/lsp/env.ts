// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Resolve the user's real login-shell environment (research R3, FR-006).
//
// A GUI-launched Obsidian inherits a truncated PATH (Finder/Dock does not source the user's
// .zshrc/.profile), so servers installed via Homebrew / rbenv / asdf / nvm are invisible to the
// host process env. We extend the login-shell insight already in src/util/launch.ts (run the user's
// shell with -l so PATH is set) to a headless `printenv`, parse it once, and cache it. On Windows the
// process env is already complete (no login-shell gap) — use it directly, honouring PATHEXT.

import { spawn } from "child_process";

export interface ResolvedEnvironment {
  // The real login-shell PATH.
  path: string;
  // Full resolved env for spawning servers.
  env: Record<string, string>;
  // Cache stamp (ms).
  resolvedAt: number;
}

export interface ResolveOptions {
  // Override the platform (tests / cross-OS reasoning). Defaults to process.platform.
  platform?: NodeJS.Platform;
  // Override the host process env. Defaults to process.env.
  procEnv?: NodeJS.ProcessEnv;
  // POSIX only: run the login shell and resolve to its raw `printenv` stdout. Injected in tests so
  // no real shell is spawned. Defaults to the login-shell spawner below.
  runLoginShell?: (shell: string) => Promise<string>;
  // Shell to use on POSIX. Defaults to $SHELL, then /bin/sh.
  shell?: string;
  // Clock (ms). Injected in tests. Defaults to Date.now.
  now?: () => number;
}

// Parse `printenv`-style output into a map. printenv prints one KEY=VALUE per line; a value that
// itself contains newlines continues on following lines that do not look like `KEY=`. Attach such
// continuation lines to the previous key so multi-line values survive.
export function parsePrintenv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let lastKey: string | null = null;
  for (const line of raw.split("\n")) {
    const eq = line.indexOf("=");
    const looksLikeAssignment = eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(line.slice(0, eq));
    if (looksLikeAssignment) {
      lastKey = line.slice(0, eq);
      out[lastKey] = line.slice(eq + 1);
    } else if (lastKey !== null && line !== "") {
      // Continuation of a multi-line value. Blank lines (notably the trailing newline) are skipped.
      out[lastKey] += "\n" + line;
    }
  }
  return out;
}

// Spawn the user's login shell and capture `printenv`. `-l` makes it a login shell and `-i`
// interactive, so rc files where version managers hook (rbenv/asdf init in .zshrc) run and their
// PATH entries appear. No stdin is attached (avoids a tty read); a timeout guards against a shell
// that blocks, falling back to whatever it printed so far.
function spawnLoginShell(shell: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(shell, ["-l", "-i", "-c", "printenv"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const timer = window.setTimeout(() => {
      child.kill();
      // Resolve with what we have — a partial env still beats the truncated GUI env.
      finish(() => resolve(out));
    }, 5000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", (e) => {
      window.clearTimeout(timer);
      finish(() => reject(e));
    });
    child.on("close", () => {
      window.clearTimeout(timer);
      finish(() => resolve(out));
    });
  });
}

let cache: ResolvedEnvironment | null = null;

// Build a ResolvedEnvironment from a full env map, deriving PATH (case-insensitive on Windows,
// where `Path`/`PATH` both occur, with PATHEXT applied for executable resolution).
function fromEnvMap(env: Record<string, string>, platform: NodeJS.Platform, now: number): ResolvedEnvironment {
  let path = env.PATH ?? "";
  if (platform === "win32") {
    // Windows env keys are case-insensitive; Node exposes them with mixed case. Find PATH/Path.
    if (!path) {
      const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH");
      if (key) path = env[key];
    }
    if (!env.PATHEXT && !Object.keys(env).some((k) => k.toUpperCase() === "PATHEXT")) {
      env = { ...env, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
    }
  }
  return { path, env, resolvedAt: now };
}

// Resolve (and cache) the environment to use for discovery and for spawning servers.
export async function resolveEnvironment(opts: ResolveOptions = {}): Promise<ResolvedEnvironment> {
  if (cache) return cache;
  const platform = opts.platform ?? process.platform;
  const procEnv = opts.procEnv ?? process.env;
  const now = (opts.now ?? Date.now)();

  if (platform === "win32") {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(procEnv)) if (v !== undefined) env[k] = v;
    cache = fromEnvMap(env, platform, now);
    return cache;
  }

  // POSIX: resolve through the login shell, then layer the parsed env over the host env so anything
  // the shell did not print (rare) still falls back to what we already have.
  const shell = opts.shell ?? procEnv.SHELL ?? "/bin/sh";
  const run = opts.runLoginShell ?? spawnLoginShell;
  let parsed: Record<string, string> = {};
  try {
    parsed = parsePrintenv(await run(shell));
  } catch {
    parsed = {};
  }
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(procEnv)) if (v !== undefined) merged[k] = v;
  Object.assign(merged, parsed);
  cache = fromEnvMap(merged, platform, now);
  return cache;
}

// Drop the cache so the next resolve re-runs (settings change, manual refresh).
export function invalidateEnvironmentCache(): void {
  cache = null;
}
