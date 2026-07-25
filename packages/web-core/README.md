# @trueyy-sdk/web-core

> Framework-agnostic browser primitives that power Trueyy's web SDKs.

[![npm](https://img.shields.io/npm/v/@trueyy-sdk/web-core.svg)](https://www.npmjs.com/package/@trueyy-sdk/web-core)
[![types](https://img.shields.io/npm/types/@trueyy-sdk/web-core.svg)](https://www.npmjs.com/package/@trueyy-sdk/web-core)

> **Most consumers should NOT install this directly.** If you use React, install [`@trueyy-sdk/web`](https://www.npmjs.com/package/@trueyy-sdk/web) — it bundles this core and adds React components.

This package is the foundation: a stateful WebSocket client, the local Helper bridge, and TypeScript types — all with **zero UI dependencies**. It exists so Trueyy's framework adapters (`@trueyy-sdk/web` for React, future `@trueyy-sdk/web-vue`, `@trueyy-sdk/web-svelte`, etc.) can share the same browser-side runtime without duplicating logic.

## When you'd install this directly

- You're building **vanilla JS or your own framework wrapper** (no React).
- You're building a **custom UI** and only need Trueyy's data plane (transcript, risk pulses, window analysis).
- You want to **embed Trueyy inside a Web Component** or a non-React micro-frontend.

If none of those apply, use [`@trueyy-sdk/web`](https://www.npmjs.com/package/@trueyy-sdk/web) — it gives you `<TrueyyMonitor>`, `<TrueyyJoin>`, and `<TrueyyReplay>` out of the box.

---

## Install

```bash
npm install @trueyy-sdk/web-core
```

Runs in any modern browser. Requires `fetch`, `WebSocket`, `crypto.subtle`. No Node/build polyfills.

---

## The two things in this package

### 1. `TrueyyClient` — typed live data client

Holds a session-scoped JWT, connects to Trueyy Cloud via WebSocket, auto-refreshes the token before expiry, and exposes a typed event subscription API.

```ts
import { TrueyyClient } from "@trueyy-sdk/web-core";

const client = new TrueyyClient({
  token: interviewerToken,                  // JWT minted by @trueyy-sdk/node
  role: "interviewer",                      // "candidate" | "interviewer" | "helper"
  baseUrl: "https://api.trueyy.com",        // optional override
  onTokenExpiring: async () => {
    // Fetch a fresh token from your ATS backend (which calls
    // trueyy.tokens.mint(round_id, role) on the server). Return the new JWT.
    const res = await fetch("/our-ats/refresh-trueyy-token");
    return res.text();
  },
});

client.connect();

// Typed subscriptions
const unsubRisk = client.on("risk-pulse", (e) => {
  // e: { session_id, kind, severity, evidence }
  console.log(e.kind, e.severity);
});
const unsubWindow = client.on("window-result", (e) => {
  // e: { session_id, window_id, risk, score, summary, modality_breakdown }
});
const unsubTranscript = client.on("live-transcript", (e) => {
  // e: { session_id, speaker, text, is_final, started_at, ended_at }
});
const unsubStatus = client.on("candidate-status", (e) => {
  // e: { session_id, screen_recording, mic_granted, joined, ... }
});

// Imperative commands (interviewer only)
client.captureNow();          // request immediate screenshot capture
client.startAnalysis();       // resume monitoring
client.stopAnalysis();        // pause monitoring
client.startTranscription();
client.stopTranscription();

// Cleanup
unsubRisk();
client.disconnect();
```

### 2. `helperBridge` — talk to the local Helper

The Trueyy Helper is a small native app the candidate installs; it captures the signals a browser can't. These helpers let your frontend detect it, hand it a token, and track its status.

```ts
import {
  detectHelper,
  helperJoin,
  helperJoinedMeeting,
  helperLeave,
  helperStatus,
  HELPER_DOWNLOAD_URL_MAC,
  HELPER_DOWNLOAD_URL_WIN,
} from "@trueyy-sdk/web-core";

// Is the Helper installed and running?
const ok = await detectHelper();
if (!ok) {
  // Send the candidate to the right installer
  const url = isMac ? HELPER_DOWNLOAD_URL_MAC : HELPER_DOWNLOAD_URL_WIN;
  window.location.href = url;
}

// Hand the Helper a helper-JWT + Trueyy Cloud URL — it connects from
// there and starts sending its data. The helper token is
// minted on your backend via @trueyy-sdk/node:
//   trueyy.tokens.mint(round_id, "helper") → { token, expires_at, role }
// and `sessionId` is the round's id (round_id).
await helperJoin({
  helperToken,                              // from trueyy.tokens.mint(round_id, "helper")
  cortexUrl:   "https://api.trueyy.com",
  sessionId:   roundId,                     // the round's id
});

// When the candidate clicks "Open Meeting" in your UI:
await helperJoinedMeeting(roundId);

// On unmount / explicit end:
await helperLeave(roundId);

// Poll for live state (permissions, mic activity)
const status = await helperStatus();
// → { ok, version, screen_recording, mic_granted, joined }
```

The Helper is **only required on the candidate side**. Interviewers don't need it.

---

## Configuration shape

```ts
interface TrueyyClientOptions {
  token: string;                           // session-scoped JWT
  role: "candidate" | "interviewer" | "helper";
  baseUrl?: string;                        // default: https://api.trueyy.com
  onTokenExpiring?: () => Promise<string>; // called ~30s before exp
}
```

The client schedules a refresh based on the JWT's `exp` claim (read locally; the server is the source of truth for verification). When the token nears expiry it calls your `onTokenExpiring`, swaps the new JWT in, and the WebSocket reconnects under the new auth.

---

## Event payloads

Every event comes through fully typed:

```ts
import type {
  RiskPulseEvent,
  WindowResultEvent,
  LiveTranscriptEvent,
  CandidateStatusEvent,
  ImageAnalysisResultEvent,
  SocketEventName,
  SocketEventMap,
} from "@trueyy-sdk/web-core";
```

`client.on(event, fn)` infers `e` from `SocketEventMap` — no manual casting required:

```ts
client.on("risk-pulse", (e) => {
  e.severity;   // typed as "info" | "warning" | "critical"
  e.evidence;   // typed as Record<string, unknown>
});
```

---

## Vanilla JS minimal example

Render risk events into a plain `<div>` with no framework:

```html
<div id="risk-list"></div>

<script type="module">
  import { TrueyyClient } from "https://esm.sh/@trueyy-sdk/web-core";

  const list = document.getElementById("risk-list");
  const client = new TrueyyClient({
    token: window.__INTERVIEWER_TOKEN__,
    role: "interviewer",
  });
  client.connect();

  client.on("risk-pulse", (e) => {
    const row = document.createElement("div");
    row.textContent = `${e.severity}: ${e.kind}`;
    row.style.borderLeft = `3px solid ${e.severity === "critical" ? "red" : "orange"}`;
    list.prepend(row);
  });
</script>
```

---

## Building your own framework adapter

If you'd like a Vue, Svelte, Angular, or Solid adapter, the pattern is:

1. Wrap `TrueyyClient` in your framework's context primitive (Vue `provide/inject`, Svelte stores, Solid signals).
2. Expose hooks/composables/runes that subscribe to specific events.
3. Re-export the relevant types from `@trueyy-sdk/web-core`.

See [`packages/web-react`](../web-react/src/) in this monorepo for a reference implementation in ~300 lines.

PRs welcome for additional adapters.

---

## TypeScript

Full type defs at `./dist/index.d.ts`. Cherry-pick imports:

```ts
import { TrueyyClient, type TrueyyClientOptions } from "@trueyy-sdk/web-core";
import { detectHelper, type HelperStatus } from "@trueyy-sdk/web-core";
import type {
  SessionRole, SessionStatus,
  RiskPulseEvent, WindowResultEvent, LiveTranscriptEvent,
  CandidateStatusEvent, ImageAnalysisResultEvent,
  SocketEventName, SocketEventMap,
} from "@trueyy-sdk/web-core";
```

---

## License

[MIT](../../LICENSE) © Trueyy

Issues, PRs, and discussions: [github.com/Anti-Cheating/trueyy-sdk](https://github.com/Anti-Cheating/trueyy-sdk)
