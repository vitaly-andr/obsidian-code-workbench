// Fallback declarations for the CodeMirror 6 surface this plugin uses.
//
// Not used in a normal checkout: tsconfig `paths` lists node_modules first, so the build always
// type-checks against the real definitions (https://codemirror.net/docs/ref/). This file only
// takes over where the sources are linted without installing dependencies, in which case every
// @codemirror import would resolve to TypeScript's `error` type and look like an unchecked `any`.
//
// Scope: only what `main.ts` and `src/**` touch. Obsidian provides these packages at runtime;
// esbuild lists them as externals, so nothing here affects the bundle.

declare module "@codemirror/state" {
  export type Extension = { extension: Extension } | readonly Extension[];

  export class Text implements Iterable<string> {
    readonly length: number;
    readonly lines: number;
    lineAt(pos: number): Line;
    line(n: number): Line;
    sliceString(from: number, to?: number, lineSep?: string): string;
    toString(): string;
    iterLines(from?: number, to?: number): Iterator<string>;
    [Symbol.iterator](): Iterator<string>;
    static of(text: readonly string[]): Text;
    static empty: Text;
  }

  export interface Line {
    readonly from: number;
    readonly to: number;
    readonly number: number;
    readonly text: string;
    readonly length: number;
  }

  export class ChangeDesc {
    readonly length: number;
    readonly newLength: number;
    readonly empty: boolean;
    iterChangedRanges(f: (fromA: number, toA: number, fromB: number, toB: number) => void, individual?: boolean): void;
    mapPos(pos: number, assoc?: number): number;
  }

  export class ChangeSet extends ChangeDesc {
    apply(doc: Text): Text;
    iterChanges(
      f: (fromA: number, toA: number, fromB: number, toB: number, inserted: Text) => void,
      individual?: boolean,
    ): void;
    static of(
      changes: readonly { from: number; to?: number; insert?: string | Text }[],
      length: number,
      lineSep?: string,
    ): ChangeSet;
  }

  export interface SelectionRange {
    readonly from: number;
    readonly to: number;
    readonly anchor: number;
    readonly head: number;
    readonly empty: boolean;
  }

  export class EditorSelection {
    readonly ranges: readonly SelectionRange[];
    readonly main: SelectionRange;
    static single(anchor: number, head?: number): EditorSelection;
    static cursor(pos: number, assoc?: number): SelectionRange;
    static range(anchor: number, head: number): SelectionRange;
  }

  // A read-only view of a facet's combined value, as returned by Facet.reader.
  export interface FacetReader<Output> {
    readonly tag: Output;
  }

  export class Facet<Input, Output = readonly Input[]> {
    get reader(): FacetReader<Output>;
    of(value: Input): Extension;
    from<T extends Input>(field: StateField<T>): Extension;
    compute(deps: readonly unknown[], get: (state: EditorState) => Input): Extension;
    static define<Input, Output = readonly Input[]>(config?: {
      combine?: (value: readonly Input[]) => Output;
      compare?: (a: Output, b: Output) => boolean;
      static?: boolean;
    }): Facet<Input, Output>;
  }

  export class StateEffectType<Value> {
    of(value: Value): StateEffect<Value>;
  }

  export class StateEffect<Value> {
    readonly value: Value;
    is<T>(type: StateEffectType<T>): this is StateEffect<T>;
    map(mapping: ChangeDesc): StateEffect<Value> | undefined;
    static define<Value = null>(spec?: { map?: (value: Value, mapping: ChangeDesc) => Value | undefined }): StateEffectType<Value>;
    static reconfigure: StateEffectType<Extension>;
    static appendConfig: StateEffectType<Extension>;
  }

  export class StateField<Value> {
    init(create: (state: EditorState) => Value): Extension;
    readonly extension: Extension;
    static define<Value>(config: {
      create: (state: EditorState) => Value;
      update: (value: Value, transaction: Transaction) => Value;
      compare?: (a: Value, b: Value) => boolean;
      provide?: (field: StateField<Value>) => Extension;
    }): StateField<Value>;
  }

