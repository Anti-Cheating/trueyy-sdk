# V1 Architecture — End-to-End Walkthrough

> Concrete narrative of how the platform works in practice — from a company signing up to running one interview from join to post-hoc review. Reference doc for engineers onboarding to the V1 platform.
>
> For the contract-level umbrella design that drove this build, see [`docs/superpowers/specs/2026-05-23-trueyy-sdk-v1-umbrella-design.md`](https://github.com/Anti-Cheating/Cortex/blob/sp-1-tenancy-tokens/docs/superpowers/specs/2026-05-23-trueyy-sdk-v1-umbrella-design.md) in the Cortex repo.

---

## Cast

| Persona | Role |
|---|---|
| **Priya** | HR director at Acme Corp who signs up for Trueyy |
| **Devon** | Backend engineer at Acme who integrates the SDK |
| **Riya** | Frontend engineer at Acme who embeds the components |
| **Alice** | Software engineering candidate being interviewed |
| **Bob** | Acme's interviewer who'll evaluate Alice |

---

## Phase 1: Acme signs up for Trueyy (one-time, ~5 min)

### Day 0, 10:00 AM — Priya visits `https://app.trueyy.com/signup`

Skyview (the hosted Trueyy app) shows the signup form. Priya fills in:
- Email: `priya@acme.com`
- Company name: `Acme Corp`
- Password

Click → frontend hits `POST /api/auth/signup` on Cortex.

Cortex:
1. Creates row in `users` (email, password hash).
2. Creates row in `companies` (`name="Acme Corp"`, `slug="acme-corp"`, default `plan="trial"`).
3. Links user to company; user role = `Owner`.
4. Generates an `email_verification_tokens` row, emails Priya a magic link.
5. Returns 200; frontend redirects Priya to `/check-inbox`.

### 10:01 AM — Priya clicks the magic link in her email

Lands on `/verify-email?token=...`. Frontend hits `POST /api/auth/verify-email`. Cortex flips `users.email_verified_at = now()`. Priya is now logged in.

### 10:02 AM — 4-step onboarding wizard

Skyview routes her to `/onboarding/step-1`:

| Step | What | Cortex side |
|---|---|---|
| 1. Company info | Logo, brand color, retention (7/30/90/365 days) | `PATCH /api/companies/me` → updates `companies.logo_url`, `branding_color`, `retention_days` |
| 2. **Generate first API token** | Modal shows `tk_live_a1b2c3...` ONCE with copy button + scary warning | `POST /api/companies/me/api-tokens` → creates `api_tokens` row, returns plaintext exactly once |
| 3. Webhook URL | Priya pastes `https://acme.com/webhooks/trueyy`, picks event types | `POST /api/companies/me/webhook-endpoints` → creates row, returns `signing_secret` ONCE |
| 4. Test integration | Embedded code samples for Node + React | (none — just display) |

After step 4, Priya copies two strings to give to her engineers:

```
TRUEYY_API_KEY=tk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8
TRUEYY_WEBHOOK_SECRET=K9pZ7yLv3xQ8mN2bF6jW1tH4eR0aD5sUvBcXgYzJoIuQ=
```

She drops them into Acme's password manager and Slacks Devon.

---

## Phase 2: Acme integrates the SDK (one-time, ~1 hour of engineering)

### 10:30 AM — Devon (backend)

```bash
cd acme-ats-backend
npm install @trueyy/node
```

In Acme's Express backend (`server.ts`):

```ts
import express from "express";
import { Trueyy } from "@trueyy/node";

const trueyy = new Trueyy({ apiKey: process.env.TRUEYY_API_KEY! });
const app = express();

// 1. Wire schedule-interview endpoint — Acme calls this when a recruiter
//    schedules an interview in their UI.
app.post("/internal/schedule-interview", express.json(), async (req, res) => {
  const session = await trueyy.sessions.create({
    external_id: req.body.acme_interview_id,        // ← Acme's own ID
    candidate:   { email: req.body.candidate_email,
                   first_name: req.body.candidate_first,
                   last_name:  req.body.candidate_last },
    interviewer: { email: req.body.interviewer_email,
                   first_name: req.body.interviewer_first,
                   last_name:  req.body.interviewer_last },
    scheduled_start_at: req.body.start,
    scheduled_end_at:   req.body.end,
    meeting_url:        req.body.zoom_url,
  });

  // Persist Trueyy IDs in Acme's DB keyed by Acme's interview ID.
  await acmeDB.interviews.update(req.body.acme_interview_id, {
    trueyy_session_id:        session.session_id,
    trueyy_candidate_token:   session.candidate_token,
    trueyy_interviewer_token: session.interviewer_token,
    trueyy_helper_token:      session.helper_token,
  });

  res.json({ ok: true });
});

// 2. Wire webhook receiver — Acme processes events Trueyy fires.
app.post(
  "/webhooks/trueyy",
  express.raw({ type: "application/json" }),
  trueyy.webhooks.verify(process.env.TRUEYY_WEBHOOK_SECRET!),
  async (req, res) => {
    const { event_id, event_type, data } = req.trueyy!.event;

    // Idempotency: skip if we've seen this event_id before.
    if (await acmeDB.trueyy_events.exists(event_id)) return res.sendStatus(200);
    await acmeDB.trueyy_events.insert({ event_id, event_type });

    switch (event_type) {
      case "session.ready":
        // Alice has joined — flip Acme's interview row to LIVE.
        await acmeDB.interviews.update(data.external_id, { status: "LIVE" });
        break;
      case "session.risk_pulse":
        // Push to Acme's alerts service so SecOps can see it.
        await acmeAlerts.push({ session_id: data.session_id, ...data });
        break;
      case "session.window_result":
        // Append to per-interview risk timeline.
        await acmeDB.risk_timeline.insert(data);
        break;
      case "session.ended":
        await acmeDB.interviews.update(data.external_id, {
          status:      "COMPLETED",
          final_score: data.final_score,
        });
        break;
      case "session.report_ready":
        await acmeDB.interviews.update(data.external_id, {
          report_url: data.report_url,
        });
        break;
    }

    res.sendStatus(200);     // anything non-2xx triggers Trueyy's retry chain
  }
);
```

### 11:00 AM — Riya (frontend)

```bash
cd acme-ats-frontend
npm install @trueyy/web
```

In Acme's React app:

```tsx
// src/main.tsx
import "@trueyy/web/styles.css";  // default theme CSS

// src/pages/candidate-join.tsx
import { TrueyyProvider, TrueyyJoin } from "@trueyy/web";

export function CandidateJoinPage() {
  const { candidateToken, helperToken, zoomUrl } = useInterviewData();

  // The helper needs its own JWT — inject before render.
  (window as any).__TRUEYY_HELPER_TOKEN__ = helperToken;

  return (
    <TrueyyProvider token={candidateToken}>
      <TrueyyJoin
        meetingUrl={zoomUrl}
        cortexUrl="https://api.trueyy.com"
        onReady={() => acmeAnalytics.track("candidate_joined")}
      />
    </TrueyyProvider>
  );
}

// src/pages/interviewer-monitor.tsx
import { TrueyyProvider, TrueyyMonitor } from "@trueyy/web";

export function InterviewerMonitorPage() {
  const { interviewerToken } = useInterviewData();

  return (
    <TrueyyProvider
      token={interviewerToken}
      theme={{ primary: "#10b981", radius: "12px" }}
      onTokenExpiring={async () => {
        // Token expires every 5 min — fetch fresh from our backend.
        const r = await fetch("/internal/refresh-trueyy-token", { method: "POST" });
        return r.text();
      }}
    >
      <TrueyyMonitor onRiskAlert={(e) => acmeAnalytics.track("risk", e)} />
    </TrueyyProvider>
  );
}

// src/pages/post-interview-review.tsx
import { TrueyyReplay } from "@trueyy/web";

export function PostInterviewReviewPage({ sessionId }) {
  return (
    <TrueyyReplay
      sessionId={sessionId}
      fetchSessionDetail={async (id) => {
        const r = await fetch(`/internal/trueyy-session/${id}`);
        return r.json();  // backend aggregates from Acme's DB + Cortex
      }}
    />
  );
}
```

Acme is integrated. Done forever.

---

## Phase 3: Schedule an interview (every interview, ~2 seconds)

### Day 5, 9:00 AM — recruiter schedules Alice's interview

A recruiter clicks "Schedule" in Acme's ATS UI. Acme's frontend hits Acme's own backend (`POST /internal/schedule-interview`), which calls Devon's code from Phase 2.

**Network sequence:**

```
Acme ATS UI                    Acme backend                        Trueyy Cortex
     │                              │                                    │
     │ POST /internal/schedule       │                                    │
     │ { interviewer, candidate,     │                                    │
     │   start, end, zoom_url }     │                                    │
     │─────────────────────────────►│                                    │
     │                              │ POST /v1/sessions                  │
     │                              │ Authorization: Bearer tk_live_…    │
     │                              │─────────────────────────────────►│
     │                              │                                    │
     │                              │                          INSERT interview_sessions
     │                              │                          (tenant_id = Acme,
     │                              │                           external_id = ACME-INT-123)
     │                              │                                    │
     │                              │                          Upsert users:
     │                              │                            alice@x.com (candidate)
     │                              │                            bob@acme.com (interviewer)
     │                              │                                    │
     │                              │                          Mint 3 JWTs (HS256, iss=trueyy)
     │                              │                                    │
     │                              │ 201 { session_id: ses_4a8…,        │
     │                              │       candidate_token,  ← 5min      │
     │                              │       interviewer_token, ← 5min     │
     │                              │       helper_token,     ← 12h cap   │
     │                              │       external_id,                  │
     │                              │       created: true }              │
     │                              │◄─────────────────────────────────│
     │                              │                                    │
     │                              │ UPDATE acmeDB.interviews            │
     │                              │ (save 3 tokens + session_id)        │
     │                              │                                    │
     │ { ok: true }                 │                                    │
     │◄─────────────────────────────│                                    │
```

Acme emails Alice via their own mailer:

> Hi Alice, your interview with Bob is at 2 PM PT tomorrow.
> Join here: https://acme.com/interview/ACME-INT-123/join

### Idempotency

If Acme's frontend double-clicks the schedule button and the same `POST /v1/sessions` fires twice with `external_id: "ACME-INT-123"`:
- First request → `201 Created`, `created: true`.
- Second request → `200 OK`, `created: false`, **same `session_id`** as the first. No duplicate row, no duplicate Alice.

This is the `(company_id, external_id) UNIQUE` index in `interview_sessions` doing its job, enforced by `createOrFindSession()` in `sessions.service.ts`.

---

## Phase 4: Interview day — Alice joins (≈ 3 minutes)

### Day 6, 1:55 PM — Alice clicks her join link

She lands on `https://acme.com/interview/ACME-INT-123/join`. Acme's React page loads with `candidateToken` + `helperToken` + `zoomUrl` from Acme's backend.

`<TrueyyJoin>` mounts inside `<TrueyyProvider>`. Three things happen concurrently:

**(a) Web SDK opens its WebSocket to Cortex.**

```
WSS api.trueyy.com/v1/sessions/:id/socket
Authorization: Bearer <candidate_token>
```

Cortex's `resolveTenant` middleware:
1. Detects Bearer JWT → calls `verifySessionJwt(token)`.
2. Verifies signature, `iss=trueyy`, `aud=candidate`, `exp > now()`.
3. Extracts `tid=Acme.id` + `sub=ses_4a8…` from claims.
4. Sets `req.tenant_id`, `req.session_id`, `req.session_role = "candidate"`.
5. Allows the socket upgrade. Joins the session room.

**(b) Web SDK pings the local Helper.**

```
GET http://127.0.0.1:48123/health
```

Three possible outcomes:

| Outcome | UI shows |
|---|---|
| **Not installed** (connection refused) | Step 1 shows download buttons: `Mac .dmg` / `Windows .exe` |
| **Installed but wrong version** | Auto-update fires; "Please restart helper" UI |
| **Up + healthy** | Step 1 shows green checkmark, jumps to Step 2 |

### 1:56 PM — Alice downloads + installs Helper (only the first time)

She clicks "Download for Mac". `TrueyyHelper-1.0.0.dmg` downloads from `downloads.trueyy.com`. She drags to Applications, double-clicks to launch.

Helper:
- Binds `127.0.0.1:48123` (HTTP + WebSocket).
- Registers a macOS Launch Agent so it auto-starts on next reboot.
- Polls TCC (Privacy permissions) state but **does NOT request any yet**.
- Returns 200 from `/health`.

The Web SDK's 4-second poll catches this — Step 1 flips green.

### 1:57 PM — Alice clicks "Connect helper" (Step 2)

`<TrueyyJoin>` POSTs to local Helper:

```
POST http://127.0.0.1:48123/session/join
Content-Type: application/json

{
  "helper_token": "<helper_token from candidateToken's same session>",
  "cortex_url":   "https://api.trueyy.com",
  "session_id":   "ses_4a8…",
  "features":     { "ai_apps": true, "paste_detection": true }
}
```

Helper stores `helper_token` in memory (NOT keychain — gone on shutdown), opens its own WSS to Cortex:

```
WSS api.trueyy.com/v1/sessions/:id/socket
Authorization: Bearer <helper_token>
```

Cortex's `resolveTenant` decodes — `aud=helper`, longer exp. Helper joins same session room as the browser. Now Helper + Alice's browser + Cortex are all in `session:ses_4a8…`.

Helper triggers TCC requests:
- "Trueyy Helper would like access to record your screen" → macOS dialog.
- "Trueyy Helper would like access to your microphone" → macOS dialog.

Alice clicks Allow on both. macOS persists the grant. Helper emits:

```
ws.emit("candidate-status", {
  session_id, screen_recording: true, mic_granted: true, joined: false
});
```

Cortex broadcasts to the room. *Nobody in the room yet except Helper + Alice's browser*, so no visible effect. Yet.

### 1:58 PM — Alice clicks "Open Meeting" (Step 3)

`<TrueyyJoin>` does two things in sequence:

```ts
// 1. Tell Helper the candidate is now in the meeting.
await fetch(`http://127.0.0.1:48123/session/joined-meeting`, {
  method: "POST",
  body: JSON.stringify({ session_id: "ses_4a8…" })
});

