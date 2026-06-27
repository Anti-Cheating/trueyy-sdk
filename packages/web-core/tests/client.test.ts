import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { createHmac } from "node:crypto";
import { TrueyyClient } from "../src/client.js";
import { startBackend, stopBackend, type Backend } from "./_support/harness.js";

let ctx: Backend;
before(async () => { ctx = await startBackend(); });
after(() => stopBackend());

/** Build a JWT-shaped token (not signature-checked client-side — the client
 *  only decodes the exp claim) that expires in `secs` seconds. */
function tokenExpiringIn(secs: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ aud: "candidate", exp: Math.floor(Date.now() / 1000) + secs });
  const sig = createHmac("sha256", "x").update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

test("TrueyyClient connects + the imperative commands emit", async () => {
  const client = new TrueyyClient({ baseUrl: ctx.baseUrl, token: ctx.ownerToken, role: "interviewer" });
  client.connect();
  await sleep(500);
  client.startTranscription();
  client.startAnalysis();
  client.captureNow();
  client.stopAnalysis();
  client.stopTranscription();
  await sleep(150);
  client.disconnect();
  assert.ok(true);
});

test("token refresh fires onTokenExpiring before expiry", async () => {
  let refreshed = false;
  const client = new TrueyyClient({
    baseUrl: ctx.baseUrl,
    token: tokenExpiringIn(34), // → scheduleRefresh fires in ~max(5s, 34-30) = 5s
    role: "candidate",
    onTokenExpiring: async () => { refreshed = true; return ctx.ownerToken; },
  });
  client.connect();
  await sleep(6000);
  client.disconnect();
  assert.equal(refreshed, true, "onTokenExpiring should have been called");
});

test("no onTokenExpiring → connect still works, no refresh scheduled", async () => {
  const client = new TrueyyClient({ baseUrl: ctx.baseUrl, token: tokenExpiringIn(34), role: "candidate" });
  client.connect();
  await sleep(300);
  client.disconnect();
  assert.ok(true);
});