  export interface TransactionSpec {
    changes?: { from: number; to?: number; insert?: string | Text } | readonly { from: number; to?: number; insert?: string | Text }[] | ChangeSet;
    selection?: EditorSelection | { anchor: number; head?: number };
    effects?: StateEffect<unknown> | readonly StateEffect<unknown>[];
    annotations?: unknown;
    scrollIntoView?: boolean;
    filter?: boolean;
    userEvent?: string;
  }

  export class Transaction {
    readonly state: EditorState;
    readonly startState: EditorState;
    readonly changes: ChangeSet;
    readonly selection: EditorSelection | undefined;
    readonly effects: readonly StateEffect<unknown>[];
    readonly docChanged: boolean;
    isUserEvent(event: string): boolean;
  }

  export class EditorState {
    readonly doc: Text;
    readonly selection: EditorSelection;
    field<Value>(field: StateField<Value>): Value;
    field<Value>(field: StateField<Value>, require: false): Value | undefined;
    update(...specs: readonly TransactionSpec[]): Transaction;
    sliceDoc(from?: number, to?: number): string;
    wordAt(pos: number): SelectionRange | null;
    facet<Output>(facet: Facet<unknown, Output>): Output;
    toJSON(): unknown;
    static create(config?: { doc?: string | Text; selection?: EditorSelection; extensions?: Extension }): EditorState;
    static readOnly: Facet<boolean, boolean>;
    static tabSize: Facet<number, number>;
    static allowMultipleSelections: Facet<boolean, boolean>;
  }

  export class Compartment {
    of(ext: Extension): Extension;
    reconfigure(content: Extension): StateEffect<unknown>;
    get(state: EditorState): Extension | undefined;
  }

  export class Prec {
    static highest(ext: Extension): Extension;
    static high(ext: Extension): Extension;
    static default(ext: Extension): Extension;
    static low(ext: Extension): Extension;
    static lowest(ext: Extension): Extension;
  }

  export class Range<T> {
    readonly from: number;
    readonly to: number;
    readonly value: T;
  }

  export class RangeSet<T> {
    readonly size: number;
    iter(from?: number): RangeCursor<T>;
    between(from: number, to: number, f: (from: number, to: number, value: T) => false | void): void;
    map(changes: ChangeDesc): RangeSet<T>;
    update(updateSpec: { add?: readonly Range<T>[]; filter?: (from: number, to: number, value: T) => boolean }): RangeSet<T>;
    static empty: RangeSet<never>;
    static of<T>(ranges: readonly Range<T>[] | Range<T>, sort?: boolean): RangeSet<T>;
  }

  export interface RangeCursor<T> {
    next(): void;
    readonly value: T | null;
    readonly from: number;
    readonly to: number;
  }

  export class RangeSetBuilder<T> {
    add(from: number, to: number, value: T): void;
    finish(): RangeSet<T>;
  }
}

declare module "@codemirror/view" {
  import { EditorState, Extension, Range, RangeSet, StateEffect, Text, Transaction, TransactionSpec } from "@codemirror/state";

  export abstract class WidgetType {
    abstract toDOM(view: EditorView): HTMLElement;
    eq(other: WidgetType): boolean;
    updateDOM(dom: HTMLElement, view: EditorView): boolean;
    ignoreEvent(event: Event): boolean;
    get estimatedHeight(): number;
    destroy(dom: HTMLElement): void;
  }

  export interface MarkDecorationSpec {
    inclusive?: boolean;
    inclusiveStart?: boolean;
    inclusiveEnd?: boolean;
    attributes?: Record<string, string>;
    class?: string;
    tagName?: string;
    [key: string]: unknown;
  }

