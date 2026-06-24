// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Resolved git context for the vault. Shared with the git-graph feature (003).
export interface RepositorySource {
  // Absolute repository root (git rev-parse --show-toplevel), or null when not a repo.
  root: string | null;
  state: "ok" | "not-a-repo" | "empty" | "unreadable";
}

// The branch identity (pure, from parseBranch).
export interface BranchIdentity {
  kind: "branch" | "detached" | "none";
  // Branch name, "@<shortsha>" when detached, or "no git" when none.
  label: string;
}

// The current checkout for display: identity + working-tree dirtiness.
export interface CurrentBranch extends BranchIdentity {
  // True when the working tree has uncommitted changes (meaningful only when kind != "none").
  dirty: boolean;
}

// A named pointer shown on a commit (branch / tag / HEAD / remote-tracking).
export interface Ref {
  name: string;
  kind: "branch" | "tag" | "head" | "remote";
}

// One commit as parsed from `git log` — the input to the graph layout and view.
export interface CommitRecord {
  hash: string;
  parents: string[]; // ordered; parents[0] is the first parent
  refs: Ref[];
  author: string;
  date: string; // committer date, ISO-8601
  subject: string;
}
