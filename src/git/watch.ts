// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { execFile } from "child_process";
import { FSWatcher, watch } from "fs";
import * as path from "path";

// Resolve a path inside the git dir, e.g. "logs/HEAD". Uses `git rev-parse --git-path` so it works
// when `.git` is a file (worktrees, submodules), not only a plain directory. Null if git fails.
function gitPath(root: string, rel: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", root, "rev-parse", "--git-path", rel],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const p = stdout.trim();
        if (!p) return resolve(null);
        resolve(path.isAbsolute(p) ? p : path.join(root, p));
      },
    );
  });
}

// Watch the repository's ref log (`logs/HEAD`), which git appends to on every ref update — commit,
// checkout, merge, reset — including changes made outside Obsidian (a terminal, or Claude Code).
// Calls `onChange` (debounced) when it moves. Best-effort: if the log can't be watched (e.g. a repo
// with no commits yet), this is a no-op. Returns a disposer; call it on unload.
export async function watchGitRefs(
  root: string,
  onChange: () => void,
  debounceMs = 300,
): Promise<() => void> {
  const target = await gitPath(root, "logs/HEAD");
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const fire = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!disposed) onChange();
    }, debounceMs);
  };

  if (target) {
    try {
      // persistent:false so the watcher never keeps the host process alive.
      watcher = watch(target, { persistent: false }, () => fire());
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      // logs/HEAD is not watchable (missing, or the platform rejected it): skip, no auto-refresh.
      watcher = null;
    }
  }

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    watcher?.close();
    watcher = null;
  };
}
