// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type { GraphCommit, GraphLink, GraphModel, GraphRow } from "./layout.types";

// Clean-room "curved" lane assignment, following the algorithm described by pvigier
// ("Commit Graph Drawing Algorithms"). Input commits MUST be newest-first in topological
// order (parents below children). Pure: same input -> same output, no I/O.
//
// `trunkTip` (optional) pins a mainline to the left: the first-parent chain from that commit
// (e.g. the tip of `main`) is kept in lane 0, and every other branch is pushed to lane >= 1, so
// the trunk reads as a straight line on the left instead of drifting by topological order. When
// `trunkTip` is absent or not in this window, lane assignment is unconstrained (whatever tip comes
// first takes lane 0).
export function layoutGraph(commits: ReadonlyArray<GraphCommit>, trunkTip?: string): GraphModel {
  // The trunk's first-parent chain, kept in lane 0.
  const trunk = new Set<string>();
  if (trunkTip) {
    const byHash = new Map(commits.map((c) => [c.hash, c]));
    let h: string | undefined = trunkTip;
    while (h && byHash.has(h) && !trunk.has(h)) {
      trunk.add(h);
      h = byHash.get(h)?.parents[0];
    }
  }
  // When there is a trunk, lane 0 belongs to it alone; other branches start at column 1.
  const reserve0 = trunk.size > 0;

  // lanes[col] = the hash this column is waiting for (its open downward edge), or null when free.
  const lanes: (string | null)[] = reserve0 ? [null] : [];
  const laneOf: number[] = new Array(commits.length);
  const stateAfter: (string | null)[][] = new Array(commits.length);
  // Columns this commit routes its parents into, with whether each is a merge edge.
  const outgoing: { col: number; merge: boolean }[][] = new Array(commits.length);

  const firstFree = (): number => {
    for (let i = reserve0 ? 1 : 0; i < lanes.length; i++) {
      if (lanes[i] === null) return i;
    }
    lanes.push(null);
    return lanes.length - 1;
  };
  // The column for a hash: the trunk's reserved lane 0, else a lane already expecting it, else a
  // fresh one. Trunk commits always land in lane 0, even if a side branch was already pointing at
  // them (that side lane then converges into 0).
  const columnFor = (hash: string): number => {
    if (reserve0 && trunk.has(hash)) return 0;
    const existing = lanes.indexOf(hash);
    return existing !== -1 ? existing : firstFree();
  };

  let laneCount = 0;
  for (let r = 0; r < commits.length; r++) {
    const c = commits[r];
    // 1. The commit's column.
    const lane = columnFor(c.hash);
    laneOf[r] = lane;
    // 2. Free any OTHER lanes that were also expecting this commit (children converging into it).
    for (let i = 0; i < lanes.length; i++) {
      if (i !== lane && lanes[i] === c.hash) lanes[i] = null;
    }
    // 3. Route the parents downward.
    const outs: { col: number; merge: boolean }[] = [];
    if (c.parents.length === 0) {
      lanes[lane] = null; // root: the lane ends here
    } else {
      lanes[lane] = c.parents[0]; // first parent continues the commit's lane
      outs.push({ col: lane, merge: false });
      for (let i = 1; i < c.parents.length; i++) {
        const p = c.parents[i];
        const pl = columnFor(p);
        lanes[pl] = p;
        outs.push({ col: pl, merge: true });
      }
    }
    outgoing[r] = outs;
    stateAfter[r] = lanes.slice();
    laneCount = Math.max(laneCount, lanes.length);
  }

  // Second pass: derive the per-gap links now that every commit's lane is known.
  const rows: GraphRow[] = [];
  for (let r = 0; r < commits.length; r++) {
    const next = r + 1 < commits.length ? commits[r + 1] : null;
    const nextLane = next ? laneOf[r + 1] : -1;
    const state = stateAfter[r];
    const outCols = new Set(outgoing[r].map((o) => o.col));
    const mergeCols = new Set(outgoing[r].filter((o) => o.merge).map((o) => o.col));
    const links: GraphLink[] = [];
    for (let col = 0; col < state.length; col++) {
      const h = state[col];
      if (h === null) continue;
      // Top of the gap: a parent edge starts at the commit's lane; a pass-through keeps its column.
      const fromLane = outCols.has(col) ? laneOf[r] : col;
      // Bottom of the gap: a lane heading to the next commit bends into the next commit's lane.
      const toLane = next && h === next.hash ? nextLane : col;
      links.push({ fromLane, toLane, merge: mergeCols.has(col) });
    }
    rows.push({ hash: commits[r].hash, lane: laneOf[r], links });
  }

  return { rows, laneCount };
}
