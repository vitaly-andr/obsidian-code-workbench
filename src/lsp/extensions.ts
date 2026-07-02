// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// CM6 extension builders for a connected LSP session. The controller (index.ts) owns the session;
// the editor (CodeView) owns the `Compartment` and reconfigures it with what `buildSessionExtensions`
// returns. This mirrors how the tree-sitter layer upgrades the editor through a Compartment, so the
// LSP layer can be attached when a server connects and dropped to highlighting-only when it is not.
//
// The diagnostics capability is a *client* extension (it registers a server capability + the lint
// display), so it is configured on the LSPClient via `lspClientExtensions()`. `client.plugin(uri, …)`
// then pulls that editor extension in automatically (T017). The remaining features (completion/
// hover/signature/definition/references) are plain editor extensions added per US2–US4.

import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import {
  LSPClient,
  type LSPClientExtension,
  serverCompletion,
  hoverTooltips,
  signatureHelp,
  jumpToDefinitionKeymap,
  findReferencesKeymap,
  serverDiagnostics,
} from "@codemirror/lsp-client";
import type { LspDiagnostic } from "./diagnostics-bridge";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { lspPositionToOffset, offsetToLspPosition, type LspPosition } from "./offsets";
import { mapHighlights, type HighlightKind, type LspDocumentHighlight } from "./highlight";

// Which v1 features to wire. All default on; the per-US tasks enable them incrementally. Rename and
// formatting are intentionally absent — they mutate files and are post-v1 (US5/US6), gated behind the
// reviewed-diff write path (FR-022 / Principle III).
export interface LspFeatures {
  completion: boolean; // US2
  hover: boolean; // US3
  signature: boolean; // US3
  definition: boolean; // US4
  references: boolean; // US4
  documentHighlight: boolean; // 009: occurrences of the symbol under the cursor
}

export const ALL_FEATURES: LspFeatures = {
  completion: true,
  hover: true,
  signature: true,
  definition: true,
  references: true,
  documentHighlight: true,
};

// Client-level extensions, passed to `new LSPClient({ extensions })`. serverDiagnostics() advertises
// the diagnostics capability and contributes the editor extension that renders the underlines, which
// `client.plugin(...)` includes — so US1 diagnostics need nothing more in the editor (T017).
//
// `onPublish` taps the server's `textDocument/publishDiagnostics` notification to record the raw
// diagnostics for the agent bridge (FR-026/T028). The recorder runs first and returns `false`, so the
// built-in serverDiagnostics handler still renders them in the editor — the tap is read-only.
export function lspClientExtensions(
  onPublish: (uri: string, diagnostics: readonly LspDiagnostic[]) => void,
): readonly (Extension | LSPClientExtension)[] {
  const recorder: LSPClientExtension = {
    notificationHandlers: {
      "textDocument/publishDiagnostics": (_client, params: { uri: string; diagnostics?: LspDiagnostic[] }) => {
        onPublish(params.uri, params.diagnostics ?? []);
        return false; // not handled — let serverDiagnostics render the underlines
      },
    },
  };
  return [recorder, serverDiagnostics()];
}

// LSP DiagnosticSeverity (1=error … 4=hint) → @codemirror/lint severity word.
const CM_SEVERITY: Record<number, CmDiagnostic["severity"]> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

// The slice of a DocumentDiagnosticReport (LSP 3.17) we read: a "full" report carries `items`; an
// "unchanged" report means "same as the previous pull" (we keep the last items). Declared locally so
// the bundle does not pull the full vscode-languageserver-protocol types.
interface DiagnosticReport {
  kind?: "full" | "unchanged";
  items?: LspDiagnostic[];
}

// Map one LSP diagnostic to a CM6 lint diagnostic. Positions use offsets.ts (UTF-16, multibyte-correct,
// SC-007); an absent end collapses to a zero-width mark at the start.
export function lspToCmDiagnostic(doc: string, d: LspDiagnostic): CmDiagnostic {
  const from = lspPositionToOffset(doc, d.range.start);
  const to = d.range.end ? lspPositionToOffset(doc, d.range.end) : from;
  return { from, to: Math.max(from, to), severity: CM_SEVERITY[d.severity ?? 1] ?? "error", message: d.message };
}

// Pull-model diagnostics (LSP 3.17, US1/FR-026). @codemirror/lsp-client only consumes *pushed*
// `textDocument/publishDiagnostics`; servers like ruby-lsp deliver diagnostics solely via the
// `textDocument/diagnostic` *request* and never push, so serverDiagnostics() alone shows nothing. This
// linter issues that request on the existing client/connection (no new process), maps the report to CM6
// diagnostics, and re-runs on every doc change through @codemirror/lint's own debounce. It no-ops for
// push-only servers (no `diagnosticProvider` capability), so push and pull coexist. The same items are
// forwarded to `onDiagnostics` for the agent getDiagnostics bridge (FR-026).
export function pullDiagnostics(
  client: LSPClient,
  uri: string,
  onDiagnostics?: (uri: string, diagnostics: readonly LspDiagnostic[]) => void,
): Extension {
  let last: readonly LspDiagnostic[] = [];
  return linter(async (view): Promise<readonly CmDiagnostic[]> => {
    // serverCapabilities is typed via vscode-languageserver-protocol, which the lint program can't
    // resolve; narrow to the one field we read so the access stays type-safe.
    const caps = client.serverCapabilities as { diagnosticProvider?: unknown } | null;
    if (!caps?.diagnosticProvider) return []; // push-only server / not yet initialised
    client.sync(); // flush pending didChange so the server diagnoses the current text
    let report: DiagnosticReport | null;
    try {
      report = await client.request<{ textDocument: { uri: string } }, DiagnosticReport>(
        "textDocument/diagnostic",
        { textDocument: { uri } },
      );
    } catch {
      return []; // disconnected / timed out — clear rather than keep stale errors
    }
    const items = report?.kind === "unchanged" ? last : report?.items ?? [];
    last = items;
    onDiagnostics?.(uri, items);
    const doc = view.state.doc.toString();
    return items.map((d) => lspToCmDiagnostic(doc, d));
  });
}

