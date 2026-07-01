// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import {
  ContentLengthFramer,
  createTransport,
  encodeMessage,
  type CreateTransportOptions,
} from "../../../src/lsp/transport";

function frame(message: string): Buffer {
  return encodeMessage(message);
}

describe("encodeMessage", () => {
  it("uses the UTF-8 byte length, not the character count", () => {
    const out = encodeMessage('{"s":"é🚀"}').toString("utf8");
    // é = 2 bytes, 🚀 = 4 bytes; body is {"s":"é🚀"} = 8 ascii + 6 = 14 bytes.
    expect(out.startsWith("Content-Length: 14\r\n\r\n")).toBe(true);
  });
});

describe("ContentLengthFramer", () => {
  function collect(): { framer: ContentLengthFramer; messages: string[]; errors: Error[] } {
    const messages: string[] = [];
    const errors: Error[] = [];
    const framer = new ContentLengthFramer(
      (m) => messages.push(m),
      (e) => errors.push(e),
    );
    return { framer, messages, errors };
  }

  it("emits a single complete message", () => {
    const { framer, messages } = collect();
    framer.append(frame('{"jsonrpc":"2.0","id":1}'));
    expect(messages).toEqual(['{"jsonrpc":"2.0","id":1}']);
  });

  it("reassembles a message split across chunks", () => {
    const { framer, messages } = collect();
    const buf = frame('{"hello":"world"}');
    framer.append(buf.subarray(0, 10));
    expect(messages).toHaveLength(0);
    framer.append(buf.subarray(10, 20));
    framer.append(buf.subarray(20));
    expect(messages).toEqual(['{"hello":"world"}']);
  });

  it("splits two back-to-back messages in one chunk", () => {
    const { framer, messages } = collect();
    framer.append(Buffer.concat([frame('{"a":1}'), frame('{"b":2}')]));
    expect(messages).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("handles a large payload arriving in many small chunks", () => {
    const { framer, messages } = collect();
    const big = JSON.stringify({ data: "x".repeat(100_000) });
    const buf = frame(big);
    for (let i = 0; i < buf.length; i += 997) framer.append(buf.subarray(i, i + 997));
    expect(messages).toEqual([big]);
  });

  it("preserves multibyte bodies across a chunk boundary mid-character", () => {
    const { framer, messages } = collect();
    const msg = '{"s":"🚀🚀"}';
    const buf = frame(msg);
    // Split inside the first emoji's 4 bytes (header is 22 bytes + body).
    framer.append(buf.subarray(0, 24));
    framer.append(buf.subarray(24));
    expect(messages).toEqual([msg]);
  });

  it("reports and skips a malformed header, then recovers the next frame", () => {
    const { framer, messages, errors } = collect();
    framer.append(Buffer.from("Content-Type: nonsense\r\n\r\n", "ascii"));
    framer.append(frame('{"ok":true}'));
    expect(errors).toHaveLength(1);
    expect(messages).toEqual(['{"ok":true}']);
  });
});

describe("createTransport", () => {
  // A fake child process: EventEmitter with stdin (capture writes) and stdout (push chunks).
  function fakeChild() {
    const stdin = { write: vi.fn() };
    const stdout = new EventEmitter();
    const proc = Object.assign(new EventEmitter(), { stdin, stdout, kill: vi.fn() });
    return proc;
  }

  function transportWith(proc: ReturnType<typeof fakeChild>, extra?: Partial<CreateTransportOptions>) {
    const spawnFn = vi.fn(() => proc as unknown as ReturnType<typeof import("child_process").spawn>);
    const t = createTransport({ command: "ruby-lsp", args: ["x"], spawnFn, ...extra });
    return { t, spawnFn };
  }

  it("spawns the command and frames outgoing messages to stdin", () => {
    const proc = fakeChild();
    const { t, spawnFn } = transportWith(proc);
    expect(spawnFn).toHaveBeenCalledWith("ruby-lsp", ["x"], expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }));
    t.send('{"id":1}');
    expect(proc.stdin.write).toHaveBeenCalledWith(encodeMessage('{"id":1}'));
  });

  it("delivers framed stdout to subscribers and stops after unsubscribe", () => {
    const proc = fakeChild();
    const { t } = transportWith(proc);
    const received: string[] = [];
    const handler = (m: string) => received.push(m);
    t.subscribe(handler);
    proc.stdout.emit("data", frame('{"n":1}'));
    t.unsubscribe(handler);
    proc.stdout.emit("data", frame('{"n":2}'));
    expect(received).toEqual(['{"n":1}']);
  });

  it("forwards process errors and exit to the callbacks", () => {
    const proc = fakeChild();
    const onError = vi.fn();
    const onExit = vi.fn();
    transportWith(proc, { onError, onExit });
    proc.emit("error", new Error("boom"));
    proc.emit("exit", 1, null);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(onExit).toHaveBeenCalledWith(1, null);
  });
});
