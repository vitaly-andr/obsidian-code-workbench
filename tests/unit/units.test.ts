// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { languageIdForPath } from "../../src/util/languages";
import { LockFile } from "../../src/server/lockfile";

describe("languages (T032)", () => {
  it("maps known extensions and falls back to plaintext", () => {
    expect(languageIdForPath("a/b.py")).toBe("python");
    expect(languageIdForPath("x.rs")).toBe("rust");
    expect(languageIdForPath("note.md")).toBe("markdown");
    expect(languageIdForPath("data.json")).toBe("json");
    expect(languageIdForPath("mystery.zzz")).toBe("plaintext");
  });
});

describe("lockfile (T032)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ccide-"));
    process.env.CLAUDE_CONFIG_DIR = dir;
  });

  afterAll(async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes atomically with 0600 perms and removes cleanly", async () => {
    const lock = new LockFile(12345);
    await lock.write({
      pid: 1,
      workspaceFolders: ["/vault"],
      ideName: "Obsidian",
      transport: "ws",
      authToken: "secret",
    });

    const file = path.join(dir, "ide", "12345.lock");
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    expect(parsed.ideName).toBe("Obsidian");
    expect(parsed.transport).toBe("ws");

    if (process.platform !== "win32") {
      const stat = await fs.stat(file);
      expect(stat.mode & 0o777).toBe(0o600);
    }

    await lock.remove();
    await expect(fs.stat(file)).rejects.toBeTruthy();
  });
});
