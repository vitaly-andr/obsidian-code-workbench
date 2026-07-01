// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Lazy entry point for the editor-LSP module. main.ts reaches everything here through a single
// dynamic import() gated by LspSettings.enabled, so the base bundle and startup stay unchanged when
// the feature is off (FR-024, SC-003): importing this file is what pulls @codemirror/lsp-client and
// the session runtime in, and that only happens on first enable.
//
// The controller owns the SessionManager and resolves, per opened file, into one of:
//   - disabled  : feature/language off → editor stays exactly as today (no process, no LSP layer)
//   - no-server : discovery found nothing → one actionable install hint, highlighting intact (FR-008)
//   - attached  : a session is connected → the editor reconfigures its LSP compartment and shows
//                 the connection status (FR-013)
// The editor (CodeView) does the actual CM6 reconfigure with buildSessionExtensions(); keeping CM out
// of the controller makes the resolve/degrade/status logic unit-testable.

import { existsSync } from "fs";
import { LSPClient } from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import { toFileUri } from "../util/paths";
import { lspLanguageId } from "../util/languages";
import { SessionManager, type ServerSession, type SessionState, type TransportHooks } from "./client";
import { createTransport } from "./transport";
import { discoverServer, installHintFor, type DiscoveredServer, type ServerOrigin } from "./discovery";
import { resolveEnvironment, type ResolvedEnvironment } from "./env";
import { lspClientExtensions, buildSessionExtensions, ALL_FEATURES } from "./extensions";
import { DiagnosticsBridge } from "./diagnostics-bridge";
import { setDiagnosticsProvider } from "../tools/diagnostics";
import { isLanguageEnabled, type LspSettings } from "./settings";
import { scanInstalledServers, type ScanResult } from "./scan";

export type { LspSettings } from "./settings";
export { buildSessionExtensions, ALL_FEATURES, type LspFeatures } from "./extensions";
export type { ScanResult, DetectedServer, NotDetectedLanguage } from "./scan";
export { invalidateEnvironmentCache } from "./env";

export interface ResolveInput {
  // Absolute path to the open file.
  filePath: string;
  // Canonical language id (e.g. "ruby"); see util/languages.lspLanguageId.
  language: string;
  // Opaque token identifying the editor view requesting the attachment. At most one view per file URI
  // drives the LSP plugin (DefaultWorkspace single-view limit); later views stay highlighting-only.
  owner?: object;
  // Notified whenever this file's session changes state (FR-013). Called with the current state.
  onStatus?: (status: SessionStatus) => void;
}

export interface SessionStatus {
  state: SessionState | "no-server" | "disabled" | "attached-elsewhere";
  origin: ServerOrigin | null;
}

export type AttachResult =
  | { kind: "disabled" }
  | { kind: "no-server"; installHint: string | null }
  | { kind: "attached-elsewhere" }
  | {
      kind: "attached";
      client: LSPClient;
      uri: string;
      languageId: string;
      origin: ServerOrigin;
      session: ServerSession;
    };

export interface ControllerDeps {
  // Live read of the persisted settings.
  settings: () => LspSettings;
  // The vault root (fallback workspace root, FR-027). Null disables discovery.
  vaultRoot: () => string | null;
  // Show an actionable notice (Obsidian Notice). Injected so tests can capture it.
  notify?: (message: string) => void;
  // Map an absolute path to a vault-relative one for the agent diagnostic lines (FR-026). Falls back
  // to the absolute path when absent.
  toRelativePath?: (absPath: string) => string | null;
  // — injectable seams for tests —
  resolveEnv?: () => Promise<ResolvedEnvironment>;
  fileExists?: (p: string) => boolean;
  makeClient?: (server: DiscoveredServer) => LSPClient;
  makeTransport?: (server: DiscoveredServer, hooks: TransportHooks) => ReturnType<typeof createTransport>;
}

export class LspController {
  private readonly sessions: SessionManager;
  // Per-session-key listeners so a state change updates every editor attached to that session.
  private readonly statusListeners = new Map<string, Set<(s: SessionStatus) => void>>();
  // install hints already shown, so the same "install X" notice is not repeated (FR-008: exactly one).
  private readonly hintedLanguages = new Set<string>();

  // Collects active LSP diagnostics for the agent getDiagnostics bridge (FR-026).
  private readonly bridge = new DiagnosticsBridge();

  // File URI → the editor view (opaque token) currently driving its LSP plugin. @codemirror/lsp-client's
  // DefaultWorkspace rejects a second openFile for the same URI (it throws; CM6 then logs "plugin
  // crashed"), so only the first claiming view attaches — later concurrent views stay highlighting-only.
  private readonly uriOwners = new Map<string, object>();

