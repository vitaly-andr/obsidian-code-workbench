// One entry point for "Format code file". Tries each engine in order until one returns formatted
// text: Prettier v3 (web + xml) -> Prettier v2 (rust) -> @wasm-fmt (downloaded) -> dprint (downloaded).
// Each returns null when it doesn't handle the extension, so the chain falls through.
import { DataAdapter } from "obsidian";
import { formatCode } from "./prettier-format";
import { formatRust } from "./rust-format";
import { formatRuby } from "./ruby-format";
import { WasmFormatterLoader } from "./wasm-fmt";
import { DprintFormatterLoader } from "./dprint-format";

export class FormatService {
  private readonly wasm: WasmFormatterLoader;
  private readonly dprint: DprintFormatterLoader;

  constructor(adapter: DataAdapter, baseDir: string) {
    const dir = `${baseDir}/formatters`;
    this.wasm = new WasmFormatterLoader(adapter, dir);
    this.dprint = new DprintFormatterLoader(adapter, dir);
  }

  async format(text: string, ext: string): Promise<string | null> {
    return (
      (await formatCode(text, ext)) ??
      formatRust(text, ext) ??
      (await formatRuby(text, ext)) ??
      (await this.wasm.format(text, ext)) ??
      (await this.dprint.format(text, ext))
    );
  }
}
