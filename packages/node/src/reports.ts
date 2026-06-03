import type { HttpClient } from "./client.js";
import type { Report } from "./types.js";

export class Reports {
  constructor(private readonly http: HttpClient) {}

  get(sessionId: string): Promise<Report> {
    return this.http.request<Report>({
      method: "GET",
      path: `/v1/reports/${encodeURIComponent(sessionId)}`,
    });
  }
}