// 2. Open the meeting URL in a new tab.
window.open(zoomUrl, "_blank", "noopener,noreferrer");
```

Helper emits:

```
ws.emit("candidate-status", { session_id, joined: true });
```

**Cortex's `eventEmitter` does its two-side fan-out:**

```
       eventEmitter("session.ready", { session_id, candidate, joined_at })
                       │
              ┌────────┴────────┐
              ▼                 ▼
       Socket.io room       BullMQ webhook-delivery queue
       broadcasts to         INSERT webhook_deliveries (pending)
       any other client      enqueue job → webhookWorker
       in the session
```

In the next 50 ms:
- Bob's browser (when he opens his monitor page) will get `candidate-status: { joined: true }`.
- Acme's `/webhooks/trueyy` receives a `session.ready` POST.

Alice is now in Zoom. The capture pipeline is live.

---

## Phase 5: Interview in progress (45 minutes)

### 2:00 PM — Bob opens the interviewer monitor

Bob's link from Acme's ATS: `https://acme.com/interview/ACME-INT-123/monitor`. Acme's frontend loads with `interviewerToken`.

`<TrueyyMonitor>` mounts inside `<TrueyyProvider>`. Same handshake as Alice's browser but with `aud=interviewer`. Joins the session room.

Bob's panel renders three columns:

```
┌──────────────────────┬───────────────────────┬──────────────────────────┐
│ Risk pulses          │ Window analysis       │ Live transcript          │
│ [Capture now]        │                       │                          │
│                      │                       │ candidate: tell me about │
│ (none yet)           │ Waiting for first…    │   your last project      │
│                      │                       │ interviewer: sure, so…   │
└──────────────────────┴───────────────────────┴──────────────────────────┘
```

The "Joined" green check appears on Bob's pre-join checklist because the room sent him `candidate-status: { joined: true }` on socket connect (Cortex replays the last known status to late-joining clients).

### What's streaming under the hood

For the next 45 minutes, **three parallel streams** flow from Alice's machine to Cortex:

**Stream 1 — Mic audio → Deepgram → live transcript**

```
Alice's mic ─→ Helper (with AEC vs. system audio)
            └─→ WSS chunk every 250ms
                 │
                 ▼
            Cortex's /deepgram WSS proxy
                 │
                 ▼
            Deepgram Nova-2 streaming API
                 │
                 ▼
            Transcript fragments back to Cortex
                 │
                 ▼
            transcriptFusion service (dedup + speaker labeling)
                 │
                 ├─→ socket.io: "live-transcript" → Bob's monitor (50ms latency)
                 └─→ INSERT session_transcripts (Postgres)
                 └─→ eventEmitter "session.transcript_segment" → webhook to Acme
```

