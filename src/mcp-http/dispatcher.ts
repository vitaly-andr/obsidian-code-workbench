// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { CancelledError, ERROR_CODES, RpcError } from "../protocol/errors";
import { errorResponse, isObject, JsonRpcId, successResponse } from "../protocol/jsonrpc";
import { INSTRUCTIONS, ToolRegistry } from "../vault-tools/registry";
import { VaultToolContext } from "../vault-tools/types";
import { negotiateProtocolVersion, SessionManager } from "./session";

export interface RequestHeaders {
  sessionId?: string;
  protocolVersion?: string;
}

// What the HTTP server needs to send a response: HTTP status, optional body, optional new session id.
export interface DispatchResult {
  status: number;
  body: string | null;
  sessionId?: string;
}

// Routes a single JSON-RPC message for the companion server. Reuses the /ide JSON-RPC helpers and
// error codes; adds the Streamable HTTP lifecycle (initialize -> session id, post-init session check).
export class CompanionDispatcher {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly sessions: SessionManager,
    private readonly ctx: VaultToolContext,
    private readonly serverInfo: { name: string; version: string },
  ) {}

  async handle(raw: string, headers: RequestHeaders, signal: AbortSignal): Promise<DispatchResult> {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return { status: 200, body: errorResponse(null, ERROR_CODES.PARSE_ERROR, "Parse error") };
    }
    if (!isObject(msg) || msg.jsonrpc !== "2.0") {
      const id: JsonRpcId = isObject(msg) && "id" in msg ? (msg.id as JsonRpcId) : null;
      return { status: 200, body: errorResponse(id, ERROR_CODES.INVALID_REQUEST, "Invalid Request") };
    }

    const method = typeof msg.method === "string" ? msg.method : "";
    const params = msg.params;
    const isNotification = !("id" in msg) || msg.id === null || msg.id === undefined;

    // Notifications (e.g. notifications/initialized) need no body — HTTP 202.
    if (isNotification) {
      return { status: 202, body: null };
    }

    const id = msg.id as string | number;

    // initialize is the only request allowed before a session exists; it mints one.
    if (method === "initialize") {
      const proposed = isObject(params) ? params.protocolVersion : undefined;
      const protocolVersion = negotiateProtocolVersion(proposed);
      const sessionId = this.sessions.create(protocolVersion);
      const result = {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: this.serverInfo,
        instructions: INSTRUCTIONS,
      };
      return { status: 200, body: successResponse(id, result), sessionId };
    }

    // Every other request requires a valid session (assigned at initialize).
    if (!this.sessions.has(headers.sessionId)) {
      return { status: 404, body: errorResponse(id, ERROR_CODES.INVALID_REQUEST, "Missing or invalid session") };
    }

    try {
      const result = await this.route(method, params, signal);
      return { status: 200, body: successResponse(id, result) };
    } catch (e) {
      // A cancelled in-flight request (signal aborted) yields no verdict, matching the /ide path
      // (§8.5); the HTTP response is already closing, so an empty 200 is never actually sent.
      if (e instanceof CancelledError) return { status: 200, body: null };
      if (e instanceof RpcError) {
        return { status: 200, body: errorResponse(id, e.code, e.message, e.data) };
      }
      const message = e instanceof Error ? e.message : String(e);
      return { status: 200, body: errorResponse(id, ERROR_CODES.INTERNAL_ERROR, message) };
    }
  }

  private async route(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    switch (method) {
      case "ping":
        return {};
      case "tools/list":
        // No pagination: omit nextCursor entirely. The MCP result schema types it as an optional
        // string, so returning `null` fails the client's validation ("expected string, received null").
        return { tools: this.registry.descriptors() };
      case "tools/call": {
        const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
        if (typeof p.name !== "string" || p.name.length === 0) {
          throw new RpcError(ERROR_CODES.INVALID_REQUEST, "missing tool name");
        }
        const args = isObject(p.arguments) ? p.arguments : {};
        return this.registry.call(p.name, args, this.ctx, signal);
      }
      default:
        throw new RpcError(ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }
}
