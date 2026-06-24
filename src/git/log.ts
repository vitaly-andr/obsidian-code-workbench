// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { execFile } from "child_process";
import type { BlameLine, BranchIdentity, CommitRecord, CurrentBranch, Ref, RepositorySource } from "./types";

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

const US = "\x1f"; // field separator
const RS = "\x1e"; // record separator

// Parse `%D` (ref names) into typed refs.
function parseRefs(raw: string): Ref[] {
  const refs: Ref[] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part.startsWith("HEAD -> ")) {
      refs.push({ name: "HEAD", kind: "head" });
      refs.push({ name: part.slice("HEAD -> ".length), kind: "branch" });
    } else if (part === "HEAD") {
      refs.push({ name: "HEAD", kind: "head" });
    } else if (part.startsWith("tag: ")) {
      refs.push({ name: part.slice("tag: ".length), kind: "tag" });
    } else if (part.includes("/")) {
      refs.push({ name: part, kind: "remote" });
    } else {
      refs.push({ name: part, kind: "branch" });
    }
  }
  return refs;
}

// Parse the US/RS-delimited `git log` output. Pure (no I/O), so it is unit-testable.
export function parseCommits(stdout: string): CommitRecord[] {
  const out: CommitRecord[] = [];
  for (const chunk of stdout.split(RS)) {
    const rec = chunk.trim();
    if (!rec) continue;
    const [hash = "", parentsRaw = "", refsRaw = "", author = "", date = "", subject = ""] = rec.split(US);
    if (!hash) continue;
    const parents = parentsRaw.trim() ? parentsRaw.trim().split(" ") : [];
    out.push({ hash, parents, refs: parseRefs(refsRaw), author, date, subject });
  }
  return out;
}

export interface LoadCommitsOptions {
  scope?: "all" | "current"; // all local branches (default) or the current branch only
  limit?: number; // max commits to return (default 500)
  skip?: number; // commits to skip, for incremental loading
}

// Load commits (newest-first, topological) for the graph. Returns `hasMore` for pagination.
export async function loadCommits(
  repo: RepositorySource,
  opts: LoadCommitsOptions = {},
): Promise<{ commits: CommitRecord[]; hasMore: boolean }> {
  if (!repo.root || repo.state !== "ok") return { commits: [], hasMore: false };
  const scope = opts.scope ?? "all";
  const limit = opts.limit ?? 500;
  const skip = opts.skip ?? 0;
  const fmt = ["%H", "%P", "%D", "%an", "%aI", "%s"].join(US) + RS;
  const args = ["log"];
  if (scope === "all") args.push("--all");
  args.push("--parents", "--topo-order", `--max-count=${limit + 1}`, `--skip=${skip}`, `--pretty=format:${fmt}`);
  const res = await runGit(repo.root, args);
  if (res.failed || res.code !== 0) return { commits: [], hasMore: false };
  const all = parseCommits(res.stdout);
  const hasMore = all.length > limit;
  return { commits: hasMore ? all.slice(0, limit) : all, hasMore };
}

// Branches containing a commit + the files it changed (vs its first parent). For the detail pane.
export async function loadCommitDetail(
  repo: RepositorySource,
  hash: string,
): Promise<{ branches: string[]; files: { status: string; path: string }[] }> {
  if (!repo.root || repo.state !== "ok") return { branches: [], files: [] };
  const br = await runGit(repo.root, ["branch", "--contains", hash, "--format=%(refname:short)"]);
  const branches =
    !br.failed && br.code === 0 ? br.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const fs = await runGit(repo.root, ["show", "--no-color", "--first-parent", "--name-status", "--format=", hash]);
  const files: { status: string; path: string }[] = [];
  if (!fs.failed && fs.code === 0) {
    for (const line of fs.stdout.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split("\t");
      if (parts.length < 2) continue;
      files.push({ status: parts[0][0] ?? "?", path: parts[parts.length - 1] });
    }
  }
  return { branches, files };
}

// An uncommitted working-tree line blames to the all-zero sha.
const ZERO_HASH = "0000000000000000000000000000000000000000";

// Parse `git blame --line-porcelain` into per-line records. Pure (no I/O), so it is unit-testable.
// The format repeats a header block for every line: a "<sha> <orig> <final> [group]" line, then
// "author"/"author-time"/"summary"/… key-value lines, then a tab-prefixed content line that closes
// the record.
export function parseBlame(stdout: string): BlameLine[] {
  const out: BlameLine[] = [];
  let cur: { author?: string; epoch?: number; summary?: string } = {};
  let hash = "";
  let finalLine = 0;
  for (const raw of stdout.split("\n")) {
    if (raw.startsWith("\t")) {
      out.push({
        line: finalLine,
        hash,
        author: cur.author ?? "",
        epoch: cur.epoch ?? 0,
        summary: cur.summary ?? "",
        uncommitted: hash === ZERO_HASH,
      });
      cur = {};
      continue;
    }
    const sp = raw.indexOf(" ");
    const key = sp === -1 ? raw : raw.slice(0, sp);
    const val = sp === -1 ? "" : raw.slice(sp + 1);
    if (/^[0-9a-f]{40}$/.test(key)) {
      hash = key;
      // "<sha> <orig-line> <final-line> [group-size]" — the final line number is the 2nd field.
      finalLine = Number(val.split(" ")[1] ?? "0") || 0;
    } else if (key === "author") {
      cur.author = val;
    } else if (key === "author-time") {
      cur.epoch = Number(val) || 0;
    } else if (key === "summary") {
      cur.summary = val;
    }
  }
  return out;
}

// Per-line blame for a file (absolute path), for the inline annotation. Empty when git is missing,
// the repo is unreadable, or the file is untracked — every "no blame" case looks the same here.
export async function loadBlame(repo: RepositorySource, absPath: string): Promise<BlameLine[]> {
  if (!repo.root || repo.state !== "ok") return [];
  const res = await runGit(repo.root, ["blame", "--line-porcelain", "--", absPath]);
  if (res.failed || res.code !== 0) return [];
  return parseBlame(res.stdout);
}

// Old (parent) and new (commit) contents of a file at a commit, for a read-only diff.
export async function loadFileDiff(
  repo: RepositorySource,
  hash: string,
  path: string,
): Promise<{ oldText: string; newText: string }> {
  if (!repo.root || repo.state !== "ok") return { oldText: "", newText: "" };
  const oldR = await runGit(repo.root, ["show", `${hash}^:${path}`]); // empty for added/root
  const newR = await runGit(repo.root, ["show", `${hash}:${path}`]); // empty for deleted
  return {
    oldText: !oldR.failed && oldR.code === 0 ? oldR.stdout : "",
    newText: !newR.failed && newR.code === 0 ? newR.stdout : "",
  };
}
