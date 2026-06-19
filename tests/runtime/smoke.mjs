// Runtime smoke test against the BUILT main.js: instantiate the plugin with a
// stubbed Obsidian, run onload(), and connect as the CLI would. Verifies the
// shipped artifact for connection (SC-001), auth (SC-007), and cleanup (SC-008).
import Module from "module";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ccide-rt-"));
process.env.CLAUDE_CONFIG_DIR = tmp;
const VAULT = path.join(tmp, "vault");
await fs.mkdir(VAULT, { recursive: true });

class FileSystemAdapter {
  getBasePath() {
    return VAULT;
  }
}
const obsidian = {
  FileSystemAdapter,
  ItemView: class { constructor(leaf) { this.leaf = leaf; } },
  TextFileView: class { constructor(leaf) { this.leaf = leaf; } },
  MarkdownView: class {},
  TFile: class {},
  WorkspaceLeaf: class {},
  Notice: class { constructor() {} },
  Plugin: class {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; }
    registerView() {}
    registerExtensions() {}
    registerEvent() {}
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return obsidian;
  if (request === "electron") return {};
  return origLoad.apply(this, arguments);
};

const app = {
  vault: { adapter: new FileSystemAdapter(), getAbstractFileByPath: () => null },
  workspace: {
    on: () => ({}),
    getActiveViewOfType: () => null,
    getLeavesOfType: () => [],
    activeLeaf: null,
    getLeaf: () => ({ openFile: async () => {}, view: {} }),
  },
};

const fail = (msg) => {
  console.error("SMOKE FAIL:", msg);
  process.exit(1);
};

// main.js is CJS; copy to .cjs so require() loads it under a type:module package.
const cjs = path.join(REPO, "._smoke_main.cjs");
await fs.copyFile(path.join(REPO, "main.js"), cjs);
let plugin;
try {
  const mod = require(cjs);
  const PluginClass = mod.default ?? mod;
  plugin = new PluginClass(app, { version: "0.1.0", id: "claude-code-ide" });
  await plugin.onload();

  const ideDir = path.join(tmp, "ide");
  const locks = (await fs.readdir(ideDir)).filter((f) => f.endsWith(".lock"));
  if (locks.length !== 1) fail(`expected 1 lock file, got ${locks.length}`);
  const lock = JSON.parse(await fs.readFile(path.join(ideDir, locks[0]), "utf8"));
  console.log("lock:", JSON.stringify({ ideName: lock.ideName, transport: lock.transport, workspaceFolders: lock.workspaceFolders, hasToken: typeof lock.authToken === "string" }));
  if (lock.ideName !== "Obsidian") fail("ideName != Obsidian");
  if (lock.transport !== "ws") fail("transport != ws");
  const port = parseInt(locks[0], 10);

  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { "x-claude-code-ide-authorization": lock.authToken } });
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  const call = (id, method, params) => new Promise((resolve) => {
    const h = (d) => { const m = JSON.parse(d.toString()); if (m.id === id) { ws.off("message", h); resolve(m); } };
    ws.on("message", h);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
  const init = await call(1, "initialize", {});
  console.log("initialize.protocolVersion:", init.result.protocolVersion);
  if (init.result.protocolVersion !== "2024-11-05") fail("protocolVersion mismatch");
  const tl = await call(2, "tools/list", {});
  console.log("tools/list count:", tl.result.tools.length);
  const wsf = await call(3, "tools/call", { name: "getWorkspaceFolders", arguments: {} });
  const root = JSON.parse(wsf.result.content[0].text).rootPath;
  console.log("getWorkspaceFolders.rootPath:", root);
  if (root !== VAULT) fail("workspace root mismatch");

  const bad = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { "x-claude-code-ide-authorization": "nope" } });
  const status = await new Promise((resolve) => {
    bad.on("unexpected-response", (_q, r) => resolve(r.statusCode));
    bad.on("open", () => resolve(0));
    bad.on("error", () => resolve(-1));
  });
  console.log("bad-token status:", status);
  if (status !== 401) fail(`expected 401, got ${status}`);

  ws.close();
  await plugin.onunload();
  const after = (await fs.readdir(ideDir).catch(() => [])).filter((f) => f.endsWith(".lock"));
  console.log("locks after unload:", after.length);
  if (after.length !== 0) fail("lock not removed on unload");

  console.log("SMOKE OK");
} finally {
  await fs.rm(cjs, { force: true });
  await fs.rm(tmp, { recursive: true, force: true });
}
process.exit(0);
