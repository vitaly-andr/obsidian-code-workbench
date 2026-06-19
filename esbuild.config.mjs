import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

// Legal banner prepended to the built bundle. PolyForm Shield's Notices clause requires the license
// (or its URL) and the Required Notice to travel with any copy of the software, and main.js is what
// users actually receive. Bundled third-party code keeps its own licenses (see THIRD-PARTY-LICENSES).
const LICENSE_BANNER = `/*
 * Code Workbench for Obsidian — https://github.com/vitaly-andr/obsidian-code-workbench
 * Copyright 2026 Vitaly Andrianov
 * SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
 * Required Notice: Copyright 2026 Vitaly Andrianov
 * Licensed under PolyForm Shield 1.0.0 (https://polyformproject.org/licenses/shield/1.0.0).
 * Bundled third-party components retain their own licenses; see THIRD-PARTY-LICENSES.
 */
`;

// R2: host-provided libraries must NOT be bundled. Obsidian hands back its own
// singleton CodeMirror 6 / Lezer instances through a require() overload; a second
// bundled copy of @codemirror/state or /view breaks extension registration.
// We bundle only what Obsidian does not provide (ws, @codemirror/merge, lang-*).
const external = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  ...builtins,
];

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external,
  format: "cjs",
  platform: "node",
  target: "es2018",
  treeShaking: true,
  logLevel: "info",
  // The web-tree-sitter runtime wasm is embedded in the bundle as a Uint8Array (~200KB) so the
  // engine boots offline; only per-language grammars are fetched on demand. Grammar .wasm files
  // are never imported here — they are downloaded at runtime — so this loader only hits the runtime.
  loader: { ".wasm": "binary" },
  // web-tree-sitter's ESM build reads `import.meta.url` (to createRequire and locate its wasm).
  // esbuild's CJS output leaves that undefined, which throws in Parser.init. Point it at the
  // bundle's own file URL, computed at runtime from __filename (defined for an Obsidian plugin).
  banner: {
    js:
      LICENSE_BANNER +
      "const __ts_import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: { "import.meta.url": "__ts_import_meta_url" },
  sourcemap: production ? false : "inline",
  outfile: "main.js",
});

if (production) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