  export interface WidgetDecorationSpec {
    widget: WidgetType;
    side?: number;
    block?: boolean;
    [key: string]: unknown;
  }

  export interface LineDecorationSpec {
    attributes?: Record<string, string>;
    class?: string;
    [key: string]: unknown;
  }

  export type DecorationSet = RangeSet<Decoration>;

  export abstract class Decoration {
    readonly spec: unknown;
    range(from: number, to?: number): Range<Decoration>;
    static mark(spec: MarkDecorationSpec): Decoration;
    static widget(spec: WidgetDecorationSpec): Decoration;
    static replace(spec: { widget?: WidgetType; inclusive?: boolean; block?: boolean }): Decoration;
    static line(spec: LineDecorationSpec): Decoration;
    static set(of: readonly Range<Decoration>[] | Range<Decoration>, sort?: boolean): DecorationSet;
    static none: DecorationSet;
  }

  export interface Rect {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  }

  export interface BlockInfo {
    readonly from: number;
    readonly to: number;
    readonly top: number;
    readonly height: number;
  }

  export class ViewUpdate {
    readonly view: EditorView;
    readonly state: EditorState;
    readonly startState: EditorState;
    readonly transactions: readonly Transaction[];
    readonly changes: import("@codemirror/state").ChangeSet;
    readonly docChanged: boolean;
    readonly viewportChanged: boolean;
    readonly selectionSet: boolean;
    readonly focusChanged: boolean;
    readonly geometryChanged: boolean;
  }

  export interface PluginValue {
    update?(update: ViewUpdate): void;
    destroy?(): void;
  }

  export interface PluginSpec<V extends PluginValue> {
    eventHandlers?: Record<string, (this: V, event: Event, view: EditorView) => boolean | void>;
    provide?: (plugin: ViewPlugin<V>) => Extension;
    decorations?: (value: V) => DecorationSet;
  }

  export class ViewPlugin<V extends PluginValue> {
    // Phantom: carries the plugin's value type so EditorView.plugin() can return it.
    private readonly value: V;
    readonly extension: Extension;
    static fromClass<V extends PluginValue>(
      cls: { new (view: EditorView): V },
      spec?: PluginSpec<V>,
    ): ViewPlugin<V>;
    static define<V extends PluginValue>(create: (view: EditorView) => V, spec?: PluginSpec<V>): ViewPlugin<V>;
  }

  export interface KeyBinding {
    key?: string;
    mac?: string;
    win?: string;
    linux?: string;
    run?: (view: EditorView) => boolean;
    shift?: (view: EditorView) => boolean;
    preventDefault?: boolean;
    scope?: string;
  }

  export interface Tooltip {
    pos: number;
    end?: number;
    create(view: EditorView): { dom: HTMLElement; mount?(view: EditorView): void; destroy?(): void };
    above?: boolean;
    strictSide?: boolean;
    arrow?: boolean;
  }

  export class EditorView {
    constructor(config?: {
      state?: EditorState;
      parent?: Element | DocumentFragment;
      root?: Document | ShadowRoot;
      dispatch?: (tr: Transaction) => void;
      extensions?: Extension;
      doc?: string | Text;
    });
    readonly state: EditorState;
    readonly dom: HTMLElement;
    readonly contentDOM: HTMLElement;
    readonly scrollDOM: HTMLElement;
    readonly viewport: { from: number; to: number };
    readonly visibleRanges: readonly { from: number; to: number }[];
    readonly hasFocus: boolean;
    readonly themeClasses: string;
    dispatch(tr: Transaction): void;
    dispatch(...specs: readonly TransactionSpec[]): void;
    focus(): void;
    destroy(): void;
    setState(state: EditorState): void;
    requestMeasure(): void;
    posAtCoords(coords: { x: number; y: number }, precise?: boolean): number | null;
    coordsAtPos(pos: number, side?: number): Rect | null;
    lineBlockAt(pos: number): BlockInfo;
    plugin<V extends PluginValue>(plugin: ViewPlugin<V>): V | null;
    static theme(spec: Record<string, Record<string, string>>, options?: { dark?: boolean }): Extension;
    static baseTheme(spec: Record<string, Record<string, string>>): Extension;
    static domEventHandlers(handlers: Record<string, (event: Event, view: EditorView) => boolean | void>): Extension;
    static updateListener: import("@codemirror/state").Facet<(update: ViewUpdate) => void>;
    static editable: import("@codemirror/state").Facet<boolean, boolean>;
    static lineWrapping: Extension;
    static contentAttributes: import("@codemirror/state").Facet<Record<string, string>>;
    static editorAttributes: import("@codemirror/state").Facet<Record<string, string>>;
    static decorations: import("@codemirror/state").Facet<DecorationSet | ((view: EditorView) => DecorationSet)>;
    static scrollIntoView(pos: number, options?: { y?: string; x?: string; yMargin?: number }): StateEffect<unknown>;
  }

