// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Resolve a file's project root and locate an installed server for its language
// (FR-005-FR-009, FR-023, FR-025, FR-027). Order: a user-configured custom server (trusted) →
// project-local → resolved PATH (version-manager shims included). Only registry-known binaries or a
// user-configured command are ever returned, so a command named by a project file is never run
// (FR-023). When nothing is found, the caller surfaces the registry install hint (FR-008).
//
// The filesystem is injected (fileExists) so this is unit-testable without touching disk.

import * as path from "path";
import type { ResolvedEnvironment } from "./env";
import { registryFor, type ServerSpec } from "./registry";
import type { LspSettings } from "./settings";

export type ServerOrigin = "user" | "project-local" | "version-manager" | "path";

export interface DiscoveredServer {
  language: string;
  // Absolute path / resolved executable.
  command: string;
  // Final argv (may include a `bundle exec` wrapper).
  args: string[];
  // Provenance, surfaced to the user (FR-009/FR-013).
  origin: ServerOrigin;
  // Resolved workspace root (FR-027).
  projectRoot: string;
  // The resolved login-shell env to launch with.
  env: Record<string, string>;
}

export interface DiscoveryDeps {
  // Synchronous existence check for markers and candidate binaries. Injected for tests.
  fileExists: (p: string) => boolean;
  // Defaults to process.platform.
  platform?: NodeJS.Platform;
}

export interface DiscoveryInput {
  filePath: string;
  language: string;
  settings: LspSettings;
  env: ResolvedEnvironment;
  // Fallback root when no project marker is found (FR-027) — the vault root.
  vaultRoot: string;
}

// Path segments that mark a version-manager / shim install, used only to label the origin.
const VERSION_MANAGER_HINTS = [
  ".rbenv",
  ".asdf",
  ".nvm",
  ".pyenv",
  ".cargo",
  ".rustup",
  ".volta",
  "mise",
  "/shims/",
  "\\shims\\",
];

export function classifyPathOrigin(binPath: string): "version-manager" | "path" {
  return VERSION_MANAGER_HINTS.some((h) => binPath.includes(h)) ? "version-manager" : "path";
}

// Walk up from the file's directory; the nearest directory holding any marker is the workspace root.
// Falls back to the vault root when none is found (FR-027). Supports monorepos / nested projects.
export function findProjectRoot(
  filePath: string,
  markers: string[],
  vaultRoot: string,
  fileExists: (p: string) => boolean,
): string {
  let dir = path.dirname(filePath);
  for (;;) {
    for (const marker of markers) {
      if (fileExists(path.join(dir, marker))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    // Do not climb above the vault root.
    if (dir === vaultRoot) break;
    dir = parent;
  }
  return vaultRoot;
}

// Resolve a bare executable name against the env PATH (PATHEXT-aware on Windows). Returns the first
// matching absolute path, or null.
export function resolveOnPath(
  bin: string,
  env: ResolvedEnvironment,
  fileExists: (p: string) => boolean,
  platform: NodeJS.Platform,
): string | null {
  // An explicit path is used as-is.
  if (bin.includes("/") || bin.includes("\\")) return fileExists(bin) ? bin : null;
  // Join with the target platform's rules even when the host differs, so PATH resolution is correct
  // on Windows and testable cross-platform. Keep the path module as an object and call .join on it
  // (not an extracted reference) so the method stays bound to its module.
  const platformPath = platform === "win32" ? path.win32 : path.posix;
  const sep = platform === "win32" ? ";" : ":";
  const dirs = (env.path || "").split(sep).filter(Boolean);
  const exts =
    platform === "win32"
      ? (env.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = platformPath.join(dir, bin + ext);
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

// Collect every root marker named by the entry's candidates (so root detection is the union).
function markersFor(candidates: ServerSpec[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    for (const m of c.rootMarkers) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  if (!seen.has(".git")) out.push(".git");
  return out;
}

// Try to resolve one candidate, preferring a project-local install over a global one (FR-007).
function resolveCandidate(
  candidate: ServerSpec,
  projectRoot: string,
  env: ResolvedEnvironment,
  deps: Required<DiscoveryDeps>,
): { command: string; args: string[]; origin: ServerOrigin } | null {
  const args = candidate.args ?? [];

  // 1. Project-local executable in node_modules/.bin (JS/TS ecosystem and friends).
  const localBin = path.join(projectRoot, "node_modules", ".bin", candidate.bin);
  if (deps.fileExists(localBin)) {
    return { command: localBin, args, origin: "project-local" };
  }

  // 2. Project-local via a known wrapper (e.g. `bundle exec ruby-lsp`), only when its marker is
  //    present and the wrapper itself resolves. The wrapper + server name are registry-known, so
  //    this is not running a command dictated by a project file (FR-023).
  const pl = candidate.projectLocal;
  if (pl && deps.fileExists(path.join(projectRoot, pl.marker))) {
    const wrapper = resolveOnPath(pl.wrapper, env, deps.fileExists, deps.platform);
    if (wrapper) {
      return { command: wrapper, args: [...pl.args, candidate.bin, ...args], origin: "project-local" };
    }
  }

  // 3. Global / version-manager: resolve the bare bin on the real login-shell PATH.
  const resolved = resolveOnPath(candidate.bin, env, deps.fileExists, deps.platform);
  if (resolved) {
    return { command: resolved, args, origin: classifyPathOrigin(resolved) };
  }
  return null;
}

// Discover a server for an open file, or null when none is installed (caller shows the install hint).
export function discoverServer(input: DiscoveryInput, deps: DiscoveryDeps): DiscoveredServer | null {
  const resolved: Required<DiscoveryDeps> = {
    fileExists: deps.fileExists,
    platform: deps.platform ?? process.platform,
  };
  const { language, settings, env, vaultRoot, filePath } = input;

  // A user-configured server is trusted and overrides registry discovery entirely (FR-025).
  const custom = settings.customServers[language];
  const entry = registryFor(language);
  const markers = entry ? markersFor(entry.candidates) : [".git"];
  const projectRoot = findProjectRoot(filePath, markers, vaultRoot, resolved.fileExists);

  if (custom && custom.command) {
    return {
      language,
      command: custom.command,
      args: custom.args ?? [],
      origin: "user",
      projectRoot,
      env: env.env,
    };
  }

  if (!entry) return null; // template-only language or no known server

  for (const candidate of entry.candidates) {
    const hit = resolveCandidate(candidate, projectRoot, env, resolved);
    if (hit) {
      return {
        language,
        command: hit.command,
        args: hit.args,
        origin: hit.origin,
        projectRoot,
        env: env.env,
      };
    }
  }
  return null;
}

// The install hint to show when discovery returns null (FR-008). Null for a language with no entry.
export function installHintFor(language: string): string | null {
  return registryFor(language)?.installHint ?? null;
}
