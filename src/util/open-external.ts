// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// window.open is unreliable in Obsidian's renderer; open external URLs through Electron's shell,
// falling back to window.open.
export function openExternal(url: string): void {
  try {
    const req = (window as unknown as { require?: (m: string) => unknown }).require;
    if (req) {
      const electron = req("electron") as { shell?: { openExternal?: (u: string) => void } };
      if (electron.shell?.openExternal) {
        void electron.shell.openExternal(url);
        return;
      }
    }
  } catch {
    // fall through to window.open
  }
  window.open(url, "_blank");
}
