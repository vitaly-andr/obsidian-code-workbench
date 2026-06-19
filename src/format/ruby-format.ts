// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Ruby formatting: @ruby/prism parses Ruby to an AST, a custom Prettier v3 printer formats it
// (see ruby-printer.ts). Prism is a WASI module; we load it with a pure-JS WASI shim (not node:wasi)
// and embed prism.wasm (~0.5MB) in the bundle, so it runs in Obsidian's renderer with no fetch.
import { format } from "prettier/standalone";
import { WASI, OpenFile, File as WasiFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import prismWasm from "@ruby/prism/src/prism.wasm";
import { parsePrism } from "@ruby/prism/src/parsePrism.js";
import { makeRubyPlugin, type PrismParseResult } from "./ruby-printer";
import { warn } from "../util/log";

let parseFn: ((src: string) => PrismParseResult) | null = null;
let booting: Promise<void> | null = null;

async function initPrism(): Promise<void> {
  const wasi = new WASI(
    [],
    [],
    [new OpenFile(new WasiFile([])), ConsoleStdout.lineBuffered(() => {}), ConsoleStdout.lineBuffered(() => {})],
  );
  const wasm = await WebAssembly.compile(prismWasm as unknown as BufferSource);
  const instance = await WebAssembly.instantiate(wasm, {
    wasi_snapshot_preview1: (wasi as unknown as { wasiImport: WebAssembly.ModuleImports }).wasiImport,
  });
  (wasi as unknown as { initialize(i: WebAssembly.Instance): void }).initialize(instance);
  const exports = instance.exports;
  parseFn = (src: string) => parsePrism(exports as any, src, {}) as PrismParseResult;
}

const RUBY_EXTS = new Set(["rb", "gemspec", "rake", "ru"]);

// Formatted Ruby, or null if the extension isn't Ruby / prism failed to load / formatting threw.
export async function formatRuby(text: string, ext: string): Promise<string | null> {
  if (!RUBY_EXTS.has(ext)) return null;
  try {
    if (!parseFn) {
      if (!booting) booting = initPrism();
      await booting;
    }
    if (!parseFn) return null;
    return await format(text, { parser: "ruby", plugins: [makeRubyPlugin(parseFn)] });
  } catch (e) {
    warn(`ruby formatter failed: ${String(e)}`);
    return null;
  }
}
