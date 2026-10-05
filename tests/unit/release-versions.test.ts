// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// A release bumps the version in several files by hand. The store's source review installs
// dependencies from the release and rejects a package-lock.json whose version lags behind
// package.json, so every copy of the version has to move together.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf8")) as Record<
    string,
    unknown
  >;

describe("release version", () => {
  const version = readJson("package.json").version;

  it("is the same in package.json, the lockfile and the manifest", () => {
    const lock = readJson("package-lock.json") as { version: string; packages: Record<string, { version: string }> };
    expect(lock.version).toBe(version);
    expect(lock.packages[""].version).toBe(version);
    expect(readJson("manifest.json").version).toBe(version);
  });

  it("has a versions.json entry with the manifest's minAppVersion", () => {
    expect(readJson("versions.json")[version as string]).toBe(readJson("manifest.json").minAppVersion);
  });
});