Bob sees transcript rolling in.
Acme's backend persists every final fragment via webhook.

**Stream 2 — Screenshots + app metadata → Layer 1 pulse (every 5s)**

```
Helper schedules a tick every 5s (driven by Cortex's "capture-pulse" emit).
On tick, Helper captures:
  - Active window title
  - List of foreground app names
  - Recent paste/copy counts

POST /v1/sessions/:id/pulse
Authorization: Bearer <helper_token>
Body: { apps, activities, paste_count, copy_count }
```

Cortex's `sessionGuard` rejects with `409 stand_down` if session is no longer ACTIVE — Helper halts on its own. (Defense against zombie capture.)

Otherwise: `categorizeApps()` keyword-matches against AI tool blocklist (ChatGPT, Claude, GitHub Copilot, etc.).

```
At 2:15 PM, Alice opens ChatGPT in a side window.
  → Helper captures it in the next tick (within 5s).
  → POST /pulse with apps:[{"app_name":"ChatGPT","window_title":"ChatGPT — Code generation"}]
  → categorizeApps() flags it as "AI_TOOL".
  → pulseSessionState dedup check: have we already alerted on this kind+keyword? No.
  → eventEmitter("session.risk_pulse", { kind: "ai_tool_detected", severity: "critical", ... })
       ├─→ socket.io "risk-pulse" → Bob's panel (red row at top)
       └─→ webhook "session.risk_pulse" → Acme's alerts pipeline (within 500ms)
```

