// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// The @wasm-fmt /web entries are resolved by esbuild via the package "exports" map; classic TS
// module resolution can't see those subpaths, so declare their tiny surface here. init() accepts
// the wasm bytes directly (BufferSource), which is how we feed the downloaded module. format()
// takes the source and (for clang-format) a filename whose extension selects the dialect.
declare module "@wasm-fmt/gofmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/ruff_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/clang-format/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string, style?: string): string;
}
declare module "@wasm-fmt/sql_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/shfmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/mago_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/lua_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/taplo_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/zig_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/biome_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
declare module "@wasm-fmt/dart_fmt/web" {
  export default function init(input?: Response | Uint8Array | ArrayBuffer | URL): Promise<unknown>;
  export function format(source: string, filename?: string): string;
}
