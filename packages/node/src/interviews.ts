import type { HttpClient } from "./client.js";
import type { CreateInterviewInput, Interview, RoundInput, Page } from "./types.js";

/** Interviews = the parent process + its ordered rounds. Same model the
 *  Trueyy dashboard uses; the SDK is a thin door onto it. */
export class Interviews {
  constructor(private http: HttpClient) {}

  /** Create an interview + its first round in one call. */
  create(input: CreateInterviewInput): Promise<{ id: string; round_id: string }> {
    return this.http.request<{ id: string; round_id: string }>({
      method: "POST",
      path: "/v1/interviews",
      body: input,
    });
  }

  list(query: { limit?: number; offset?: number; search?: string } = {}): Promise<Page<Interview>> {
    return this.http.request<Page<Interview>>({ method: "GET", path: "/v1/interviews", query });
  }

  get(id: string): Promise<Interview> {
    return this.http.request<Interview>({ method: "GET", path: `/v1/interviews/${encodeURIComponent(id)}` });
  }

  /** Add another round (different interviewer / day) to an existing interview. */
  addRound(id: string, round: RoundInput): Promise<{ round_id: string; round_order: number }> {
    return this.http.request<{ round_id: string; round_order: number }>({
      method: "POST",
      path: `/v1/interviews/${encodeURIComponent(id)}/rounds`,
      body: round,
    });
  }

  cancel(id: string): Promise<void> {
    return this.http.request<void>({ method: "DELETE", path: `/v1/interviews/${encodeURIComponent(id)}` });
  }
}
