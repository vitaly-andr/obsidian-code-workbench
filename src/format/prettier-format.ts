// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// In-process code formatting via Prettier standalone — no external tools, no language servers.
// Prettier is bundled into main.js but loaded lazily on the first format, and only the plugins the
// current file's parser needs (formatting a .json never pulls the TypeScript or HTML plugin). Nothing
// here runs on the plugin's onload path.
import type { Plugin } from "prettier";

const pick = (m: unknown): Plugin => ((m as { default?: Plugin } | null)?.default || (m as Plugin));

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

export function canFormat(ext: string): boolean {
  return ext in PARSER;
}

// Prettier standalone — loaded once on first format. The JS module system memoizes import(), so
// repeated calls reuse the same module.
let stdPromise: Promise<typeof import("prettier/standalone")> | null = null;
const loadPrettier = () => (stdPromise ??= import("prettier/standalone"));

// Only the plugins a given parser needs. estree is the printer for the JS/TS/JSON ASTs; html embeds
// JS/CSS, so it also needs babel/estree/postcss. jinja2 is the only bundled template formatter (zero
// extra deps); twig/pug/gherkin/blade/liquid pull large parsers and are deferred to the future
// external-formatter layer.
async function pluginsFor(parser: string): Promise<Plugin[]> {
  switch (parser) {
    case "babel":
    case "json":
    case "json5":
      return Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
    case "typescript":
      return Promise.all([import("prettier/plugins/typescript"), import("prettier/plugins/estree")]);
    case "css":
    case "scss":
    case "less":
      return [await import("prettier/plugins/postcss")];
    case "html":
      return Promise.all([
        import("prettier/plugins/html"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
        import("prettier/plugins/postcss"),
      ]);
    case "yaml":
      return [await import("prettier/plugins/yaml")];
    case "xml":
      return [pick(await import("@prettier/plugin-xml"))];
    case "jinja-template":
      return [pick(await import("prettier-plugin-jinja-template"))];
    default:
      return [];
  }
}

// Formatted text, or null if the extension is unsupported or Prettier threw (e.g. a syntax
// error) — in which case the file is left untouched.
export async function formatCode(text: string, ext: string): Promise<string | null> {
  const parser = PARSER[ext];
  if (!parser) return null;
  try {
    const [std, plugins] = await Promise.all([loadPrettier(), pluginsFor(parser)]);
    return await std.format(text, { parser, plugins });
  } catch {
    return null;
  }
}
