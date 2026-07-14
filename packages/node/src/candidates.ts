import type { HttpClient } from "./client.js";
import type { EraseReceipt } from "./types.js";

/** Candidate data operations. */
export class Candidates {
  constructor(private readonly http: HttpClient) {}

  /**
   * Erase a candidate's captured data (recordings, transcripts, screenshots +
   * stored files) from THIS company's interviews. Company-scoped: the shared
   * candidate identity and other companies' data are untouched. Consent and
   * audit records are retained. Returns an erasure receipt.
   *
   * `candidateId` = the candidate's user id (e.g. an interview's candidate.id).
   * Throws TrueyyNotFoundError if the candidate never interviewed here.
   */
  erase(candidateId: string): Promise<EraseReceipt> {
    return this.http.request<EraseReceipt>({
      method: "DELETE",
      path: `/v1/candidates/${encodeURIComponent(candidateId)}`,
    });
  }
}
