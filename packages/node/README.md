# @trueyy/node

> Trueyy Server SDK for Node.js. Mint session tokens, query sessions, verify and process webhooks — from your ATS backend.

[![npm](https://img.shields.io/npm/v/@trueyy/node.svg)](https://www.npmjs.com/package/@trueyy/node)
[![types](https://img.shields.io/npm/types/@trueyy/node.svg)](https://www.npmjs.com/package/@trueyy/node)

This package is for your **backend**. It holds your `tk_live_*` master API key, talks to `https://api.trueyy.com/v1/*`, and exposes:

- **Session orchestration** — create, fetch, list, end, cancel, refresh tokens.
- **Reports** — pull the final risk report after the interview.
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

## 30-second quick start

### 1. Configure

```ts
import { Trueyy } from "@trueyy/node";

const trueyy = new Trueyy({
  apiKey: process.env.TRUEYY_API_KEY!,        // tk_live_… (production) or tk_test_… (sandbox)
});
```

### 2. Schedule an interview

```ts
const session = await trueyy.sessions.create({
  external_id: "acme-interview-42",            // YOUR ID — keep this for idempotency
  candidate:   { email: "alice@x.com",  first_name: "Alice", last_name: "Doe" },
  interviewer: { email: "bob@you.com",  first_name: "Bob",   last_name: "Smith" },
  scheduled_start_at: "2026-06-04T10:00:00Z",
  scheduled_end_at:   "2026-06-04T11:00:00Z",
  meeting_url: "https://zoom.us/j/123456789",
});

// → { session_id, candidate_token, interviewer_token, helper_token, ... }
```

### 3. Hand the tokens off to your frontend

Persist `session.session_id` in your DB keyed by your `external_id`, then return the right JWT to the right browser tab:

- `candidate_token` → the candidate's pre-join page
- `interviewer_token` → the interviewer's monitoring page

The frontend uses these with [`@trueyy/web`](https://www.npmjs.com/package/@trueyy/web)'s `<TrueyyProvider>`.

### 4. Receive webhook events

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

Override `baseUrl` only for self-hosted V2 deployments. Override `fetchImpl` to inject a polyfill or instrumentation (e.g. `undici`, OpenTelemetry-wrapped fetch).

---

## Sessions API

### `trueyy.sessions.create(input)`

Schedules an interview. **Idempotent** on `(your_tenant, external_id)` — POSTing the same `external_id` twice returns the **same** session instead of creating a duplicate.

```ts
const session: CreatedSession = await trueyy.sessions.create({
  external_id: "acme-int-42",
  candidate:   { email, first_name, last_name },
  interviewer: { email, first_name, last_name },
  scheduled_start_at: ISO_DATE,
  scheduled_end_at:   ISO_DATE,
  meeting_url?: string,
  title?: string,
  description?: string,
  timezone?: string,                // default: "UTC"
  features?: { ai_apps?: boolean, paste_detection?: boolean, ... },
});
```

Returns:

```ts
{
  session_id: "ses_…",
  external_id: "acme-int-42",
  candidate_token:    "<5-min JWT>",
  interviewer_token:  "<5-min JWT>",
  helper_token:       "<session-long JWT, capped at scheduled_end_at + 2h>",
  candidate_token_expires_at:   "2026-06-04T10:05:00Z",
  interviewer_token_expires_at: "2026-06-04T10:05:00Z",
  helper_token_expires_at:      "2026-06-04T13:00:00Z",
  status: "SCHEDULED",
  scheduled_start_at, scheduled_end_at,
  created: true,    // false if this was an idempotent replay
}
```

### `trueyy.sessions.get(id)`

```ts
const session: Session = await trueyy.sessions.get(sessionId);
```

### `trueyy.sessions.list(filter)`

Paginated list. Cursor-based.

```ts
const { sessions, next_cursor } = await trueyy.sessions.list({
  limit: 50,                       // 1..100, default 20
  cursor: prevCursor,              // optional, for next page
  status: "ACTIVE",                // optional filter
});
```

### `trueyy.sessions.end(id)`

Force-end an ACTIVE session. Idempotent — returns 404 if already ENDED/CANCELLED.

### `trueyy.sessions.cancel(id, reason?)`

Cancel a SCHEDULED session. Reason is optional, stored in description.

### `trueyy.sessions.refreshToken(id, role)`

Mint a fresh 5-min JWT before the current one expires. Your backend calls this when the browser approaches expiry and pushes the new token down via your own channel (existing socket, etc.).

```ts
const { token, expires_at, role } = await trueyy.sessions.refreshToken(
  sessionId,
  "candidate" | "interviewer" | "helper"
);
```

---

## Reports API

```ts
const report = await trueyy.reports.get(sessionId);
// → { session_id, report_url, expires_at }
```

`report_url` is a short-lived signed URL for the PDF + JSON. Re-fetch when expired.

---

## Webhooks

### `trueyy.webhooks.verify(secret)`

Returns Express-compatible middleware. Validates `X-Trueyy-Signature` (HMAC-SHA256), rejects replays (timestamp > 5 min old), parses the body, and attaches `req.trueyy.event`.

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

### Event catalog

| `event_type` | Fires when | Sample `data` shape |
|---|---|---|
| `session.ready` | Candidate clicked "Open Meeting" + helper online | `{ session_id, external_id, candidate, joined_at }` |
| `session.transcript_segment` | Deepgram returns a final fragment | `{ session_id, speaker, text, started_at, ended_at }` |
| `session.risk_pulse` | Layer 1 alert (AI tool detected, paste threshold) | `{ session_id, kind, severity, evidence }` |
| `session.window_result` | 30-second analysis window completes | `{ session_id, window_id, risk, score, summary, modality_breakdown }` |
| `session.image_analysis_result` | Vision LLM completes screenshot analysis | `{ session_id, image_id, risk, findings }` |
| `session.ended` | Session moves to ENDED (any path) | `{ session_id, external_id, started_at, ended_at, final_score }` |
| `session.report_ready` | Final PDF + JSON report generated | `{ session_id, report_url, expires_at }` |
| `session.cancelled` | Cancelled before start | `{ session_id, reason }` |

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
  await trueyy.sessions.create(input);
} catch (err) {
  if (err instanceof TrueyyAuthError)     { /* 401 — rotate token */ }
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

**Retry policy at the transport layer:** idempotent GETs are retried once on network failure. POSTs are **never** auto-retried — supply your own `external_id` for create-style operations and Trueyy's server-side idempotency will catch duplicates.

---

## TypeScript

Full types ship with the package (`./dist/index.d.ts`). Useful exports:

```ts
import type {
  // Request shapes
  CreateSessionInput,
  Person,
  // Response shapes
  CreatedSession,
  Session,
  Report,
  Paginated,
  // Session metadata
  SessionStatus,        // "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED"
  SessionRole,          // "candidate" | "interviewer" | "helper"
  // Webhook
  WebhookEvent,
  WebhookEventType,
} from "@trueyy/node";
```

---

## Examples

A full Express integration lives in this monorepo:

- [`examples/express-ats`](../../examples/express-ats/server.ts) — schedule endpoint + webhook receiver.

Clone and run:

```bash
git clone https://github.com/Anti-Cheating/trueyy-sdk.git
cd trueyy-sdk
pnpm install
TRUEYY_API_KEY=tk_test_… pnpm -F express-ats dev
```

---

## Versioning & compatibility

V1 contract is **frozen** — additive changes only. Breaking changes will ship under `@trueyy/node@2` against a future `/v2/*` API.

---

## License

[MIT](../../LICENSE) © Trueyy

Issues, PRs, and discussions: [github.com/Anti-Cheating/trueyy-sdk](https://github.com/Anti-Cheating/trueyy-sdk)
