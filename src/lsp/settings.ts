// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Persisted LSP settings (data-model.md → LspSettings, contracts/settings.md).
// Kept in its own tiny module — no CM6 / child_process imports — so main.ts can read the
// type and defaults eagerly without pulling the lazy LSP runtime (src/lsp/index.ts) into startup.

export interface CustomServer {
  command: string;
  args?: string[];
}

export interface LspSettings {
  // Master switch. Default false (FR-001): with it off, no server process and no LSP code runs.
  enabled: boolean;
  // Per-language enable, keyed by canonical grammar id (FR-002). Absent → treated as enabled
  // once the master switch is on; an explicit false keeps that language highlight-only.
  perLanguage: Record<string, boolean>;
  // User-configured server per language (FR-025). Trusted (the user chose it), overrides discovery.
  customServers: Record<string, CustomServer>;
  // Populate the IDE getDiagnostics tool for the agent (FR-026). Default true — it "follows feature
  // enable" per data-model.md: it only has any effect once the master switch is on AND the
  // getDiagnostics bridge (T028) is implemented; until then getDiagnostics stays empty regardless.
  // (The UI toggle returns with the bridge so a user can opt out without disabling the whole feature.)
  exposeToAgent: boolean;
}

export const DEFAULT_LSP_SETTINGS: LspSettings = {
  enabled: false,
  perLanguage: {},
  customServers: {},
  exposeToAgent: true,
};

// Whether the module should do anything for a given language. The master switch gates everything;
// a language is on unless explicitly turned off in perLanguage.
export function isLanguageEnabled(settings: LspSettings, language: string): boolean {
  if (!settings.enabled) return false;
  return settings.perLanguage[language] !== false;
}
