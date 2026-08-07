// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Lightweight console logging. Never log secrets (the auth token in particular).
const PREFIX = "[code-workbench]";

// Routine status lines stay off: a plugin should not write to everyone's console on startup. Turn
// them on for a debugging session with
// `localStorage.setItem("code-workbench-debug", "1")` in the developer console. Warnings and
// errors below are always emitted — those report something the user may need to act on.
const DEBUG_KEY = "code-workbench-debug";

// Guarded: this module also runs under the tests and the headless smoke check, where there is no
// window and no storage at all.
function debugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(DEBUG_KEY) != null;
  } catch {
    return false;
  }
}

export function info(...args: unknown[]): void {
  if (debugEnabled()) console.log(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}
