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

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
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
import { codeFolding, foldGutter, foldKeymap, foldService } from "@codemirror/language";
import type { LspDiagnostic } from "./diagnostics-bridge";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { lspPositionToOffset, offsetToLspPosition, type LspPosition } from "./offsets";
import { mapHighlights, type HighlightKind, type LspDocumentHighlight } from "./highlight";
import { mapInlayHints, type InlayHintKind, type LspInlayHint } from "./inlay";
import { decodeSemanticTokens, type SemanticSpan, type SemanticTokensLegend } from "./semantic-tokens";
import { mapFoldingRanges, type LspFoldRange, type LspFoldingRange } from "./folding";

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
  inlayHint: boolean; // 010: inline inferred types + parameter names
  semanticTokens: boolean; // 011: server-driven token colors layered over tree-sitter
  folding: boolean; // 012: fold gutter + fold/unfold from the server's structural regions
}

export const ALL_FEATURES: LspFeatures = {
  completion: true,
  hover: true,
  signature: true,
  definition: true,
  references: true,
  documentHighlight: true,
  inlayHint: true,
  semanticTokens: true,
  folding: true,
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

// Debounce delay for an inlayHint re-request (FR-003) — short, same as the 009 highlight delay, so
// hints feel near-instant (SC-001) without spamming the server on every edit/scroll tick.
const INLAY_DEBOUNCE_MS = 200;

// A non-editable, atomic inline annotation (an inferred type or a parameter name). Decoration.widget
// content is not part of the document model, so it is never selected, copied, or edited (FR-005) —
// unlike 009's mark decorations, which tint existing text, a widget can render content that is not
// in the doc at all, which is what an inlay hint is (research.md R2).
class InlayHintWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly kind: InlayHintKind,
    private readonly paddingLeft: boolean,
    private readonly paddingRight: boolean,
  ) {
    super();
  }

  eq(other: InlayHintWidget): boolean {
    return (
      this.label === other.label &&
      this.kind === other.kind &&
      this.paddingLeft === other.paddingLeft &&
      this.paddingRight === other.paddingRight
    );
  }

  toDOM(view: EditorView): HTMLElement {
    // The view's own document, not the global one, so this still renders correctly in a popped-out
    // window (same convention as the diff view's revert button / git-graph's SVG elements).
    const span = view.dom.ownerDocument.createElement("span");
    span.className = `cw-lsp-inlay cw-lsp-inlay-${this.kind}`;
    if (this.paddingLeft) span.classList.add("cw-lsp-inlay-pad-left");
    if (this.paddingRight) span.classList.add("cw-lsp-inlay-pad-right");
    span.textContent = this.label;
    return span;
  }
}

// Drives one file's inlay-hint widgets. @codemirror/lsp-client has no built-in inlay-hint feature
// (same gap as 009's document-highlight), so this is a custom ViewPlugin shaped like
// DocumentHighlighter — gate on serverCapabilities, client.request, offsets.ts mapping, debounce +
// stale-drop — but widget (not mark) decorations, and the request is scoped to the visible line
// range (inlayHint is a range request) rather than a single cursor position.
class InlayHinter {
  decorations: DecorationSet = Decoration.none;
  private timer: number | null = null;
  // Bumped on every request; a response is applied only if it is still the latest (drops a stale
  // result from a superseded viewport/doc state, contract B3/US2).
  private generation = 0;

  constructor(
    private readonly view: EditorView,
    private readonly client: LSPClient,
    private readonly uri: string,
  ) {
    this.schedule();
  }

