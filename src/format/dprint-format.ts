// Formatting via the dprint engine + its WASM plugins. dprint plugins are downloaded on first use
// from plugins.dprint.dev and cached, then run through @dprint/formatter. Used for languages the
// other engines don't cover — currently markup_fmt (Vue/Svelte/Astro/HTML).
import { DataAdapter, requestUrl } from "obsidian";
import { createFromBuffer, type Formatter, type FormatRequest } from "@dprint/formatter";
import biomeInit, { format as biomeFormat } from "@wasm-fmt/biome_fmt/web";
import { warn } from "../util/log";

// markup_fmt formats only the markup layer of a component file; it delegates the embedded <script>
// and <style> back to the host. We route those to Biome (one ~1.8MB wasm doing both js/ts and css),
// downloaded on demand — so Vue/Svelte/Astro format fully (markup + script + style) without bundling
// a language compiler.
const BIOME_WASM = "https://cdn.jsdelivr.net/npm/@wasm-fmt/biome_fmt@0.2.9/biome_fmt_bg.wasm";
const SCRIPT_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const STYLE_EXT = /\.(css|scss|less)$/;

interface DprintPlugin {
  id: string;
  url: string; // pinned plugin wasm
}

const PLUGINS: Record<string, DprintPlugin> = {
  markup: { id: "markup", url: "https://plugins.dprint.dev/g-plane/markup_fmt-v0.21.0.wasm" },
};

// markup_fmt infers the dialect from the file path's extension.
const EXT_TO_DPRINT: Record<string, { plugin: string; filePath: string }> = {
  vue: { plugin: "markup", filePath: "x.vue" },
  svelte: { plugin: "markup", filePath: "x.svelte" },
  astro: { plugin: "markup", filePath: "x.astro" },
};

export class DprintFormatterLoader {
  private readonly cache = new Map<string, Promise<Formatter | null>>();
  private biomeFmt: Promise<((src: string, file: string) => string) | null> | null = null;

  constructor(
    private readonly adapter: DataAdapter,
    private readonly cacheDir: string,
  ) {}

  canFormat(ext: string): boolean {
    return ext in EXT_TO_DPRINT;
  }

  async format(text: string, ext: string): Promise<string | null> {
    const route = EXT_TO_DPRINT[ext];
    if (!route) return null;
    const formatter = await this.ensure(PLUGINS[route.plugin]);
    if (!formatter) return null;
    try {
      return formatter.formatText({ filePath: route.filePath, fileText: text });
    } catch (e) {
      warn(`dprint "${route.plugin}" threw on .${ext}: ${String(e)}`);
      return null;
    }
  }

  private ensure(plugin: DprintPlugin): Promise<Formatter | null> {
    let pending = this.cache.get(plugin.id);
    if (!pending) {
      pending = this.boot(plugin).catch((e) => {
        warn(`dprint plugin "${plugin.id}" failed to load: ${String(e)}`);
        return null;
      });
      this.cache.set(plugin.id, pending);
    }
    return pending;
  }

  private async boot(plugin: DprintPlugin): Promise<Formatter | null> {
    const path = `${this.cacheDir}/dprint-${plugin.id}.wasm`;
    let bytes: ArrayBuffer;
    if (await this.adapter.exists(path)) {
      bytes = await this.adapter.readBinary(path);
    } else {
      const res = await requestUrl({ url: plugin.url, throw: false });
      if (res.status !== 200) return null;
      if (!(await this.adapter.exists(this.cacheDir))) {
        try {
          await this.adapter.mkdir(this.cacheDir);
        } catch {
          /* concurrent create */
        }
      }
      await this.adapter.writeBinary(path, res.arrayBuffer);
      bytes = res.arrayBuffer;
    }
    const formatter = createFromBuffer(new Uint8Array(bytes));
    // Route embedded <script>/<style> to Biome so script + style are formatted too, not just markup.
    const biome = await this.ensureBiome();
    if (biome) {
      formatter.setHostFormatter((req: FormatRequest): string => {
        try {
          if (SCRIPT_EXT.test(req.filePath)) return biome(req.fileText, req.filePath);
          if (STYLE_EXT.test(req.filePath)) return biome(req.fileText, "embedded.css");
        } catch {
          /* leave the embedded block as-is on failure */
        }
        return req.fileText;
      });
    }
    return formatter;
  }

  // Biome (js/ts + css), downloaded once and reused as the host formatter for embedded blocks.
  private ensureBiome(): Promise<((src: string, file: string) => string) | null> {
    if (!this.biomeFmt) {
      this.biomeFmt = this.bootBiome().catch((e) => {
        warn(`dprint: Biome (embedded script/style) unavailable: ${String(e)}`);
        return null;
      });
    }
    return this.biomeFmt;
  }

  private async bootBiome(): Promise<((src: string, file: string) => string) | null> {
    const path = `${this.cacheDir}/biome.wasm`;
    let bytes: ArrayBuffer;
    if (await this.adapter.exists(path)) {
      bytes = await this.adapter.readBinary(path);
    } else {
      const res = await requestUrl({ url: BIOME_WASM, throw: false });
      if (res.status !== 200) return null;
      if (!(await this.adapter.exists(this.cacheDir))) {
        try {
          await this.adapter.mkdir(this.cacheDir);
        } catch {
          /* concurrent create */
        }
      }
      await this.adapter.writeBinary(path, res.arrayBuffer);
      bytes = res.arrayBuffer;
    }
    await biomeInit(new Response(bytes, { headers: { "Content-Type": "application/wasm" } }));
    return (src, file) => biomeFormat(src, file);
  }
}
