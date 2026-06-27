# Trueyy SDK

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

// 1. make sure the interviewer exists (once — they accept via email, then
//    appear in team.members with an id you reference as interviewer_user_id)
await trueyy.team.invite({ email: "bob@you.com", role: "Member" });
const { members } = await trueyy.team.members();
const bob = members.find((m) => m.email === "bob@you.com")!;

// 2. create the interview + round 1
const { id, round_id } = await trueyy.interviews.create({
  role: "Senior Backend",
  candidate_email: "alice@x.com",
  candidate_first_name: "Alice",
  candidate_last_name: "X",
  first_round: {
    round_name: "Phone screen",
    interviewer_user_id: bob.id,
    scheduled_start_at: r1.start,
    scheduled_end_at: r1.end,
    timezone: "America/New_York",
    meeting_link: r1.meeting_url,   // required (zoom / meet / teams)
  },
});

// 3. mint a short-lived browser token to embed the candidate join flow
const candidate = await trueyy.tokens.mint(round_id, "candidate");
```

### Multi-round interviews

A candidate often has several rounds — different interviewers, different days.
Add each round to the same interview; each round references its own (pre-existing)
interviewer:

```ts
await trueyy.interviews.addRound(id, {
  round_name: "Technical — Round 2",
  interviewer_user_id: carol.id,      // a different interviewer, already on the team
  scheduled_start_at: r2.start,
  scheduled_end_at: r2.end,
  timezone: "America/New_York",
  meeting_link: r2.meeting_url,
});
```

The interview (`id`) groups its rounds; `trueyy.interviews.get(id)` returns each
round with its own analysis summary. Per-round report: `trueyy.reports.get(round_id)`.
Cancelling the interview (`trueyy.interviews.cancel(id)`) cancels every round that
hasn't started yet.

**Frontend (React):**

```tsx
import { TrueyyProvider, TrueyyMonitor } from "@trueyy/web";
import "@trueyy/web/styles.css";

// `interviewerToken` comes from your backend — trueyy.tokens.mint(round_id, "interviewer")
<TrueyyProvider token={interviewerToken}>
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
