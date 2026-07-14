import type { HttpClient } from "./client.js";
import type { Report } from "./types.js";

/** Per-round analysis report. */
export class Reports {
  constructor(private readonly http: HttpClient) {}

  /** roundId = the round's session id (from interviews.create → round_id, or
   *  an interview's rounds[].id). Resolves to the round's analysis. */
  get(roundId: string): Promise<Report> {
    return this.http.request<Report>({
      method: "GET",
      path: `/v1/reports/${encodeURIComponent(roundId)}`,
    });
  }
}
