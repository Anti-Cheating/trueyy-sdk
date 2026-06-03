export class TrueyyError extends Error {
  public readonly status: number;
  public readonly requestId?: string;
  public readonly body?: unknown;

  constructor(message: string, status: number, requestId?: string, body?: unknown) {
    super(message);
    this.name = "TrueyyError";
    this.status = status;
    if (requestId !== undefined) this.requestId = requestId;
    if (body !== undefined) this.body = body;
  }
}

export class TrueyyAuthError extends TrueyyError {
  constructor(message = "Unauthenticated", requestId?: string, body?: unknown) {
    super(message, 401, requestId, body);
    this.name = "TrueyyAuthError";
  }
}

export class TrueyyNotFoundError extends TrueyyError {
  constructor(message = "Not found", requestId?: string, body?: unknown) {
    super(message, 404, requestId, body);
    this.name = "TrueyyNotFoundError";
  }
}

export class TrueyyValidationError extends TrueyyError {
  constructor(message = "Invalid request", requestId?: string, body?: unknown) {
    super(message, 400, requestId, body);
    this.name = "TrueyyValidationError";
  }
}

export class TrueyyRateLimitError extends TrueyyError {
  constructor(message = "Rate limited", requestId?: string, body?: unknown) {
    super(message, 429, requestId, body);
    this.name = "TrueyyRateLimitError";
  }
}

export class TrueyyServerError extends TrueyyError {
  constructor(message = "Server error", status = 500, requestId?: string, body?: unknown) {
    super(message, status, requestId, body);
    this.name = "TrueyyServerError";
  }
}

export function errorFromResponse(status: number, requestId: string | undefined, body: unknown): TrueyyError {
  const msg = extractMessage(body) ?? `Request failed (${status})`;
  if (status === 401) return new TrueyyAuthError(msg, requestId, body);
  if (status === 404) return new TrueyyNotFoundError(msg, requestId, body);
  if (status === 400) return new TrueyyValidationError(msg, requestId, body);
  if (status === 429) return new TrueyyRateLimitError(msg, requestId, body);
  if (status >= 500) return new TrueyyServerError(msg, status, requestId, body);
  return new TrueyyError(msg, status, requestId, body);
}

function extractMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string") return e;
  }
  return null;
}
