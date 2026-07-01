// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Spawn a language server and bridge its stdio to the @codemirror/lsp-client string Transport
// (research R2). The client's Transport speaks JSON strings; the only missing piece is LSP's
// `Content-Length: N\r\n\r\n<json>` framing over stdout/stdin, implemented here. Keeping it in-repo
// avoids pulling in vscode-jsonrpc (heavier, message-object API) — see research R2.

import { spawn, type ChildProcess, type SpawnOptions } from "child_process";

// The minimal Transport shape @codemirror/lsp-client expects. Declared locally so the type does not
// pull the client into the bundle eagerly.
export interface Transport {
  send(message: string): void;
  subscribe(handler: (value: string) => void): void;
  unsubscribe(handler: (value: string) => void): void;
}

// Encode one JSON string as an LSP frame. Content-Length is the body's UTF-8 byte count, not its
// character count, so multibyte payloads frame correctly.
export function encodeMessage(message: string): Buffer {
  const body = Buffer.from(message, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

// Incremental reader: feed it raw stdout chunks, it emits each complete message body. Handles
// messages split across chunks, several messages in one chunk, and large payloads. A header block
// with no Content-Length is reported and skipped rather than wedging the stream.
export class ContentLengthFramer {
  private buf: Buffer = Buffer.alloc(0);

  constructor(
    private readonly onMessage: (message: string) => void,
    private readonly onError?: (error: Error) => void,
  ) {}

  append(chunk: Buffer): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    this.drain();
  }

  private drain(): void {
    for (;;) {
      const sep = this.buf.indexOf("\r\n\r\n");
      if (sep === -1) return; // header not complete yet
      const header = this.buf.subarray(0, sep).toString("ascii");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Malformed: a complete header block carrying no Content-Length. Drop it and continue so a
        // single bad frame does not stall every message behind it.
        this.onError?.(new Error(`malformed LSP header: ${JSON.stringify(header)}`));
        this.buf = this.buf.subarray(sep + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = sep + 4;
      if (this.buf.length < start + length) return; // body not fully arrived
      const body = this.buf.subarray(start, start + length).toString("utf8");
      this.buf = this.buf.subarray(start + length);
      this.onMessage(body);
    }
  }
}

export interface SpawnedTransport extends Transport {
  process: ChildProcess;
  dispose(): void;
}

export interface CreateTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  // Reported when the process errors or a frame is malformed.
  onError?: (error: Error) => void;
  // Reported when the server process exits (used to drive restart/lifecycle in client.ts).
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  // Injectable spawn for tests; defaults to child_process.spawn.
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

// Spawn the server and return the string Transport over its framed stdio.
export function createTransport(opts: CreateTransportOptions): SpawnedTransport {
  const handlers = new Set<(value: string) => void>();
  const framer = new ContentLengthFramer(
    (message) => {
      for (const handler of handlers) handler(message);
    },
    opts.onError,
  );

  const spawnFn = opts.spawnFn ?? spawn;
  const child = spawnFn(opts.command, opts.args ?? [], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: opts.cwd,
    env: opts.env,
  });

  child.stdout?.on("data", (chunk: Buffer) => framer.append(chunk));
  child.on("error", (error) => opts.onError?.(error));
  child.on("exit", (code, signal) => opts.onExit?.(code, signal));

  return {
    process: child,
    send(message: string): void {
      child.stdin?.write(encodeMessage(message));
    },
    subscribe(handler: (value: string) => void): void {
      handlers.add(handler);
    },
    unsubscribe(handler: (value: string) => void): void {
      handlers.delete(handler);
    },
    dispose(): void {
      try {
        child.kill();
      } catch {
        // already gone
      }
      handlers.clear();
    },
  };
}
