import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { TrueyyClient } from "../src/client.js";

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;
}

/**
 * Regression test for the room-join bug: Cortex broadcasts every monitoring
 * event to `session:{id}`, and a socket only joins that room by emitting
 * `join-session`. If TrueyyClient connects but never emits it, <TrueyyMonitor>
 * receives nothing. This stands up a REAL socket.io server and asserts the
 * client emits `join-session` with the session id from the token's `sub`.
 */
test("TrueyyClient emits join-session with the JWT sub on connect", async () => {
  const http: HttpServer = createServer();
  const io = new Server(http, { cors: { origin: "*" } });
  let joined: string | null = null;
  io.on("connection", (socket) => {
    socket.on("join-session", (id: string) => { joined = id; });
  });
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as AddressInfo).port;

  const client = new TrueyyClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token: jwt({ sub: "round-xyz", aud: "interviewer" }),
    role: "interviewer",
  });
  client.connect();
  await sleep(700);
  client.disconnect();
  io.close();
  http.close();

  assert.equal(joined, "round-xyz", "client must emit join-session with the session id from the token");
});
