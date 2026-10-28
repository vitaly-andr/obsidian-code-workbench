// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Proves the PUBLISHED ABAP grammar asset works under the exact web-tree-sitter the plugin bundles.
// Unlike the CI verify step (which checks the freshly built files before publishing), this script
// downloads tree-sitter-abap.wasm + tree-sitter-abap.highlights.scm from the fork's grammars-v1
// release and runs the same load / parse / highlights-compile checks against the installed
// web-tree-sitter@0.26.9 in node_modules. Run it AFTER the user dispatches the CI job and the
// release assets exist; until then the download fails (expected) — that is not a build failure.
//
// Usage:
//   node tests/runtime/verify-abap-grammar.mjs               # download from the fork release
//   node tests/runtime/verify-abap-grammar.mjs <wasm> <scm>  # verify local files instead
import { Parser, Language, Query } from "web-tree-sitter";
import { promises as fs } from "fs";

const RELEASE = "https://github.com/sigurdn/obsidian-code-workbench-abap/releases/download/grammars-v1";
const WASM_URL = `${RELEASE}/tree-sitter-abap.wasm`;
const SCM_URL = `${RELEASE}/tree-sitter-abap.highlights.scm`;

// Representative ABAP fixtures: a line comment, an inline comment, a string/char literal, a DATA:
// chain, a CLASS DEFINITION / METHOD / ENDMETHOD block, an inline declaration, IF/ENDIF, and a
// SELECT ... INTO TABLE. The grammar is permissive and documents gaps, so the assertion below only
// requires that the tree is non-trivial — not that every statement parses error-free.
const SAMPLE = `* a full-line comment
REPORT zdemo.

DATA: lv_count TYPE i,
      lv_name  TYPE string.

lv_name = 'hello world'. " inline comment

DATA(lv_x) = lv_count + 1.

IF lv_count > 0.
  lv_count = lv_count - 1.
ENDIF.

CLASS zcl_demo DEFINITION.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.

CLASS zcl_demo IMPLEMENTATION.
  METHOD run.
    SELECT * FROM sflight INTO TABLE @DATA(lt_flights).
  ENDMETHOD.
ENDCLASS.
`;

function fail(msg) {
  console.error("ABAP GRAMMAR VERIFY FAIL:", msg);
  process.exit(1);
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchTextFrom(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function main() {
  const [wasmArg, scmArg] = process.argv.slice(2);

  let wasmBytes;
  let scm;
  if (wasmArg && scmArg) {
    console.log(`loading local files: ${wasmArg}, ${scmArg}`);
    wasmBytes = new Uint8Array(await fs.readFile(wasmArg));
    scm = await fs.readFile(scmArg, "utf8");
  } else {
    console.log(`downloading from ${RELEASE}`);
    wasmBytes = await fetchBytes(WASM_URL);
    scm = await fetchTextFrom(SCM_URL);
  }

  await Parser.init();
  const language = await Language.load(wasmBytes);

  // (b) ABI check: the plugin's runtime (web-tree-sitter 0.26.9) supports ABI 14/15 only.
  const abi = language.abiVersion;
  console.log("abiVersion:", abi);
  if (abi !== 14 && abi !== 15) fail(`unexpected ABI version ${abi} (expected 14 or 15)`);

  // (c) parse the representative sample and assert the tree is non-trivial and not one giant error.
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(SAMPLE);
  const root = tree.rootNode;
  console.log("root type:", root.type, "children:", root.childCount, "hasError:", root.hasError);
  if (root.childCount === 0) fail("root node has no children — grammar did not parse the sample");
  // A single ERROR node spanning the whole input means the grammar rejected everything.
  if (root.childCount === 1 && root.children[0].type === "ERROR") {
    fail("the entire tree is a single ERROR node");
  }

  // (d) compile the highlights query. If it throws, report HIGHLIGHTS_INCOMPATIBLE so the caller can
  // choose the highlights-disabled registry fallback, but keep the parse assertions above as passing.
  try {
    const query = new Query(language, scm);
    console.log("highlights query compiled; captures:", query.captureNames.length);
    query.delete?.();
  } catch (e) {
    console.error("HIGHLIGHTS_INCOMPATIBLE:", String(e));
    fail("highlights query did not compile under web-tree-sitter");
  }

  console.log("ABAP GRAMMAR VERIFY OK");
  process.exit(0);
}

main().catch((e) => fail(String(e)));