  update(u: ViewUpdate): void {
    // viewportChanged (US2): scroll/resize reveals new lines, which need their own hints — not just
    // an edit. run() always re-reads view.viewport fresh, so this naturally re-scopes to wherever the
    // user scrolled to.
    if (u.docChanged || u.viewportChanged) this.schedule();
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, INLAY_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const gen = ++this.generation;
    // serverCapabilities is typed via vscode-languageserver-protocol, which this file avoids
    // depending on; narrow to the one field read here, same convention as pullDiagnostics.
    const caps = this.client.serverCapabilities as { inlayHintProvider?: unknown } | null;
    if (!caps?.inlayHintProvider) return this.clear();
    this.client.sync(); // flush pending didChange so the server sees the current text (pullDiagnostics precedent)
    const doc = this.view.state.doc.toString();
    // Never the whole document — inlayHint is a range request, so scope it to what is on screen
    // (FR-003; the viewport is re-read fresh on every request so scrolling picks up new lines).
    const { from, to } = this.view.viewport;
    const range = { start: offsetToLspPosition(doc, from), end: offsetToLspPosition(doc, to) };
    let raw: LspInlayHint[] | null;
    try {
      raw = await this.client.request<
        { textDocument: { uri: string }; range: { start: LspPosition; end: LspPosition } },
        LspInlayHint[] | null
      >("textDocument/inlayHint", { textDocument: { uri: this.uri }, range });
    } catch {
      raw = null; // disconnected / timed out — clear rather than keep stale hints
    }
    if (gen !== this.generation) return; // the viewport/doc moved on before this resolved
    if (!raw || raw.length === 0) return this.clear();
    const hints = mapInlayHints(raw, this.view.state.doc.toString());
    if (hints.length === 0) return this.clear();
    const widgets = hints
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((h) =>
        Decoration.widget({
          widget: new InlayHintWidget(h.label, h.kind, h.paddingLeft, h.paddingRight),
          side: 1,
        }).range(h.offset),
      );
    this.decorations = Decoration.set(widgets);
    this.view.dispatch({}); // an empty transaction repaints with the new decorations
  }

  private clear(): void {
    if (this.decorations === Decoration.none) return; // avoid a needless empty dispatch
    this.decorations = Decoration.none;
    this.view.dispatch({});
  }
}

// Render the server's inlay hints (inferred types, parameter names) inline (010). Read-only: sends
// only textDocument/inlayHint, never inlayHint/resolve or a file-modifying request (FR-007).
export function inlayHints(client: LSPClient, uri: string): Extension {
  return ViewPlugin.define((view) => new InlayHinter(view, client, uri), {
    decorations: (v) => v.decorations,
  });
}

// Debounce delay for a semanticTokens re-request after an edit (FR-003) — same as the other 009-011
// editor-layer debounces (short: colors should refresh quickly, not spam the server per keystroke).
const SEMANTIC_DEBOUNCE_MS = 200;

// Semantic token type -> the tree-sitter highlighter's own CSS class (styles.css, src/treesitter/
// tree-extensions.ts), so semantic and syntax highlighting share one palette (research.md R3) instead
// of a second copy of the same --code-* color rules. Only LSP's standard token types are listed;
// anything else (including a server-specific extension type) falls through to no type class — the
// span still renders if it carries a recognized modifier, otherwise it is a no-op layered over
// tree-sitter's own color (data-model.md's "unknown -> neutral").
const SEMANTIC_TYPE_CLASS: Record<string, string> = {
  namespace: "cm-ts-type",
  type: "cm-ts-type",
  class: "cm-ts-type",
  enum: "cm-ts-type",
  interface: "cm-ts-type",
  struct: "cm-ts-type",
  typeParameter: "cm-ts-type",
  parameter: "cm-ts-variable",
  variable: "cm-ts-variable",
  property: "cm-ts-property",
  enumMember: "cm-ts-property",
  event: "cm-ts-property",
  function: "cm-ts-function",
  method: "cm-ts-function",
  macro: "cm-ts-function",
  decorator: "cm-ts-function",
  keyword: "cm-ts-keyword",
  modifier: "cm-ts-keyword",
  comment: "cm-ts-comment",
  string: "cm-ts-string",
  regexp: "cm-ts-string",
  number: "cm-ts-value",
  operator: "cm-ts-operator",
};

// A class per active modifier (US2/FR-005) — layered alongside the type class. Unknown modifiers are
// ignored (data-model.md), not an error.
const SEMANTIC_MODIFIER_CLASS: Record<string, string> = {
  deprecated: "cw-lsp-sem-deprecated",
  readonly: "cw-lsp-sem-readonly",
  static: "cw-lsp-sem-static",
};

// The CSS classes for one span (US1 type + US2 modifiers), or an empty array when nothing is
// recognized — the span is then a true no-op, leaving tree-sitter's own color untouched
// (data-model.md's "unknown -> neutral").
function semanticMarkClasses(span: SemanticSpan): string[] {
  const classes: string[] = [];
  const typeClass = SEMANTIC_TYPE_CLASS[span.type];
  if (typeClass) classes.push(typeClass);
  for (const modifier of span.modifiers) {
    const modifierClass = SEMANTIC_MODIFIER_CLASS[modifier];
    if (modifierClass) classes.push(modifierClass);
  }
  return classes;
}

