// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { timingSafeEqual } from "crypto";
import * as http from "http";
import { error, info } from "../util/log";
import { CompanionDispatcher } from "./dispatcher";

// Cap the request body and how long a request may take. Approval flows can block on the user, so
// the request timeout is generous; the body cap is a hard anti-abuse limit.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

// Constant-time string compare that never short-circuits on length (timingSafeEqual throws on a
// length mismatch, so equalize first). Used for the bearer token — constitution V.
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Burn a comparison of equal-length buffers so timing doesn't leak the length.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// Extract the hostname from a Host or Origin header value and test it against the loopback allowlist.
function isLoopback(value: string | undefined): boolean {
  if (value === undefined) return true; // a non-browser client may send no Origin
  let host = value;
  // Origin is a URL ("http://127.0.0.1:port"); Host is "host:port".
  const schemeIdx = host.indexOf("://");
  if (schemeIdx >= 0) host = host.slice(schemeIdx + 3);
  // Strip a trailing path and the port; handle bracketed IPv6.
  host = host.split("/")[0];
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    host = close >= 0 ? host.slice(1, close) : host.slice(1);
  } else {
    host = host.split(":")[0];
  }
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

// Loopback-only Streamable HTTP server for the companion MCP. POST /mcp only; bearer auth with a
// constant-time compare; Origin/Host loopback allowlist (anti DNS-rebinding). Mirrors the loopback
// + lifecycle shape of src/server/websocket-server.ts. Never logs the token (constitution V).
export class CompanionServer {
  private httpServer: http.Server | null = null;
  private port = 0;

  constructor(
    private readonly dispatcher: CompanionDispatcher,
    private readonly authToken: string,
  ) {}

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.onRequest(req, res));
      server.once("error", (err) => {
        error("companion server failed to start", err);
        reject(err);
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        this.httpServer = server;
        info(`companion listening on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  private send(res: http.ServerResponse, status: number, body: string, contentType = "text/plain"): void {
    res.writeHead(status, { "Content-Type": contentType });
    res.end(body);
  }

  private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 1. Method + path: POST /mcp only.
    const path = (req.url ?? "").split("?")[0];
    if (req.method !== "POST" || path !== "/mcp") {
      this.send(res, 405, "Method Not Allowed");
      return;
    }
    // 2. Origin/Host loopback allowlist -> 403 (no `*` CORS). Origin may be absent (non-browser
    // clients send none); Host must be present and loopback so it can't be omitted to skip the check.
    const host = req.headers.host;
    if (host === undefined || !isLoopback(host) || !isLoopback(req.headers.origin)) {
      this.send(res, 403, "origin not allowed");
      return;
    }
    // 3. Bearer auth -> 401 even on loopback. Constant-time compare; token never logged.
    const auth = req.headers.authorization;
    const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!constantTimeEqual(token, this.authToken)) {
      this.send(res, 401, "invalid or missing authorization token");
      return;
    }

    // 4. Read the body under a size cap + timeout, then dispatch.
    const controller = new AbortController();
    const chunks: Buffer[] = [];
    let total = 0;
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      controller.abort();
      this.send(res, 408, "Request Timeout");
      req.destroy();
    }, REQUEST_TIMEOUT_MS);

    const done = () => {
      finished = true;
      window.clearTimeout(timer);
    };

    req.on("aborted", () => controller.abort());
    res.on("close", () => controller.abort());

    req.on("data", (chunk: Buffer) => {
      if (finished) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        done();
        this.send(res, 413, "Payload Too Large");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (finished) return;
      const headers = {
        sessionId: this.headerValue(req.headers["mcp-session-id"]),
        protocolVersion: this.headerValue(req.headers["mcp-protocol-version"]),
      };
      const raw = Buffer.concat(chunks).toString("utf8");
      this.dispatcher
        .handle(raw, headers, controller.signal)
        .then((result) => {
          done();
          if (res.writableEnded) return;
          const responseHeaders: Record<string, string> = {};
          if (result.sessionId) responseHeaders["Mcp-Session-Id"] = result.sessionId;
          if (result.body === null) {
            res.writeHead(result.status, responseHeaders);
            res.end();
            return;
          }
          responseHeaders["Content-Type"] = "application/json";
          res.writeHead(result.status, responseHeaders);
          res.end(result.body);
        })
        .catch((e) => {
          done();
          error("companion dispatch failure", e);
          if (!res.writableEnded) this.send(res, 500, "Internal Server Error");
        });
    });
  }

  private headerValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.httpServer ? this.httpServer.close(() => resolve()) : resolve(),
    );
    this.httpServer = null;
    this.port = 0;
  }
}
