import { errorFromResponse, TrueyyError } from "./errors.js";

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
}

/**
 * Thin fetch wrapper. Single retry on idempotent GET network failure;
 * NEVER retries POSTs at the transport layer (idempotency is caller's
 * job via external_id).
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.trueyy.com").replace(/\/+$/, "");
    this.timeout = opts.timeout ?? 10_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async request<T>({ method, path, query, body }: RequestOptions): Promise<T> {
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "content-type": "application/json",
      "user-agent": "trueyy-node/1.0.0",
    };
    const init: RequestInit = {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    const maxAttempts = method === "GET" ? 2 : 1;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.send<T>(url, init);
      } catch (err: unknown) {
        lastErr = err;
        if (err instanceof TrueyyError) throw err; // non-retryable HTTP errors
        if (attempt < maxAttempts) continue;
      }
    }
    throw lastErr;
  }

  private async send<T>(url: string, init: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const requestId = res.headers.get("x-trueyy-request-id") ?? undefined;
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (!res.ok) {
      throw errorFromResponse(res.status, requestId, parsed);
    }
    return parsed as T;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}
