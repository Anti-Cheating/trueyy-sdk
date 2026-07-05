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

export interface RoundInput {
  round_name: string;
  /** Must pre-exist — invite via team.invite, then find the id via team.members. */
  interviewer_user_id: string;
  scheduled_start_at: string; // ISO 8601
  scheduled_end_at: string; // ISO 8601
  timezone: string;
  meeting_link: string; // required (zoom / meet / teams)
}

export interface CreateInterviewInput {
  role: string;
  description?: string | null;
  candidate_email: string;
  candidate_first_name: string;
  candidate_last_name: string;
  first_round: RoundInput;
}

export interface RoundSummary {
  id: string;
  round_name: string | null;
  round_order: number | null;
  status: string;
  interviewer: { first_name: string; last_name: string } | null;
  analysis: { overall_score: number | null; risk_level: string | null } | null;
}

export interface Interview {
  id: string;
  role: string;
  candidate: { id: string; first_name: string; last_name: string; email: string };
  status: "IN_PROGRESS" | "COMPLETED";
  rounds?: RoundSummary[];
}

export interface Member {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
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

export interface Page<T> {
  items: T[];
  total: number;
}

/** Per-round analysis (shape mirrors interview_session_participants.analysis). */
export type Report = Record<string, unknown>;

/** Receipt returned by candidates.erase — proof the erasure was recorded. */
export interface EraseReceipt {
  receipt: { id: string; requested_at: string };
}

/** An audit-trail entry (customer-scoped view). */
export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name?: string | null;
  actor_role: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: unknown;
  company_id: string | null;
  created_at: string;
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
