import { useEffect, useState } from "react";

export interface TrueyyReplayProps {
  sessionId: string;
  /**
   * Fetch the session's transcript + risk timeline + screenshots. The
   * exact shape comes from /v1/sessions/:id (full) plus its child
   * collections. For V1 we hold a flexible shape; refine in V1.1.
   */
  fetchSessionDetail: (sessionId: string) => Promise<TrueyySessionDetail>;
}

export interface TrueyySessionDetail {
  session_id: string;
  title: string;
  status: string;
  // Field names mirror Cortex's post-analysis report (speaker_role +
  // detection shape), the same data Skyview's PostAnalysis panel renders.
  transcripts: Array<{
    speaker_role: "candidate" | "interviewer";
    text: string;
    captured_at: string;
  }>;
  detections: Array<{
    categoryLabel: string;
    riskLevel: string;
    apps: string[];
    occurred_at: string;
  }>;
  windows: Array<{
    risk: string;
    score: number;
    summary: string;
    start_time: string;
  }>;
}

export function TrueyyReplay({ sessionId, fetchSessionDetail }: TrueyyReplayProps) {
  const [detail, setDetail] = useState<TrueyySessionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchSessionDetail(sessionId)
      .then(setDetail)
      .catch((e) => setErr((e as Error).message));
  }, [sessionId, fetchSessionDetail]);

  if (err) return <div className="trueyy-card">Error: {err}</div>;
  if (!detail) return <div className="trueyy-card">Loading…</div>;

  return (
    <div className="trueyy-monitor">
      <div className="trueyy-card">
        <h3>{detail.title}</h3>
        <p className="trueyy-muted">Status: {detail.status}</p>
      </div>

      <div className="trueyy-card">
        <h3>Risk timeline</h3>
        {detail.detections.map((d, i) => (
          <div key={i} className={`trueyy-risk-pulse trueyy-risk-pulse--${d.riskLevel.toLowerCase()}`}>
            <strong>{d.categoryLabel}</strong> — {d.apps.join(", ")}
            <span>{new Date(d.occurred_at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>

      <div className="trueyy-card" style={{ gridColumn: "1 / -1" }}>
        <h3>Transcript</h3>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {detail.transcripts.map((t, i) => (
            <p key={i}>
              <strong>{t.speaker_role}:</strong> {t.text}
            </p>
          ))}
        </div>
      </div>

      <div className="trueyy-card" style={{ gridColumn: "1 / -1" }}>
        <h3>Window scores</h3>
        {detail.windows.map((w, i) => (
          <div key={i}>
            <strong>{w.risk}</strong> ({w.score}) — {w.summary}
          </div>
        ))}
      </div>
    </div>
  );
}
