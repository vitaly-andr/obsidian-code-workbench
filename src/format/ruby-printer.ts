// Ruby printer for Prettier v3. The parser (@ruby/prism) is injected via `makeRubyPlugin(parse)`;
// this file is the printer (AST -> formatted code) plus the thin plugin wiring.
//
// Design: handle common Ruby structurally (def/class/module, calls, blocks, control flow,
// hashes/arrays, literals, assignments). For ANY node we don't recognise — or any node whose
// source range contains a comment we can't safely relocate — emit the ORIGINAL source verbatim.
// This guarantees the formatter never corrupts code: it formats what it understands and leaves
// the rest byte-for-byte.

// Import doc builders from the lightweight `prettier/doc` entry, NOT `prettier` — the latter pulls
// the full Prettier (all built-in language plugins), adding ~4MB to the bundle.
import { builders } from "prettier/doc";
import type { Doc as PrettierDoc, Plugin } from "prettier";

const {
  group,
  indent,
  join,
  line,
  softline,
  hardline,
  literalline,
} = builders;

// Prism nodes are loosely typed; we read fields dynamically and rely on the source-fallback for
// anything unexpected, so `any` is the pragmatic choice here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyNode = any;
type Doc = PrettierDoc;

export interface PrismParseResult {
  value: AnyNode;
  errors: any[];
  comments?: any[];
  [k: string]: any;
}

const AST_FORMAT = "ruby-ast";

// Per-format state stashed on the AST root by the parser, so the printer can slice the original
// source for fallbacks and detect comment ranges.
interface RubyState {
  source: string;
  // Comments sorted by start offset, with their source text. Used both to detect comment-bearing
  // ranges (force source-fallback) and to re-emit comments that sit in the gaps between statements
  // so none are ever dropped.
  comments: Array<{ start: number; end: number; text: string }>;
}

function nodeType(node: AnyNode): string {
  return node && node.constructor ? node.constructor.name : "";
}

function startOf(node: AnyNode): number {
  return node.location.startOffset;
}

function endOf(node: AnyNode): number {
  return node.location.startOffset + node.location.length;
}

function locText(state: RubyState, loc: any): string {
  if (!loc) return "";
  return state.source.slice(loc.startOffset, loc.startOffset + loc.length);
}

// Slice original source for a node and re-emit it verbatim, preserving internal newlines without
// imposing our own indentation (literalline keeps the slice as-is across line breaks).
function sourceFallback(state: RubyState, node: AnyNode): Doc {
  const text = state.source.slice(startOf(node), endOf(node));
  return verbatim(text);
}

function verbatim(text: string): Doc {
  const lines = text.split("\n");
  const out: Doc[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push(literalline);
    out.push(lines[i]);
  }
  return out;
}

// True if any comment range overlaps [start, end).
function rangeHasComment(state: RubyState, start: number, end: number): boolean {
  for (const c of state.comments) {
    if (c.start < end && c.end > start) return true;
  }
  return false;
}

// Comments whose start lies within [start, end) — used to harvest comments that sit in the gaps
// between statements (the structural printer reconstructs statements and would otherwise drop a
// comment that isn't inside any statement's own range).
function commentsInGap(state: RubyState, start: number, end: number): string[] {
  const out: string[] = [];
  for (const c of state.comments) {
    if (c.start >= start && c.start < end) out.push(c.text);
  }
  return out;
}

// Number of blank source lines between two byte offsets (used to preserve one blank line between
// statements). Returns at most 1.
function blankLinesBetween(state: RubyState, fromEnd: number, toStart: number): number {
  if (toStart <= fromEnd) return 0;
  const between = state.source.slice(fromEnd, toStart);
  const newlines = between.split("\n").length - 1;
  return newlines >= 2 ? 1 : 0;
}

