// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { getByPath, setByPath } from "../../src/settings/binding";

// Setting definitions address values by key; the tab resolves those keys against the persisted
// settings object (017). The nested LSP keys are why the resolution is dotted at all, so the
// persisted shape stays exactly as it was before the settings tab became declarative.

describe("getByPath", () => {
  it("reads a plain key", () => {
    expect(getByPath({ gitBlame: true }, "gitBlame")).toBe(true);
  });

  it("reads a nested key", () => {
    expect(getByPath({ lsp: { folding: false } }, "lsp.folding")).toBe(false);
  });

  it("returns undefined for a missing key, at any depth", () => {
    expect(getByPath({ lsp: {} }, "lsp.folding")).toBeUndefined();
    expect(getByPath({}, "lsp.folding")).toBeUndefined();
    expect(getByPath({ lsp: null }, "lsp.folding")).toBeUndefined();
  });

  it("distinguishes a stored false from a missing key", () => {
    // The toggles that default to on rely on this: undefined falls back to the definition's
    // defaultValue, a stored false stays off.
    expect(getByPath({ lsp: { inlayHints: false } }, "lsp.inlayHints")).toBe(false);
    expect(getByPath({ lsp: {} }, "lsp.inlayHints")).toBeUndefined();
  });
});

describe("setByPath", () => {
  it("writes a plain key in place", () => {
    const settings = { gitBlame: false };
    setByPath(settings, "gitBlame", true);
    expect(settings).toEqual({ gitBlame: true });
  });

  it("writes a nested key without disturbing its siblings", () => {
    const settings = { lsp: { enabled: true, perLanguage: { ruby: false } } };
    setByPath(settings, "lsp.enabled", false);
    expect(settings).toEqual({ lsp: { enabled: false, perLanguage: { ruby: false } } });
  });

  it("leaves the object alone when the parent branch does not exist", () => {
    const settings: Record<string, unknown> = { gitBlame: true };
    setByPath(settings, "lsp.enabled", true);
    expect(settings).toEqual({ gitBlame: true });
  });

  it("ignores an empty path", () => {
    const settings = { gitBlame: true };
    setByPath(settings, "", false);
    expect(settings).toEqual({ gitBlame: true });
  });

  it("adds an unknown leaf on an existing branch", () => {
    // A key that no definition uses is still a write to a real object: the guard is about missing
    // parents, not about unknown leaves.
    const settings: Record<string, unknown> = { lsp: {} };
    setByPath(settings, "lsp.somethingNew", 1);
    expect(settings).toEqual({ lsp: { somethingNew: 1 } });
  });
});
