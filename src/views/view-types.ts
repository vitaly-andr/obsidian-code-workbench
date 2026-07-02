// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// View type identifiers for the custom leaves we register.
export const DIFF_VIEW_TYPE = "code-workbench-diff";
export const CODE_VIEW_TYPE = "code-workbench-code";
// Editable view for hidden/dot files, which Obsidian does not index as vault files (no TFile).
export const HIDDEN_FILE_VIEW_TYPE = "code-workbench-hidden-file";
// Sidebar tree panel listing the vault's hidden files (a parallel explorer for dot-paths).
export const HIDDEN_TREE_VIEW_TYPE = "code-workbench-hidden-tree";
// Sidebar panel that draws the repository history as a branch graph.
export const GIT_GRAPH_VIEW_TYPE = "code-workbench-git-graph";
// Read-only side-by-side diff of a file at a commit (opened from the git graph).
export const GIT_DIFF_VIEW_TYPE = "code-workbench-git-diff";
// Sidebar panel listing the active code file's symbols from the connected language server.
export const OUTLINE_VIEW_TYPE = "code-workbench-outline";