// Drives one file's semantic-token decorations, layered over (never replacing) the always-on
// tree-sitter highlighter — same shape as DocumentHighlighter/InlayHinter (capability gate,
// client.sync() before requesting, debounce + generation-guard) but reading the server's advertised
// legend and decoding the LSP relative encoding (decodeSemanticTokens). v1 always requests the full
// token set (research.md R4/R5 — simpler and correct; /range and full/delta are later optimizations).
class SemanticTokenizer {
  decorations: DecorationSet = Decoration.none;
  private timer: number | null = null;
  // Bumped on every request; a response is applied only if it is still the latest (drops a stale
  // result from a superseded doc state, contract's generation-counter requirement).
  private generation = 0;

  constructor(
    private readonly view: EditorView,
    private readonly client: LSPClient,
    private readonly uri: string,
  ) {
    this.schedule();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged) this.schedule();
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, SEMANTIC_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const gen = ++this.generation;
    // serverCapabilities is typed via vscode-languageserver-protocol, which this file avoids
    // depending on; narrow to the one field read here, same convention as pullDiagnostics. Unlike a
    // boolean-capable field (e.g. documentHighlightProvider), semanticTokensProvider always carries an
    // object with a legend per the LSP spec, but the narrow cast stays defensive about a malformed one.
    const caps = this.client.serverCapabilities as {
      semanticTokensProvider?: { legend?: SemanticTokensLegend };
    } | null;
    const legend = caps?.semanticTokensProvider?.legend;
    if (!legend?.tokenTypes || !legend.tokenModifiers) return this.clear();
    this.client.sync(); // flush pending didChange so the server tokenizes the current text (pullDiagnostics precedent)
    let result: { data?: number[] } | null;
    try {
      result = await this.client.request<{ textDocument: { uri: string } }, { data?: number[] } | null>(
        "textDocument/semanticTokens/full",
        { textDocument: { uri: this.uri } },
      );
    } catch {
      result = null; // disconnected / timed out — clear rather than keep stale colors
    }
    if (gen !== this.generation) return; // the doc moved on before this resolved
    const data = result?.data;
    if (!data || data.length === 0) return this.clear();
    const spans = decodeSemanticTokens(data, legend, this.view.state.doc.toString());
    const marks = spans
      .slice()
      .sort((a, b) => a.from - b.from || a.to - b.to)
      .map((span) => {
        const classes = semanticMarkClasses(span);
        return classes.length > 0 ? Decoration.mark({ class: classes.join(" ") }).range(span.from, span.to) : null;
      })
      .filter((mark) => mark !== null);
    if (marks.length === 0) return this.clear();
    this.decorations = Decoration.set(marks);
    this.view.dispatch({}); // an empty transaction repaints with the new decorations
  }

  private clear(): void {
    if (this.decorations === Decoration.none) return; // avoid a needless empty dispatch
    this.decorations = Decoration.none;
    this.view.dispatch({});
  }
}

// Recolor tokens by the server's semantic classification, layered over tree-sitter (011). Read-only:
// sends only textDocument/semanticTokens/full, never a file-modifying request (FR-007).
//
// Prec.highest is load-bearing, not cosmetic: CM6 renders the higher-precedence mark as the *inner*
// span, and the inner span's `color` is what paints the glyph. The tree-sitter highlighter's plugin
// is added earlier (code-view.ts, langLayer before lspLayer) and so is inner by default — leaving the
// semantic marks outside it, where their `color` is overridden and the recoloring (US1/FR-005) is
// visually inert (only modifiers, which inherit to descendant text, would show). Lifting the semantic
// plugin above the tree-sitter layer nests it inside, so the semantic color wins the overlap.
export function semanticTokens(client: LSPClient, uri: string): Extension {
  return Prec.highest(
    ViewPlugin.define((view) => new SemanticTokenizer(view, client, uri), {
      decorations: (v) => v.decorations,
    }),
  );
}

// Debounce delay for a foldingRange re-request after an edit (FR-003) — same as the other 009-011
// editor-layer debounces.
const FOLDING_DEBOUNCE_MS = 200;

// Replaces the fold-ranges field's contents (R2: a StateEffect the requesting ViewPlugin dispatches
// when a foldingRange response arrives). Module-level, like the field below — one definition shared
// by every attached file; each EditorState holds its own field *value*.
const setFoldRanges = StateEffect.define<readonly LspFoldRange[]>();

// The server's current fold ranges for this editor, replaced wholesale on each response (v1 always
// requests the full set — no incremental diffing). foldService (below) reads this field per line.
const foldRangesField = StateField.define<readonly LspFoldRange[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFoldRanges)) return effect.value;
    }
    return value;
  },
});

