// Fallback declarations for the remaining third-party packages this plugin imports.
//
// Not used in a normal checkout: tsconfig `paths` lists node_modules first, so the build always
// type-checks against each package's own definitions. This file only takes over where the sources
// are linted without installing dependencies, in which case these imports would resolve to
// TypeScript's `error` type and look like unchecked `any`.
//
// Scope: only what `main.ts` and `src/**` touch.

declare module "prettier" {
  export type Doc = import("prettier/doc").builders.Doc;

  // ParserOptions carries prettier's full required-option set, and a parser's `parse` is a property
  // rather than a method. Both matter for assignability: with looser stand-ins a plugin object
  // literal satisfies Plugin directly and the plugin's own `as Plugin` reads as redundant.
  export interface RequiredOptions {
    tabWidth: number;
    printWidth: number;
    useTabs: boolean;
    semi: boolean;
    singleQuote: boolean;
    endOfLine: string;
    trailingComma: string;
    bracketSpacing: boolean;
    arrowParens: string;
    parser: string;
    plugins: (Plugin | string)[];
    filepath: string;
    rangeStart: number;
    rangeEnd: number;
    embeddedLanguageFormatting: string;
  }

  export interface ParserOptions<T = unknown> extends RequiredOptions {
    locStart: (node: T) => number;
    locEnd: (node: T) => number;
    originalText: string;
  }

  export interface AstPath<T = unknown> {
    node: T;
    parent: T | null;
    key: string | null;
    index: number | null;
    stack: unknown[];
    getValue(): T;
    getNode(count?: number): T | null;
    getParentNode(count?: number): T | null;
    // Walking into a property narrows the path to that property's type, which prettier expresses
    // with conditional types. Keeping the walked-into overloads at `unknown` reproduces the part
    // that matters here: a printer still has to assert the node type back.
    call<U>(callback: (path: AstPath<T>, index: number, value: unknown) => U): U;
    call<U>(callback: (path: AstPath<unknown>, index: number, value: unknown) => U, ...names: PropertyKey[]): U;
    map<U>(callback: (path: AstPath<T>, index: number, value: unknown) => U): U[];
    map<U>(callback: (path: AstPath<unknown>, index: number, value: unknown) => U, ...names: PropertyKey[]): U[];
    each(callback: (path: AstPath<T>, index: number, value: unknown) => void): void;
    each(callback: (path: AstPath<unknown>, index: number, value: unknown) => void, ...names: PropertyKey[]): void;
  }

  export interface Printer<T = unknown> {
    print(path: AstPath<T>, options: ParserOptions<T>, print: () => Doc, args?: unknown): Doc;
    preprocess?: (ast: T, options: ParserOptions) => T;
    printComment?: (path: AstPath<T>, options: ParserOptions) => Doc;
    canAttachComment?: (node: T) => boolean;
    isBlockComment?: (node: T) => boolean;
    handleComments?: Record<string, unknown>;
    getVisitorKeys?: (node: T) => string[];
    hasPrettierIgnore?: (path: AstPath<T>) => boolean;
    embed?: unknown;
    massageAstNode?: unknown;
    willPrintOwnComments?: unknown;
  }

  export interface Parser<T = unknown> {
    parse: (text: string, options: ParserOptions<T>) => T | Promise<T>;
    astFormat: string;
    locStart(node: T): number;
    locEnd(node: T): number;
    preprocess?: (text: string, options: ParserOptions) => string;
  }

  export interface SupportLanguage {
    name: string;
    parsers: string[];
    extensions?: string[];
    filenames?: string[];
    aliases?: string[];
    linguistLanguageId?: number;
    vscodeLanguageIds?: string[];
  }

  export interface Plugin<T = unknown> {
    languages?: SupportLanguage[];
    parsers?: Record<string, Parser<T>>;
    printers?: Record<string, Printer<T>>;
    options?: Record<string, unknown>;
    defaultOptions?: Record<string, unknown>;
  }

  export interface Options extends Partial<ParserOptions> {
    plugins?: (Plugin | string)[];
  }

  export function format(source: string, options?: Options): Promise<string>;
}

// Mirrors the shape of prettier's own doc.d.ts: `builders` is a namespace of plain functions, and
// Doc is a union of tagged commands rather than an open record. Both matter — a looser Doc makes
// the printer's casts look redundant, and declaring the builders as methods trips unbound-method
// when the printer destructures them.
declare module "prettier/doc" {
  export namespace builders {
    type DocCommand =
      | Align
      | BreakParent
      | Cursor
      | Fill
      | Group
      | IfBreak
      | Indent
      | IndentIfBreak
      | Label
      | Line
      | LineSuffix
      | LineSuffixBoundary
      | Trim;
    type Doc = string | Doc[] | DocCommand;