Bob immediately sees a red row: `🚨 critical — ai_tool_detected (ChatGPT — Code generation)`. Acme's SecOps Slack channel pings simultaneously.

**Stream 3 — Window analysis (every 30s, deeper)**

```
Helper schedules a 30-second tick. On tick:
  - Captures screenshot, uploads to R2 (signed URL from Cortex).
  - Bundles last 30s of: keystrokes, app metadata, transcript fragments.
  - POST /v1/sessions/:id/windows with all of the above.

Cortex queues a job in BullMQ "window-processing" queue.
windowWorker.ts picks it up:
  1. Stores per-modality rows (window_voice, window_keystrokes, window_app_metadata).
  2. Runs heuristics — app detection, keystroke patterns, voice patterns.
  3. Fetches last 3 windows + recent image findings (context).
  4. Calls LLM (Groq llama-3.3-70b-versatile by default) for synthesis.
  5. UPDATE session_activity_window SET risk, score, summary.
  6. eventEmitter("session.window_result", { risk, score, summary, modality_breakdown })
       ├─→ socket.io "window-result" → Bob's panel (window 14 of 90 shown)
       └─→ webhook "session.window_result" → Acme persists score in their DB
```

Bob's "Window analysis" column updates every 30s with a one-line LLM summary like `MEDIUM (62) — Candidate paused for 18s; ChatGPT visible at 2:15:23; subsequent answer used precise terminology unusual for their stated experience level.`