// Wrap a body of statements (already a list of Doc) with hardline separators, blank-line
// preservation, and interleaved comments harvested from the gaps. `lowerBound`/`upperBound` bound
// the comment-scan region so each statements list only emits comments in its own scope (the nearest
// enclosing list claims them, never an outer one).
function printStatementList(
  state: RubyState,
  nodes: AnyNode[],
  printed: Doc[],
  lowerBound: number,
  upperBound: number
): Doc {
  const parts: Doc[] = [];
  let emitted = false;

  // Emit a line break before the next part. `blank` preserves a single blank line.
  const sep = (blank: boolean): void => {
    if (!emitted) return;
    parts.push(hardline);
    if (blank) parts.push(hardline);
  };

  for (let i = 0; i < printed.length; i++) {
    const stmtStart = startOf(nodes[i]);
    const gapStart = i === 0 ? lowerBound : endOf(nodes[i - 1]);
    const gapComments = commentsInGap(state, gapStart, stmtStart);
    if (gapComments.length > 0) {
      // Comments sitting before this statement (leading ones for i === 0). Keep them on their own
      // lines; blank-line preservation is skipped around comments to stay deterministic/idempotent.
      for (const text of gapComments) {
        sep(false);
        parts.push(text);
        emitted = true;
      }
      sep(false);
    } else {
      // Preserve a single blank line between bare statements.
      sep(blankLinesBetween(state, gapStart, stmtStart) > 0);
    }
    parts.push(printed[i]);
    emitted = true;
  }

  // Trailing comments after the last statement, up to the scope's upper bound.
  for (const text of commentsInGap(state, endOf(nodes[nodes.length - 1]), upperBound)) {
    sep(false);
    parts.push(text);
    emitted = true;
  }
  return parts;
}

// ---- Plugin factory --------------------------------------------------------------------------

export function makeRubyPlugin(parse: (src: string) => PrismParseResult): Plugin {
  const printer = {
    print(path: any, _options: any, print: any): Doc {
      const node: AnyNode = path.node ?? path.getValue();
      const state: RubyState = getState(path, _options);
      return printNode(path, print, node, state);
    },
  };

  return {
    languages: [
      {
        name: "Ruby",
        parsers: ["ruby"],
        extensions: [".rb", ".rake", ".gemspec", ".ru"],
        vscodeLanguageIds: ["ruby"],
      },
    ],
    parsers: {
      ruby: {
        parse(text: string): AnyNode {
          const result = parse(text);
          const root = result.value;
          // Stash original source + comment ranges on the root so the printer can reach them
          // regardless of how Prettier threads options.
          const comments = (result.comments || [])
            .map((c: any) => {
              const start = c.location.startOffset;
              const end = start + c.location.length;
              return { start, end, text: text.slice(start, end) };
            })
            .sort((a: any, b: any) => a.start - b.start);
          (root as any).__rubyState = { source: text, comments } as RubyState;
          return root;
        },
        astFormat: AST_FORMAT,
        locStart: (n: AnyNode) => n.location.startOffset,
        locEnd: (n: AnyNode) => n.location.startOffset + n.location.length,
      },
    },
    printers: {
      [AST_FORMAT]: printer as any,
    },
  } as Plugin;
}

// Reach the per-format state: it lives on the AST root. Prettier also gives us the root via
// options.originalText as a backstop.
function getState(path: any, options: any): RubyState {
  // Walk up to the root node which carries __rubyState.
  const stack: AnyNode[] = path.stack ? path.stack.filter((x: any) => x && x.constructor) : [];
  for (const n of stack) {
    if (n && (n as any).__rubyState) return (n as any).__rubyState as RubyState;
  }
  const root = path.stack && path.stack[0];
  if (root && root.__rubyState) return root.__rubyState as RubyState;
  // Fallback: reconstruct minimal state from originalText (no comment info).
  return { source: options?.originalText ?? "", comments: [] };
}

// ---- Core dispatch ---------------------------------------------------------------------------

