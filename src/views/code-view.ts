// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { TextFileView, WorkspaceLeaf } from "obsidian";
import { Compartment, EditorState, Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { SelectionPayload } from "../context";
import { SelectionProvider } from "../tools/selection";
import { extensionOf, grammarKeyForPath } from "../util/languages";
import { absoluteForVaultPath, toFileUri } from "../util/paths";
import { CODE_VIEW_TYPE } from "./view-types";
import { languageExtension, obsidianEditorTheme, obsidianHighlighting } from "./cm-theme";
import { syntaxDiagnostics } from "./lezer-lint";
import { formatCode } from "../format/prettier-format";
import { grammarForExtension } from "../treesitter/registry";
import { treeSitterExtensions } from "../treesitter/tree-extensions";
import type { GrammarLoader } from "../treesitter/loader";
import type { FormatService } from "../format/format-service";

// §9: renders non-markdown files with CodeMirror 6 syntax highlighting, editable (basic editing
// only — no LSP/linter/autocomplete), using the host's CM6 singleton (R2). Reports its selection
// like a note; edits persist through Obsidian's save.
// Optional tree-sitter wiring handed in by the plugin: the grammar loader plus a live read of the
// "enable tree-sitter" setting. Absent => CodeView stays on the bundled Lezer/legacy highlighter.
export interface TreeSitterConfig {
  loader: GrammarLoader;
  enabled: () => boolean;
}

export class CodeView extends TextFileView implements SelectionProvider {
  private editor: EditorView | null = null;
  // Swappable language layer: Lezer/legacy first, upgraded to tree-sitter once a grammar loads.
  private readonly langLayer = new Compartment();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly ts?: TreeSitterConfig,
    private readonly formatService?: FormatService,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CODE_VIEW_TYPE;
  }

  getIcon(): string {
    return "file-code";
  }

  getViewData(): string {
    return this.editor ? this.editor.state.doc.toString() : this.data;
  }

  setViewData(data: string, _clear: boolean): void {
    this.data = data;
    this.renderEditor(data);
  }

  clear(): void {
    this.data = "";
    this.editor?.destroy();
    this.editor = null;
    this.contentEl.empty();
  }

  private renderEditor(data: string): void {
    this.editor?.destroy();
    this.contentEl.empty();
    // Highlighting key (blade-aware); formatting still keys off the raw extension below.
    const ext = this.file ? grammarKeyForPath(this.file.path) : "";
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      obsidianEditorTheme,
      obsidianHighlighting,
      EditorView.lineWrapping,
      // Editable; persist edits through Obsidian's save.
      EditorView.updateListener.of((u) => {
        if (u.docChanged) this.requestSave();
      }),
      // Highlighting + diagnostics layer. Starts on the bundled Lezer/legacy grammar (instant), and
      // is swapped for tree-sitter once that grammar finishes downloading (maybeUpgradeToTreeSitter).
      this.langLayer.of(this.lezerLayer(ext)),
    ];

    this.editor = new EditorView({
      state: EditorState.create({ doc: data, extensions }),
      parent: this.contentEl,
    });
    void this.maybeUpgradeToTreeSitter(ext, this.editor);
  }

  // Bundled Lezer/legacy highlighter plus its syntax-error underlines (the latter for lang-* only).
  private lezerLayer(ext: string): Extension {
    const lang = languageExtension(ext);
    if (!lang) return [];
    // Lezer's sass grammar misparses modern SCSS (maps, map-get, division), and HTML parsing of
    // astro frontmatter is noisy — skip Lezer diagnostics there to avoid false errors. tree-sitter,
    // when enabled, is accurate.
    const noisyDiagnostics = ext === "scss" || ext === "sass" || ext === "astro";
    return noisyDiagnostics ? [lang] : [lang, syntaxDiagnostics];
  }

  // When tree-sitter is enabled and a grammar exists for this file, download it (cached after the
  // first time) and swap the language layer over. Grammars with no highlights query keep the Lezer
  // colors and gain only tree-sitter diagnostics.
  private async maybeUpgradeToTreeSitter(ext: string, view: EditorView): Promise<void> {
    if (!this.ts?.enabled()) return;
    const src = grammarForExtension(ext);
    if (!src) return;
    const grammar = await this.ts.loader.load(src);
    if (!grammar || this.editor !== view) return; // unavailable, or the file was switched meanwhile
    // Does the query actually highlight this document? Some grammars ship incomplete queries that
    // yield no captures — keep the Lezer colours then, and use tree-sitter only for diagnostics,
    // rather than blanking the file.
    let highlights = false;
    if (grammar.query) {
      const tree = grammar.parser.parse(view.state.doc.toString());
      if (tree) {
        highlights = grammar.query.captures(tree.rootNode).length > 0;
        tree.delete();
      }
    }
    const layer: Extension = highlights
      ? treeSitterExtensions(grammar)
      : [languageExtension(ext) ?? [], treeSitterExtensions({ parser: grammar.parser, query: null })];
    view.dispatch({ effects: this.langLayer.reconfigure(layer) });
  }

  getSelectionPayload(): SelectionPayload | null {
    if (!this.editor || !this.file) return null;
    const state = this.editor.state;
    const range = state.selection.main;
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    const abs = absoluteForVaultPath(this.app, this.file.path) ?? this.file.path;
    return {
      success: true,
      text: state.sliceDoc(range.from, range.to),
      filePath: abs,
      fileUrl: toFileUri(abs),
      selection: {
        start: { line: fromLine.number - 1, character: range.from - fromLine.from },
        end: { line: toLine.number - 1, character: range.to - toLine.from },
        isEmpty: range.empty,
      },
    };
  }

  // Format the open file with Prettier (in-process). Returns false if unsupported or invalid.
  async format(): Promise<boolean> {
    if (!this.editor || !this.file) return false;
    // Blade-aware key so ".blade.php" routes to the blade formatter, not php (.liquid/.twig/.j2 map
    // to themselves). The wasm/dprint formatters still match on these keys too.
    const ext = grammarKeyForPath(this.file.path);
    const current = this.editor.state.doc.toString();
    // FormatService chains Prettier (web+xml) -> rust -> @wasm-fmt -> dprint; downloads cache on first use.
    const formatted = this.formatService
      ? await this.formatService.format(current, ext)
      : await formatCode(current, ext);
    if (formatted == null || formatted === current) return false;
    this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: formatted } });
    this.requestSave();
    return true;
  }
}

export { CODE_VIEW_EXTENSIONS } from "./cm-theme";
