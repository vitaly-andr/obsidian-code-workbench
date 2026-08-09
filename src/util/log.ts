// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Lightweight console logging. Never log secrets (the auth token in particular).
const PREFIX = "[code-workbench]";

// Routine status lines go out at debug level: the developer console hides those behind its Verbose
// filter, so a working plugin stays quiet for everyone else (Obsidian's "avoid unnecessary logging
// to console" guideline). Warnings and errors below stay at their own level — they report something
// the user may need to act on.
export function info(...args: unknown[]): void {
  console.debug(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}
