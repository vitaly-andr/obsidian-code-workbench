// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import {
  CLAUDE_PROFILE,
  defaultLaunchProfile,
  newLaunchProfileId,
  normalizeLaunchProfiles,
} from "../../src/util/launch-profiles";

describe("normalizeLaunchProfiles (016 contract: total, seeded, invariant-preserving)", () => {
  it("seeds the built-in Claude profile when the list is missing", () => {
    const state = normalizeLaunchProfiles(undefined, undefined);
    expect(state.profiles).toEqual([{ id: "claude", name: "Claude", command: "claude" }]);
    expect(state.defaultId).toBe("claude");
  });

  it("seeds on empty or non-array junk without throwing", () => {
    for (const junk of [[], "nonsense", 42, null, { a: 1 }]) {
      const state = normalizeLaunchProfiles(junk, 7);
      expect(state.profiles).toEqual([CLAUDE_PROFILE]);
      expect(state.defaultId).toBe("claude");
    }
  });

  it("keeps valid rows in order and preserves a valid default", () => {
    const rows = [
      { id: "claude", name: "Claude", command: "claude" },
      { id: "profile-2", name: "Claude × Kimi K3", command: "claude-kimi" },
    ];
    const state = normalizeLaunchProfiles(rows, "profile-2");
    expect(state.profiles).toEqual(rows);
    expect(state.defaultId).toBe("profile-2");
  });

  it("drops malformed rows and duplicate ids, seeding if nothing survives", () => {
    const state = normalizeLaunchProfiles(
      [null, { id: "" }, { id: "x", name: "no command" }, { id: "ok", name: "A", command: "a" }, { id: "ok", name: "Dup", command: "b" }],
      "ok",
    );
    expect(state.profiles).toEqual([{ id: "ok", name: "A", command: "a" }]);
    expect(state.defaultId).toBe("ok");

    const seeded = normalizeLaunchProfiles([{ broken: true }], "ok");
    expect(seeded.profiles).toEqual([CLAUDE_PROFILE]);
  });

  it("repoints a dangling default at the first profile", () => {
    const state = normalizeLaunchProfiles([{ id: "a", name: "A", command: "a" }], "deleted");
    expect(state.defaultId).toBe("a");
  });

  it("defaultLaunchProfile resolves the default row", () => {
    const state = normalizeLaunchProfiles(
      [
        { id: "a", name: "A", command: "a" },
        { id: "b", name: "B", command: "b" },
      ],
      "b",
    );
    expect(defaultLaunchProfile(state).name).toBe("B");
  });

  it("newLaunchProfileId returns an id not colliding with existing ones", () => {
    const existing = [
      { id: "claude", name: "Claude", command: "claude" },
      { id: "profile-2", name: "X", command: "x" },
    ];
    const id = newLaunchProfileId(existing);
    expect(existing.some((p) => p.id === id)).toBe(false);
    expect(id).toMatch(/^profile-\d+$/);
  });
});