    interface Align {
      type: "align";
      contents: Doc;
      n: number | string | { type: "root" };
    }
    interface BreakParent {
      type: "break-parent";
    }
    interface Cursor {
      type: "cursor";
      placeholder: symbol;
    }
    interface Fill {
      type: "fill";
      parts: Doc[];
    }
    interface Group {
      type: "group";
      id?: symbol;
      contents: Doc;
      break: boolean;
      expandedStates: Doc[];
    }
    interface Line {
      type: "line";
      soft?: boolean;
      hard?: boolean;
      literal?: boolean;
    }
    interface HardlineWithoutBreakParent extends Line {
      hard: true;
    }
    interface IfBreak {
      type: "if-break";
      breakContents: Doc;
      flatContents: Doc;
    }
    interface Indent {
      type: "indent";
      contents: Doc;
    }
    interface IndentIfBreak {
      type: "indent-if-break";
      contents: Doc;
      groupId: symbol;
      negate?: boolean;
    }
    interface Label {
      type: "label";
      label: unknown;
      contents: Doc;
    }
    interface LineSuffix {
      type: "line-suffix";
      contents: Doc;
    }
    interface LineSuffixBoundary {
      type: "line-suffix-boundary";
    }
    interface Trim {
      type: "trim";
    }
    interface GroupOptions {
      shouldBreak?: boolean;
      id?: symbol;
    }

    function group(doc: Doc, opts?: GroupOptions): Group;
    function indent(doc: Doc): Indent;
    function dedent(doc: Doc): Align;
    function align(widthOrString: Align["n"], doc: Doc): Align;
    function join(separator: Doc, docs: Doc[]): Doc[];
    function fill(docs: Doc[]): Fill;
    function ifBreak(breakContents: Doc, flatContents?: Doc, options?: { groupId?: symbol }): IfBreak;
    function indentIfBreak(doc: Doc, opts: { groupId: symbol; negate?: boolean }): IndentIfBreak;
    function lineSuffix(suffix: Doc): LineSuffix;
    function label(label: unknown, contents: Doc): Label;

    const line: Line;
    const softline: Line;
    const hardline: (HardlineWithoutBreakParent | BreakParent)[];
    const literalline: (HardlineWithoutBreakParent | BreakParent)[];
    const breakParent: BreakParent;
    const trim: Trim;
    const lineSuffixBoundary: LineSuffixBoundary;
    const cursor: Cursor;
  }

  export namespace printer {
    function printDocToString(doc: builders.Doc, options: unknown): { formatted: string };
  }

  export namespace utils {
    function willBreak(doc: builders.Doc): boolean;
    function cleanDoc(doc: builders.Doc): builders.Doc;
  }
}

declare module "prettier/standalone" {
  import { Options } from "prettier";
  export function format(source: string, options?: Options): Promise<string>;
  export function formatWithCursor(
    source: string,
    options: Options & { cursorOffset: number },
  ): Promise<{ formatted: string; cursorOffset: number }>;
}

// Bundled parser plugins. Each module is passed straight to `format({ plugins })`, so only the
// Plugin shape matters; some ship it as a default export, which `pick()` unwraps.
declare module "prettier/plugins/babel" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const parsers: Record<string, unknown>;
}
declare module "prettier/plugins/estree" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const printers: Record<string, unknown>;
}
declare module "prettier/plugins/typescript" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const parsers: Record<string, unknown>;
}
declare module "prettier/plugins/postcss" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const parsers: Record<string, unknown>;
}
declare module "prettier/plugins/html" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const parsers: Record<string, unknown>;
}
declare module "prettier/plugins/yaml" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const parsers: Record<string, unknown>;
}
declare module "prettier/plugins/markdown" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
  export const parsers: Record<string, unknown>;
}
declare module "@prettier/plugin-xml" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
}
declare module "prettier-plugin-jinja-template" {
  import { Plugin } from "prettier";
  const plugin: Plugin;
  export default plugin;
}

declare module "web-tree-sitter" {
  export interface Point {
    row: number;
    column: number;
  }

  export interface Node {
    readonly type: string;
    readonly text: string;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly startPosition: Point;
    readonly endPosition: Point;
    readonly isError: boolean;
    readonly isMissing: boolean;
    readonly hasError: boolean;
    readonly isNamed: boolean;
    readonly childCount: number;
    readonly namedChildCount: number;
    readonly parent: Node | null;
    readonly children: (Node | null)[];
    child(index: number): Node | null;
    namedChild(index: number): Node | null;
    descendantForIndex(startIndex: number, endIndex?: number): Node | null;
    walk(): TreeCursor;
  }

  export interface TreeCursor {
    readonly nodeType: string;
    readonly nodeText: string;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly currentNode: Node;
    gotoFirstChild(): boolean;
    gotoNextSibling(): boolean;
    gotoParent(): boolean;
    delete(): void;
  }

