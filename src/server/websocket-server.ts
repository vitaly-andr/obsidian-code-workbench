// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import * as http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { IdeContext } from "../context";
import { Dispatcher } from "../protocol/jsonrpc";
import { error, info, warn } from "../util/log";

const AUTH_HEADER = "x-claude-code-ide-authorization";

// §5/§11: loopback WebSocket server. Authenticates at the HTTP upgrade; one
// JSON-RPC object per text frame. The `ws` library answers ping with pong
// automatically (keepalive).
export class IdeServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private port = 0;
  private heartbeat: number | null = null;
  // Notified with the live client count on connect/disconnect (for the status bar).
  onClientChange: ((count: number) => void) | null = null;

  constructor(private readonly ctx: IdeContext, private readonly authToken: string) {}

  getPort(): number {
    return this.port;
  }

  // Push a JSON-RPC notification to every connected client (IDE -> CLI).
  broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);
    for (const client of this.wss?.clients ?? []) {
      if (client.readyState === 1 /* OPEN */) {
        try {
          client.send(data);
        } catch {
          // client went away mid-send
        }
      }
    }
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const httpServer = http.createServer((_req, res) => {
        res.writeHead(426);
        res.end("Upgrade Required");
      });
      const wss = new WebSocketServer({ noServer: true });

      httpServer.on("upgrade", (req, socket, head) => {
        // L3: the Claude CLI connects as a raw ws client and sends no Origin header;
        // a browser always sends one. Reject any upgrade carrying an Origin —
        // defense-in-depth against a web page reaching the loopback server.
        if (req.headers.origin !== undefined) {
          socket.write("HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\norigin not allowed");
          socket.destroy();
          return;
        }
        const provided = req.headers[AUTH_HEADER];
        const token = Array.isArray(provided) ? provided[0] : provided;
        if (token !== this.authToken) {
          socket.write(
            "HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\ninvalid or missing authorization token",
          );
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      });

      wss.on("connection", (ws: WebSocket) => this.onConnection(ws));

      httpServer.once("error", (err) => {
        error("server failed to start", err);
        reject(err);
      });
      httpServer.listen(0, "127.0.0.1", () => {
        const addr = httpServer.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        this.httpServer = httpServer;
        this.wss = wss;
        // Reap silently-dead clients: ping every 30s, terminate any that missed the prior pong.
        this.heartbeat = window.setInterval(() => this.pingClients(), 30000);
        info(`listening on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  private pingClients(): void {
    for (const client of this.wss?.clients ?? []) {
      const tracked = client as WebSocket & { isAlive?: boolean };
      if (tracked.isAlive === false) {
        client.terminate();
        continue;
      }
      tracked.isAlive = false;
      client.ping();
    }
  }

  private onConnection(ws: WebSocket): void {
    const tracked = ws as WebSocket & { isAlive?: boolean };
    tracked.isAlive = true;
    ws.on("pong", () => {
      tracked.isAlive = true;
    });
    // One dispatcher per connection isolates in-flight request ids.
    const dispatcher = new Dispatcher(this.ctx);
    ws.on("message", (data) => {
      const raw =
        typeof data === "string" ? data
        : Buffer.isBuffer(data) ? data.toString("utf8")
        : Array.isArray(data) ? Buffer.concat(data).toString("utf8")
        : Buffer.from(data).toString("utf8");
      dispatcher
        .handle(raw)
        .then((response) => {
          if (response !== null) ws.send(response);
        })
        .catch((e) => error("dispatch failure", e));
    });
    ws.on("close", () => {
      dispatcher.cancelAll();
      this.onClientChange?.(this.wss?.clients.size ?? 0);
    });
    ws.on("error", (e) => warn("socket error", e));
    this.onClientChange?.(this.wss?.clients.size ?? 0);
  }

  async stop(): Promise<void> {
    if (this.heartbeat) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const client of this.wss?.clients ?? []) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
    await new Promise<void>((resolve) => (this.httpServer ? this.httpServer.close(() => resolve()) : resolve()));
    this.wss = null;
    this.httpServer = null;
  }
}
