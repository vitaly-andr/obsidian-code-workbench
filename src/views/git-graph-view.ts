// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { vaultBasePath } from "../util/paths";
import { loadCommitDetail, loadCommits, resolveRepository } from "../git/log";
import { layoutGraph } from "../git-graph/layout";
import type { GraphModel } from "../git-graph/layout.types";
import type { CommitRecord, RepositorySource } from "../git/types";
import { GIT_GRAPH_VIEW_TYPE } from "./view-types";

const ROW_H = 24; // px per commit row (kept in sync with .cw-gg-row in styles.css)
const LANE_W = 14; // px per lane column
const NODE_R = 4; // commit node radius
const PALETTE = 8; // number of lane color classes (.cw-gg-lane-0..7)

const SVG_NS = "http://www.w3.org/2000/svg";

// Create an SVG element in the parent's own document (popout-safe) and append it.
function svgEl<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  cls?: string,
): SVGElementTagNameMap[K] {
  const el = parent.ownerDocument.createElementNS(SVG_NS, tag);
  if (cls) el.setAttribute("class", cls);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

// A left-sidebar panel that draws the repository's history as a branch graph (read-only):
// commits newest-first, lanes per branch, edges for branch/merge, ref labels. Clicking a commit
// shows its branches and changed files in a detail pane at the bottom. Reuses the shared git read
// (src/git/log) and the pure layout (src/git-graph/layout). All git work happens here, on
// open/refresh/click — never at plugin load.
export class GitGraphView extends ItemView {
  private repo: RepositorySource | null = null;
  private detailEl: HTMLElement | null = null;
  private selectedRow: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return GIT_GRAPH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Git graph";
  }

  getIcon(): string {
    return "git-branch";
  }

  async onOpen(): Promise<void> {
    this.addAction("refresh-cw", "Refresh git graph", () => void this.refresh());
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const base = vaultBasePath(this.app);
      if (!base) return this.renderMessage("Could not resolve the vault folder.");
      const repo = await resolveRepository(base);
      this.repo = repo.state === "ok" ? repo : null;
      if (repo.state === "not-a-repo") return this.renderMessage("This vault is not a git repository.");
      if (repo.state === "unreadable") return this.renderMessage("Could not read git history.");
      if (repo.state === "empty") return this.renderMessage("No commits yet.");
      const { commits } = await loadCommits(repo);
      if (commits.length === 0) return this.renderMessage("No commits yet.");
      this.renderGraph(commits, layoutGraph(commits));
    } catch (e) {
      this.renderMessage(`Git graph error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private renderMessage(text: string): void {
    this.contentEl.empty();
    this.contentEl.addClass("cw-gitgraph");
    this.detailEl = null;
    this.selectedRow = null;
    this.contentEl.createDiv({ cls: "pane-empty", text });
  }

  private renderGraph(commits: CommitRecord[], model: GraphModel): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("cw-gitgraph");
    this.selectedRow = null;

    const scroll = root.createDiv({ cls: "cw-gg-scroll" });
    const wrap = scroll.createDiv({ cls: "cw-gg-wrap" });
    const gutterW = Math.max(LANE_W, model.laneCount * LANE_W);
    const totalH = model.rows.length * ROW_H;
    const svg = svgEl(
      wrap,
      "svg",
      { width: gutterW, height: totalH, viewBox: `0 0 ${gutterW} ${totalH}` },
      "cw-gg-svg",
    );
    const laneX = (lane: number): number => LANE_W / 2 + lane * LANE_W;
    const rowY = (r: number): number => r * ROW_H + ROW_H / 2;

    // Edges first so the nodes sit on top of them.
    model.rows.forEach((row, r) => {
      for (const link of row.links) {
        const x1 = laneX(link.fromLane);
        const y1 = rowY(r);
        const x2 = laneX(link.toLane);
        const y2 = rowY(r + 1);
        const colorLane = link.merge ? link.toLane : Math.max(link.fromLane, link.toLane);
        const d =
          x1 === x2
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
        svgEl(svg, "path", { d }, `cw-gg-edge cw-gg-lane-${colorLane % PALETTE}`);
      }
    });
    model.rows.forEach((row, r) => {
      svgEl(
        svg,
        "circle",
        { cx: laneX(row.lane), cy: rowY(r), r: NODE_R },
        `cw-gg-node cw-gg-lane-${row.lane % PALETTE}`,
      );
    });

    // Commit list, aligned row-for-row with the graph (same ROW_H).
    const list = wrap.createDiv({ cls: "cw-gg-list" });
    for (const c of commits) {
      const rowEl = list.createDiv({ cls: "cw-gg-row" });
      for (const ref of c.refs) {
        if (ref.kind === "remote") continue; // remotes hidden in v1 (spec assumption)
        rowEl.createSpan({ cls: `cw-gg-ref cw-gg-ref-${ref.kind}`, text: ref.name });
      }
      rowEl.createSpan({ cls: "cw-gg-subject", text: c.subject });
      rowEl.createSpan({ cls: "cw-gg-meta", text: c.hash.slice(0, 7) });
      rowEl.addEventListener("click", () => this.selectCommit(rowEl, c.hash));
    }

    // Detail pane: branches + changed files for the selected commit.
    this.detailEl = root.createDiv({ cls: "cw-gg-detail" });
    this.detailEl.createDiv({ cls: "pane-empty", text: "Select a commit to see its files." });
  }

  private selectCommit(rowEl: HTMLElement, hash: string): void {
    if (this.selectedRow) this.selectedRow.classList.remove("is-selected");
    rowEl.classList.add("is-selected");
    this.selectedRow = rowEl;
    void this.showDetail(hash);
  }

  private async showDetail(hash: string): Promise<void> {
    const detail = this.detailEl;
    const repo = this.repo;
    if (!detail || !repo) return;
    detail.empty();
    detail.createDiv({ cls: "pane-empty", text: "Loading…" });
    const d = await loadCommitDetail(repo, hash);
    if (this.detailEl !== detail) return; // a refresh replaced the pane meanwhile
    detail.empty();

    const branches = detail.createDiv({ cls: "cw-gg-detail-branches" });
    branches.createSpan({ cls: "cw-gg-detail-label", text: "On:" });
    if (d.branches.length === 0) branches.createSpan({ cls: "cw-gg-detail-label", text: "(no branch)" });
    for (const b of d.branches) branches.createSpan({ cls: "cw-gg-ref cw-gg-ref-branch", text: b });

    const files = detail.createDiv({ cls: "cw-gg-detail-files" });
    if (d.files.length === 0) {
      files.createDiv({ cls: "pane-empty", text: "No file changes." });
      return;
    }
    for (const f of d.files) {
      const fr = files.createDiv({ cls: "cw-gg-file" });
      fr.createSpan({ cls: `cw-gg-file-status cw-gg-st-${f.status}`, text: f.status });
      fr.createSpan({ cls: "cw-gg-file-path", text: f.path, attr: { title: f.path } });
    }
  }
}
