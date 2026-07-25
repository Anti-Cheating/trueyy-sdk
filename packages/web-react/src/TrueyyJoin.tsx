import { useEffect, useState } from "react";
import {
  detectHelper,
  helperJoin,
  helperJoinedMeeting,
  HELPER_DOWNLOAD_URL_MAC,
  HELPER_DOWNLOAD_URL_WIN,
} from "@trueyy-sdk/web-core";
import { useTrueyyContext } from "./TrueyyProvider.js";
import { useConsent, type ConsentStatus, type UseConsent } from "./hooks.js";

export interface TrueyyJoinProps {
  meetingUrl: string;
  /** Cortex base URL the helper should connect to. */
  cortexUrl?: string;
  onReady?: () => void;
  /** Replace the built-in consent UI with your own. Receives the consent
   *  hook state; capture stays server-gated until consent is granted. */
  renderConsent?: (c: UseConsent) => React.ReactNode;
  /** DANGER: skip the built-in consent step because your ATS collects
   *  consent itself and calls client.consent.grant(). Capture is still
   *  blocked server-side until consent is granted either way — this only
   *  hides the built-in UI. You accept the compliance responsibility. */
  consentHandledExternally?: boolean;
  /** Fired on every consent transition. */
  onConsentChange?: (status: ConsentStatus) => void;
}

/**
 * Candidate pre-join. Consent (GDPR Art. 7) is collected FIRST — the
 * helper steps stay disabled until the candidate agrees. Then:
 *   1. Install helper (if not detected).
 *   2. Permission grants (Helper handles natively).
 *   3. Open meeting URL.
 */
export function TrueyyJoin({
  meetingUrl, cortexUrl, onReady, renderConsent, consentHandledExternally, onConsentChange,
}: TrueyyJoinProps) {
  const { role } = useTrueyyContext();
  const [helperUp, setHelperUp] = useState<boolean | null>(null);
  const [joined, setJoined] = useState(false);
  const isCandidate = role === "candidate";

  const consent = useConsent();
  useEffect(() => { onConsentChange?.(consent.status); }, [consent.status, onConsentChange]);
  // Gate everything below on consent unless the host owns it.
  const consentOk = consentHandledExternally || consent.status === "given";

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

  // Consent gate renders before the join steps (candidate only). Hidden
  // entirely when the host ATS owns consent.
  if (isCandidate && !consentHandledExternally && consent.status !== "given") {
    if (renderConsent) return <>{renderConsent(consent)}</>;
    return (
      <div className="trueyy-join">
        <h2>Interview monitoring consent</h2>
        {consent.status === "loading" && <p className="trueyy-muted">Loading…</p>}
        {consent.status === "declined" && (
          <div>
            <p>You've declined monitoring. Your interviewer has been notified.</p>
            <button className="trueyy-button" onClick={() => consent.refresh()}>I changed my mind</button>
          </div>
        )}
        {consent.status === "revoked" && (
          <div>
            <p>Monitoring stopped — you withdrew consent.</p>
            <button className="trueyy-button" onClick={() => consent.refresh()}>Re-enable monitoring</button>
          </div>
        )}
        {consent.status === "needed" && consent.text && (
          <div>
            <div
              className="trueyy-consent__text"
              style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto", border: "1px solid #e5e7eb", padding: 12, borderRadius: 8, margin: "8px 0" }}
            >
              {consent.text.body}
            </div>
            <p className="trueyy-muted">
              Version {consent.text.version}. You may withdraw at any time during the interview.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="trueyy-button" disabled={consent.busy} onClick={() => consent.agree()}>
                I agree — continue
              </button>
              <button className="trueyy-button trueyy-button--secondary" disabled={consent.busy} onClick={() => consent.decline()}>
                Decline
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="trueyy-join">
      <h2>Join your interview</h2>

      {isCandidate && consentOk && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            className="trueyy-button trueyy-button--secondary"
            style={{ fontSize: "0.8rem" }}
            disabled={consent.busy}
            onClick={() => consent.revoke()}
          >
            Withdraw monitoring consent
          </button>
        </div>
      )}

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
            disabled={!helperUp || !isCandidate || !consentOk}
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