  export const keymap: import("@codemirror/state").Facet<readonly KeyBinding[]>;
  export function lineNumbers(config?: { formatNumber?: (lineNo: number, state: EditorState) => string }): Extension;
  export function highlightActiveLine(): Extension;
  export function tooltips(config?: { position?: "fixed" | "absolute"; parent?: HTMLElement }): Extension;
  export const closeHoverTooltips: StateEffect<null>;
  export function drawSelection(): Extension;
  export function rectangularSelection(): Extension;
}

declare module "@codemirror/language" {
  // Lezer tree types, declared here rather than imported: @lezer/common is not a direct
  // dependency of this plugin, only a transitive one reached through syntaxTree().
    class Tree {
      readonly length: number;
      readonly type: NodeType;
      topNode: SyntaxNode;
      cursor(mode?: number): TreeCursor;
      resolve(pos: number, side?: number): SyntaxNode;
      resolveInner(pos: number, side?: number): SyntaxNode;
      iterate(spec: {
        enter: (node: SyntaxNodeRef) => boolean | void;
        leave?: (node: SyntaxNodeRef) => void;
        from?: number;
        to?: number;
      }): void;
    }

    class NodeType {
      readonly name: string;
      readonly id: number;
      readonly isError: boolean;
      readonly isTop: boolean;
      readonly isSkipped: boolean;
      readonly isAnonymous: boolean;
      is(name: string | number): boolean;
    }

    interface SyntaxNodeRef {
      readonly from: number;
      readonly to: number;
      readonly type: NodeType;
      readonly name: string;
      node: SyntaxNode;
    }

    interface SyntaxNode extends SyntaxNodeRef {
      parent: SyntaxNode | null;
      firstChild: SyntaxNode | null;
      lastChild: SyntaxNode | null;
      nextSibling: SyntaxNode | null;
      prevSibling: SyntaxNode | null;
      getChild(type: string | number): SyntaxNode | null;
      getChildren(type: string | number): SyntaxNode[];
      cursor(mode?: number): TreeCursor;
    }

    interface TreeCursor extends SyntaxNodeRef {
      next(enter?: boolean): boolean;
      nextSibling(): boolean;
      firstChild(): boolean;
      parent(): boolean;
      iterate(enter: (node: SyntaxNodeRef) => boolean | void, leave?: (node: SyntaxNodeRef) => void): void;
    }

  import { EditorState, Extension, Facet } from "@codemirror/state";
  import { EditorView, KeyBinding } from "@codemirror/view";
  import { Tag } from "@lezer/highlight";

  export class Language {
    readonly name: string;
    readonly extension: Extension;
  }

  export class LanguageSupport {
    readonly language: Language;
    readonly support: Extension;
    readonly extension: Extension;
    constructor(language: Language, support?: Extension);
  }