  export interface Tree {
    readonly rootNode: Node;
    walk(): TreeCursor;
    delete(): void;
    copy(): Tree;
  }

  export interface QueryCapture {
    name: string;
    node: Node;
  }

  export interface QueryMatch {
    pattern: number;
    captures: QueryCapture[];
  }

  export class Language {
    readonly name: string | null;
    static load(input: string | Uint8Array): Promise<Language>;
    query(source: string): Query;
  }

  export class Query {
    constructor(language: Language, source: string);
    captures(node: Node, options?: { startIndex?: number; endIndex?: number }): QueryCapture[];
    matches(node: Node, options?: { startIndex?: number; endIndex?: number }): QueryMatch[];
    delete(): void;
  }

  export class Parser {
    static init(options?: { locateFile?: (name: string, prefix: string) => string }): Promise<void>;
    setLanguage(language: Language | null): void;
    getLanguage(): Language | null;
    parse(input: string, oldTree?: Tree | null): Tree | null;
    delete(): void;
    reset(): void;
  }
}

declare module "@ruby/prism/src/parsePrism.js" {
  export function parsePrism(exports: WebAssembly.Exports, source: string, options?: object): object;
}

declare module "@bjorn3/browser_wasi_shim" {
  export class File {
    constructor(data: Uint8Array | number[]);
  }
  export class OpenFile {
    constructor(file: File);
  }
  export class ConsoleStdout {
    static lineBuffered(write: (line: string) => void): ConsoleStdout;
  }
  export class WASI {
    constructor(args: string[], env: string[], fds: unknown[]);
    readonly wasiImport: WebAssembly.ModuleImports;
    initialize(instance: WebAssembly.Instance): void;
  }
}

declare module "@ruby/prism/src/nodes.js" {
  // The real module declares one class per Ruby AST node. The printer only reads the export names
  // (to map a node's constructor back to its type name), so one representative export is enough to
  // keep the namespace typed here.
  export const Node: abstract new (...args: never[]) => object;
}

declare module "@dprint/formatter" {
  export interface FormatRequest {
    filePath: string;
    fileText: string;
    overrideConfig?: Record<string, unknown>;
    rangeStart?: number;
    rangeEnd?: number;
  }

  export interface Formatter {
    formatText(request: FormatRequest): string;
    setConfig(globalConfig: Record<string, unknown>, pluginConfig: Record<string, unknown>): void;
    setHostFormatter(formatter: (request: FormatRequest) => string | undefined): void;
    getPluginInfo(): { name: string; version: string };
    getLicenseText(): string;
    getConfigDiagnostics(): { propertyName: string; message: string }[];
  }

  export function createFromBuffer(wasmModuleBuffer: BufferSource): Formatter;
  export function createStreaming(response: Promise<Response>): Promise<Formatter>;
}

declare module "obsidian-daily-notes-interface" {
  import { TFile } from "obsidian";

  // The package takes a Moment. Declared structurally so this stub does not depend on the `moment`
  // types resolving either — callers derive their own date type from this signature.
  export interface DailyNoteDate {
    format(format?: string): string;
    valueOf(): number;
    clone(): DailyNoteDate;
    startOf(unit: string): DailyNoteDate;
  }

  export function appHasDailyNotesPluginLoaded(): boolean;
  export function getAllDailyNotes(): Record<string, TFile>;
  export function getDailyNote(date: DailyNoteDate, dailyNotes: Record<string, TFile>): TFile | null;
  export function getDateFromFile(file: TFile, granularity: string): DailyNoteDate | null;
  export function createDailyNote(date: DailyNoteDate): Promise<TFile>;
}

declare module "ws" {
  import { IncomingMessage, Server as HttpServer } from "http";

  // Declared here rather than imported from "http": the real @types/node keeps its socket type in
  // "net" and does not re-export it, so importing it would only resolve against this stub.
  interface RawSocket {
    write(data: string): boolean;
    destroy(error?: Error): void;
  }

  export class WebSocket {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly readyState: 0 | 1 | 2 | 3;
    send(data: string | Uint8Array): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    ping(data?: unknown): void;
    on(event: "message", listener: (data: Buffer | string, isBinary: boolean) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "open" | "pong" | "ping", listener: () => void): this;
    off(event: string, listener: (...args: never[]) => void): this;
  }

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean; port?: number; host?: string; server?: HttpServer; path?: string });
    readonly clients: Set<WebSocket>;
    handleUpgrade(
      request: IncomingMessage,
      socket: RawSocket,
      head: Buffer,
      callback: (client: WebSocket, request: IncomingMessage) => void,
    ): void;
    emit(event: "connection", ws: WebSocket, request: IncomingMessage): boolean;
    on(event: "connection", listener: (ws: WebSocket, request: IncomingMessage) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close" | "listening", listener: () => void): this;
    close(callback?: (err?: Error) => void): void;
  }
}
