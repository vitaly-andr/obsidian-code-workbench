// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type { GraphCommit, GraphLink, GraphModel, GraphRow } from "./layout.types";

// Clean-room "curved" lane assignment, following the algorithm described by pvigier
// ("Commit Graph Drawing Algorithms"). Input commits MUST be newest-first in topological
// order (parents below children). Pure: same input -> same output, no I/O.
export function layoutGraph(commits: ReadonlyArray<GraphCommit>): GraphModel {
  // lanes[col] = the hash this column is waiting for (its open downward edge), or null when free.
  const lanes: (string | null)[] = [];
  const laneOf: number[] = new Array(commits.length);
  const stateAfter: (string | null)[][] = new Array(commits.length);
  // Columns this commit routes its parents into, with whether each is a merge edge.
  const outgoing: { col: number; merge: boolean }[][] = new Array(commits.length);

  const firstFree = (): number => {
    const i = lanes.indexOf(null);
    if (i !== -1) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  let laneCount = 0;
  for (let r = 0; r < commits.length; r++) {
    const c = commits[r];
    // 1. The commit's column: a lane already expecting it, else a fresh lane (a tip).
    let lane = lanes.indexOf(c.hash);
    if (lane === -1) lane = firstFree();
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
        let pl = lanes.indexOf(p);
        if (pl === -1) pl = firstFree();
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
