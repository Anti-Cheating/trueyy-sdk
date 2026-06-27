// Socket event payloads — these MIRROR CORTEX'S socketService emit shapes
// exactly (the same events Skyview's useRiskSocket consumes). Keep them in
// sync with Cortex/src/services/socketService.ts.

export type SessionRole = "candidate" | "interviewer" | "helper";
export type SessionStatus = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";

// ── risk-pulse ──
export interface PulseDetection {
  categoryId: string;
  categoryLabel: string;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "CLEAN";
  riskScore: number;
  apps: string[];
  matchedKeywords: string[];
}
export interface PulseKeyboardAlert {
  type: string;
  label: string;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  key?: string;
  app?: string;
  fromApp?: string;
}
export interface RiskPulseEvent {
  detections: PulseDetection[];
  activities: string[];
  keyboardAlerts?: PulseKeyboardAlert[];
  timestamp: string;
}

// ── window-result ──
export interface ModalityRisk {
  risk?: string;
  score?: number;
  summary?: string;
}
export interface WindowResultEvent {
  window_id: string;
  session_id: string;
  risk: string;
  score: number;
  summary: string;
  confidence?: string;
  status: string;
  processed_at: string;
  per_modality?: {
    app_metadata?: ModalityRisk;
    keystroke?: ModalityRisk;
    voice?: ModalityRisk;
  };
  correlations?: Array<Record<string, unknown>>;
}

// ── live-transcript (interim) + stable-transcript (final, deduped) ──
export interface LiveTranscriptEvent {
  text: string;
  is_final: boolean;
  timestamp: string;
  speaker_role?: "interviewer" | "candidate";
  participant_id?: string;
  start_ms?: number;
  end_ms?: number;
}
export interface StableTranscriptEvent {
  transcript_id: string;
  speaker_role: "candidate" | "interviewer";
  text: string;
  is_final: true;
  timestamp: string;
  start_ms: number;
  end_ms: number;
  participant_id?: string;
  confidence: number;
}

// ── candidate-status / interviewer-status ──
export interface CandidateStatusEvent {
  sessionId: string;
  extension_installed?: boolean;
  screen_recording?: boolean;
  mic_granted?: boolean;
  keyboard_granted?: boolean;
  joined?: boolean;
}

// ── image-analysis-result ──
export interface ImageAnalysisResultEvent {
  analysis_id: string;
  session_id: string;
  status: string;
  risk: string;
  score: number;
  summary: string;
  image_count: number;
  processed_at: string;
  image_signals: string[];
  image_evidence: string[];
  thumbnail_urls: string[];
}

/**
 * Map of socket event names → typed payloads. Used by TrueyyClient's typed
 * `.on(event, listener)` overloads.
 */
export interface SocketEventMap {
  "risk-pulse": RiskPulseEvent;
  "window-result": WindowResultEvent;
  "live-transcript": LiveTranscriptEvent;
  "stable-transcript": StableTranscriptEvent;
  "candidate-status": CandidateStatusEvent;
  "image-analysis-result": ImageAnalysisResultEvent;
}

export type SocketEventName = keyof SocketEventMap;
