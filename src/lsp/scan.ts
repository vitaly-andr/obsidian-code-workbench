// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Settings-surface scan (006-settings-lsp-servers): which languages can the user connect to right
// now, without opening a file? Reuses discovery's PATH resolver over the registry (contracts/
// scan-result.md) so the answer matches what per-file discovery would find. Project-agnostic —
// project-local resolution (node_modules/.bin, `bundle exec`) is intentionally out of scope here
// (research R7); it stays in discoverServer at file-open.

import { classifyPathOrigin, resolveOnPath } from "./discovery";
import { REGISTRY } from "./registry";
import type { ResolvedEnvironment } from "./env";
import type { LspSettings } from "./settings";

export interface DetectedServer {
  language: string;
  serverId: string;
  command: string;
  origin: "path" | "version-manager" | "user";
}

export interface NotDetectedLanguage {
  language: string;
  installHint: string;
}

export interface ScanResult {
  detected: DetectedServer[];
  notDetected: NotDetectedLanguage[];
}

export interface ScanDeps {
  // Synchronous existence check for candidate binaries. Injected for tests.
  fileExists: (p: string) => boolean;
  // Defaults to process.platform.
  platform?: NodeJS.Platform;
  // Supplies customServers overrides.
  settings: LspSettings;
}

// Walk REGISTRY, resolve the first candidate per language (registry preference order — the same
// server a file open would get), and merge user-configured custom servers as origin "user"
// (overriding an auto-detected candidate for that language).
export function scanInstalledServers(env: ResolvedEnvironment, deps: ScanDeps): ScanResult {
  const platform = deps.platform ?? process.platform;
  const detected: DetectedServer[] = [];
  const notDetected: NotDetectedLanguage[] = [];
  const customLanguages = new Set(Object.keys(deps.settings.customServers));

  for (const entry of REGISTRY) {
    const custom = deps.settings.customServers[entry.language];
    if (custom) {
      detected.push({
        language: entry.language,
        serverId: entry.language,
        command: custom.command,
        origin: "user",
      });
      customLanguages.delete(entry.language);
      continue;
    }

    let hit: DetectedServer | null = null;
    for (const candidate of entry.candidates) {
      const resolved = resolveOnPath(candidate.bin, env, deps.fileExists, platform);
      if (resolved) {
        hit = {
          language: entry.language,
          serverId: candidate.id,
          command: resolved,
          origin: classifyPathOrigin(resolved),
        };
        break;
      }
    }

    if (hit) detected.push(hit);
    else notDetected.push({ language: entry.language, installHint: entry.installHint });
  }

  // A custom server for a language outside the registry (not otherwise possible today, but keeps
  // the invariant that every customServers entry appears in `detected`).
  for (const language of customLanguages) {
    const custom = deps.settings.customServers[language];
    detected.push({ language, serverId: language, command: custom.command, origin: "user" });
  }

  return { detected, notDetected };
}
