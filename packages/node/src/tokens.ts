import type { HttpClient } from "./client.js";
import type { SessionRole, RefreshedToken } from "./types.js";

/** Mint a short-lived browser token for a round so you can embed
 *  <TrueyyJoin> / <TrueyyMonitor> in your own UI without a Trueyy login. */
export class Tokens {
  constructor(private http: HttpClient) {}
  mint(roundId: string, role: SessionRole): Promise<RefreshedToken> {
    return this.http.request<RefreshedToken>({
      method: "POST",
      path: `/v1/sessions/${encodeURIComponent(roundId)}/tokens`,
      body: { role },
    });
  }
}
