import { useEffect, useState } from "react";
import type {
  LiveTranscriptEvent,
  RiskPulseEvent,
  WindowResultEvent,
} from "@trueyy/web-core";
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