function printNode(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  if (node == null) return "";
  const type = nodeType(node);

  switch (type) {
    case "ProgramNode":
      // Whole-file scope: harvest comments anywhere from start to EOF (e.g. a leading `# comment`
      // before the first statement, which sits outside the StatementsNode range).
      return path.call(
        (p: any) => printStatements(p, print, state, 0, state.source.length),
        "statements"
      );

    case "StatementsNode":
      return printStatements(path, print, state);

    case "DefNode":
      return printDef(path, print, node, state);

    case "ClassNode":
      return printClass(path, print, node, state, "class");

    case "ModuleNode":
      return printModule(path, print, node, state);

    case "CallNode":
      return printCall(path, print, node, state);

    case "IfNode":
      return printIf(path, print, node, state, "if");

    case "UnlessNode":
      return printUnless(path, print, node, state);

    case "WhileNode":
      return printWhileUntil(path, print, node, state, "while");

    case "UntilNode":
      return printWhileUntil(path, print, node, state, "until");

    case "CaseNode":
      return printCase(path, print, node, state);

    case "ElseNode":
      return path.call((p: any) => printStatements(p, print, state), "statements");

    case "HashNode":
      return printHash(path, print, node, state);

    case "ArrayNode":
      return printArray(path, print, node, state);

    case "AssocNode":
      return printAssoc(path, print, node, state);

    case "ReturnNode":
      return printKeywordWithArgs(path, print, node, state, "return");

    case "BreakNode":
      return printKeywordWithArgs(path, print, node, state, "break");

    case "NextNode":
      return printKeywordWithArgs(path, print, node, state, "next");

    case "YieldNode":
      return printYield(path, print, node, state);

    case "AndNode":
      return printBinary(path, print, node, state);

    case "OrNode":
      return printBinary(path, print, node, state);

    case "LocalVariableWriteNode":
    case "InstanceVariableWriteNode":
    case "ClassVariableWriteNode":
    case "GlobalVariableWriteNode":
    case "ConstantWriteNode":
      return printWrite(node, state);

    default:
      // Everything else: emit original source verbatim. Safe and lossless.
      return sourceFallback(state, node);
  }
}

// ---- Statements ------------------------------------------------------------------------------

// Print a StatementsNode. `lowerBound`/`upperBound` bound the region scanned for gap comments
// (comments that sit between statements, or before the first / after the last). They default to the
// StatementsNode's own range; constructs with a header/footer (def, class, blocks, …) pass a wider
// region so comments living in the header->body and body->`end` gaps are not lost.
function printStatements(
  path: any,
  print: any,
  state: RubyState,
  lowerBound?: number,
  upperBound?: number
): Doc {
  const node: AnyNode = path.node ?? path.getValue();
  const body: AnyNode[] = node.body || [];
  if (body.length === 0) return "";
  const printed: Doc[] = path.map((p: any) => printOneStatement(p, print, state), "body");
  const lo = lowerBound != null ? lowerBound : startOf(node);
  const hi = upperBound != null ? upperBound : endOf(node);
  return printStatementList(state, body, printed, lo, hi);
}

// A single statement. If the statement's own source range contains a comment, fall back to verbatim
// source for that statement so comments inside it are never lost.
function printOneStatement(path: any, print: any, state: RubyState): Doc {
  const node: AnyNode = path.node ?? path.getValue();
  if (rangeHasComment(state, startOf(node), endOf(node))) {
    return sourceFallback(state, node);
  }
  return print();
}

// ---- def -------------------------------------------------------------------------------------

function printDef(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  const parts: Doc[] = ["def "];
  if (node.receiver) {
    parts.push(locText(state, node.receiver.location), ".");
  }
  parts.push(String(node.name));

  const params = node.parameters;
  if (params && nodeType(params) === "ParametersNode") {
    const paramsDoc = printParameters(state, params);
    if (paramsDoc !== "") parts.push("(", paramsDoc, ")");
  }

  const body = node.body;
  if (body && nodeType(body) === "StatementsNode" && (body.body || []).length > 0) {
    const bodyDoc = printBodyStatements(path, print, node, state, "body");
    return group([parts, indent([hardline, bodyDoc]), hardline, "end"]);
  }
  // Empty body: an `end`-region comment would otherwise be dropped, so fall back if one exists.
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  return group([parts, hardline, "end"]);
}

