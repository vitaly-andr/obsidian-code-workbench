// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { IdeContext } from "../context";
import { callTool, TOOL_DESCRIPTORS } from "../tools/registry";
import { CancelledError, ERROR_CODES, RpcError } from "./errors";
import { initializeResult } from "./mcp";

export type JsonRpcId = string | number | null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function successResponse(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

export function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): string {
  const error: Record<string, unknown> = { code, message };
  if (data !== undefined) error.data = data;
  return JSON.stringify({ jsonrpc: "2.0", id, error });
}

// One dispatcher per connection. Routes parsed messages, tracks in-flight requests
// so notifications/cancelled can abort a pending blocking call (§8.5).
export class Dispatcher {
  private readonly inFlight = new Map<string | number, AbortController>();

  constructor(private readonly ctx: IdeContext) {}

  // Returns the response JSON to send, or null for notifications / cancelled requests.
  async handle(raw: string): Promise<string | null> {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return errorResponse(null, ERROR_CODES.PARSE_ERROR, "Parse error");
    }
    if (!isObject(msg)) {
      return errorResponse(null, ERROR_CODES.INVALID_REQUEST, "Invalid Request");
    }

    const rawId: JsonRpcId = "id" in msg ? (msg.id as JsonRpcId) : null;
    if (msg.jsonrpc !== "2.0") {
      return errorResponse(rawId, ERROR_CODES.INVALID_REQUEST, "Invalid Request");
    }

    const method = typeof msg.method === "string" ? msg.method : "";
    const params = msg.params;
    const isNotification = !("id" in msg) || msg.id === null || msg.id === undefined;

    if (isNotification) {
      if (method === "notifications/cancelled") {
        const requestId = isObject(params) ? params.requestId : undefined;
        if (typeof requestId === "string" || typeof requestId === "number") {
          this.cancel(requestId);
        }
      }
      // Other notifications (e.g. notifications/initialized) need no action.
      return null;
    }

    const id = msg.id as string | number;
    const controller = new AbortController();
    this.inFlight.set(id, controller);
    try {
      const result = await this.route(method, params, controller.signal);
      return successResponse(id, result);
    } catch (e) {
      if (e instanceof CancelledError) return null; // §8.5: no verdict on cancel
      if (e instanceof RpcError) return errorResponse(id, e.code, e.message, e.data);
      return errorResponse(id, ERROR_CODES.INTERNAL_ERROR, e instanceof Error ? e.message : String(e));
    } finally {
      this.inFlight.delete(id);
    }
  }

  cancelAll(): void {
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
  }

  private cancel(id: string | number): void {
    this.inFlight.get(id)?.abort();
  }

  private async route(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    switch (method) {
      case "initialize":
        return initializeResult(this.ctx.pluginVersion);
      case "prompts/list":
        return { prompts: [] };
      case "resources/list":
        return { resources: [] };
      case "tools/list":
        return { tools: TOOL_DESCRIPTORS };
      case "tools/call":
        return callTool(params, this.ctx, signal);
      default:
        throw new RpcError(ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }
}
