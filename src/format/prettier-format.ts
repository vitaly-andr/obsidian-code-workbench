// In-process code formatting via Prettier standalone — no external tools, no language servers.
// Bundled into main.js (Prettier is plain JS); lazy-loading is a later optimization, since an
// Obsidian plugin loads a single main.js and may not load remote code.
import { format } from "prettier/standalone";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as typescript from "prettier/plugins/typescript";
import * as postcss from "prettier/plugins/postcss";
import * as htmlPlugin from "prettier/plugins/html";
import * as yamlPlugin from "prettier/plugins/yaml";
import xmlPlugin from "@prettier/plugin-xml";
// jinja2 is the only template formatter bundled (zero extra deps, +~0.1 MB). twig/pug/gherkin each
// pull a large parser (~4 MB), and blade/liquid more — all deferred to the future external-formatter
// layer (user installs the CLI, Claude guides setup) rather than bloating main.js. It exports its
// plugin object on the module default, so normalize with pick().
import * as jinjaNs from "prettier-plugin-jinja-template";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pick = (m: any): any => (m && m.default) || m;

// File extension -> Prettier parser. (JSON parsers live in the babel plugin; estree is the printer.)
// The xml community plugin adds XML; everything else Prettier doesn't cover is handled by a wasm
// formatter (see wasm-fmt.ts) — including TOML, via @wasm-fmt/taplo_fmt (downloaded), instead of the
// Prettier toml plugin whose Taplo wasm is inlined at 34MB.
const PARSER: Record<string, string> = {
  js: "babel", mjs: "babel", cjs: "babel", jsx: "babel",
  ts: "typescript", tsx: "typescript",
  json: "json", jsonc: "json", json5: "json5",
  css: "css", scss: "scss", less: "less",
  html: "html", htm: "html",
  yaml: "yaml", yml: "yaml",
  xml: "xml", xsd: "xml", xsl: "xml", svg: "xml", plist: "xml",
  // Jinja2 / Ansible templates (only bundled template formatter).
  j2: "jinja-template", jinja: "jinja-template", jinja2: "jinja-template",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLUGINS: any[] = [
  babel, estree, typescript, postcss, htmlPlugin, yamlPlugin, xmlPlugin,
  pick(jinjaNs),
];

export function canFormat(ext: string): boolean {
  return ext in PARSER;
}

// Formatted text, or null if the extension is unsupported or Prettier threw (e.g. a syntax
// error) — in which case the file is left untouched.
export async function formatCode(text: string, ext: string): Promise<string | null> {
  const parser = PARSER[ext];
  if (!parser) return null;
  try {
    return await format(text, { parser, plugins: PLUGINS });
  } catch {
    return null;
  }
}