### Bob hits "Capture now" mid-interview

Suspicious moment. Bob clicks the button in `<TrueyyMonitor>`. SDK emits:

```
ws.emit("capture-screenshots");
```

Cortex broadcasts `remote-capture-screenshots` to room. Helper receives it, captures 3 screenshots immediately, uploads to R2, POSTs `/image-analysis`. Image worker spawns:
- Vision LLM (Gemini 2.0 Flash) analyzes content.
- Sees: ChatGPT tab in background with question text matching the interview question.
- UPDATE `window_image_analysis` with `risk: CRITICAL, summary: "ChatGPT visible answering current question verbatim"`.
- eventEmitter `session.image_analysis_result`.

Bob's panel updates within 8s. Webhook fires to Acme.

### Token refresh (silently, ~every 4 minutes)

5 minutes after Bob's monitor loaded, his `interviewer_token` is about to expire. `TrueyyClient` (in `@trueyy/web-core`) detects this from the JWT's `exp` claim:

```
30 seconds before exp, client fires opts.onTokenExpiring().
```

Bob's wrapper code (Riya wrote it in Phase 2):
```ts
onTokenExpiring={async () => {
  const r = await fetch("/internal/refresh-trueyy-token", { method: "POST" });
  return r.text();
}}
```

Acme's `/internal/refresh-trueyy-token` calls server-side:
```ts
const fresh = await trueyy.sessions.refreshToken(sessionId, "interviewer");
return fresh.token;
```

Cortex returns a new 5-minute JWT. `WsClient.updateToken(newToken)` swaps it in, disconnects, reconnects with new auth. **Bob sees nothing.** Zero downtime.

(Same flow happens for Alice's candidate_token. Helper's token lasts up to 12h so it never refreshes mid-interview.)

---

## Phase 6: Interview ends (≈ 30 seconds)

### 2:45 PM — Bob clicks "End interview"

`<TrueyyMonitor>` doesn't have a built-in end button (Acme owns that UI). Bob clicks Acme's button, which calls server-side:

```ts
await trueyy.sessions.end(sessionId);
```

Cortex's `endSession()` service:
1. `UPDATE interview_sessions SET status = 'ENDED', ended_at = now() WHERE id = ? AND status IN ('SCHEDULED', 'ACTIVE')`.
2. Stops `analysisScheduler` (kills the 5s + 30s timers for this session).
3. `socketService` broadcasts `stop-analysis` + `stop-transcription` to the room.
4. Helper receives those → halts local capture, emits a final `candidate-status: { ended: true }`.
5. `sessionGuard` will now reject any subsequent `/pulse`, `/windows`, `/image-analysis` with `409 stand_down`.

`eventEmitter` fires twice in rapid succession:

```
"session.ended" → webhook to Acme:
  { session_id, external_id: "ACME-INT-123",
    started_at, ended_at, final_score: 67 (LLM-synthesized from all windows) }

(report generation job runs)

"session.report_ready" → webhook to Acme:
  { session_id, report_url: "https://r2.trueyy.com/reports/…signed…",
    expires_at: "2026-06-13T..." }
```

Acme's `/webhooks/trueyy` receives both. The receiver (Devon's code from Phase 2) updates `acmeDB.interviews` with `status="COMPLETED"`, `final_score=67`, `report_url=...`.

Helper, on Alice's machine, drops to idle. No more capture, no CPU, no network. Memory frees. Helper-JWT is forgotten.

---

## Phase 7: Post-hoc review (next day)

