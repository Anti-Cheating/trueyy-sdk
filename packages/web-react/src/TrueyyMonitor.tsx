import { useTrueyyClient } from "./TrueyyProvider.js";
import { useRiskStream, useTranscriptStream, useWindowResults } from "./hooks.js";
import type { RiskPulseEvent } from "@trueyy/web-core";

export interface TrueyyMonitorProps {
  onRiskAlert?: (e: RiskPulseEvent) => void;
}

/**
 * Interviewer's live monitoring panel. Renders three columns:
 *   - Risk pulses
 *   - Window results (every 30s)
 *   - Live transcript
 * Plus a "Capture now" button.
 */
export function TrueyyMonitor({ onRiskAlert }: TrueyyMonitorProps) {
  const client = useTrueyyClient();
  const risks = useRiskStream();
  const windows = useWindowResults();
  const transcript = useTranscriptStream();

  // Forward alerts to the host app.
  if (onRiskAlert) {
    risks[0] && onRiskAlert(risks[0]);
  }

  return (
    <div className="trueyy-monitor">
      <div className="trueyy-card">
        <h3>Risk pulses</h3>
        <button className="trueyy-button" onClick={() => client.captureNow()}>
          Capture now
        </button>
        <div>
          {risks.map((r, i) => (
            <div key={i} className={`trueyy-risk-pulse trueyy-risk-pulse--${r.severity}`}>
              <span>{r.kind}</span>
              <span>{r.severity}</span>
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
              <strong>{t.speaker}:</strong> {t.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
