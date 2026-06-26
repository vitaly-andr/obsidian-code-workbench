// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Rust formatting via prettier-plugin-rust (the jinx-rust parser). The plugin targets Prettier v2's
// doc API (v3 removed `concat`), so a Prettier v2 standalone is bundled under the `prettier-v2`
// alias just for Rust. Pure JS, in-process (no download); loaded lazily on the first Rust format
// (dynamic import) to stay off the plugin's onload path.
// `prettier-v2` ships no types and the rust plugin's are loose, so the engine's options/plugin are
// `unknown` (not `any`) — we only forward them to the type-erased v2 `format`.
let engine: Promise<{ format: (src: string, opts: unknown) => string; plugin: unknown }> | null = null;

function loadEngine() {
  if (!engine) {
    engine = (async () => {
      const [v2, rustPluginNs] = await Promise.all([
        import("prettier-v2/standalone") as Promise<{ format: (src: string, opts: unknown) => string }>,
        import("prettier-plugin-rust"),
      ]);
      return {
        format: v2.format,
        plugin: rustPluginNs.default ?? rustPluginNs,
      };
    })();
  }
  return engine;
}

export async function formatRust(text: string, ext: string): Promise<string | null> {
  if (ext !== "rs") return null;
  try {
    const { format, plugin } = await loadEngine();
    return format(text, { parser: "jinx-rust", plugins: [plugin] });
  } catch {
    return null;
  }
}