// Debounce delay for a documentHighlight re-request after the cursor settles (FR-003). Short — the
// occurrences should feel near-instant (SC-001: "well under a second") while still not spamming the
// server on every caret tick, unlike the ~1200ms "let an edit settle" delay used for blame/outline.
const HIGHLIGHT_DEBOUNCE_MS = 200;

// CSS class for one occurrence mark, chosen by kind (US2/FR-006): "write" (an assignment/definition)
// gets a distinct tint; "read"/"text" share the neutral class. Degrades to the neutral class when the
// server omits `kind` (mapHighlights already normalizes a missing kind to "text").
function highlightMarkClass(kind: HighlightKind): string {
  return kind === "write" ? "cw-lsp-occurrence-write" : "cw-lsp-occurrence";
}

// Drives one file's occurrence-highlight decorations. @codemirror/lsp-client has no built-in
// document-highlight (unlike completion/hover/signature), so this is a small custom ViewPlugin — same
// shape as pullDiagnostics: gate on serverCapabilities, client.request, offsets.ts mapping — but
// triggered by the caret (selectionSet), not by @codemirror/lint's own doc-change debounce.
class DocumentHighlighter {
  decorations: DecorationSet = Decoration.none;
  private timer: number | null = null;
  // Bumped on every request; a response is applied only if it is still the latest (drops a stale
  // result from a superseded cursor position, contract B3).
  private generation = 0;

  constructor(
    private readonly view: EditorView,
    private readonly client: LSPClient,
    private readonly uri: string,
  ) {
    this.schedule();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged || u.selectionSet) this.schedule();
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, HIGHLIGHT_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const gen = ++this.generation;
    // serverCapabilities is typed via vscode-languageserver-protocol, which this file avoids
    // depending on; narrow to the one field read here, same convention as pullDiagnostics.
    const caps = this.client.serverCapabilities as { documentHighlightProvider?: unknown } | null;
    if (!caps?.documentHighlightProvider) return this.clear();
    this.client.sync(); // flush pending didChange so the server sees the current text (pullDiagnostics precedent)
    const position = offsetToLspPosition(
      this.view.state.doc.toString(),
      this.view.state.selection.main.head,
    );
    let raw: LspDocumentHighlight[] | null;
    try {
      raw = await this.client.request<
        { textDocument: { uri: string }; position: LspPosition },
        LspDocumentHighlight[] | null
      >("textDocument/documentHighlight", { textDocument: { uri: this.uri }, position });
    } catch {
      raw = null; // disconnected / timed out — clear rather than keep stale marks
    }
    if (gen !== this.generation) return; // the cursor moved again before this resolved
    if (!raw || raw.length === 0) return this.clear();
    const spans = mapHighlights(raw, this.view.state.doc.toString());
    if (spans.length === 0) return this.clear();
    const marks = spans
      .slice()
      .sort((a, b) => a.from - b.from || a.to - b.to)
      .map((s) => Decoration.mark({ class: highlightMarkClass(s.kind) }).range(s.from, s.to));
    this.decorations = Decoration.set(marks);
    this.view.dispatch({}); // an empty transaction repaints with the new decorations
  }

  private clear(): void {
    if (this.decorations === Decoration.none) return; // avoid a needless empty dispatch
    this.decorations = Decoration.none;
    this.view.dispatch({});
  }
}

// Highlight every occurrence of the symbol under the cursor (009). Read-only: sends only
// textDocument/documentHighlight, never a file-modifying request (FR-008).
export function documentHighlights(client: LSPClient, uri: string): Extension {
  return ViewPlugin.define((view) => new DocumentHighlighter(view, client, uri), {
    decorations: (v) => v.decorations,
  });
}

// The editor extension set for one connected file. `client.plugin(uri, languageId)` wires the file to
// the server (didOpen/didChange/didClose, push diagnostics display) and pullDiagnostics adds the LSP
// 3.17 pull path. The rest are the read/navigate features (US2–US4, 009).
export function buildSessionExtensions(
  client: LSPClient,
  uri: string,
  languageId: string,
  features: LspFeatures = ALL_FEATURES,
  onDiagnostics?: (uri: string, diagnostics: readonly LspDiagnostic[]) => void,
): Extension {
  const ext: Extension[] = [client.plugin(uri, languageId), pullDiagnostics(client, uri, onDiagnostics)];
  if (features.completion) ext.push(serverCompletion());
  if (features.hover) ext.push(hoverTooltips());
  if (features.signature) ext.push(signatureHelp());
  const keys = [
    ...(features.definition ? jumpToDefinitionKeymap : []),
    ...(features.references ? findReferencesKeymap : []),
  ];
  if (keys.length) ext.push(keymap.of(keys));
  if (features.documentHighlight) ext.push(documentHighlights(client, uri));
  return ext;
}
