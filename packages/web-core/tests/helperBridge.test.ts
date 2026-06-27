import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  detectHelper,
  helperJoin,
  helperJoinedMeeting,
  helperLeave,
  helperStatus,
  HELPER_DOWNLOAD_URL_MAC,
  HELPER_DOWNLOAD_URL_WIN,
} from "../src/helperBridge.js";

const PORT = 48123;
let server: http.Server | null = null;
let mode: "ok" | "fail" = "ok";
const calls: string[] = [];

function startDaemon(): Promise<void> {
  server = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (mode === "fail" && req.url !== "/health") { res.statusCode = 500; res.end("err"); return; }
    res.setHeader("content-type", "application/json");
    if (req.url === "/session/status") { res.end(JSON.stringify({ running: true, session_id: "s1" })); return; }
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((resolve) => server!.listen(PORT, "127.0.0.1", () => resolve()));
}

test("detectHelper is false when no daemon is running", async () => {
  // (server not started yet)
  assert.equal(await detectHelper(800), false);
});

test("download URL constants are .dmg / .exe", () => {
  assert.match(HELPER_DOWNLOAD_URL_MAC, /\.dmg$/);
  assert.match(HELPER_DOWNLOAD_URL_WIN, /\.exe$/);
});

test("full bridge against a real local daemon", async () => {
  await startDaemon();
  assert.equal(await detectHelper(1500), true);

  const join = await helperJoin({ helperToken: "eyJ.helper.token", cortexUrl: "http://127.0.0.1:9999", sessionId: "s1", features: { transcripts: true } });
  assert.equal(join.ok, true);

  assert.equal(await helperJoinedMeeting("s1"), true);
  assert.equal(await helperLeave("s1"), true);

  const status = await helperStatus();
  assert.ok(status && (status as { running?: boolean }).running === true);

  assert.ok(calls.some((c) => c.includes("/session/join")));
});

test("helperJoin reports failure when the daemon errors", async () => {
  mode = "fail";
  const res = await helperJoin({ helperToken: "x", cortexUrl: "http://127.0.0.1:9999", sessionId: "s1" });
  assert.equal(res.ok, false);
  mode = "ok";
});

after(() => { if (server) server.close(); });
