// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Minimal input the layout needs (a slice of CommitRecord).
export interface GraphCommit {
  hash: string;
  parents: string[]; // ordered; parents[0] is the first parent
}

// One segment drawn between a row and the next row.
export interface GraphLink {
  fromLane: number; // column at the top of the gap (the row's side)
  toLane: number; // column at the bottom of the gap (the next row's side)
  merge: boolean; // true for a merge edge (an extra parent of a merge commit)
}

export interface GraphRow {
  hash: string;
  lane: number; // the commit's column
  links: GraphLink[]; // segments from this row down to the next row
}

export interface GraphModel {
  rows: GraphRow[];
  laneCount: number; // peak number of columns (graph width)
}
