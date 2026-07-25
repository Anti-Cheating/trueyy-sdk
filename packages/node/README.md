# @trueyy/node

> Trueyy Server SDK for Node.js. Create interviews + rounds, mint session tokens, query reports, verify and process webhooks — from your ATS backend.

[![npm](https://img.shields.io/npm/v/@trueyy/node.svg)](https://www.npmjs.com/package/@trueyy/node)
[![types](https://img.shields.io/npm/types/@trueyy/node.svg)](https://www.npmjs.com/package/@trueyy/node)

> **The Trueyy SDK is two packages** — you'll use **both** for a full integration:
> **`@trueyy/node`** (backend, this one) mints tokens + handles webhooks, and
> **[`@trueyy/web`](https://www.npmjs.com/package/@trueyy/web)** (React frontend)
> embeds the live monitoring UI.

This package is for your **backend**. It holds your `tk_live_*` master API key, talks to `https://api.trueyy.com/v1/*`, and exposes:

- **Interviews** — create an interview + its first round, list, fetch, add more rounds, cancel.
- **Team** — invite interviewers, list members.
- **Billing** (read-only) — plans, current subscription, usage, invoices.
- **Reports** — pull the per-round analysis report after the interview.
- **Tokens** — mint short-lived browser JWTs for embedding the candidate/interviewer/helper UI.
- **Webhook verification** — Express-compatible middleware that validates `X-Trueyy-Signature`, rejects replays, and parses the event.

For your **frontend** (where the interviewer and candidate live), install [`@trueyy/web`](https://www.npmjs.com/package/@trueyy/web) instead.

---

## Install

```bash
npm install @trueyy/node
# or
pnpm add @trueyy/node
# or
yarn add @trueyy/node
```

Requires **Node ≥ 18** (native `fetch`, `AbortController`, `crypto`). ESM and CommonJS exports both supported.

---

## 60-second quick start

The end-to-end flow: **invite the interviewer → create an interview (with its first round) → mint a browser token per round/role → embed the frontend → receive webhooks → pull the report.**

### 1. Configure

```ts
import { Trueyy } from "@trueyy/node";

const trueyy = new Trueyy({
  apiKey: process.env.TRUEYY_API_KEY!,        // tk_live_… (production) or tk_test_… (sandbox)
});
```

> **Getting your API key:** Generate one in the Trueyy dashboard at
> [app.trueyy.com](https://app.trueyy.com) → **Settings → API Tokens**. API
> access is included on **Growth, annual Starter, and Enterprise** plans. If you
> don't see the API Tokens option, your plan doesn't include SDK access yet —
> [contact us](https://app.trueyy.com) to enable it.

### 2. Invite the interviewer

The interviewer must exist in your team before you can reference them on a round. Invite them, then look up their id in `members()`.

```ts
await trueyy.team.invite({ email: "bob@you.com", role: "Member" });

// After they accept, find their id:
const { members } = await trueyy.team.members();
const interviewer = members.find((m) => m.email === "bob@you.com")!;
```

### 3. Create an interview + its first round

```ts
const { id, round_id } = await trueyy.interviews.create({
  role: "Senior Backend Engineer",
  candidate_email: "alice@x.com",
  candidate_first_name: "Alice",
  candidate_last_name: "Doe",
  first_round: {
    round_name: "Technical Screen",
    interviewer_user_id: interviewer.id,           // from team.members()
    scheduled_start_at: "2026-06-04T10:00:00Z",    // ISO 8601
    scheduled_end_at:   "2026-06-04T11:00:00Z",    // ISO 8601
    timezone: "UTC",
    meeting_link: "https://zoom.us/j/123456789",   // required
  },
});

// → { id: "<interview id>", round_id: "<first round id>" }
```

Persist `id` and `round_id` in your DB. The `round_id` is the handle for tokens and reports.

### 4. Mint browser tokens

Mint a short-lived JWT per round + role and hand each to the right browser tab.

```ts
const candidate    = await trueyy.tokens.mint(round_id, "candidate");
const interviewerT = await trueyy.tokens.mint(round_id, "interviewer");
const helper       = await trueyy.tokens.mint(round_id, "helper");

// each → { token, expires_at, role }
```

- `candidate.token` → the candidate's pre-join page
- `interviewerT.token` → the interviewer's monitoring page
- `helper.token` → handed to the local Helper daemon via `@trueyy/web-core`'s `helperJoin`

The frontend uses these with [`@trueyy/web`](https://www.npmjs.com/package/@trueyy/web).

### 5. Receive webhook events

```ts
import express from "express";

app.post(
  "/webhooks/trueyy",
  express.raw({ type: "application/json" }),         // raw body required for HMAC
  trueyy.webhooks.verify(process.env.TRUEYY_WEBHOOK_SECRET!),
  (req, res) => {
    const { event_type, event_id, data } = req.trueyy!.event;
    // ... persist event, idempotency-check on event_id ...
    res.sendStatus(200);
  }
);
```

### 6. Pull the report

```ts
const report = await trueyy.reports.get(round_id);
```

That's the whole integration.

---

## Configuration

```ts
new Trueyy({
  apiKey: string,                  // REQUIRED — tk_live_… or tk_test_…
  baseUrl?: string,                // default: "https://api.trueyy.com"
  timeout?: number,                // default: 10_000 (ms)
  fetchImpl?: typeof fetch,        // default: globalThis.fetch
});
```

Override `baseUrl` only for self-hosted deployments. Override `fetchImpl` to inject a polyfill or instrumentation (e.g. `undici`, OpenTelemetry-wrapped fetch).

---

## Interviews API

An **interview** is the parent process; it owns one or more ordered **rounds** (different interviewers / days). This is the same model the Trueyy dashboard uses.

### `trueyy.interviews.create(input)`

Creates an interview and its first round in one call.

```ts
const { id, round_id } = await trueyy.interviews.create({
  role: string,
  description?: string | null,
  candidate_email: string,
  candidate_first_name: string,
  candidate_last_name: string,
  first_round: {
    round_name: string,
    interviewer_user_id: string,    // must pre-exist (team.invite → team.members)
    scheduled_start_at: string,     // ISO 8601
    scheduled_end_at: string,       // ISO 8601
    timezone: string,
    meeting_link: string,           // required (zoom / meet / teams)
  },
});
// → { id: string, round_id: string }
```

### `trueyy.interviews.list(query?)`

```ts
const page = await trueyy.interviews.list({
  limit?: number,
  offset?: number,
  search?: string,
});
// → { items: Interview[], total: number }
```

### `trueyy.interviews.get(id)`

Returns the interview with its `rounds[]`.

```ts
const interview = await trueyy.interviews.get(id);
// interview.rounds → RoundSummary[] (each has id, round_name, round_order,
//   status, interviewer, analysis)
```

### `trueyy.interviews.addRound(id, round)`

Add another round (different interviewer / day) to an existing interview. The returned `round_id` is what you pass to `tokens.mint` and `reports.get`.

```ts
const { round_id, round_order } = await trueyy.interviews.addRound(id, {
  round_name: "System Design",
  interviewer_user_id: anotherInterviewer.id,
  scheduled_start_at: "2026-06-06T10:00:00Z",
  scheduled_end_at:   "2026-06-06T11:00:00Z",
  timezone: "UTC",
  meeting_link: "https://zoom.us/j/987654321",
});
// → { round_id: string, round_order: number }
```

### `trueyy.interviews.cancel(id)`

Cancel an interview.

```ts
await trueyy.interviews.cancel(id);
```

---

## Team API

### `trueyy.team.invite({ email, role })`

Invite a teammate (e.g. an interviewer). They accept via email, then appear in `members()` with an id you reference as `interviewer_user_id`.

```ts
await trueyy.team.invite({ email: "bob@you.com", role: "Member" });
// role: "Admin" | "Member"
// → { id, email, role }
```

### `trueyy.team.members()`

```ts
const { members } = await trueyy.team.members();
// members → Member[] (id, email, first_name, last_name, role)
```

### `trueyy.team.invites(query?)`

List pending invites.

```ts
await trueyy.team.invites({ limit?: number, offset?: number });
```

---

## Billing API (read-only)

Billing is **read-only**. Plan upgrade / subscribe / cancel are intentionally **not** in the SDK — those happen in the Trueyy dashboard.

```ts
await trueyy.billing.plans();         // available plans
await trueyy.billing.subscription();  // current subscription
await trueyy.billing.invoices();      // invoice history
await trueyy.billing.usage();         // usage this period
```

---

## Reports API

### `trueyy.reports.get(roundId)`

`roundId` is the round's session id — from `interviews.create` → `round_id`, `interviews.addRound` → `round_id`, or an interview's `rounds[].id`.

```ts
const report = await trueyy.reports.get(round_id);
// → Report (the round's analysis)
```

---

## Tokens API

### `trueyy.tokens.mint(roundId, role)`

Mint a short-lived browser JWT for a round so you can embed `<TrueyyJoin>` / `<TrueyyMonitor>` in your own UI without a Trueyy login.

```ts
const { token, expires_at, role } = await trueyy.tokens.mint(
  round_id,
  "candidate"    // "candidate" | "interviewer" | "helper"
);
```

Mint a fresh token whenever the previous one nears expiry; the browser-side client (`@trueyy/web-core`) calls back to your backend to fetch one via this method.

---

## Webhooks

### `trueyy.webhooks.verify(secret)`

Returns Express-compatible middleware. Validates `X-Trueyy-Signature` (HMAC-SHA256 over `t.rawBody`), rejects replays (timestamp > 5 min old), parses the body, and attaches `req.trueyy.event`. Mount it **after** `express.raw()` so the raw bytes are available for HMAC.

```ts
import express from "express";

app.post(
  "/webhooks/trueyy",
  express.raw({ type: "application/json" }),       // MUST come first — raw bytes for HMAC
  trueyy.webhooks.verify(WEBHOOK_SECRET),
  async (req, res) => {
    const event = req.trueyy!.event;
    // event = { event_id, event_type, created_at, api_version, data }

    // 1. Idempotency check on event_id
    if (await alreadySeen(event.event_id)) return res.sendStatus(200);

    // 2. Dispatch by event_type
    switch (event.event_type) {
      case "session.ended":
        await persistFinalReport(event.data);
        break;
      case "session.risk_pulse":
        await alertsPipeline.push(event.data);
        break;
      // ... etc
    }

    // 3. Acknowledge — anything non-2xx triggers Trueyy's retry chain.
    res.sendStatus(200);
  }
);
```

The middleware responds `401` on missing/invalid signature or missing `x-trueyy-event-id` / `x-trueyy-event-type` headers, and `400` if the raw body is unavailable or not JSON.

### Event catalog

Every event shares the envelope `{ event_id, event_type, created_at, api_version, data }`.

| `event_type` | Fires when | Sample `data` shape |
|---|---|---|
| `session.ready` | Candidate + helper online and ready | `{ session_id, ... }` |
| `session.transcript_segment` | A final transcript fragment is produced | `{ session_id, speaker, text, started_at, ended_at }` |
| `session.risk_pulse` | A risk alert fires (AI tool detected, paste threshold) | `{ session_id, kind, severity, evidence }` |
| `session.window_result` | A 30-second analysis window completes | `{ session_id, window_id, risk, score, summary, modality_breakdown }` |
| `session.image_analysis_result` | Vision LLM completes screenshot analysis | `{ session_id, image_id, risk, findings }` |
| `session.ended` | A round moves to ENDED (any path) | `{ session_id, ... }` |
| `session.report_ready` | The round's analysis report is generated | `{ session_id, ... }` |
| `session.cancelled` | Cancelled before start | `{ session_id, ... }` |

### Delivery guarantees

- **At-least-once** delivery within ~15 hours.
- **Exactly-once on your side** via `event_id` idempotency.
- Retry schedule: `1m → 5m → 30m → 2h → 12h` then dead-lettered.
- After 50 consecutive failures, your endpoint auto-disables and we email the admin.
- Re-fire dead-lettered events from the Trueyy dashboard (preserves original `event_id`).

---

## Errors

All HTTP errors are typed. Catch the base `TrueyyError` to handle all of them, or specific subclasses for finer control.

```ts
import {
  TrueyyAuthError,
  TrueyyNotFoundError,
  TrueyyValidationError,
  TrueyyRateLimitError,
  TrueyyServerError,
  TrueyyError,
} from "@trueyy/node";

try {
  await trueyy.interviews.create(input);
} catch (err) {
  if (err instanceof TrueyyAuthError)       { /* 401 — rotate token */ }
  if (err instanceof TrueyyNotFoundError)   { /* 404 — missing resource */ }
  if (err instanceof TrueyyValidationError) { /* 400 — fix input */ }
  if (err instanceof TrueyyRateLimitError)  { /* 429 — back off */ }
  if (err instanceof TrueyyServerError)     { /* 5xx — retry later */ }
}
```

Every error carries:

```ts
err.status      // HTTP status code
err.requestId   // X-Trueyy-Request-Id — quote this in support tickets
err.body        // parsed response body if any
err.message     // human-readable
```

**Retry policy at the transport layer:** idempotent GETs are retried once on network failure. POSTs are **never** auto-retried.

---

## TypeScript

Full types ship with the package (`./dist/index.d.ts`). Useful exports:

```ts
import type {
  // Request shapes
  CreateInterviewInput,
  RoundInput,
  Person,
  // Response shapes
  Interview,
  RoundSummary,
  Member,
  Report,
  RefreshedToken,
  Page,
  // Metadata
  SessionStatus,        // "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED"
  SessionRole,          // "candidate" | "interviewer" | "helper"
  // Webhook
  WebhookEvent,
  WebhookEventType,
} from "@trueyy/node";
```

---

## Versioning & compatibility

V1 contract is **frozen** — additive changes only. Breaking changes will ship under `@trueyy/node@2` against a future `/v2/*` API.

---

## License

[MIT](../../LICENSE) © Trueyy

Issues, PRs, and discussions: [github.com/Anti-Cheating/trueyy-sdk](https://github.com/Anti-Cheating/trueyy-sdk)
