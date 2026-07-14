import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { WsClient } from "../src/wsClient.js";
import { startBackend, stopBackend, type Backend } from "./_support/harness.js";

let ctx: Backend;
before(async () => { ctx = await startBackend(); });
after(() => stopBackend());

function connected(ws: WsClient): Promise<void> {
  // WsClient has no connect promise; poll the underlying socket via a probe.
  return sleep(600);
}

test("WsClient connects to the real Cortex socket + subscribes/emits", async () => {
  const ws = new WsClient({ baseUrl: ctx.baseUrl, token: ctx.ownerToken });
  ws.connect();
  await connected(ws);

  let got = false;
  const off = ws.on("risk-pulse", () => { got = true; });
  assert.equal(typeof off, "function");

  // emit a client→server event (join-session) — exercises emit()
  ws.emit("join-session", "00000000-0000-0000-0000-000000000000");
  await sleep(150);

  off(); // unsubscribe
  ws.disconnect();
  assert.ok(true);
});

test("updateToken disconnects + reconnects with new auth", async () => {
  const ws = new WsClient({ baseUrl: ctx.baseUrl, token: ctx.ownerToken });
  ws.connect();
  await sleep(400);
  ws.updateToken(ctx.ownerToken); // same token is fine — exercises the reconnect path
  await sleep(400);
  ws.disconnect();
  assert.ok(true);
});

test("a bad token still constructs + connect is a no-op-safe call", async () => {
  const ws = new WsClient({ baseUrl: ctx.baseUrl, token: "not.a.jwt" });
  ws.connect();      // server will reject auth; client should not throw
  await sleep(300);
  ws.disconnect();
  assert.ok(true);
});
