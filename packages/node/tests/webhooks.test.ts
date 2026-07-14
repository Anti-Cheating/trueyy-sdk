import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { Trueyy } from "../src/index.js";

const SECRET = "whsec_test_abc";

/** A real HTTP receiver mounting the SDK's webhook-verify middleware. */
function startReceiver(): Promise<{ url: string; close: () => void; last: () => unknown }> {
  const mw = new Trueyy({ apiKey: "tk_test_x" }).webhooks.verify(SECRET);
  let last: unknown = null;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      (req as unknown as { body: Buffer }).body = Buffer.concat(chunks);
      mw(req as never, res as never, () => {
        last = (req as unknown as { trueyy?: { event: unknown } }).trueyy?.event;
        res.statusCode = 200;
        res.end("ok");
      });
    });
  });
  return new Promise((resolve) => server.listen(0, () => {
    const { port } = server.address() as AddressInfo;
    resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close(), last: () => last });
  }));
}

function sigHeader(body: string, atSec = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", SECRET).update(`${atSec}.${body}`).digest("hex");
  return `t=${atSec},v1=${v1}`;
}
function post(url: string, body: string, headers: Record<string, string>) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
}

test("valid signed webhook passes + parses the event", async () => {
  const rcv = await startReceiver();
  const body = JSON.stringify({ event_type: "session.ended", data: { session_id: "s1" } });
  const res = await post(rcv.url, body, {
    "x-trueyy-signature": sigHeader(body), "x-trueyy-event-id": "evt_1", "x-trueyy-event-type": "session.ended",
  });
  assert.equal(res.status, 200);
  assert.deepEqual((rcv.last() as { data: unknown }).data, { session_id: "s1" });
  rcv.close();
});

test("a tampered body is rejected (401)", async () => {
  const rcv = await startReceiver();
  const body = JSON.stringify({ a: 1 });
  const res = await post(rcv.url, JSON.stringify({ a: 2 }), {
    "x-trueyy-signature": sigHeader(body), "x-trueyy-event-id": "evt_2", "x-trueyy-event-type": "session.ended",
  });
  assert.equal(res.status, 401);
  rcv.close();
});

test("missing headers → 401", async () => {
  const rcv = await startReceiver();
  const res = await post(rcv.url, "{}", {});
  assert.equal(res.status, 401);
  rcv.close();
});

test("an old timestamp (replay) → 401", async () => {
  const rcv = await startReceiver();
  const body = JSON.stringify({ a: 1 });
  const old = Math.floor(Date.now() / 1000) - 1000;
  const res = await post(rcv.url, body, {
    "x-trueyy-signature": sigHeader(body, old), "x-trueyy-event-id": "evt_3", "x-trueyy-event-type": "session.ended",
  });
  assert.equal(res.status, 401);
  rcv.close();
});

test("valid signature but non-JSON body → 400", async () => {
  const rcv = await startReceiver();
  const body = "not json";
  const res = await post(rcv.url, body, {
    "x-trueyy-signature": sigHeader(body), "x-trueyy-event-id": "evt_4", "x-trueyy-event-type": "session.ended",
  });
  assert.equal(res.status, 400);
  rcv.close();
});