  constructor(private readonly deps: ControllerDeps) {
    const record = (uri: string, diagnostics: Parameters<DiagnosticsBridge["record"]>[1]) =>
      this.bridge.record(uri, diagnostics);
    const makeClient =
      deps.makeClient ??
      ((server: DiscoveredServer) =>
        new LSPClient({ rootUri: toFileUri(server.projectRoot), extensions: lspClientExtensions(record) }));
    const makeTransport =
      deps.makeTransport ??
      ((server: DiscoveredServer, hooks: TransportHooks) =>
        createTransport({
          command: server.command,
          args: server.args,
          cwd: server.projectRoot,
          env: server.env,
          onExit: hooks.onExit,
          onError: hooks.onError,
        }));
    this.sessions = new SessionManager({
      createClient: makeClient,
      createTransport: makeTransport,
      onStateChange: (key, state) => {
        const session = this.sessions.get(key);
        const status: SessionStatus = { state, origin: session?.server.origin ?? null };
        for (const fn of this.statusListeners.get(key) ?? []) fn(status);
      },
    });

    // Feed the agent getDiagnostics tool from the bridge, but only while exposeToAgent is on (FR-026);
    // the live settings read means toggling it off immediately empties getDiagnostics again.
    const toRelative = deps.toRelativePath ?? ((p: string) => p);
    setDiagnosticsProvider((uri) =>
      this.deps.settings().exposeToAgent ? this.bridge.render(toRelative, uri) : [],
    );
  }

  // Resolve an opened file to an attachment / degrade / disabled decision.
  async resolve(input: ResolveInput): Promise<AttachResult> {
    const settings = this.deps.settings();
    if (!isLanguageEnabled(settings, input.language)) return { kind: "disabled" };

    const vaultRoot = this.deps.vaultRoot();
    if (!vaultRoot) return { kind: "disabled" };

    const env = await (this.deps.resolveEnv ?? resolveEnvironment)();
    const fileExists = this.deps.fileExists ?? existsSync;
    const server = discoverServer(
      { filePath: input.filePath, language: input.language, settings, env, vaultRoot },
      { fileExists },
    );

    if (!server) {
      const installHint = installHintFor(input.language);
      // One actionable notice per language (FR-008), editor otherwise unaffected.
      if (installHint && !this.hintedLanguages.has(input.language)) {
        this.hintedLanguages.add(input.language);
        this.deps.notify?.(installHint);
      }
      input.onStatus?.({ state: "no-server", origin: null });
      return { kind: "no-server", installHint };
    }

    const session = this.sessions.getOrCreate(server);
    const uri = toFileUri(input.filePath);
    // Single-view-per-URI guard: if another live view already drives this file's LSP plugin, stay
    // highlighting-only instead of triggering DefaultWorkspace's duplicate-openFile throw.
    const claimedBy = this.uriOwners.get(uri);
    if (input.owner && claimedBy && claimedBy !== input.owner) {
      // Surface why this view is highlighting-only, instead of silently showing nothing.
      input.onStatus?.({ state: "attached-elsewhere", origin: server.origin });
      return { kind: "attached-elsewhere" };
    }
    if (input.owner) this.uriOwners.set(uri, input.owner);
    session.openDocs.add(uri);
    if (input.onStatus) {
      const set = this.statusListeners.get(session.key) ?? new Set();
      set.add(input.onStatus);
      this.statusListeners.set(session.key, set);
      input.onStatus({ state: session.state, origin: server.origin });
    }
    // In production the manager's client IS an LSPClient (makeClient default); the SessionClient
    // interface only narrows what the session itself drives.
    return {
      kind: "attached",
      client: session.lspClient as unknown as LSPClient,
      uri,
      languageId: lspLanguageId(input.language),
      origin: server.origin,
      session,
    };
  }

  // Settings-surface scan (006): which languages can the user connect to right now, without opening
  // a file. Pure discovery — no session, no process spawn beyond the (cached) login-shell resolve.
  async scanServers(): Promise<ScanResult> {
    const env = await (this.deps.resolveEnv ?? resolveEnvironment)();
    const fileExists = this.deps.fileExists ?? existsSync;
    return scanInstalledServers(env, { fileExists, settings: this.deps.settings() });
  }

  // Build the CM6 editor extension for an attached file, wiring pull-model diagnostics (ruby-lsp et al.)
  // into the same bridge the push path feeds — so the editor AND the agent getDiagnostics see them.
  buildEditorExtension(attached: Extract<AttachResult, { kind: "attached" }>): Extension {
    return buildSessionExtensions(
      attached.client,
      attached.uri,
      attached.languageId,
      ALL_FEATURES,
      (uri, items) => this.bridge.record(uri, items),
    );
  }

  // Detach an editor's status listener (called when the view closes/reconfigures).
  removeStatusListener(sessionKey: string, fn: (s: SessionStatus) => void): void {
    this.statusListeners.get(sessionKey)?.delete(fn);
  }

  // Release the file URI claimed by this editor view (called when the view closes, switches file, or
  // re-applies the LSP layer), freeing it for another view to drive the LSP plugin.
  releaseOwner(owner: object): void {
    for (const [uri, o] of this.uriOwners) if (o === owner) this.uriOwners.delete(uri);
  }

  // Tear down all sessions (plugin unload / feature disabled). No orphan processes (FR-012).
  dispose(): void {
    this.sessions.disposeAll();
    this.statusListeners.clear();
    this.hintedLanguages.clear();
    this.uriOwners.clear();
    // Stop feeding the agent and drop the collected diagnostics (getDiagnostics returns to empty).
    setDiagnosticsProvider(null);
    this.bridge.clear();
  }
}

export function createLspController(deps: ControllerDeps): LspController {
  return new LspController(deps);
}