// foldGutter()/the fold commands both consult this per line; a line "begins" a range when the range's
// `from` (already computed as end-of-startLine or startCharacter, per folding.ts) falls within it.
function lspFoldService(
  state: EditorState,
  lineStart: number,
  lineEnd: number,
): { from: number; to: number } | null {
  for (const range of state.field(foldRangesField)) {
    if (range.from >= lineStart && range.from <= lineEnd) return { from: range.from, to: range.to };
  }
  return null;
}

// Requests textDocument/foldingRange and keeps foldRangesField up to date — the read half of the
// folding extension. Same shape as DocumentHighlighter/InlayHinter/SemanticTokenizer (capability gate,
// client.sync() before requesting, debounce + generation-guard) but this plugin renders nothing itself
// (no `decorations`); it only dispatches a StateEffect that foldGutter()/foldService (via the field
// above) pick up. Nothing is folded automatically (FR-005) — this only supplies candidates for the
// reader to fold via the gutter marker or the fold keys.
class FoldingRequester {
  private timer: number | null = null;
  // Bumped on every request; a response is applied only if it is still the latest (drops a stale
  // result from a superseded doc state, contract's generation-counter requirement).
  private generation = 0;

  constructor(
    private readonly view: EditorView,
    private readonly client: LSPClient,
    private readonly uri: string,
  ) {
    this.schedule();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged) this.schedule();
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, FOLDING_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    const gen = ++this.generation;
    // serverCapabilities is typed via vscode-languageserver-protocol, which this file avoids
    // depending on; narrow to the one field read here, same convention as pullDiagnostics.
    const caps = this.client.serverCapabilities as { foldingRangeProvider?: unknown } | null;
    if (!caps?.foldingRangeProvider) return this.clear();
    this.client.sync(); // flush pending didChange so the server sees the current text (pullDiagnostics precedent)
    let raw: LspFoldingRange[] | null;
    try {
      raw = await this.client.request<{ textDocument: { uri: string } }, LspFoldingRange[] | null>(
        "textDocument/foldingRange",
        { textDocument: { uri: this.uri } },
      );
    } catch {
      raw = null; // disconnected / timed out — clear rather than keep stale ranges
    }
    if (gen !== this.generation) return; // the doc moved on before this resolved
    if (!raw || raw.length === 0) return this.clear();
    const ranges = mapFoldingRanges(raw, this.view.state.doc.toString());
    this.replace(ranges);
  }

  private replace(ranges: readonly LspFoldRange[]): void {
    this.view.dispatch({ effects: setFoldRanges.of(ranges) });
  }

  private clear(): void {
    if (this.view.state.field(foldRangesField).length === 0) return; // avoid a needless empty dispatch
    this.replace([]);
  }
}

// Fold gutter + fold/unfold + fold-all/unfold-all, fed by the server's structural regions (012).
// Read-only: sends only textDocument/foldingRange, never a file-modifying request (FR-008). Built on
// CodeMirror's own folding (codeFolding/foldGutter/foldKeymap, host-provided @codemirror/language) —
// unlike 009/010/011 this supplies ranges through foldService + a state field, not decorations; the
// code editor has no folding today, so this adds it (not a refinement of an existing layer).
export function lspFolding(client: LSPClient, uri: string): Extension {
  return [
    foldRangesField,
    codeFolding(),
    // `foldingChanged` is load-bearing: foldGutter only rebuilds its markers on its own triggers
    // (doc/viewport/foldState/syntaxTree changes), NOT when our foldRangesField updates. The server's
    // ranges arrive asynchronously (after the first foldingRange response), so without this the gutter
    // is built while the field is still empty and never refreshes — the markers only appear on the next
    // unrelated scroll/edit. Signalling the field swap here makes them appear as soon as the ranges land.
    foldGutter({
      foldingChanged: (update) =>
        update.startState.field(foldRangesField) !== update.state.field(foldRangesField),
    }),
    keymap.of(foldKeymap),
    foldService.of(lspFoldService),
    ViewPlugin.define((view) => new FoldingRequester(view, client, uri)),
  ];
}

// The editor extension set for one connected file. `client.plugin(uri, languageId)` wires the file to
// the server (didOpen/didChange/didClose, push diagnostics display) and pullDiagnostics adds the LSP
// 3.17 pull path. The rest are the read/navigate features (US2–US4, 009, 010, 011, 012).
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
  if (features.inlayHint) ext.push(inlayHints(client, uri));
  if (features.semanticTokens) ext.push(semanticTokens(client, uri));
  if (features.folding) ext.push(lspFolding(client, uri));
  return ext;
}