  export interface StreamParser<State> {
    name?: string;
    startState?: (indentUnit: number) => State;
    token(stream: StringStream, state: State): string | null;
    blankLine?: (state: State, indentUnit: number) => void;
    copyState?: (state: State) => State;
    indent?: (state: State, textAfter: string) => number | null;
    languageData?: Record<string, unknown>;
    tokenTable?: Record<string, Tag>;
  }

  export class StringStream {
    pos: number;
    start: number;
    readonly string: string;
    eol(): boolean;
    sol(): boolean;
    peek(): string | undefined;
    next(): string | undefined;
    eat(match: string | RegExp | ((ch: string) => boolean)): string | undefined;
    eatWhile(match: string | RegExp | ((ch: string) => boolean)): boolean;
    eatSpace(): boolean;
    skipToEnd(): void;
    skipTo(ch: string): boolean | undefined;
    match(pattern: string | RegExp, consume?: boolean, caseInsensitive?: boolean): boolean | RegExpMatchArray | null;
    current(): string;
  }

  // The parser's state type lives on define(); nothing here refers to a parameterized instance.
  export class StreamLanguage extends Language {
    static define<State>(spec: StreamParser<State>): StreamLanguage;
  }

  export interface TagStyle {
    tag: Tag | readonly Tag[];
    class?: string;
    color?: string;
    fontStyle?: string;
    fontWeight?: string;
    textDecoration?: string;
    [key: string]: unknown;
  }

  export class HighlightStyle {
    readonly extension: Extension;
    static define(specs: readonly TagStyle[], options?: { scope?: Language; all?: string | Record<string, string>; themeType?: "dark" | "light" }): HighlightStyle;
  }

  export function syntaxHighlighting(highlighter: HighlightStyle, options?: { fallback?: boolean }): Extension;
  export function syntaxTree(state: EditorState): Tree;
  export function foldGutter(config?: {
    markerDOM?: (open: boolean) => HTMLElement;
    placeholderText?: string;
    foldingChanged?: (update: import("@codemirror/view").ViewUpdate) => boolean;
  }): Extension;
  export function codeFolding(config?: { placeholderDOM?: (view: EditorView, onclick: (e: Event) => void) => HTMLElement }): Extension;
  export const foldService: Facet<(state: EditorState, lineStart: number, lineEnd: number) => { from: number; to: number } | null>;
  export function foldAll(view: EditorView): boolean;
  export function unfoldAll(view: EditorView): boolean;
  export const foldKeymap: readonly KeyBinding[];
  export const indentUnit: Facet<string, string>;
  export function indentOnInput(): Extension;
  export function bracketMatching(): Extension;
  export function foldedRanges(state: EditorState): import("@codemirror/state").RangeSet<unknown>;
}

declare module "@codemirror/commands" {
  import { Extension } from "@codemirror/state";
  import { KeyBinding } from "@codemirror/view";
  export const defaultKeymap: readonly KeyBinding[];
  export const historyKeymap: readonly KeyBinding[];
  export const indentWithTab: KeyBinding;
  export function history(config?: { minDepth?: number; newGroupDelay?: number }): Extension;
}

declare module "@codemirror/lint" {
  import { Extension } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";

  export interface Action {
    name: string;
    apply(view: EditorView, from: number, to: number): void;
  }

  export interface Diagnostic {
    from: number;
    to: number;
    severity: "hint" | "info" | "warning" | "error";
    markClass?: string;
    source?: string;
    message: string;
    renderMessage?: (view: EditorView) => Node;
    actions?: readonly Action[];
  }

  export function linter(
    source: ((view: EditorView) => readonly Diagnostic[] | Promise<readonly Diagnostic[]>) | null,
    config?: { delay?: number; needsRefresh?: (update: unknown) => boolean; autoPanel?: boolean },
  ): Extension;
  export function lintGutter(config?: { hoverTime?: number }): Extension;
  export function forceLinting(view: EditorView): void;
  export function setDiagnostics(state: import("@codemirror/state").EditorState, diagnostics: readonly Diagnostic[]): import("@codemirror/state").TransactionSpec;
}