### Day 7, 9:00 AM — Bob (or another HR person) reviews Alice's interview

Bob opens Alice's candidate profile in Acme ATS. There's a "Review Trueyy session" button. Click → Acme's React page mounts:

```tsx
<TrueyyReplay
  sessionId={"ses_4a8…"}
  fetchSessionDetail={async (id) => {
    // Hits Acme's backend, which aggregates from:
    //   - acmeDB.risk_timeline (events received via webhook)
    //   - acmeDB.session_transcripts (received via webhook)
    //   - Cortex /v1/sessions/:id (live fetch for canonical session data)
    //   - signed report URL fetched from Cortex
    const r = await fetch(`/internal/trueyy-session/${id}`);
    return r.json();
  }}
/>
```

`<TrueyyReplay>` does **NOT** open a live WebSocket — interview is over. It renders:

- **Header**: title, status (`ENDED`), duration, final score.
- **Risk timeline column** — every `risk_pulse` color-coded by severity, scrubable.
- **Transcript** — scroll-through of the full conversation, two-speaker.
- **Window scores** — 90 rows (one per 30s window) with LLM summaries.
- **Embedded PDF report** — pulled from the `report_url` Cortex emitted.

Bob has all the evidence he needs to decide. He scrolls to 2:15 PM:

```
[2:15:18] candidate: actually, looking at this problem, I think we should…
[2:15:21] interviewer: take your time
[2:15:23] 🚨 critical risk_pulse: ai_tool_detected — ChatGPT
[2:15:34] candidate: …we could use a hash map to deduplicate the input
[2:15:36] window 28: CRITICAL (89) — answer phrasing changed abruptly after AI tool detected
```

Bob makes his decision. The integration is done.

---

## Cross-reference — where every component lives

| Phase | Component / file |
|---|---|
| 1. Signup | Skyview `/onboarding/*` + `ApiTokensPage.tsx` + `WebhooksPage.tsx` (`Anti-Cheating/Skyview`) |
| 2. SDK install | `@trueyy/node` + `@trueyy/web` published from `trueyy-sdk` |
| 3. `sessions.create` | `sessions.controller.ts` + `sessions.service.ts` in `Anti-Cheating/Cortex` |
| 3. `tk_live_` auth | `resolveTenant.ts` middleware Path A |
| 4. Helper auth | `resolveTenant.ts` Path B (session JWT, aud=helper) |
| 4. `<TrueyyJoin>` UI | `packages/web-react/src/TrueyyJoin.tsx` in trueyy-sdk |
| 4. `session.ready` webhook | `eventEmitter.ts` + `webhookWorker.ts` in Cortex |
| 5. Live transcript | Existing `transcriptFusion.ts` + new `eventEmitter` integration |
| 5. Pulse alerts | Existing `pulseSessionState` + new `eventEmitter` fan-out |
| 5. Window analysis | Existing `windowWorker` + new webhook side-effect |
| 5. `<TrueyyMonitor>` UI | `packages/web-react/src/TrueyyMonitor.tsx` |
| 5. Token refresh | `TrueyyClient.scheduleRefresh()` in `packages/web-core/src/client.ts` |
| 6. End session | `sessions.service.endSession()` + `socketService` broadcast |
| 6. `session.ended` webhook | `eventEmitter` queues to `webhookWorker` |
| 7. Post-hoc replay | `packages/web-react/src/TrueyyReplay.tsx` |
| Throughout | HMAC signing on every webhook: `webhookSigning.ts` + `@trueyy/node`'s `webhooks.verify` |
| Throughout | Cross-tenant isolation: `prismaTenantExtension.ts` |

That's the whole platform, working as one system — verified end-to-end by the 33-scenario e2e test on local Docker (see `Cortex/e2e_test.mjs` history, or the test summary in this monorepo's PR description).

---

## Status

V1. Production-ready. `/v1/*` contract is **frozen** — additive changes only.

V2 (BYO-DB per-tenant Postgres) is acknowledged in the umbrella spec but deferred.