// Print a construct's body StatementsNode with comment-aware bounds: scan for gap comments from the
// construct's start (so a comment between the header and the first body line is kept) up to the
// `end` keyword (so a trailing body comment before `end` is kept).
function printBodyStatements(
  path: any,
  print: any,
  node: AnyNode,
  state: RubyState,
  field: string
): Doc {
  const lower = startOf(node);
  const upper = node.endKeywordLoc ? node.endKeywordLoc.startOffset : endOf(node);
  return path.call((p: any) => printStatements(p, print, state, lower, upper), field);
}

// Build the parameter list as a comma-joined string of pieces. Returns "" when empty.
function printParameters(state: RubyState, params: AnyNode): Doc {
  const pieces: string[] = [];

  for (const p of params.requireds || []) pieces.push(paramName(state, p));
  for (const p of params.optionals || []) {
    pieces.push(`${p.name} = ${exprText(state, p.value)}`);
  }
  if (params.rest) {
    pieces.push(restText(state, params.rest, "*"));
  }
  for (const p of params.posts || []) pieces.push(paramName(state, p));
  for (const p of params.keywords || []) {
    const kt = nodeType(p);
    if (kt === "OptionalKeywordParameterNode") {
      pieces.push(`${p.name}: ${exprText(state, p.value)}`);
    } else {
      // RequiredKeywordParameterNode
      pieces.push(`${p.name}:`);
    }
  }
  if (params.keywordRest) {
    const krt = nodeType(params.keywordRest);
    if (krt === "KeywordRestParameterNode") pieces.push(restText(state, params.keywordRest, "**"));
    else if (krt === "ForwardingParameterNode") pieces.push("...");
    else if (krt === "NoKeywordsParameterNode") pieces.push("**nil");
    else pieces.push(locText(state, params.keywordRest.location));
  }
  if (params.block) {
    pieces.push(params.block.name ? `&${params.block.name}` : "&");
  }

  if (pieces.length === 0) return "";
  return join(", ", pieces);
}

function paramName(state: RubyState, p: AnyNode): string {
  // RequiredParameterNode has `name`; multi-target/destructured params we slice from source.
  if (typeof p.name === "string") return p.name;
  return locText(state, p.location);
}

function restText(state: RubyState, p: AnyNode, sigil: string): string {
  return p.name ? `${sigil}${p.name}` : sigil;
}

// ---- class / module --------------------------------------------------------------------------

function printClass(
  path: any,
  print: any,
  node: AnyNode,
  state: RubyState,
  keyword: string
): Doc {
  const constPath = node.constantPath || node.constant_path;
  const head: Doc[] = [keyword, " ", locText(state, constPath.location)];
  if (node.superclass) {
    head.push(" < ", locText(state, node.superclass.location));
  }
  return wrapBody(path, print, node, state, head);
}

function printModule(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  const constPath = node.constantPath || node.constant_path;
  const head: Doc[] = ["module ", locText(state, constPath.location)];
  return wrapBody(path, print, node, state, head);
}

// Shared body wrapper for class/module: indent body statements, close with `end`.
function wrapBody(path: any, print: any, node: AnyNode, state: RubyState, head: Doc[]): Doc {
  const body = node.body;
  if (body && nodeType(body) === "StatementsNode" && (body.body || []).length > 0) {
    const bodyDoc = printBodyStatements(path, print, node, state, "body");
    return group([head, indent([hardline, bodyDoc]), hardline, "end"]);
  }
  // Body could be a BeginNode (rescue/ensure) or other; if not plain statements, fall back for the
  // whole node to stay correct.
  if (body && nodeType(body) !== "StatementsNode") {
    return sourceFallback(state, node);
  }
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  return group([head, hardline, "end"]);
}

// ---- calls -----------------------------------------------------------------------------------