declare module "@codemirror/merge" {
  import { EditorState, Extension } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";

  export interface MergeConfig {
    a: { doc?: string; extensions?: Extension };
    b: { doc?: string; extensions?: Extension };
    parent?: Element | DocumentFragment;
    root?: Document | ShadowRoot;
    orientation?: "a-b" | "b-a";
    revertControls?: "a-to-b" | "b-to-a";
    renderRevertControl?: () => HTMLElement;
    highlightChanges?: boolean;
    gutter?: boolean;
    collapseUnchanged?: { margin?: number; minSize?: number };
    diffConfig?: { scanLimit?: number; timeout?: number };
  }

  export class MergeView {
    constructor(config: MergeConfig);
    readonly a: EditorView;
    readonly b: EditorView;
    readonly dom: HTMLElement;
    readonly chunks: readonly { fromA: number; toA: number; fromB: number; toB: number }[];
    reconfigure(config: Partial<MergeConfig>): void;
    destroy(): void;
  }

  export function unifiedMergeView(config: { original: string; highlightChanges?: boolean; gutter?: boolean }): Extension;
  export function getOriginalDoc(state: EditorState): import("@codemirror/state").Text;
}

declare module "@codemirror/lsp-client" {
  import { Extension, Text } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";

  export interface Transport {
    send(message: string): void;
    subscribe(handler: (value: string) => void): void;
    unsubscribe(handler: (value: string) => void): void;
  }

  export interface ServerCapabilities {
    definitionProvider?: boolean | object;
    declarationProvider?: boolean | object;
    typeDefinitionProvider?: boolean | object;
    implementationProvider?: boolean | object;
    referencesProvider?: boolean | object;
    hoverProvider?: boolean | object;
    completionProvider?: object;
    signatureHelpProvider?: object;
    documentHighlightProvider?: boolean | object;
    documentSymbolProvider?: boolean | object;
    foldingRangeProvider?: boolean | object;
    inlayHintProvider?: boolean | object;
    // legend is required here, as in the LSP spec; callers that treat it as optional assert it.
    semanticTokensProvider?: {
      legend: { tokenTypes: string[]; tokenModifiers: string[] };
      range?: boolean | object;
      full?: boolean | object;
    };
    diagnosticProvider?: object;
  }

  export interface WorkspaceFile {
    uri: string;
    languageId: string;
    version: number;
    doc: Text;
    getView(main?: EditorView): EditorView | null;
  }

  export abstract class Workspace {
    readonly client: LSPClient;
    abstract files: WorkspaceFile[];
    constructor(client: LSPClient);
    abstract openFile(uri: string, languageId: string, view: EditorView): void;
    abstract closeFile(uri: string, view: EditorView): void;
    getFile(uri: string): WorkspaceFile | null;
    syncFiles(): readonly { file: WorkspaceFile; prevDoc: Text; changes: import("@codemirror/state").ChangeSet }[];
    requestRefresh(): void;
    updateFile(uri: string, update: unknown): void;
    displayFile(uri: string): Promise<EditorView | null>;
  }

  export interface LSPClientConfig {
    rootUri?: string;
    workspace?: (client: LSPClient) => Workspace;
    timeout?: number;
    sanitizeHTML?: (html: string) => string;
    highlightLanguage?: (lang: string) => unknown;
    notificationHandlers?: Record<string, (client: LSPClient, params: unknown) => boolean>;
  }

