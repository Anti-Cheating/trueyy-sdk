// Shared types across the Trueyy public API surface (mirrored on the web
// SDK side). Hand-written from Cortex's /v1/* contract; in production we'd
// generate these from an OpenAPI spec to avoid drift.

export type SessionStatus = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";
export type SessionRole = "candidate" | "interviewer" | "helper";

export interface Person {
  email: string;
  first_name: string;
  last_name: string;
}

export interface CreateSessionInput {
  external_id: string;
  candidate: Person;
  interviewer: Person;
  scheduled_start_at: string; // ISO 8601
  scheduled_end_at: string; // ISO 8601
  meeting_url?: string | null;
  title?: string;
  description?: string;
  timezone?: string;
  features?: Record<string, boolean>;
  /**
   * Optional multi-round grouping. Supply your own ID for the *interview*
   * (the parent process) and every session created with the same
   * `interview_external_id` is attached to it as an ordered round — so a
   * candidate's rounds (with different interviewers) appear as one interview.
   * Omit and the session is auto-wrapped in its own single-round interview.
   */
  interview_external_id?: string;
  /** Label for this round, e.g. "Technical — Round 2". */
  round_name?: string;
}

export interface CreatedSession {
  session_id: string;
  external_id: string | null;
  /** The parent interview process this session belongs to (its round). */
  process_id: string | null;
  round_name: string | null;
  round_order: number | null;
  candidate_token: string;
  interviewer_token: string;
  helper_token: string;
  candidate_token_expires_at: string;
  interviewer_token_expires_at: string;
  helper_token_expires_at: string;
  status: SessionStatus;
  scheduled_start_at: string;
  scheduled_end_at: string;
  created: boolean;
}

export interface Session {
  id: string;
  external_id: string | null;
  process_id?: string | null;
  round_name?: string | null;
  round_order?: number | null;
  status: SessionStatus;
  title: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  ended_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  interview_session_participants?: Array<{
    candidate?: { id: string; email: string; first_name: string; last_name: string };
    interviewer?: { id: string; email: string; first_name: string; last_name: string };
  }>;
}

export interface RefreshedToken {
  token: string;
  expires_at: string;
  role: SessionRole;
}

export interface ListSessionsFilter {
  limit?: number;
  cursor?: string;
  status?: SessionStatus;
}

export interface Paginated<T> {
  sessions: T[];
  next_cursor: string | null;
}

export interface Report {
  session_id: string;
  report_url: string;
  expires_at: string;
}

// Webhook event envelope (all events share this shape).
export type WebhookEventType =
  | "session.ready"
  | "session.transcript_segment"
  | "session.risk_pulse"
  | "session.window_result"
  | "session.image_analysis_result"
  | "session.ended"
  | "session.report_ready"
  | "session.cancelled";

export interface WebhookEvent<T = unknown> {
  event_id: string;
  event_type: WebhookEventType;
  created_at: string;
  api_version: "v1";
  data: T;
}
