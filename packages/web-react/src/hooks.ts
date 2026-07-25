import { useCallback, useEffect, useState } from "react";
import type {
  ConsentStatusEvent,
  ConsentText,
  LiveTranscriptEvent,
  RiskPulseEvent,
  WindowResultEvent,
} from "@trueyy-sdk/web-core";
import { TrueyyConsentError } from "@trueyy-sdk/web-core";
import { useTrueyyClient } from "./TrueyyProvider.js";

export function useRiskStream(max = 50): RiskPulseEvent[] {
  const client = useTrueyyClient();
  const [items, setItems] = useState<RiskPulseEvent[]>([]);
  useEffect(() => {
    return client.on("risk-pulse", (e) => {
      setItems((prev) => [e, ...prev].slice(0, max));
    });
  }, [client, max]);
  return items;
}

export function useWindowResults(max = 50): WindowResultEvent[] {
  const client = useTrueyyClient();
  const [items, setItems] = useState<WindowResultEvent[]>([]);
  useEffect(() => {
    return client.on("window-result", (e) => {
      setItems((prev) => [e, ...prev].slice(0, max));
    });
  }, [client, max]);
  return items;
}

export function useTranscriptStream(max = 200): LiveTranscriptEvent[] {
  const client = useTrueyyClient();
  const [items, setItems] = useState<LiveTranscriptEvent[]>([]);
  useEffect(() => {
    return client.on("live-transcript", (e) => {
      setItems((prev) => [...prev, e].slice(-max));
    });
  }, [client, max]);
  return items;
}

export type ConsentStatus = "loading" | "needed" | "given" | "declined" | "revoked";

export interface UseConsent {
  status: ConsentStatus;
  text: ConsentText | null;
  agree: () => Promise<void>;
  decline: () => Promise<void>;
  revoke: () => Promise<void>;
  refresh: () => Promise<void>;
  busy: boolean;
}

/**
 * Candidate consent (GDPR Art. 7) state machine backed by the client's
 * consent API + the live consent-status broadcast. Capture is server-gated
 * on an open consent row, so a candidate join UI MUST drive this to
 * `given` before any monitoring data flows.
 */
export function useConsent(): UseConsent {
  const client = useTrueyyClient();
  const [status, setStatus] = useState<ConsentStatus>("loading");
  const [text, setText] = useState<ConsentText | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const t = await client.consent.text();
    setText(t);
    setStatus(t.consented ? "given" : "needed");
  }, [client]);

  useEffect(() => {
    refresh().catch(() => setStatus("needed"));
  }, [refresh]);

  useEffect(() => {
    return client.on("consent-status", (e: ConsentStatusEvent) => {
      if (e.status === "given") setStatus("given");
      else if (e.status === "declined") setStatus("declined");
      else if (e.status === "revoked") setStatus("revoked");
    });
  }, [client]);

  const agree = useCallback(async () => {
    if (!text) return;
    setBusy(true);
    try {
      await client.consent.grant(text.version);
      setStatus("given");
    } catch (err) {
      // Legal shipped new wording between load and Agree — re-show it.
      if (err instanceof TrueyyConsentError && err.code === "stale_text") {
        await refresh();
      } else {
        throw err;
      }
    } finally {
      setBusy(false);
    }
  }, [client, text, refresh]);

  const decline = useCallback(async () => {
    setBusy(true);
    try {
      await client.consent.decline();
      setStatus("declined");
    } finally {
      setBusy(false);
    }
  }, [client]);

  const revoke = useCallback(async () => {
    setBusy(true);
    try {
      await client.consent.revoke();
      setStatus("revoked");
    } finally {
      setBusy(false);
    }
  }, [client]);

  return { status, text, agree, decline, revoke, refresh, busy };
}
