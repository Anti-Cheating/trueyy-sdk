# @trueyy/web

> React components for embedding Trueyy's live interview integrity monitoring into your ATS — drop-in, themable, fully typed.

[![npm](https://img.shields.io/npm/v/@trueyy/web.svg)](https://www.npmjs.com/package/@trueyy/web)
[![types](https://img.shields.io/npm/types/@trueyy/web.svg)](https://www.npmjs.com/package/@trueyy/web)

This package is for your **frontend** (React 17+). It gives you three drop-in components plus a typed hook surface so you can build a custom UI on top of Trueyy's live data plane.

For your **backend** (where session tokens are minted and webhooks are received), install [`@trueyy/node`](https://www.npmjs.com/package/@trueyy/node).

---

## Install

```bash
npm install @trueyy/web
# or
pnpm add @trueyy/web
# or
yarn add @trueyy/web
```

Then import the default theme stylesheet **once** (typically in your app entry):

```ts
import "@trueyy/web/styles.css";
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
import { TrueyyProvider, TrueyyMonitor } from "@trueyy/web";
import "@trueyy/web/styles.css";

function InterviewerPage({ interviewerToken }) {
  return (
    <TrueyyProvider
      token={interviewerToken}
      theme={{ primary: "#3B82F6", radius: "8px" }}
      onTokenExpiring={async () => {
        // Hit YOUR backend, which calls trueyy.tokens.mint(round_id, role) via @trueyy/node
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
import { TrueyyProvider, TrueyyJoin } from "@trueyy/web";

function CandidateJoinPage({ candidateToken, helperToken, zoomUrl }) {
  // The Helper needs its own token. Inject it on window so <TrueyyJoin> can
  // hand it to the local daemon. (A future API will accept it as a prop.)
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
import { TrueyyReplay } from "@trueyy/web";

function ReviewPage({ sessionId }) {
  return (
    <TrueyyReplay
      sessionId={sessionId}
      fetchSessionDetail={async (id) => {
        // YOUR backend, which calls trueyy.reports.get(round_id) via @trueyy/node
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
   │  frontend  │                              │  + @trueyy/node     │
   │  + @trueyy/│ ◄──── candidate_token  ──────│  (holds tk_live_*)  │
   │   web      │       interviewer_token      └─────────┬───────────┘
   └────┬───────┘       helper_token                     │
        │                                                │ POST /v1/sessions
        │                                                │ (returns 3 JWTs)
        │  <TrueyyProvider token={…}>                    ▼
        │  opens WSS to Cortex                Cortex mints JWTs (5min)
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
/>
```

Renders three columns:
1. **Risk pulses** — incoming alerts color-coded by severity.
2. **Window analysis** — every 30 seconds, the LLM-synthesized risk + score + one-line summary.
3. **Transcript** — Deepgram live transcript, two-speaker.

Plus a **"Capture now"** button that triggers an on-demand screenshot capture pipeline.

The component is intentionally simple. For a custom UI, drop the component and use the hooks instead.

---

## `<TrueyyJoin>` reference

```tsx
<TrueyyJoin
  meetingUrl={string}                      // REQUIRED — Zoom / Meet / Teams URL
  cortexUrl="https://api.trueyy.com"       // OPTIONAL
  onReady={() => void}                     // OPTIONAL — fires after meeting opens
/>
```

3 steps:

1. **Install the helper** — auto-detects presence; offers per-OS download if missing.
2. **Connect helper** — POSTs the `helper_token` to `127.0.0.1:48123` so the daemon can talk to Cortex.
3. **Open meeting** — opens `meetingUrl` in a new tab and tells the daemon the candidate is in.

---

## `<TrueyyReplay>` reference

```tsx
<TrueyyReplay
  sessionId={string}
  fetchSessionDetail={async (id) => TrueyySessionDetail}
/>
```

The `fetchSessionDetail` callback is your call — typically a fetch to your own backend that aggregates Cortex data + your own stored webhook history.

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
} from "@trueyy/web";

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
} from "@trueyy/web";
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

The data plane lives in [`@trueyy/web-core`](https://www.npmjs.com/package/@trueyy/web-core) and is framework-agnostic. We'd love community-maintained adapters — see the web-core README for the wrapping pattern.

---

## Versioning & compatibility

`@trueyy/web` ships in lockstep with `@trueyy/web-core`. Both follow the underlying `/v1/*` socket contract — frozen for V1, additive changes only.

---

## License

[MIT](../../LICENSE) © Trueyy

Issues, PRs, and discussions: [github.com/Anti-Cheating/trueyy-sdk](https://github.com/Anti-Cheating/trueyy-sdk)
