// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { randomUUID } from "crypto";

// The server's default/max MCP protocol version. Streamable HTTP requires >= 2025-03-26.
export const SERVER_PROTOCOL_VERSION = "2025-11-25";
export const MIN_PROTOCOL_VERSION = "2025-03-26";

// Echo the client's proposed version when it is within [MIN, SERVER] (ISO YYYY-MM-DD strings
// compare lexically). Anything older or newer than we support -> counter with our max.
export function negotiateProtocolVersion(proposed: unknown): string {
  if (
    typeof proposed === "string" &&
    proposed >= MIN_PROTOCOL_VERSION &&
    proposed <= SERVER_PROTOCOL_VERSION
  ) {
    return proposed;
  }
  return SERVER_PROTOCOL_VERSION;
}

// Tracks the protocol version negotiated per session id (assigned at initialize, dropped on stop).
export class SessionManager {
  private readonly sessions = new Map<string, string>();

  // Create a session and remember its negotiated protocol version. Returns the new session id.
  create(protocolVersion: string): string {
    const id = randomUUID();
    this.sessions.set(id, protocolVersion);
    return id;
  }

  has(id: string | undefined): id is string {
    return typeof id === "string" && this.sessions.has(id);
  }

  clear(): void {
    this.sessions.clear();
  }
}
