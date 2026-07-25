# @trueyy-sdk/web

> React components for embedding Trueyy's live interview integrity monitoring into your ATS — drop-in, themable, fully typed.

[![npm](https://img.shields.io/npm/v/@trueyy-sdk/web.svg)](https://www.npmjs.com/package/@trueyy-sdk/web)
[![types](https://img.shields.io/npm/types/@trueyy-sdk/web.svg)](https://www.npmjs.com/package/@trueyy-sdk/web)

> **The Trueyy SDK is two packages** — you'll use **both** for a full integration:
> **`@trueyy-sdk/web`** (React frontend, this one) embeds the live monitoring UI, and
> **[`@trueyy-sdk/node`](https://www.npmjs.com/package/@trueyy-sdk/node)** (backend) mints
> the tokens it needs + handles webhooks.

This package is for your **frontend** (React 17+). It gives you three drop-in components plus a typed hook surface so you can build a custom UI on top of Trueyy's live data plane.

For your **backend** (where session tokens are minted and webhooks are received), install [`@trueyy-sdk/node`](https://www.npmjs.com/package/@trueyy-sdk/node).

---

## Install

```bash
npm install @trueyy-sdk/web
# or
pnpm add @trueyy-sdk/web
# or
yarn add @trueyy-sdk/web
```

Then import the default theme stylesheet **once** (typically in your app entry):

```ts
import "@trueyy-sdk/web/styles.css";
```

If you prefer full control, skip the stylesheet and style the components yourself — every component accepts `className` and theme tokens are CSS variables.

---

## The components

| Component | Side | Purpose |
|---|---|---|
| `<TrueyyProvider>` | Both | Holds the session JWT, opens the WebSocket, refreshes tokens before expiry. **Mount once per page.** |
| `<TrueyyMonitor>` | Interviewer | Live panel: risk pulses, 30-second window scores, transcript stream, "capture now" button. |
| `<TrueyyJoin>` | Candidate | 3-step pre-join: install Helper → grant permissions → open meeting. |
| `<TrueyyReplay>` | Interviewer | Post-hoc session review: scrubbable transcript, risk timeline, screenshots, final report. |

You almost always wrap content in `<TrueyyProvider>` and put one of the other three inside.

---

## 60-second quick start

### Interviewer's live monitoring page

```tsx
import { TrueyyProvider, TrueyyMonitor } from "@trueyy-sdk/web";
import "@trueyy-sdk/web/styles.css";

function InterviewerPage({ interviewerToken }) {
  return (
    <TrueyyProvider
      token={interviewerToken}
      theme={{ primary: "#3B82F6", radius: "8px" }}
      onTokenExpiring={async () => {
        // Hit YOUR backend, which calls trueyy.tokens.mint(round_id, role) via @trueyy-sdk/node
        const res = await fetch("/our-ats/refresh-trueyy-token");
        return res.text();
      }}
    >
      <TrueyyMonitor
        onRiskAlert={(e) => acmeAnalytics.track("trueyy_risk", e)}
      />
    </TrueyyProvider>
  );
}
```

### Candidate's pre-join page

```tsx
import { TrueyyProvider, TrueyyJoin } from "@trueyy-sdk/web";

function CandidateJoinPage({ candidateToken, helperToken, zoomUrl }) {
  // The Helper needs its own token. Inject it on window so <TrueyyJoin> can
  // hand it to the local Helper. (A future API will accept it as a prop.)
  (window as any).__TRUEYY_HELPER_TOKEN__ = helperToken;

  return (
    <TrueyyProvider token={candidateToken}>
      <TrueyyJoin
        meetingUrl={zoomUrl}
        cortexUrl="https://api.trueyy.com"
        onReady={() => console.log("Candidate joined")}
      />
    </TrueyyProvider>
  );
}
```

### Recruiter reviewing a finished interview

```tsx
import { TrueyyReplay } from "@trueyy-sdk/web";

function ReviewPage({ sessionId }) {
  return (
    <TrueyyReplay
      sessionId={sessionId}
      fetchSessionDetail={async (id) => {
        // YOUR backend, which calls trueyy.reports.get(round_id) via @trueyy-sdk/node
        const res = await fetch(`/our-ats/sessions/${id}/replay`);
        return res.json();
      }}
    />
  );
}
```

Replay does **not** open a live socket — it reads from your aggregated copy.

---

## How tokens flow (the architecture in one diagram)

```
                                                ┌────────────────────┐
                                                │  Trueyy Cloud      │
                                                │  (api.trueyy.com)  │
                                                └─────────┬──────────┘
                                                          │
   ┌────────────┐    POST /our-ats/schedule    ┌──────────┴──────────┐
   │  Your      │ ─────────────────────────────►  Your ATS Backend   │
   │  frontend  │                              │  + @trueyy-sdk/node     │
   │  + @trueyy-sdk/│ ◄──── candidate_token  ──────│  (holds tk_live_*)  │
   │   web      │       interviewer_token      └─────────┬───────────┘
   └────┬───────┘       helper_token                     │
        │                                                │ POST /v1/sessions
        │                                                │ (returns 3 JWTs)
        │  <TrueyyProvider token={…}>                    ▼
        │  opens WSS to Trueyy Cloud                Trueyy Cloud mints JWTs (5min)
        │                                                │
        └───── WSS auth: Bearer <session-JWT> ───────────┘
```

**Your backend never sends the master `tk_live_*` to the browser** — it mints short-lived (5-min) session JWTs and hands those to the frontend. Damage radius of a leaked browser JWT: one session, five minutes.

---

## `<TrueyyProvider>` reference

```tsx
<TrueyyProvider
  token={sessionJwt}                       // REQUIRED — 5-min JWT
  role="candidate" | "interviewer" | "helper"   // OPTIONAL — inferred from JWT aud
  baseUrl="https://api.trueyy.com"         // OPTIONAL — defaults to prod
  theme={{ primary, radius }}              // OPTIONAL — CSS-var overrides
  onTokenExpiring={async () => string}     // OPTIONAL but recommended
>
  {children}
</TrueyyProvider>
```

`theme` sets CSS variables on the root element:

| Prop | CSS variable | Default |
|---|---|---|
| `primary` | `--trueyy-primary` | `#3B82F6` |
| `radius` | `--trueyy-radius` | `8px` |

You can also override `--trueyy-bg`, `--trueyy-text`, `--trueyy-muted`, `--trueyy-border` directly in your CSS.

---

## `<TrueyyMonitor>` reference

```tsx
<TrueyyMonitor
  onRiskAlert={(event) => void}            // fires on every risk-pulse
  onConsentChange={(event) => void}        // fires on consent given/declined/revoked
/>
```

Renders three columns:
1. **Risk pulses** — incoming alerts color-coded by severity.
2. **Window analysis** — every 30 seconds, the LLM-synthesized risk + score + one-line summary.
3. **Transcript** — live transcript, two-speaker.

A **consent banner** appears above the columns when the candidate withdraws
(or declines) consent — capture has already stopped server-side at that point.
`onConsentChange` also forwards every transition to your app.

Plus a **"Capture now"** button that triggers an on-demand screenshot capture pipeline.

The component is intentionally simple. For a custom UI, drop the component and use the hooks instead.

---

## `<TrueyyJoin>` reference

```tsx
<TrueyyJoin
  meetingUrl={string}                      // REQUIRED — Zoom / Meet / Teams URL
  cortexUrl="https://api.trueyy.com"       // OPTIONAL
  onReady={() => void}                     // OPTIONAL — fires after meeting opens
  renderConsent={(c) => ReactNode}         // OPTIONAL — replace the built-in consent UI
  consentHandledExternally={boolean}       // OPTIONAL — you own the consent flow (see below)
  onConsentChange={(status) => void}       // OPTIONAL — 'needed'|'given'|'declined'|'revoked'
/>
```

Consent first, then 3 steps:

0. **Consent (GDPR Art. 7)** — before anything else, the candidate is shown the
   monitoring consent text and must agree. Capture is **hard-gated server-side**:
   no candidate data is captured for a session until consent is granted,
   so this is a compliance requirement, not just UI.
1. **Install the helper** — auto-detects presence; offers per-OS download if missing.
2. **Connect helper** — hands the Helper its token so it can start on the candidate's machine.
3. **Open meeting** — opens `meetingUrl` in a new tab and signals that the candidate has joined.

A **"Withdraw monitoring consent"** control is shown throughout the session
(GDPR Art. 7(3)). Withdrawal notifies the interviewer immediately and stops
capture; the candidate can re-consent to resume.

### Candidate consent

The default consent UI is compliance-safe out of the box — do nothing and your
candidates get a valid, versioned, provable consent flow. Two escape hatches:

- **`renderConsent`** — supply your own UI while keeping the logic. You receive
  the `useConsent()` state (`status`, `text`, `agree`, `decline`, `revoke`, `busy`).
- **`consentHandledExternally`** — your ATS collects consent itself and calls
  `client.consent.grant(version)` directly. This only **hides** the built-in UI;
  Trueyy Cloud still blocks capture until consent is granted, so **you accept the
  compliance responsibility** for showing informed consent before granting.

For a fully custom flow, use the hook directly:

```tsx
import { useConsent } from "@trueyy-sdk/web";

function MyConsent() {
  const { status, text, agree, decline, revoke, busy } = useConsent();
  // status: 'loading' | 'needed' | 'given' | 'declined' | 'revoked'
}
```

Or the raw client methods (framework-agnostic, `@trueyy-sdk/web-core`):
`client.consent.text()`, `.grant(version)`, `.decline()`, `.revoke()`.

---

## `<TrueyyReplay>` reference

```tsx
<TrueyyReplay
  sessionId={string}
  fetchSessionDetail={async (id) => TrueyySessionDetail}
/>
```

The `fetchSessionDetail` callback is your call — typically a fetch to your own backend that aggregates Trueyy Cloud data + your own stored webhook history.

Expected shape:

```ts
interface TrueyySessionDetail {
  session_id: string;
  title: string;
  status: string;
  transcripts: { speaker, text, captured_at }[];
  risk_pulses: { kind, severity, occurred_at }[];
  windows: { risk, score, summary, start_time }[];
}
```

---

## Hooks (for custom UIs)

If the built-in components don't fit your design, build your own using the same data plane:

```tsx
import {
  useTrueyyClient,
  useRiskStream,
  useWindowResults,
  useTranscriptStream,
} from "@trueyy-sdk/web";

function MyCustomMonitor() {
  const client = useTrueyyClient();
  const risks = useRiskStream(50);          // last 50 risk pulses
  const windows = useWindowResults(50);     // last 50 windows
  const transcript = useTranscriptStream(200);

  return (
    <div>
      <button onClick={() => client.captureNow()}>Capture</button>
      {risks.map((r, i) => <MyRiskCard key={i} event={r} />)}
      {/* ... */}
    </div>
  );
}
```

All hooks return reactive state that updates as new events stream in. Unsubscribe happens automatically on unmount.

---

## TypeScript

Everything is typed. Useful exports:

```ts
import type {
  // Component props
  TrueyyProviderProps,
  TrueyyMonitorProps,
  TrueyyJoinProps,
  TrueyyReplayProps,
  TrueyyTheme,
  TrueyySessionDetail,
  // Event payloads
  SessionRole,
  RiskPulseEvent,
  WindowResultEvent,
  LiveTranscriptEvent,
  CandidateStatusEvent,
} from "@trueyy-sdk/web";
```

---

## Examples

A full React app embedding the SDK lives in this monorepo:

- [`examples/react-ats`](../../examples/react-ats/) — Vite + React, demos `<TrueyyMonitor>` with theme override.

Clone and run:

```bash
git clone https://github.com/Anti-Cheating/trueyy-sdk.git
cd trueyy-sdk
pnpm install
pnpm -F react-ats dev
# Open http://localhost:5173/?interviewer_token=<paste a real JWT>
```

---

## Browser support

Targets evergreen browsers — Chrome, Edge, Firefox, Safari (last 2 versions each). Uses `fetch`, `WebSocket`, `AbortController`, `BroadcastChannel`.

---

## What about Vue / Angular / Svelte?

The data plane lives in [`@trueyy-sdk/web-core`](https://www.npmjs.com/package/@trueyy-sdk/web-core) and is framework-agnostic. We'd love community-maintained adapters — see the web-core README for the wrapping pattern.

---

## License

[MIT](../../LICENSE) © Trueyy

Issues, PRs, and discussions: [github.com/Anti-Cheating/trueyy-sdk](https://github.com/Anti-Cheating/trueyy-sdk)
