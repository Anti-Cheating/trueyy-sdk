import type { HttpClient } from "./client.js";
import type { Member } from "./types.js";

/** Team = invite the interviewer (so interviewer_user_id exists) + list members. */
export class Team {
  constructor(private http: HttpClient) {}

  members(): Promise<{ members: Member[] }> {
    return this.http.request<{ members: Member[] }>({ method: "GET", path: "/v1/team/members" });
  }

  /** Invite a teammate (e.g. an interviewer). They accept via email, then
   *  appear in members() with an id you reference as interviewer_user_id. */
  invite(input: { email: string; role: "Admin" | "Member" }): Promise<{ id: string; email: string; role: string }> {
    return this.http.request<{ id: string; email: string; role: string }>({
      method: "POST",
      path: "/v1/team/invites",
      body: input,
    });
  }

  invites(query: { limit?: number; offset?: number } = {}): Promise<unknown> {
    return this.http.request<unknown>({ method: "GET", path: "/v1/team/invites", query });
  }
}