function printCall(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  // Operator-style and index calls (`a + b`, `a[b]`, `-a`, `!a`) are easiest and safest as source.
  if (isOperatorCall(node)) {
    return sourceFallback(state, node);
  }

  const parts: Doc[] = [];
  if (node.receiver) {
    parts.push(locText(state, node.receiver.location));
    parts.push(locText(state, node.callOperatorLoc) || ".");
  }
  parts.push(String(node.name));

  // Arguments.
  const args = node.arguments_;
  const hasParens = node.openingLoc != null; // `(` present in source
  if (args && (args.arguments_ || []).length > 0) {
    const argDocs = argumentDocs(state, args);
    if (hasParens) {
      parts.push(group(["(", indent([softline, join([",", line], argDocs)]), softline, ")"]));
    } else {
      parts.push(" ", group(join([",", line], argDocs)));
    }
  } else if (hasParens) {
    parts.push("()");
  }

  // Block.
  if (node.block && nodeType(node.block) === "BlockNode") {
    const blockDoc = printBlock(path, print, node.block, state);
    if (blockDoc == null) return sourceFallback(state, node); // block had comments
    parts.push(blockDoc);
  } else if (node.block) {
    // BlockArgumentNode (&blk) passed as last argument — slice whole call to be safe.
    return sourceFallback(state, node);
  }

  return parts;
}

// Treat as operator/index/unary call when the method name isn't a normal identifier, or when it's
// a receiver call with no `.`/`&.` operator (i.e. infix/prefix operator).
function isOperatorCall(node: AnyNode): boolean {
  const name: string = node.name || "";
  if (/^[A-Za-z_][A-Za-z0-9_]*[!?=]?$/.test(name)) return false;
  return true;
}

function argumentDocs(state: RubyState, args: AnyNode): Doc[] {
  return (args.arguments_ || []).map((a: AnyNode) => exprDoc(state, a));
}

// Returns the block doc, or null when the block carries comments (the caller then source-falls-back
// the whole call so they are preserved verbatim).
function printBlock(path: any, print: any, block: AnyNode, state: RubyState): Doc | null {
  if (rangeHasComment(state, startOf(block), endOf(block))) return null;
  const isBrace = locText(state, block.openingLoc) === "{";
  const paramsDoc = blockParamsDoc(state, block);
  const body = block.body;
  const hasBody = body && nodeType(body) === "StatementsNode" && (body.body || []).length > 0;

  // `path` is positioned at the CallNode; descend into block -> body for the full printer.
  const printBody = (): Doc =>
    path.call((p: any) => printStatements(p, print, state), "block", "body");

  if (isBrace) {
    // ` { |a| body }` on one line; group lets it break to do/end-like layout if needed.
    if (!hasBody) return paramsDoc ? [" { ", paramsDoc, " }"] : " {}";
    const inner: Doc[] = [];
    if (paramsDoc) inner.push(paramsDoc, " ");
    inner.push(printBody());
    return group([" { ", inner, " }"]);
  }

  // do/end block.
  const head: Doc[] = [" do"];
  if (paramsDoc) head.push(" ", paramsDoc);
  if (!hasBody) return [...head, hardline, "end"];
  return [...head, indent([hardline, printBody()]), hardline, "end"];
}

function blockParamsDoc(state: RubyState, block: AnyNode): Doc | null {
  const bp = block.parameters;
  if (!bp) return null;
  if (nodeType(bp) === "NumberedParametersNode") return null; // implicit `_1` etc.
  // BlockParametersNode wraps a ParametersNode plus block-locals (`|a; x|`).
  if (nodeType(bp) === "BlockParametersNode") {
    // Slice the whole `|...|` from source to capture locals and destructuring faithfully.
    return locText(state, bp.location) || null;
  }
  return locText(state, bp.location) || null;
}

// ---- control flow ----------------------------------------------------------------------------

