import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { consentApi, TrueyyConsentError } from "../src/consent.js";
import { TrueyyClient } from "../src/client.js";

// A minimal stub of Cortex's four consent endpoints. Records every request
// (method, path, auth header, body) so tests can assert exactly what the
// SDK sends, and can be told to return a specific status/body per case.
interface Recorded { method: string; path: string; auth: string | undefined; body: unknown }
let server: http.Server;
let baseUrl: string;
const recorded: Recorded[] = [];
let nextResponse: { status: number; body: unknown } = { status: 200, body: { data: { ok: true } } };

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;
}

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      recorded.push({
        method: req.method!,
        path: req.url!,
        auth: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      });
      res.statusCode = nextResponse.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(nextResponse.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());
beforeEach(() => { recorded.length = 0; nextResponse = { status: 200, body: { data: { ok: true } } }; });

test("consentApi.text GETs consent-text with the Bearer token", async () => {
  nextResponse = { status: 200, body: { data: { version: "1.0", body: "we record...", consented: false, consent_id: null } } };
  const out = await consentApi.text(baseUrl, "tok-123", "sess-1");
  assert.equal(out.version, "1.0");
  assert.equal(out.consented, false);
  assert.deepEqual(recorded[0], {
    method: "GET", path: "/interview-sessions/sess-1/consent-text",
    auth: "Bearer tok-123", body: undefined,
  });
});

test("consentApi.grant POSTs the version in the body", async () => {
  nextResponse = { status: 201, body: { data: { id: "c-1", given_at: "2026-07-05T00:00:00Z" } } };
  const out = await consentApi.grant(baseUrl, "tok-123", "sess-1", "1.0");
  assert.equal(out.id, "c-1");
  assert.equal(recorded[0].method, "POST");
  assert.equal(recorded[0].path, "/interview-sessions/sess-1/consent");
  assert.deepEqual(recorded[0].body, { version: "1.0" });
});

test("consentApi.decline and .revoke POST with no body", async () => {
  await consentApi.decline(baseUrl, "tok-123", "sess-1");
  await consentApi.revoke(baseUrl, "tok-123", "sess-1");
  assert.equal(recorded[0].path, "/interview-sessions/sess-1/consent/decline");
  assert.equal(recorded[1].path, "/interview-sessions/sess-1/consent/revoke");
  assert.ok(recorded.every((r) => r.method === "POST"));
});

test("a non-2xx maps to TrueyyConsentError carrying the server error code", async () => {
  nextResponse = { status: 409, body: { error: "stale_text", current_version: "1.1" } };
  await assert.rejects(
    () => consentApi.grant(baseUrl, "tok-123", "sess-1", "1.0"),
    (err: unknown) => {
      assert.ok(err instanceof TrueyyConsentError);
      assert.equal(err.status, 409);
      assert.equal(err.code, "stale_text");
      return true;
    },
  );
});

test("TrueyyClient.consent.* uses the token's session id (sub claim)", async () => {
  const token = jwt({ sub: "sess-42", role: "candidate", tid: "co-1" });
  const client = new TrueyyClient({ baseUrl, token, role: "candidate" });
  nextResponse = { status: 200, body: { data: { version: "1.0", body: "x", consented: true, consent_id: "c-9" } } };
  const text = await client.consent.text();
  assert.equal(text.consent_id, "c-9");
  // Path carries the sub from the JWT, not passed explicitly.
  assert.equal(recorded[0].path, "/interview-sessions/sess-42/consent-text");
  assert.equal(recorded[0].auth, `Bearer ${token}`);
});
