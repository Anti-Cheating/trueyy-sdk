// Mirror of @trueyy/node's types.ts (kept in sync manually until OpenAPI
// generation is wired). Browser-safe — no Node-only imports.

export type SessionRole = "candidate" | "interviewer" | "helper";
export type SessionStatus = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";

export interface RiskPulseEvent {
  session_id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  evidence: Record<string, unknown>;
}

export interface WindowResultEvent {
  session_id: string;
  window_id: string;
  risk: string;
  score: number;
  summary: string;
  modality_breakdown?: Record<string, unknown>;
}

export interface LiveTranscriptEvent {
  session_id: string;
  speaker: "candidate" | "interviewer";
  text: string;
  is_final: boolean;
  started_at?: string;
  ended_at?: string;
}

export interface CandidateStatusEvent {
  session_id: string;
  extension_installed?: boolean;
  screen_recording?: boolean;
  mic_granted?: boolean;
  joined?: boolean;
}

export interface ImageAnalysisResultEvent {
  session_id: string;
  image_id: string;
  risk: string;
  findings: Record<string, unknown>;
}

/**
 * Map of socket event names → typed payloads. Used by TrueyyClient's
 * typed `.on(event, listener)` overloads.
 */
export interface SocketEventMap {
  "risk-pulse": RiskPulseEvent;
  "window-result": WindowResultEvent;
  "live-transcript": LiveTranscriptEvent;
  "candidate-status": CandidateStatusEvent;
  "image-analysis-result": ImageAnalysisResultEvent;
}

export type SocketEventName = keyof SocketEventMap;
