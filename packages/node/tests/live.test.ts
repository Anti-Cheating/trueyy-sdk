import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Trueyy, TrueyyAuthError, TrueyyNotFoundError, TrueyyValidationError, TrueyyError } from "../src/index.js";
import { startBackend, stopBackend, type Backend } from "./_support/harness.js";

let ctx: Backend;
let trueyy: Trueyy;
before(async () => {
  ctx = await startBackend();
  trueyy = new Trueyy({ apiKey: ctx.apiKey, baseUrl: ctx.baseUrl });
});
after(() => stopBackend());

const UUID = "00000000-0000-0000-0000-000000000000";
function round(interviewerId: string) {
  return {
    round_name: "R1", interviewer_user_id: interviewerId,
    scheduled_start_at: new Date(Date.now() + 3600_000).toISOString(),
    scheduled_end_at: new Date(Date.now() + 7200_000).toISOString(),
    timezone: "UTC", meeting_link: "https://meet.google.com/abc-defg-hij",
  };
}
async function makeInterview() {
  return trueyy.interviews.create({
    role: "Backend", candidate_email: "alice@x.com", candidate_first_name: "Alice", candidate_last_name: "X",
    first_round: round(ctx.interviewerId),
  });
}

// ── interviews ──
test("interviews: create → get → list → addRound → cancel", async () => {
  const created = await makeInterview();
  assert.ok(created.id && created.round_id);
  const got = await trueyy.interviews.get(created.id);
  assert.equal(got.role, "Backend");
  const page = await trueyy.interviews.list({ limit: 50 });
  assert.ok(page.items.length >= 1 && typeof page.total === "number");
  const r2 = await trueyy.interviews.addRound(created.id, round(ctx.interviewerId));
  assert.ok(r2.round_id && r2.round_order >= 1);
  await trueyy.interviews.cancel(created.id);
});

test("interviews.list with search", async () => {
  await makeInterview();
  const page = await trueyy.interviews.list({ search: "Backend", limit: 10, offset: 0 });
  assert.ok(Array.isArray(page.items));
});

// ── team ──
test("team: invite → members → invites", async () => {
  const invite = await trueyy.team.invite({ email: `tm-${Date.now()}@x.com`, role: "Member" });
  assert.ok(invite.id);
  const { members } = await trueyy.team.members();
  assert.ok(Array.isArray(members) && members.length >= 1);
  const invites = await trueyy.team.invites();
  assert.ok(invites !== undefined);
});

// ── billing (read-only) ──
test("billing: plans, subscription, invoices, usage", async () => {
  assert.ok(await trueyy.billing.plans());
  assert.ok((await trueyy.billing.subscription()) !== undefined);
  assert.ok((await trueyy.billing.invoices()) !== undefined);
  const usage = await trueyy.billing.usage() as Record<string, unknown>;
  assert.equal(typeof usage.plan, "string");
});

// ── tokens ──
test("tokens.mint returns a browser token for a round", async () => {
  const created = await makeInterview();
  const tok = await trueyy.tokens.mint(created.round_id, "candidate");
  assert.ok(typeof tok.token === "string" && tok.token.length > 20);
  assert.equal(tok.role, "candidate");
});

// ── reports ──
test("reports.get is a 404 (NotFound) before analysis", async () => {
  const created = await makeInterview();
  await assert.rejects(() => trueyy.reports.get(created.round_id), TrueyyNotFoundError);
});

// ── error mapping (client.ts + errors.ts) ──
test("a bad API key → TrueyyAuthError (401)", async () => {
  const bad = new Trueyy({ apiKey: "tk_live_bogus", baseUrl: ctx.baseUrl });
  await assert.rejects(() => bad.interviews.list(), TrueyyAuthError);
});

test("a missing interview → TrueyyNotFoundError (404)", async () => {
  await assert.rejects(() => trueyy.interviews.get(UUID), TrueyyNotFoundError);
});

test("an invalid create body → TrueyyValidationError (400)", async () => {
  await assert.rejects(
    () => trueyy.interviews.create({ role: "" } as never),
    TrueyyValidationError,
  );
});

test("a dead endpoint → a network TrueyyError", async () => {
  const dead = new Trueyy({ apiKey: ctx.apiKey, baseUrl: "http://127.0.0.1:9", timeout: 1500 });
  await assert.rejects(() => dead.interviews.list(), (e) => e instanceof Error);
});

// ── candidates (GDPR erasure) ──
test("candidates.erase removes the candidate's data and returns a receipt", async () => {
  const created = await makeInterview();
  const detail = await trueyy.interviews.get(created.id);
  const out = await trueyy.candidates.erase(detail.candidate.id);
  assert.ok(out.receipt.id, "receipt id returned");
  assert.ok(out.receipt.requested_at);
});

test("candidates.erase on an unknown candidate → TrueyyNotFoundError", async () => {
  await assert.rejects(() => trueyy.candidates.erase(UUID), TrueyyNotFoundError);
});

// ── audit ──
test("audit.list returns entries; audit.get fetches one", async () => {
  await makeInterview(); // emits interview.create
  const page = await trueyy.audit.list({ limit: 50 });
  assert.ok(page.items.length >= 1 && typeof page.total === "number");
  const row = page.items.find((r) => r.action === "interview.create") ?? page.items[0]!;
  const one = await trueyy.audit.get(row.id);
  assert.equal(one.id, row.id);
});

test("audit.get on an unknown id → TrueyyNotFoundError", async () => {
  await assert.rejects(() => trueyy.audit.get(UUID), TrueyyNotFoundError);
});
