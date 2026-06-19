// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Obsidian runs plugins in a browser-like renderer where `window` exists. The headless test env is
// Node, so expose `window` for code that uses popout-safe timers (window.setInterval/setTimeout).
globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