  export class LSPClient {
    constructor(config?: LSPClientConfig);
    readonly workspace: Workspace;
    // The package types this as the LSP ServerCapabilities object; callers narrow it themselves.
    readonly serverCapabilities: ServerCapabilities | null;
    readonly initialized: boolean;
    connect(transport: Transport): this;
    disconnect(): void;
    didOpen(file: { uri: string; languageId: string; version: number; text: string }): void;
    didChange(file: { uri: string; version: number; text: string }): void;
    didClose(uri: string): void;
    plugin(uri: string, languageId?: string): Extension;
    request<Params, Result>(method: string, params: Params): Promise<Result>;
    notify<Params>(method: string, params: Params): void;
    withMapping<T>(f: (mapping: unknown) => Promise<T>): Promise<T>;
    sync(): void;
  }

  export class LSPPlugin {
    readonly client: LSPClient;
    readonly uri: string;
    readonly view: EditorView;
    readonly unsyncedChanges: import("@codemirror/state").ChangeDesc;
    clear(): void;
    docToPos(doc: unknown): number;
    posToDoc(pos: number): unknown;
    toPosition(pos: number, doc?: Text): unknown;
    fromPosition(pos: unknown, doc?: Text): number;
    static create(client: LSPClient, uri: string, languageId?: string): Extension;
    static get(view: EditorView): LSPPlugin | null;
  }

  export function languageServerSupport(client: LSPClient, uri: string, languageId?: string): Extension;
  export function serverDiagnostics(): Extension;
  export function serverCompletion(config?: { override?: boolean }): Extension;
  export function hoverTooltips(config?: { hoverTime?: number }): Extension;
  export function formatDocument(view: EditorView): boolean;
  export function renameSymbol(view: EditorView): boolean;
  export function signatureHelp(config?: { keymap?: boolean }): Extension;
  export function jumpToDefinition(view: EditorView): boolean;
  export function jumpToDeclaration(view: EditorView): boolean;
  export function jumpToTypeDefinition(view: EditorView): boolean;
  export function jumpToImplementation(view: EditorView): boolean;
  export function findReferences(view: EditorView): boolean;

  export interface LSPClientExtension {
    notificationHandlers?: Record<string, (client: LSPClient, params: never) => boolean>;
    [key: string]: unknown;
  }
}

declare module "@lezer/highlight" {
  export class Tag {
    static define(parent?: Tag): Tag;
  }
  export const tags: Record<string, Tag> & {
    keyword: Tag;
    comment: Tag;
    string: Tag;
    number: Tag;
    variableName: Tag;
    typeName: Tag;
    function: (tag: Tag) => Tag;
    definition: (tag: Tag) => Tag;
    special: (tag: Tag) => Tag;
    local: (tag: Tag) => Tag;
  };
  export function styleTags(spec: Record<string, Tag | readonly Tag[]>): unknown;
}

declare module "@replit/codemirror-indentation-markers" {
  import { Extension } from "@codemirror/state";
  export function indentationMarkers(config?: {
    highlightActiveBlock?: boolean;
    hideFirstIndent?: boolean;
    markerType?: "codeOnly" | "fullScope";
    thickness?: number;
    colors?: { light?: string; dark?: string; activeLight?: string; activeDark?: string };
  }): Extension;
}

