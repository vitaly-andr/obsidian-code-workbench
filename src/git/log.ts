// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { execFile } from "child_process";
import type { BranchIdentity, CurrentBranch, RepositorySource } from "./types";

// Run git with an argument array (never a shell string) and a fixed cwd, so no untrusted
// text is interpreted by a shell. Never rejects: a non-zero exit is normal control flow.
// `failed` marks a spawn failure (git missing) or a timeout/kill — treated as unreadable.
function runGit(cwd: string, args: string[]): Promise<{ stdout: string; code: number; failed: boolean }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, windowsHide: true, timeout: 5000, maxBuffer: 1 << 24 }, (err, stdout) => {
      if (!err) {
        resolve({ stdout: stdout ?? "", code: 0, failed: false });
        return;
      }
      const e = err as NodeJS.ErrnoException & { killed?: boolean };
      if (typeof e.code === "string" || e.killed) {
        resolve({ stdout: "", code: -1, failed: true });
        return;
      }
      resolve({ stdout: stdout ?? "", code: typeof e.code === "number" ? e.code : 1, failed: false });
    });
  });
}

// Resolve the repository that contains `vaultBasePath` and whether it has any commits.
export async function resolveRepository(vaultBasePath: string): Promise<RepositorySource> {
  const top = await runGit(vaultBasePath, ["rev-parse", "--show-toplevel"]);
  if (top.failed) return { root: null, state: "unreadable" };
  if (top.code !== 0) return { root: null, state: "not-a-repo" };
  const root = top.stdout.trim();
  if (!root) return { root: null, state: "not-a-repo" };
  const head = await runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (head.failed) return { root, state: "unreadable" };
  if (head.code !== 0 || !head.stdout.trim()) return { root, state: "empty" };
  return { root, state: "ok" };
}

// Map raw git output to a display branch. Pure (no I/O) so it is unit-testable.
export function parseBranch(input: {
  repoState: RepositorySource["state"];
  symbolicRef: string; // trimmed stdout of `symbolic-ref --short HEAD`
  symbolicRefCode: number; // its exit code
  shortId: string | null; // trimmed `rev-parse --short HEAD`, when detached
}): BranchIdentity {
  if (input.repoState === "not-a-repo" || input.repoState === "unreadable") {
    return { kind: "none", label: "no git" };
  }
  // symbolic-ref resolves the branch name even for an unborn branch (empty repo).
  if (input.symbolicRefCode === 0 && input.symbolicRef) {
    return { kind: "branch", label: input.symbolicRef };
  }
  if (input.shortId) {
    return { kind: "detached", label: `@${input.shortId}` };
  }
  return { kind: "none", label: "no git" };
}

// Read the current branch (or detached id) for an already-resolved repository.
export async function getCurrentBranch(repo: RepositorySource): Promise<CurrentBranch> {
  if (!repo.root || repo.state === "not-a-repo" || repo.state === "unreadable") {
    return { ...parseBranch({ repoState: repo.state, symbolicRef: "", symbolicRefCode: 1, shortId: null }), dirty: false };
  }
  const sym = await runGit(repo.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (sym.failed) {
    return { ...parseBranch({ repoState: "unreadable", symbolicRef: "", symbolicRefCode: 1, shortId: null }), dirty: false };
  }
  let shortId: string | null = null;
  if (sym.code !== 0 || !sym.stdout.trim()) {
    const rev = await runGit(repo.root, ["rev-parse", "--short", "HEAD"]);
    shortId = rev.code === 0 ? rev.stdout.trim() || null : null;
  }
  const identity = parseBranch({ repoState: repo.state, symbolicRef: sym.stdout.trim(), symbolicRefCode: sym.code, shortId });
  // Working-tree dirtiness drives the status color. One cheap porcelain read.
  let dirty = false;
  if (identity.kind !== "none") {
    const st = await runGit(repo.root, ["status", "--porcelain"]);
    dirty = !st.failed && st.code === 0 && st.stdout.trim().length > 0;
  }
  return { ...identity, dirty };
}
