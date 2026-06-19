// JSON-RPC 2.0 error codes (§6.2) and the protocol-level error types.

export const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
} as const;

// A protocol error carrying a JSON-RPC error code. Thrown by handlers; the
// dispatcher turns it into an error response.
export class RpcError extends Error {
  constructor(public readonly code: number, message: string, public readonly data?: unknown) {
    super(message);
    this.name = "RpcError";
  }
}

// Thrown when an in-flight request is cancelled via notifications/cancelled.
// The dispatcher suppresses the response entirely (no verdict — §8.5).
export class CancelledError extends Error {
  constructor() {
    super("Request cancelled");
    this.name = "CancelledError";
  }
}
