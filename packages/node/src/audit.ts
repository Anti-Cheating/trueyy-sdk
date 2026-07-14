import type { HttpClient } from "./client.js";
import type { Page, AuditEntry } from "./types.js";

// A `type` (not `interface`) so it gets an implicit index signature and
// satisfies the HttpClient request `query` param.
export type AuditQuery = {
  action?: string;
  search?: string;
  from?: string; // ISO date
  to?: string;   // ISO date
  limit?: number;
  offset?: number;
};

/** Read-only audit trail — the same customer-scoped view as the dashboard:
 *  your own people and API keys, not Trueyy platform operations. */
export class Audit {
  constructor(private readonly http: HttpClient) {}

  list(query: AuditQuery = {}): Promise<Page<AuditEntry>> {
    return this.http.request<Page<AuditEntry>>({ method: "GET", path: "/v1/audit", query });
  }

  get(id: string): Promise<AuditEntry> {
    return this.http.request<AuditEntry>({ method: "GET", path: `/v1/audit/${encodeURIComponent(id)}` });
  }
}
