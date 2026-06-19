// Connects to a live plugin instance (discovered via its lock file) and exercises
// the read-only tools — used to verify the plugin running inside real Obsidian.
import { WebSocket } from "ws";
import { promises as fs } from "fs";
import path from "path";

const ideDir = process.argv[2] ?? "/tmp/ccide-obs-test/claude/ide";
const locks = (await fs.readdir(ideDir)).filter((f) => f.endsWith(".lock"));
if (locks.length === 0) {
  console.error("no lock file in", ideDir);
  process.exit(1);
}
const lock = JSON.parse(await fs.readFile(path.join(ideDir, locks[0]), "utf8"));
const port = parseInt(locks[0], 10);

const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
  headers: { "x-claude-code-ide-authorization": lock.authToken },
});
await new Promise((res, rej) => {
  ws.on("open", res);
  ws.on("error", rej);
});

const call = (id, method, params) =>
  new Promise((resolve) => {
    const h = (d) => {
      const m = JSON.parse(d.toString());
      if (m.id === id) {
        ws.off("message", h);
        resolve(m);
      }
    };
    ws.on("message", h);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });

const init = await call(1, "initialize", {});
console.log("initialize.protocolVersion:", init.result.protocolVersion, "serverInfo:", JSON.stringify(init.result.serverInfo));
const tl = await call(2, "tools/list", {});
console.log("tools/list count:", tl.result.tools.length);
console.log("tool names:", tl.result.tools.map((t) => t.name).join(", "));
const wsf = await call(3, "tools/call", { name: "getWorkspaceFolders", arguments: {} });
console.log("getWorkspaceFolders.rootPath:", JSON.parse(wsf.result.content[0].text).rootPath);
const oe = await call(4, "tools/call", { name: "getOpenEditors", arguments: {} });
console.log("getOpenEditors.tabs:", JSON.parse(oe.result.content[0].text).tabs.length);
const diag = await call(5, "tools/call", { name: "getDiagnostics", arguments: {} });
console.log("getDiagnostics.content length:", diag.result.content.length);

ws.close();
console.log("LIVE OBSIDIAN VERIFY OK");
process.exit(0);
