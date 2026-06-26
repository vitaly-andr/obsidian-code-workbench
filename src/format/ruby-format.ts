// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Ruby formatting: @ruby/prism parses Ruby to an AST, a custom Prettier v3 printer formats it
// (see ruby-printer.ts). prism.wasm (~0.5MB) is downloaded on first use and cached in the plugin
// folder — the same lazy, offline-after-first model as the @wasm-fmt formatters — instead of being
// embedded in main.js. Prettier, the WASI shim and the printer load lazily too, so nothing here runs
// on the plugin's onload path.
import { DataAdapter, requestUrl } from "obsidian";
import { warn } from "../util/log";
import type { PrismParseResult } from "./ruby-printer";

const RUBY_EXTS = new Set(["rb", "gemspec", "rake", "ru"]);
const PRISM_WASM_URL = "https://cdn.jsdelivr.net/npm/@ruby/prism@1.9.0/src/prism.wasm";

export class RubyFormatter {
  private parseFn: ((src: string) => PrismParseResult) | null = null;
  private booting: Promise<boolean> | null = null;

  constructor(
    private readonly adapter: DataAdapter,
    private readonly cacheDir: string,
  ) {}

  canFormat(ext: string): boolean {
    return RUBY_EXTS.has(ext);
  }

  // Formatted Ruby, or null if the extension isn't Ruby / prism is unavailable / formatting threw.
  async format(text: string, ext: string): Promise<string | null> {
    if (!RUBY_EXTS.has(ext)) return null;
    if (!(await this.ensure())) return null;
    try {
      const [{ format }, { makeRubyPlugin }] = await Promise.all([
        import("prettier/standalone"),
        import("./ruby-printer"),
      ]);
      return await format(text, { parser: "ruby", plugins: [makeRubyPlugin(this.parseFn!)] });
    } catch (e) {
      warn(`ruby formatter failed: ${String(e)}`);
      return null;
    }
  }

  private ensure(): Promise<boolean> {
    if (!this.booting) {
      this.booting = this.boot().catch((e) => {
        warn(`ruby formatter failed to initialize: ${String(e)}`);
        return false;
      });
    }
    return this.booting;
  }

  private async boot(): Promise<boolean> {
    const bytes = await this.loadWasm();
    if (!bytes) return false;
    const [{ WASI, OpenFile, File: WasiFile, ConsoleStdout }, { parsePrism }] = await Promise.all([
      import("@bjorn3/browser_wasi_shim"),
      import("@ruby/prism/src/parsePrism.js"),
    ]);
    const wasi = new WASI(
      [],
      [],
      [new OpenFile(new WasiFile([])), ConsoleStdout.lineBuffered(() => {}), ConsoleStdout.lineBuffered(() => {})],
    );
    const wasm = await WebAssembly.compile(bytes);
    const instance = await WebAssembly.instantiate(wasm, {
      wasi_snapshot_preview1: (wasi as unknown as { wasiImport: WebAssembly.ModuleImports }).wasiImport,
    });
    (wasi as unknown as { initialize(i: WebAssembly.Instance): void }).initialize(instance);
    this.parseFn = (src: string) => parsePrism(instance.exports, src, {}) as PrismParseResult;
    return true;
  }

  // Cached prism.wasm bytes, downloading once on first use; null if offline on first use.
  private async loadWasm(): Promise<ArrayBuffer | null> {
    const path = `${this.cacheDir}/prism.wasm`;
    if (await this.adapter.exists(path)) return this.adapter.readBinary(path);
    const res = await requestUrl({ url: PRISM_WASM_URL, throw: false });
    if (res.status !== 200) return null;
    if (!(await this.adapter.exists(this.cacheDir))) {
      try {
        await this.adapter.mkdir(this.cacheDir);
      } catch {
        /* concurrent create */
      }
    }
    await this.adapter.writeBinary(path, res.arrayBuffer);
    return res.arrayBuffer;
  }
}
