// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Rust formatting via prettier-plugin-rust (the jinx-rust parser). The plugin targets Prettier v2's
// doc API (v3 removed `concat`), so a Prettier v2 standalone is bundled under the `prettier-v2`
// alias just for Rust. Pure JS, in-process (no download), ~0.8MB of bundle.
import { format as formatV2 } from "prettier-v2/standalone";
import * as rustPluginNs from "prettier-plugin-rust";

const rustPlugin: any = (rustPluginNs as any).default ?? rustPluginNs;

export function formatRust(text: string, ext: string): string | null {
  if (ext !== "rs") return null;
  try {
    return formatV2(text, { parser: "jinx-rust", plugins: [rustPlugin] }) as unknown as string;
  } catch {
    return null;
  }
}
