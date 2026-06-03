# Hermes — Trueyy SDK

> The official Trueyy SDK. Embed AI-powered interview integrity monitoring into your ATS in under 50 lines of code.

Trueyy detects cheating during remote technical interviews — AI assistants, suspicious applications, paste behavior, keystroke patterns, and screen content — and surfaces it as live risk pulses, 30-second window analyses, and a final report. This SDK is how your applicant tracking system plugs into the platform.

## What's in the box

| Package | For | Install |
|---|---|---|
| [`@trueyy/node`](./packages/node) | Your backend (Node 18+) | `npm i @trueyy/node` |
| [`@trueyy/web`](./packages/web-react) | Your React frontend | `npm i @trueyy/web` |

The backend mints session tokens and verifies webhook deliveries. The frontend embeds `<TrueyyMonitor>` for live interviewer view, `<TrueyyJoin>` for the candidate pre-join flow, and `<TrueyyReplay>` for post-hoc review.

`@trueyy/web-core` is a framework-agnostic browser core (WebSocket client, helper bridge, types) consumed transitively by `@trueyy/web`. Future Vue / Angular / Svelte adapters will share the same core.

## Quick start

**Backend:**

```ts
import { Trueyy } from "@trueyy/node";

const trueyy = new Trueyy({ apiKey: process.env.TRUEYY_API_KEY! });

const session = await trueyy.sessions.create({
  external_id: req.body.interview_id,
  candidate: { email: "alice@x.com", first_name: "Alice", last_name: "X" },
  interviewer: { email: "bob@you.com", first_name: "Bob", last_name: "Y" },
  scheduled_start_at: req.body.start,
  scheduled_end_at: req.body.end,
});
// → returns { candidate_token, interviewer_token, helper_token, ... }
```

**Frontend (React):**

```tsx
import { TrueyyProvider, TrueyyMonitor } from "@trueyy/web";
import "@trueyy/web/styles.css";

<TrueyyProvider token={session.interviewer_token}>
  <TrueyyMonitor onRiskAlert={(e) => analytics.track("risk", e)} />
</TrueyyProvider>
```

**Webhook receiver:**

```ts
import express from "express";

app.post(
  "/webhooks/trueyy",
  express.raw({ type: "application/json" }),
  trueyy.webhooks.verify(process.env.TRUEYY_WEBHOOK_SECRET!),
  (req, res) => {
    const { event_type, data } = req.trueyy!.event;
    switch (event_type) {
      case "session.ended":
        // persist final report URL
        break;
      case "session.risk_pulse":
        // forward to alerts pipeline
        break;
    }
    res.sendStatus(200);
  }
);
```

## Architecture

- **Multi-tenant**: every API call is scoped to your tenant by your `tk_live_*` token. Cross-tenant data access is impossible by design.
- **Session JWTs**: candidate / interviewer / helper tokens are short-lived (5 min for browsers, capped to interview duration + 2h for the helper) and scoped to one session.
- **Signed webhooks**: every event carries an `X-Trueyy-Signature` HMAC header. `webhooks.verify(secret)` middleware handles validation, replay protection, and forwards the parsed event on `req.trueyy.event`.
- **At-least-once delivery**: webhook retry schedule is 1m → 5m → 30m → 2h → 12h, then dead-lettered. ATS-side idempotency is via `event_id`.

## Examples

- [`examples/express-ats`](./examples/express-ats) — minimal Node/Express backend integration with webhook receiver.
- [`examples/react-ats`](./examples/react-ats) — Vite + React demo embedding `<TrueyyMonitor>`.

## Local development

This is a [pnpm workspaces](https://pnpm.io/workspaces) monorepo.

```bash
pnpm install
pnpm build       # builds all packages
pnpm -F @trueyy/node build       # build a single package
pnpm -F express-ats dev          # run the express example
pnpm -F react-ats dev            # run the React example
```

## Event catalog

| Event | When it fires |
|---|---|
| `session.ready` | Candidate clicked "Open Meeting" + helper is online |
| `session.transcript_segment` | Final transcript fragment (>1s of speech) |
| `session.risk_pulse` | Layer 1 alert (AI app detected, paste threshold hit, etc.) |
| `session.window_result` | Layer 2 window analysis completes (every 30s) |
| `session.image_analysis_result` | Layer 3 image analysis completes |
| `session.ended` | Session moves to ENDED |
| `session.report_ready` | Final report PDF + JSON generated |
| `session.cancelled` | Session cancelled before starting |

## Status

V1 — production-ready API surface, frozen. `@trueyy/web-vue` and `@trueyy/web-svelte` planned.

## License

[MIT](./LICENSE)