function printIf(path: any, print: any, node: AnyNode, state: RubyState, keyword: string): Doc {
  // Ternary `a ? b : c` is an IfNode with no `if` keyword in source.
  if (node.ifKeywordLoc == null && node.endKeywordLoc == null) {
    return sourceFallback(state, node);
  }
  // Modifier form `expr if cond` (no end keyword) — slice to preserve exact layout.
  if (node.endKeywordLoc == null) {
    return sourceFallback(state, node);
  }
  // Comments anywhere in the chain: preserve the whole construct verbatim.
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);

  const predicate = exprText(state, node.predicate);
  const head: Doc[] = [keyword, " ", predicate];
  return printConditionalBody(path, print, node, state, head);
}

function printUnless(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  if (node.endKeywordLoc == null) return sourceFallback(state, node);
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  const predicate = exprText(state, node.predicate);
  const head: Doc[] = ["unless ", predicate];

  const parts: Doc[] = [head];
  const thenDoc = printOptionalStatements(path, print, node, state, "statements");
  if (thenDoc !== "") parts.push(indent([hardline, thenDoc]));

  // UnlessNode uses `elseClause` (ElseNode) rather than `subsequent`.
  if (node.elseClause) {
    parts.push(hardline, "else");
    const elseBody = printElseClause(path, print, node.elseClause, state, "elseClause");
    if (elseBody !== "") parts.push(indent([hardline, elseBody]));
  }
  parts.push(hardline, "end");
  return group(parts);
}

// Handle if/elsif/else chain via `subsequent` (ElseNode or nested IfNode for elsif).
function printConditionalBody(
  path: any,
  print: any,
  node: AnyNode,
  state: RubyState,
  head: Doc[]
): Doc {
  const parts: Doc[] = [head];
  const thenDoc = printOptionalStatements(path, print, node, state, "statements");
  if (thenDoc !== "") parts.push(indent([hardline, thenDoc]));

  const sub = node.subsequent;
  if (sub) {
    const subType = nodeType(sub);
    if (subType === "IfNode") {
      // elsif
      const elsifPred = exprText(state, sub.predicate);
      parts.push(hardline, "elsif ", elsifPred);
      const elsifInner = printChainContinuation(path, print, sub, state, "subsequent");
      parts.push(elsifInner);
    } else if (subType === "ElseNode") {
      parts.push(hardline, "else");
      const elseBody = printElseClause(path, print, sub, state, "subsequent");
      if (elseBody !== "") parts.push(indent([hardline, elseBody]));
    }
  }
  parts.push(hardline, "end");
  return group(parts);
}

// Continue an elsif chain. `path` is still at the outer node; we descend into the named field.
function printChainContinuation(
  path: any,
  print: any,
  sub: AnyNode,
  state: RubyState,
  field: string
): Doc {
  // Build the inner pieces (then-body + further subsequent) without re-emitting `elsif <pred>`.
  return path.call(
    (p: any) => {
      const innerParts: Doc[] = [];
      const thenDoc = printOptionalStatements(p, print, sub, state, "statements");
      if (thenDoc !== "") innerParts.push(indent([hardline, thenDoc]));
      const sub2 = sub.subsequent;
      if (sub2) {
        const t = nodeType(sub2);
        if (t === "IfNode") {
          innerParts.push(hardline, "elsif ", exprText(state, sub2.predicate));
          innerParts.push(printChainContinuation(p, print, sub2, state, "subsequent"));
        } else if (t === "ElseNode") {
          innerParts.push(hardline, "else");
          const elseBody = printElseClause(p, print, sub2, state, "subsequent");
          if (elseBody !== "") innerParts.push(indent([hardline, elseBody]));
        }
      }
      return innerParts;
    },
    field
  );
}

function printElseClause(
  path: any,
  print: any,
  elseNode: AnyNode,
  state: RubyState,
  field: string
): Doc {
  const stmts = elseNode.statements;
  if (!stmts || (stmts.body || []).length === 0) return "";
  if (rangeHasComment(state, startOf(stmts), endOf(stmts))) {
    return sourceFallback(state, stmts);
  }
  return path.call(
    (p: any) => p.call((q: any) => printStatements(q, print, state), "statements"),
    field
  );
}

