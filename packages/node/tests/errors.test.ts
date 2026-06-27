import { test } from "node:test";
import assert from "node:assert/strict";
import {
  errorFromResponse,
  TrueyyError,
  TrueyyAuthError,
  TrueyyNotFoundError,
  TrueyyValidationError,
  TrueyyRateLimitError,
  TrueyyServerError,
} from "../src/errors.js";

test("status → error class mapping", () => {
  assert.ok(errorFromResponse(401, "r1", {}) instanceof TrueyyAuthError);
  assert.ok(errorFromResponse(404, "r1", {}) instanceof TrueyyNotFoundError);
  assert.ok(errorFromResponse(400, "r1", {}) instanceof TrueyyValidationError);
  assert.ok(errorFromResponse(429, "r1", {}) instanceof TrueyyRateLimitError);
  assert.ok(errorFromResponse(500, "r1", {}) instanceof TrueyyServerError);
  assert.ok(errorFromResponse(503, "r1", {}) instanceof TrueyyServerError);
});

test("unmapped status → base TrueyyError", () => {
  const e = errorFromResponse(418, "r1", {});
  assert.ok(e instanceof TrueyyError);
  assert.ok(!(e instanceof TrueyyAuthError));
});

test("carries status + requestId", () => {
  const e = errorFromResponse(404, "req-123", { error: "nope" });
  assert.equal(e.status, 404);
  assert.equal(e.requestId, "req-123");
});

test("extracts a message from { error }; other shapes fall back to generic", () => {
  assert.match(errorFromResponse(400, undefined, { error: "bad body" }).message, /bad body/);
  assert.match(errorFromResponse(400, undefined, { message: "ignored" }).message, /Request failed/);
  assert.match(errorFromResponse(400, undefined, "raw string").message, /Request failed/);
});

test("falls back to a generic message when body has none", () => {
  const e = errorFromResponse(500, undefined, {});
  assert.ok(e.message.length > 0);
});
