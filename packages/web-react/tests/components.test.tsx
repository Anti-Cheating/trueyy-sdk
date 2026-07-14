import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, getByText, queryByText, cleanup, click, waitFor } from "./_support/render.js";
import {
  TrueyyProvider,
  useTrueyyClient,
  TrueyyMonitor,
  TrueyyJoin,
  TrueyyReplay,
  useRiskStream,
  useWindowResults,
  useTranscriptStream,
} from "../src/index.js";

afterEach(() => cleanup());

// A JWT-shaped token (client only decodes the aud + exp claims — never verifies
// the signature browser-side). No live socket server is needed: TrueyyClient's
// connect() is fire-and-forget, so the components render for real regardless.
function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;
}
const BASE = "http://127.0.0.1:9"; // nothing listening — connect fails silently

test("TrueyyProvider exposes a client through context + derives the role from the JWT aud", () => {
  let client: unknown = null;
  function Probe() { client = useTrueyyClient(); return <div>ok</div>; }
  render(
    <TrueyyProvider token={jwt({ aud: "interviewer" })} baseUrl={BASE}>
      <Probe />
    </TrueyyProvider>,
  );
  assert.ok(client, "client is available via useTrueyyClient");
  assert.ok(getByText("ok"));
});

test("TrueyyMonitor renders all panels + the Capture button works", () => {
  render(
    <TrueyyProvider token={jwt({ aud: "interviewer" })} baseUrl={BASE} theme={{ primary: "#123456" }}>
      <TrueyyMonitor onRiskAlert={() => {}} />
    </TrueyyProvider>,
  );
  assert.ok(getByText("Risk pulses"));
  assert.ok(getByText("No alerts yet."));
  assert.ok(getByText("Window analysis"));
  assert.ok(getByText("Transcript"));
  click(getByText("Capture now")); // → client.captureNow(); must not throw
});

test("the stream hooks start empty inside the provider", () => {
  let risks: unknown[] = [-1 as never];
  let windows: unknown[] = [-1 as never];
  let transcript: unknown[] = [-1 as never];
  function Probe() {
    risks = useRiskStream();
    windows = useWindowResults();
    transcript = useTranscriptStream();
    return <div />;
  }
  render(
    <TrueyyProvider token={jwt({ aud: "interviewer" })} baseUrl={BASE}>
      <Probe />
    </TrueyyProvider>,
  );
  assert.deepEqual(risks, []);
  assert.deepEqual(windows, []);
  assert.deepEqual(transcript, []);
});

test("TrueyyJoin gates on consent first — a candidate sees the consent screen, not the join steps", () => {
  render(
    <TrueyyProvider token={jwt({ aud: "candidate" })} baseUrl={BASE}>
      <TrueyyJoin meetingUrl="https://meet.google.com/abc-defg-hij" onReady={() => {}} />
    </TrueyyProvider>,
  );
  // Consent (GDPR Art. 7) blocks the helper flow — the join steps must NOT
  // render until consent is given.
  assert.ok(getByText("Interview monitoring consent"));
  assert.equal(queryByText("Join your interview"), null);
  assert.equal(queryByText("Install the helper"), null);
});

test("TrueyyJoin with consentHandledExternally skips the consent UI and shows the 3-step flow", async () => {
  render(
    <TrueyyProvider token={jwt({ aud: "candidate" })} baseUrl={BASE}>
      <TrueyyJoin meetingUrl="https://meet.google.com/abc-defg-hij" consentHandledExternally onReady={() => {}} />
    </TrueyyProvider>,
  );
  // Host ATS owns consent → built-in consent UI hidden, join steps render.
  assert.ok(getByText("Join your interview"));
  assert.ok(getByText("Install the helper"));
  assert.equal(queryByText("Interview monitoring consent"), null);
  // detectHelper() polls 127.0.0.1:48123 — nothing there → "Download for Mac"
  await waitFor(() => assert.ok(getByText("Download for Mac")), { timeout: 6000 });
});

test("TrueyyJoin renderConsent lets the host replace the built-in consent UI", () => {
  render(
    <TrueyyProvider token={jwt({ aud: "candidate" })} baseUrl={BASE}>
      <TrueyyJoin
        meetingUrl="https://meet.google.com/abc-defg-hij"
        renderConsent={(c) => <div>custom consent status={c.status}</div>}
        onReady={() => {}}
      />
    </TrueyyProvider>,
  );
  assert.ok(getByText(/custom consent/));
  assert.equal(queryByText("Interview monitoring consent"), null);
});

test("TrueyyJoin does NOT gate an interviewer on consent", async () => {
  render(
    <TrueyyProvider token={jwt({ aud: "interviewer" })} baseUrl={BASE}>
      <TrueyyJoin meetingUrl="https://meet.google.com/abc-defg-hij" onReady={() => {}} />
    </TrueyyProvider>,
  );
  // Interviewer streams aren't consent-gated → straight to the join steps.
  assert.ok(getByText("Join your interview"));
  assert.equal(queryByText("Interview monitoring consent"), null);
});

test("TrueyyReplay fetches + renders the session detail", async () => {
  const detail = {
    session_id: "s1",
    title: "Final round — Alice",
    status: "ENDED",
    transcripts: [{ speaker_role: "candidate" as const, text: "Here is my solution.", captured_at: new Date().toISOString() }],
    detections: [{ categoryLabel: "AI Assistant", riskLevel: "CRITICAL", apps: ["ChatGPT"], occurred_at: new Date().toISOString() }],
    windows: [{ risk: "high", score: 80, summary: "Pasted code", start_time: new Date().toISOString() }],
  };
  render(<TrueyyReplay sessionId="s1" fetchSessionDetail={async () => detail} />);
  await waitFor(() => assert.ok(getByText("Final round — Alice")), { timeout: 4000 });
  assert.ok(getByText(/Here is my solution/));
  // corrected shapes must render: detection categoryLabel + speaker_role
  assert.ok(getByText(/AI Assistant/), "renders detection categoryLabel");
  assert.ok(getByText(/candidate:/), "renders transcript speaker_role");
});

test("TrueyyReplay shows an error when the fetch rejects", async () => {
  render(<TrueyyReplay sessionId="s1" fetchSessionDetail={async () => { throw new Error("boom"); }} />);
  await waitFor(() => assert.ok(getByText(/boom|Error/)), { timeout: 4000 });
});
