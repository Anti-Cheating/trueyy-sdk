import { useEffect, useState } from "react";
import { useTrueyyClient } from "./TrueyyProvider.js";
import { useRiskStream, useTranscriptStream, useWindowResults } from "./hooks.js";
import type { ConsentStatusEvent, RiskPulseEvent } from "@trueyy/web-core";

export interface TrueyyMonitorProps {
  onRiskAlert?: (e: RiskPulseEvent) => void;
  /** Fired on candidate consent transitions (given/declined/revoked). */
  onConsentChange?: (e: ConsentStatusEvent) => void;
}

/**
 * Interviewer's live monitoring panel. Renders three columns:
 *   - Risk pulses (detections, keyboard alerts, activities)
 *   - Window results (every 30s)
 *   - Live transcript
 * Plus a "Capture now" button. Payload shapes mirror Cortex's socket events.
 */
export function TrueyyMonitor({ onRiskAlert, onConsentChange }: TrueyyMonitorProps) {
  const client = useTrueyyClient();
  const risks = useRiskStream();
  const windows = useWindowResults();
  const transcript = useTranscriptStream();
  const [consent, setConsent] = useState<ConsentStatusEvent | null>(null);

  // Forward the newest pulse to the host app (effect, not during render).
  useEffect(() => {
    if (onRiskAlert && risks[0]) onRiskAlert(risks[0]);
  }, [risks, onRiskAlert]);

  // Consent transitions — drive the banner + notify the host.
  useEffect(() => {
    return client.on("consent-status", (e) => {
      setConsent(e);
      onConsentChange?.(e);
    });
  }, [client, onConsentChange]);

  return (
    <div className="trueyy-monitor">
      {consent?.status === "revoked" && (
        <div className="trueyy-banner trueyy-banner--error" style={{ gridColumn: "1 / -1" }}>
          Candidate withdrew monitoring consent at {new Date(consent.at).toLocaleTimeString()} — capture stopped.
        </div>
      )}
      {consent?.status === "declined" && (
        <div className="trueyy-banner trueyy-banner--warning" style={{ gridColumn: "1 / -1" }}>
          Candidate declined monitoring consent — monitoring cannot start.
        </div>
      )}
      {consent?.status === "given" && (
        <div className="trueyy-banner trueyy-banner--ok" style={{ gridColumn: "1 / -1" }}>
          Candidate consented to monitoring.
        </div>
      )}
      <div className="trueyy-card">
        <h3>Risk pulses</h3>
        <button className="trueyy-button" onClick={() => client.captureNow()}>
          Capture now
        </button>
        <div>
          {risks.map((pulse, i) => (
            <div key={i} className="trueyy-risk-pulse">
              {pulse.detections.map((d, j) => (
                <div key={`d${j}`} className={`trueyy-risk-pulse--${d.riskLevel.toLowerCase()}`}>
                  <strong>{d.categoryLabel}</strong> — {d.apps.join(", ")} <span>({d.riskLevel})</span>
                </div>
              ))}
              {(pulse.keyboardAlerts ?? []).map((k, j) => (
                <div key={`k${j}`} className={`trueyy-risk-pulse--${k.riskLevel.toLowerCase()}`}>
                  {k.label}
                  {k.app ? ` — ${k.app}` : ""}
                </div>
              ))}
              {pulse.activities.map((a, j) => (
                <div key={`a${j}`} className="trueyy-muted">{a}</div>
              ))}
            </div>
          ))}
          {risks.length === 0 && <p className="trueyy-muted">No alerts yet.</p>}
        </div>
      </div>

      <div className="trueyy-card">
        <h3>Window analysis</h3>
        <div>
          {windows.map((w) => (
            <div key={w.window_id}>
              <strong>{w.risk}</strong> ({w.score}) — {w.summary}
            </div>
          ))}
          {windows.length === 0 && <p className="trueyy-muted">Waiting for first window…</p>}
        </div>
      </div>

      <div className="trueyy-card" style={{ gridColumn: "1 / -1" }}>
        <h3>Transcript</h3>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {transcript.map((t, i) => (
            <p key={i}>
              <strong>{t.speaker_role ?? "speaker"}:</strong> {t.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
