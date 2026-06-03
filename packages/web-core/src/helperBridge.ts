const HELPER_BASE = "http://127.0.0.1:48123";

export interface HelperStatus {
  ok: boolean;
  version?: string;
  screen_recording?: boolean;
  mic_granted?: boolean;
  joined?: boolean;
}

/**
 * Tries to reach the local Helper daemon. Resolves true if `/health`
 * responded 2xx within `timeoutMs`. Treats any error (CORS, connection
 * refused, timeout) as "not installed".
 */
export async function detectHelper(timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${HELPER_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Tell the Helper to join a session. Carries the helper-JWT + cortex
 * base URL + per-tenant features. Helper opens WSS to Cortex from there.
 */
export async function helperJoin(opts: {
  helperToken: string;
  cortexUrl: string;
  sessionId: string;
  features?: Record<string, boolean>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${HELPER_BASE}/session/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        helper_token: opts.helperToken,
        cortex_url: opts.cortexUrl,
        session_id: opts.sessionId,
        features: opts.features ?? {},
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `helper /session/join HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function helperJoinedMeeting(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${HELPER_BASE}/session/joined-meeting`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function helperLeave(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${HELPER_BASE}/session/leave`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function helperStatus(): Promise<HelperStatus | null> {
  try {
    const res = await fetch(`${HELPER_BASE}/session/status`);
    if (!res.ok) return null;
    return (await res.json()) as HelperStatus;
  } catch {
    return null;
  }
}

export const HELPER_DOWNLOAD_URL_MAC =
  "https://downloads.trueyy.com/TrueyyHelper-latest.dmg";
export const HELPER_DOWNLOAD_URL_WIN =
  "https://downloads.trueyy.com/TrueyyHelper-latest.exe";
