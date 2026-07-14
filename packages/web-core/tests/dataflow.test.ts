import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { TrueyyClient } from "../src/client.js";
import { startBackend, stopBackend, type Backend } from "./_support/harness.js";

let ctx: Backend;
before(async () => { ctx = await startBackend(); });
after(() => stopBackend());

async function api(
  method: string,
  path: string,
  opts: { apiKey?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}

function firstRound() {
  return {
    round_name: "R1", interviewer_user_id: ctx.interviewerId,
    scheduled_start_at: new Date(Date.now() + 3600_000).toISOString(),
    scheduled_end_at: new Date(Date.now() + 7200_000).toISOString(),
    timezone: "UTC", meeting_link: "https://meet.google.com/abc-defg-hij",
  };
}

/**
 * The real end-to-end the line-coverage tests missed: an event emitted by
 * Cortex must actually reach a TrueyyClient. This connects to the real server,
 * triggers a genuine risk-pulse over the HTTP pulse endpoint, and asserts the
 * client receives it — which only works if connect() joins the session room.
 * Without the join-session fix this test times out with zero pulses.
 */
test("TrueyyClient receives a real risk-pulse Cortex broadcasts to the session room", async () => {
  const created = await api("POST", "/v1/interviews", {
    apiKey: ctx.apiKey,
    body: { role: "Backend", candidate_email: "a@x.com", candidate_first_name: "A", candidate_last_name: "X", first_round: firstRound() },
  });
  const sessionId = created.body.round_id as string;

  // Activate so the pulse endpoint accepts ingestion.
  const act = await api("POST", `/interview-sessions/${sessionId}/activate`, { token: ctx.ownerToken });
  assert.equal(act.status, 200, `session activates → ${act.status} ${JSON.stringify(act.body)}`);

  // Interviewer token drives the monitor.
  const itv = await api("POST", `/v1/sessions/${sessionId}/tokens`, { apiKey: ctx.apiKey, body: { role: "interviewer" } });

  const client = new TrueyyClient({ baseUrl: ctx.baseUrl, token: itv.body.token, role: "interviewer" });
  const pulses: unknown[] = [];
  client.on("risk-pulse", (e) => pulses.push(e));
  client.connect();
  await sleep(900); // connect + join-session

  // Trigger a genuine risk-pulse: an AI app in the pulse → categorizeApps fires
  // emitRiskPulse(sessionId, ...) to the room. participant_id just needs to be
  // a UUID for schema validation; the emit keys off the session, not it.
  const pulse = await api("POST", `/interview-sessions/${sessionId}/pulse`, {
    body: { participant_id: "00000000-0000-0000-0000-000000000000", apps: [{ app_name: "ChatGPT", window_title: "ChatGPT - Google Chrome" }] },
  });
  assert.equal(pulse.status, 200, `pulse accepted → ${JSON.stringify(pulse.body)}`);

  for (let i = 0; i < 50 && pulses.length === 0; i++) await sleep(100);
  client.disconnect();

  assert.ok(pulses.length >= 1, "client must RECEIVE the risk-pulse (proves it joined the room)");
  assert.match(JSON.stringify(pulses[0]), /detections|ChatGPT|AI/i);
});