function printWhileUntil(
  path: any,
  print: any,
  node: AnyNode,
  state: RubyState,
  keyword: string
): Doc {
  // Modifier form `expr while cond`: no closing keyword span we can rely on -> source-fallback.
  const text = state.source.slice(startOf(node), endOf(node));
  if (!text.trimStart().startsWith(keyword)) {
    return sourceFallback(state, node);
  }
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  const predicate = exprText(state, node.predicate);
  const head: Doc[] = [keyword, " ", predicate];
  const parts: Doc[] = [head];
  const bodyDoc = printOptionalStatements(path, print, node, state, "statements");
  if (bodyDoc !== "") parts.push(indent([hardline, bodyDoc]));
  parts.push(hardline, "end");
  return group(parts);
}

function printCase(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  const parts: Doc[] = ["case"];
  if (node.predicate) parts.push(" ", exprText(state, node.predicate));

  const conditions: AnyNode[] = node.conditions || [];
  for (let i = 0; i < conditions.length; i++) {
    const when = conditions[i];
    if (nodeType(when) !== "WhenNode") {
      // `in` pattern matching etc. — slice whole case for safety.
      return sourceFallback(state, node);
    }
    const condTexts = (when.conditions || []).map((c: AnyNode) => exprText(state, c));
    parts.push(hardline, "when ", join(", ", condTexts));
    const stmts = when.statements;
    if (stmts && (stmts.body || []).length > 0) {
      const whenBody = rangeHasComment(state, startOf(stmts), endOf(stmts))
        ? sourceFallback(state, stmts)
        : printStatementsOf(stmts, state);
      parts.push(indent([hardline, whenBody]));
    }
  }

  if (node.elseClause) {
    parts.push(hardline, "else");
    const stmts = node.elseClause.statements;
    if (stmts && (stmts.body || []).length > 0) {
      parts.push(indent([hardline, printStatementsOf(stmts, state)]));
    }
  }
  parts.push(hardline, "end");
  return group(parts);
}

// Print a StatementsNode without a Prettier path — used where descending the path is awkward.
// Each statement is printed via its own structural printer using a detached mini-walk; to keep it
// safe and simple we slice source for the whole statements block whenever it is multi-line-tricky.
function printStatementsOf(stmts: AnyNode, state: RubyState): Doc {
  const body: AnyNode[] = stmts.body || [];
  const parts: Doc[] = [];
  for (let i = 0; i < body.length; i++) {
    if (i > 0) {
      parts.push(hardline);
      if (blankLinesBetween(state, endOf(body[i - 1]), startOf(body[i]))) parts.push(hardline);
    }
    parts.push(exprDoc(state, body[i]));
  }
  return parts;
}

function printOptionalStatements(
  path: any,
  print: any,
  node: AnyNode,
  state: RubyState,
  field: string
): Doc {
  const stmts = node[field];
  if (!stmts || (stmts.body || []).length === 0) return "";
  if (rangeHasComment(state, startOf(stmts), endOf(stmts))) {
    return sourceFallback(state, stmts);
  }
  return path.call((p: any) => printStatements(p, print, state), field);
}

// ---- literals & containers -------------------------------------------------------------------

function printHash(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  const elements: AnyNode[] = node.elements || [];
  if (elements.length === 0) return "{}";
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  const items = elements.map((el) => assocDoc(state, el));
  return group(["{", indent([line, join([",", line], items)]), line, "}"]);
}

function printArray(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  const elements: AnyNode[] = node.elements || [];
  // %w[], %i[] and similar use non-`[` openings — slice to preserve.
  if (node.openingLoc && locText(state, node.openingLoc) !== "[") {
    return sourceFallback(state, node);
  }
  if (elements.length === 0) return "[]";
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  const items = elements.map((el) => exprDoc(state, el));
  return group(["[", indent([softline, join([",", line], items)]), softline, "]"]);
}

function printAssoc(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  return assocDoc(state, node);
}

