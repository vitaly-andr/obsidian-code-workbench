// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { layoutGraph } from "../../src/git-graph/layout";
import type { GraphModel } from "../../src/git-graph/layout.types";

const lanesOf = (m: GraphModel): number[] => m.rows.map((r) => r.lane);

describe("layoutGraph (curved)", () => {
  it("linear history → a single lane", () => {
    const m = layoutGraph([
      { hash: "C", parents: ["B"] },
      { hash: "B", parents: ["A"] },
      { hash: "A", parents: [] },
    ]);
    expect(lanesOf(m)).toEqual([0, 0, 0]);
    expect(m.laneCount).toBe(1);
    expect(m.rows[0].links).toEqual([{ fromLane: 0, toLane: 0, merge: false }]);
    expect(m.rows[2].links).toEqual([]); // root: no outgoing edge
  });

  it("a branch that diverges and merges → two lanes, a merge edge, a convergence", () => {
    const m = layoutGraph([
      { hash: "F", parents: ["C", "E"] }, // merge of C and E
      { hash: "C", parents: ["B"] },
      { hash: "E", parents: ["D"] },
      { hash: "D", parents: ["B"] },
      { hash: "B", parents: ["A"] }, // fork point (C and D both branch from B)
      { hash: "A", parents: [] },
    ]);
    expect(lanesOf(m)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(m.laneCount).toBe(2);
    // F fans a merge edge from its lane (0) out to lane 1 (its second parent, E).
    expect(m.rows[0].links).toContainEqual({ fromLane: 0, toLane: 1, merge: true });
    // The two lanes converge into B: row D (index 3) bends lane 1 into lane 0.
    expect(m.rows[3].links).toContainEqual({ fromLane: 1, toLane: 0, merge: false });
  });

  it("octopus merge (3 parents) → does not crash, two merge edges, ≥3 lanes", () => {
    const m = layoutGraph([
      { hash: "M", parents: ["A", "B", "C"] },
      { hash: "A", parents: ["Z"] },
      { hash: "B", parents: ["Z"] },
      { hash: "C", parents: ["Z"] },
      { hash: "Z", parents: [] },
    ]);
    expect(m.rows[0].lane).toBe(0);
    expect(m.rows[0].links.filter((l) => l.merge).length).toBe(2);
    expect(m.laneCount).toBeGreaterThanOrEqual(3);
  });
});