// Language packages: each exports a factory returning LanguageSupport. Signatures are the
// published ones (https://github.com/codemirror/lang-<name>); only the call shape matters here.
declare module "@codemirror/lang-cpp" { import { LanguageSupport } from "@codemirror/language"; export function cpp(): LanguageSupport; }
declare module "@codemirror/lang-css" { import { LanguageSupport } from "@codemirror/language"; export function css(): LanguageSupport; }
declare module "@codemirror/lang-go" { import { LanguageSupport } from "@codemirror/language"; export function go(): LanguageSupport; }
declare module "@codemirror/lang-html" { import { LanguageSupport } from "@codemirror/language"; export function html(config?: { matchClosingTags?: boolean; autoCloseTags?: boolean; nestedLanguages?: unknown[] }): LanguageSupport; }
declare module "@codemirror/lang-java" { import { LanguageSupport } from "@codemirror/language"; export function java(): LanguageSupport; }
declare module "@codemirror/lang-javascript" { import { LanguageSupport } from "@codemirror/language"; export function javascript(config?: { jsx?: boolean; typescript?: boolean }): LanguageSupport; }
declare module "@codemirror/lang-json" { import { LanguageSupport } from "@codemirror/language"; export function json(): LanguageSupport; }
declare module "@codemirror/lang-less" { import { LanguageSupport } from "@codemirror/language"; export function less(): LanguageSupport; }
declare module "@codemirror/lang-liquid" { import { LanguageSupport } from "@codemirror/language"; export function liquid(config?: { base?: LanguageSupport }): LanguageSupport; }
declare module "@codemirror/lang-markdown" { import { LanguageSupport } from "@codemirror/language"; export function markdown(config?: { codeLanguages?: unknown; base?: unknown }): LanguageSupport; }
declare module "@codemirror/lang-php" { import { LanguageSupport } from "@codemirror/language"; export function php(config?: { baseLanguage?: unknown; plain?: boolean }): LanguageSupport; }
declare module "@codemirror/lang-python" { import { LanguageSupport } from "@codemirror/language"; export function python(): LanguageSupport; }
declare module "@codemirror/lang-rust" { import { LanguageSupport } from "@codemirror/language"; export function rust(): LanguageSupport; }
declare module "@codemirror/lang-sass" { import { LanguageSupport } from "@codemirror/language"; export function sass(config?: { indented?: boolean }): LanguageSupport; }
declare module "@codemirror/lang-sql" { import { LanguageSupport } from "@codemirror/language"; export function sql(config?: { dialect?: unknown; upperCaseKeywords?: boolean }): LanguageSupport; }
declare module "@codemirror/lang-vue" { import { LanguageSupport } from "@codemirror/language"; export function vue(config?: { base?: LanguageSupport }): LanguageSupport; }
declare module "@codemirror/lang-wast" { import { LanguageSupport } from "@codemirror/language"; export function wast(): LanguageSupport; }
declare module "@codemirror/lang-xml" { import { LanguageSupport } from "@codemirror/language"; export function xml(config?: { elements?: unknown[] }): LanguageSupport; }
declare module "@codemirror/lang-yaml" { import { LanguageSupport } from "@codemirror/language"; export function yaml(): LanguageSupport; }

// Legacy stream modes: each exports a StreamParser passed to StreamLanguage.define.
declare module "@codemirror/legacy-modes/mode/clike" {
  import { StreamParser } from "@codemirror/language";
  export const c: StreamParser<unknown>;
  export const csharp: StreamParser<unknown>;
  export const dart: StreamParser<unknown>;
  export const kotlin: StreamParser<unknown>;
  export const objectiveC: StreamParser<unknown>;
  export const scala: StreamParser<unknown>;
}
declare module "@codemirror/legacy-modes/mode/clojure" { import { StreamParser } from "@codemirror/language"; export const clojure: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/diff" { import { StreamParser } from "@codemirror/language"; export const diff: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/haskell" { import { StreamParser } from "@codemirror/language"; export const haskell: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/julia" { import { StreamParser } from "@codemirror/language"; export const julia: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/lua" { import { StreamParser } from "@codemirror/language"; export const lua: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/perl" { import { StreamParser } from "@codemirror/language"; export const perl: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/properties" { import { StreamParser } from "@codemirror/language"; export const properties: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/r" { import { StreamParser } from "@codemirror/language"; export const r: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/ruby" { import { StreamParser } from "@codemirror/language"; export const ruby: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/shell" { import { StreamParser } from "@codemirror/language"; export const shell: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/swift" { import { StreamParser } from "@codemirror/language"; export const swift: StreamParser<unknown>; }
declare module "@codemirror/legacy-modes/mode/toml" { import { StreamParser } from "@codemirror/language"; export const toml: StreamParser<unknown>; }