// `key: value` (label, operatorLoc null) or `key => value`.
function assocDoc(state: RubyState, assoc: AnyNode): Doc {
  if (nodeType(assoc) !== "AssocNode") {
    // AssocSplatNode (`**h`) etc. — slice.
    return verbatim(state.source.slice(startOf(assoc), endOf(assoc)));
  }
  if (assoc.operatorLoc == null) {
    // Label form: the key node's source already ends with `:` for `a:` style, but prism's
    // SymbolNode key doesn't include the colon. Slice the key span from source and append a space.
    const keyText = labelKeyText(state, assoc.key);
    if (assoc.value == null) {
      // Shorthand `{ a: }` (Ruby 3.1) — value omitted.
      return keyText;
    }
    return [keyText, " ", exprText(state, assoc.value)];
  }
  return [exprText(state, assoc.key), " => ", exprText(state, assoc.value)];
}

function labelKeyText(state: RubyState, key: AnyNode): string {
  if (nodeType(key) === "SymbolNode") {
    const v = symbolText(key);
    return `${v}:`;
  }
  // String label `"a": 1` — keep source for the key, ensure trailing colon.
  const raw = state.source.slice(startOf(key), endOf(key)).trimEnd();
  return raw.endsWith(":") ? raw : `${raw}:`;
}

function symbolText(sym: AnyNode): string {
  const u = sym.unescaped;
  if (typeof u === "string") return u;
  if (u && typeof u.value === "string") return u.value;
  return "";
}

// ---- keyword statements ----------------------------------------------------------------------

function printKeywordWithArgs(
  path: any,
  print: any,
  node: AnyNode,
  state: RubyState,
  keyword: string
): Doc {
  const args = node.arguments_;
  if (!args || (args.arguments_ || []).length === 0) return keyword;
  const argDocs = (args.arguments_ || []).map((a: AnyNode) => exprText(state, a));
  return [keyword, " ", join(", ", argDocs)];
}

function printYield(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  const args = node.arguments_;
  if (!args || (args.arguments_ || []).length === 0) return "yield";
  const argDocs = (args.arguments_ || []).map((a: AnyNode) => exprText(state, a));
  const hasParens = node.lparenLoc != null;
  if (hasParens) return ["yield(", join(", ", argDocs), ")"];
  return ["yield ", join(", ", argDocs)];
}

function printBinary(path: any, print: any, node: AnyNode, state: RubyState): Doc {
  const op = locText(state, node.operatorLoc) || (nodeType(node) === "AndNode" ? "&&" : "||");
  return [exprText(state, node.left), " ", op, " ", exprText(state, node.right)];
}

// `target = value` for local/instance/class/global/constant writes. The target and `=` come from
// source (exact), the value via exprDoc so a nested hash/array literal gets reformatted.
function printWrite(node: AnyNode, state: RubyState): Doc {
  if (rangeHasComment(state, startOf(node), endOf(node))) return sourceFallback(state, node);
  const target = locText(state, node.nameLoc) || String(node.name);
  return [target, " = ", exprDoc(state, node.value)];
}

// ---- expression helpers ----------------------------------------------------------------------

// For nested expressions we prefer source slices: they are always valid, and reformatting deep
// expression trees risks changing semantics. The structural printers above handle the layouts that
// matter (blocks, bodies, containers); leaf/inline expressions are sliced verbatim.
function exprText(state: RubyState, node: AnyNode): Doc {
  if (node == null) return "";
  return verbatim(state.source.slice(startOf(node), endOf(node)));
}

// Like exprText but reformats containers/structural nodes when worthwhile (used for array/hash
// elements and call arguments so nested hashes/arrays still get grouped layout).
function exprDoc(state: RubyState, node: AnyNode): Doc {
  if (node == null) return "";
  const type = nodeType(node);
  if (type === "HashNode") return printHash(null, null, node, state);
  if (type === "ArrayNode") return printArray(null, null, node, state);
  if (type === "AssocNode") return assocDoc(state, node);
  return verbatim(state.source.slice(startOf(node), endOf(node)));
}

/* eslint-enable @typescript-eslint/no-explicit-any */
