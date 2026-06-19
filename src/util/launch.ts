// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { spawn } from "child_process";

// How a given terminal wraps the program it should run in a fresh window.
type Term = { bin: string; wrap: (inner: string[]) => string[] };

// Tried in order until one launches. `xdg-terminal-exec` is the freedesktop-standard launcher and
// respects the user's preferred terminal; the rest are common emulators with their own run flags.
const LINUX_TERMS: Term[] = [
  { bin: "xdg-terminal-exec", wrap: (i) => i },
  { bin: "ghostty", wrap: (i) => ["-e", ...i] },
  { bin: "kitty", wrap: (i) => i },
  { bin: "alacritty", wrap: (i) => ["-e", ...i] },
  { bin: "wezterm", wrap: (i) => ["start", "--", ...i] },
  { bin: "konsole", wrap: (i) => ["-e", ...i] },
  { bin: "gnome-terminal", wrap: (i) => ["--", ...i] },
  { bin: "xfce4-terminal", wrap: (i) => ["-x", ...i] },
  { bin: "foot", wrap: (i) => i },
  { bin: "x-terminal-emulator", wrap: (i) => ["-e", ...i] },
  { bin: "xterm", wrap: (i) => ["-e", ...i] },
];

// Spawn detached so the terminal outlives Obsidian. Resolves false if the binary is missing
// (ENOENT fires asynchronously), true if it started without an immediate error.
function spawnDetached(bin: string, argv: string[], cwd?: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };
    try {
      const child = spawn(bin, argv, { cwd, detached: true, stdio: "ignore" });
      child.on("error", () => finish(false));
      child.unref();
      window.setTimeout(() => finish(true), 400);
    } catch {
      finish(false);
    }
  });
}

// Open the platform terminal in `cwd` and start `claude`, keeping the window open afterward.
// Returns false if no terminal could be launched, so the caller can fall back to the clipboard.
export async function launchClaude(cwd: string): Promise<boolean> {
  if (process.platform === "darwin") {
    const path = cwd.replace(/"/g, '\\"');
    const script =
      'tell application "Terminal"\n' +
      `  do script "cd " & quoted form of "${path}" & " && claude"\n` +
      "  activate\n" +
      "end tell";
    return spawnDetached("osascript", ["-e", script]);
  }

  if (process.platform === "win32") {
    if (await spawnDetached("wt", ["-d", cwd, "cmd", "/k", "claude"])) return true;
    return spawnDetached("cmd", ["/c", "start", "", "cmd", "/k", `cd /d "${cwd}" && claude`]);
  }

  // Linux / other unix: run claude through a login shell so PATH is set, then keep a shell open
  // so any error stays visible. The terminal inherits `cwd`, so no cd is needed.
  const shell = process.env.SHELL || "bash";
  const inner = [shell, "-l", "-c", `claude; exec ${shell} -l`];
  const preferred = (process.env.TERMINAL || "").split("/").pop();
  const ordered = preferred
    ? [
        ...LINUX_TERMS.filter((t) => t.bin === preferred),
        ...LINUX_TERMS.filter((t) => t.bin !== preferred),
      ]
    : LINUX_TERMS;
  for (const term of ordered) {
    if (await spawnDetached(term.bin, term.wrap(inner), cwd)) return true;
  }
  return false;
}
