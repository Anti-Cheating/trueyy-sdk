import { WsClient } from "./wsClient.js";
import type { SessionRole, SocketEventName, SocketEventMap } from "./types.js";

export interface TrueyyClientOptions {
  /** Short-lived session JWT minted by the ATS backend via @trueyy/node. */
  token: string;
  /** Role encoded in the JWT — declared explicitly for clarity. */
  role: SessionRole;
  /** Cortex base URL. Default: https://api.trueyy.com */
  baseUrl?: string;
  /**
   * Called ~30s before the current token expires. Implementation should
   * fetch a fresh token from the ATS backend (which uses @trueyy/node to
   * call refreshToken) and return the new JWT.
   */
  onTokenExpiring?: () => Promise<string>;
}

/**
 * Stateful client used by both vanilla and React adapters. Owns:
 *   - the WS connection to Cortex,
 *   - typed event subscriptions,
 *   - imperative commands (capture-screenshots, start/stop analysis, etc.),
 *   - auto-refresh of the session JWT before expiry.
 */
export class TrueyyClient {
  private opts: TrueyyClientOptions;
  private ws: WsClient;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: TrueyyClientOptions) {
    this.opts = { baseUrl: "https://api.trueyy.com", ...opts };
    this.ws = new WsClient({
      baseUrl: this.opts.baseUrl!,
      token: opts.token,
      onReconnect: () => {},
    });
  }

  connect(): void {
    this.ws.connect();
    this.scheduleRefresh();
  }

  on<E extends SocketEventName>(event: E, fn: (e: SocketEventMap[E]) => void): () => void {
    return this.ws.on(event, fn);
  }

  /** Interviewer-only: request immediate screenshot capture. */
  captureNow(): void {
    this.ws.emit("capture-screenshots");
  }

  /** Interviewer-only: pause/resume analysis. */
  startAnalysis(): void {
    this.ws.emit("start-analysis");
  }
  stopAnalysis(): void {
    this.ws.emit("stop-analysis");
  }

  startTranscription(): void {
    this.ws.emit("start-transcription");
  }
  stopTranscription(): void {
    this.ws.emit("stop-transcription");
  }

  disconnect(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.ws.disconnect();
  }

  private scheduleRefresh(): void {
    if (!this.opts.onTokenExpiring) return;
    const expMs = decodeJwtExpMs(this.opts.token);
    if (!expMs) return;
    const fireInMs = Math.max(5_000, expMs - Date.now() - 30_000);
    this.refreshTimer = setTimeout(async () => {
      try {
        const fresh = await this.opts.onTokenExpiring!();
        this.opts.token = fresh;
        this.ws.updateToken(fresh);
        this.scheduleRefresh();
      } catch (err) {
        // Surface via console for now; React layer can re-arm via re-mount.
        console.error("[TrueyyClient] token refresh failed", err);
      }
    }, fireInMs);
  }
}

/**
 * Decode a JWT WITHOUT verifying signature (we don't have the secret in
 * the browser). We only read `exp` to schedule refresh; security is at
 * the server side.
 */
function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload?.exp === "number") return payload.exp * 1000;
  } catch {
    /* ignore */
  }
  return null;
}
