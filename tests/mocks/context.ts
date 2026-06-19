import { FileSystemAdapter } from "obsidian";
import type { App } from "obsidian";
import type { IdeContext } from "../../src/context";
import type { DiffManager } from "../../src/diff-manager";

// Builds a mock IdeContext with a vault rooted at /vault. `diffs` can be
// overridden per test to drive openDiff outcomes.
export function makeContext(diffs?: Partial<DiffManager>): IdeContext {
  const adapter = new FileSystemAdapter();
  const app = {
    vault: { adapter, getAbstractFileByPath: () => null },
    workspace: {
      getActiveViewOfType: () => null,
      getLeavesOfType: () => [],
      activeLeaf: null,
      getLeaf: () => ({ openFile: async () => undefined, view: {} }),
      on: () => undefined,
    },
  } as unknown as App;

  const defaultDiffs = {
    openDiff: async () => ({ kept: false, content: "" }),
    closeAll: () => 0,
  };

  return {
    app,
    pluginVersion: "0.1.0",
    lastSelection: null,
    diffs: (diffs ?? defaultDiffs) as DiffManager,
    notify: () => {},
  };
}
