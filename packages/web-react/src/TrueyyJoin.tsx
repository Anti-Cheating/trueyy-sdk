import { useEffect, useState } from "react";
import {
  detectHelper,
  helperJoin,
  helperJoinedMeeting,
  HELPER_DOWNLOAD_URL_MAC,
  HELPER_DOWNLOAD_URL_WIN,
} from "@trueyy/web-core";
import { useTrueyyContext } from "./TrueyyProvider.js";

export interface TrueyyJoinProps {
  meetingUrl: string;
  /** Cortex base URL the helper should connect to. */
  cortexUrl?: string;
  onReady?: () => void;
}

/**
 * Candidate pre-join: 3 steps.
 *   1. Install helper (if not detected).
 *   2. Permission grants (Helper handles natively).
 *   3. Open meeting URL.
 */
export function TrueyyJoin({ meetingUrl, cortexUrl, onReady }: TrueyyJoinProps) {
  const { role } = useTrueyyContext();
  const [helperUp, setHelperUp] = useState<boolean | null>(null);
  const [joined, setJoined] = useState(false);
  const isCandidate = role === "candidate";

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const ok = await detectHelper();
      if (!cancelled) setHelperUp(ok);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleConnect = async () => {
    // The token in this Provider IS the helper-or-candidate token. The
    // candidate's <TrueyyJoin> hands the helper-JWT (passed in separately
    // via the ATS) to the local Helper. For simplicity here, we re-use
    // the candidate token's session_id; the ATS is expected to pre-hand
    // helper_token to the page.
    const helperToken = (window as unknown as { __TRUEYY_HELPER_TOKEN__?: string })
      .__TRUEYY_HELPER_TOKEN__;
    if (!helperToken) {
      alert("Helper token missing. The ATS must inject __TRUEYY_HELPER_TOKEN__.");
      return;
    }
    const r = await helperJoin({
      helperToken,
      cortexUrl: cortexUrl ?? "https://api.trueyy.com",
      sessionId: getSessionIdFromToken(helperToken),
    });
    if (!r.ok) {
      alert(`Helper connection failed: ${r.error}`);
    }
  };

  const handleOpenMeeting = async () => {
    const helperToken = (window as unknown as { __TRUEYY_HELPER_TOKEN__?: string })
      .__TRUEYY_HELPER_TOKEN__;
    if (helperToken) {
      await helperJoinedMeeting(getSessionIdFromToken(helperToken));
    }
    setJoined(true);
    onReady?.();
    window.open(meetingUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="trueyy-join">
      <h2>Join your interview</h2>

      <div className="trueyy-join__step">
        <span>1.</span>
        <div style={{ flex: 1 }}>
          <strong>Install the helper</strong>
          {helperUp === null && <p className="trueyy-muted">Checking…</p>}
          {helperUp === false && (
            <p>
              <a href={HELPER_DOWNLOAD_URL_MAC}>Download for Mac</a>
              {" · "}
              <a href={HELPER_DOWNLOAD_URL_WIN}>Download for Windows</a>
            </p>
          )}
          {helperUp === true && <p className="trueyy-muted">Helper detected ✓</p>}
        </div>
      </div>

      <div className="trueyy-join__step">
        <span>2.</span>
        <div style={{ flex: 1 }}>
          <strong>Grant permissions</strong>
          <p className="trueyy-muted">
            The helper will prompt for screen recording and microphone access.
          </p>
          <button
            className="trueyy-button"
            disabled={!helperUp || !isCandidate}
            onClick={handleConnect}
          >
            Connect helper
          </button>
        </div>
      </div>

      <div className="trueyy-join__step">
        <span>3.</span>
        <div style={{ flex: 1 }}>
          <strong>Open the meeting</strong>
          <button
            className="trueyy-button"
            disabled={!helperUp || joined}
            onClick={handleOpenMeeting}
          >
            {joined ? "Opened ✓" : "Open meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getSessionIdFromToken(token: string): string {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.sub ?? "");
  } catch {
    return "";
  }
}
