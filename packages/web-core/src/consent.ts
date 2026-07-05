/**
 * Candidate consent (GDPR Art. 7) — REST calls to Cortex's consent
 * endpoints. These are the ONLY browser REST calls in the SDK; Cortex
 * carries a deliberate per-route CORS exception for them (Bearer-token
 * gated, no cookies), so they work from any customer ATS origin.
 */

export interface ConsentText {
  version: string;
  body: string;
  consented: boolean;
  consent_id: string | null;
}

export class TrueyyConsentError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TrueyyConsentError";
  }
}

async function req<T>(baseUrl: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; data?: T };
  if (!res.ok) throw new TrueyyConsentError(res.status, body.error ?? String(res.status));
  return (body.data ?? body) as T;
}

export const consentApi = {
  text: (baseUrl: string, token: string, sessionId: string) =>
    req<ConsentText>(baseUrl, token, `/interview-sessions/${sessionId}/consent-text`),
  grant: (baseUrl: string, token: string, sessionId: string, version: string) =>
    req<{ id: string; given_at: string }>(baseUrl, token, `/interview-sessions/${sessionId}/consent`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  decline: (baseUrl: string, token: string, sessionId: string) =>
    req<unknown>(baseUrl, token, `/interview-sessions/${sessionId}/consent/decline`, { method: "POST" }),
  revoke: (baseUrl: string, token: string, sessionId: string) =>
    req<unknown>(baseUrl, token, `/interview-sessions/${sessionId}/consent/revoke`, { method: "POST" }),
};
