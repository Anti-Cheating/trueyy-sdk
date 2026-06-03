import type { HttpClient } from "./client.js";
import type {
  CreateSessionInput,
  CreatedSession,
  Session,
  ListSessionsFilter,
  Paginated,
  RefreshedToken,
  SessionRole,
} from "./types.js";

export class Sessions {
  constructor(private readonly http: HttpClient) {}

  create(input: CreateSessionInput): Promise<CreatedSession> {
    return this.http.request<CreatedSession>({
      method: "POST",
      path: "/v1/sessions",
      body: input,
    });
  }

  get(id: string): Promise<Session> {
    return this.http.request<Session>({
      method: "GET",
      path: `/v1/sessions/${encodeURIComponent(id)}`,
    });
  }

  list(filter: ListSessionsFilter = {}): Promise<Paginated<Session>> {
    return this.http.request<Paginated<Session>>({
      method: "GET",
      path: "/v1/sessions",
      query: {
        limit: filter.limit,
        cursor: filter.cursor,
        status: filter.status,
      },
    });
  }

  end(id: string): Promise<Session> {
    return this.http.request<Session>({
      method: "POST",
      path: `/v1/sessions/${encodeURIComponent(id)}/end`,
    });
  }

  cancel(id: string, reason?: string): Promise<Session> {
    return this.http.request<Session>({
      method: "POST",
      path: `/v1/sessions/${encodeURIComponent(id)}/cancel`,
      body: { reason },
    });
  }

  refreshToken(id: string, role: SessionRole): Promise<RefreshedToken> {
    return this.http.request<RefreshedToken>({
      method: "POST",
      path: `/v1/sessions/${encodeURIComponent(id)}/tokens/refresh`,
      body: { role },
    });
  }
}
