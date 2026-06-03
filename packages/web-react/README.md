# @trueyy/web

React components for embedding Trueyy interview monitoring in your ATS.

## Install

```bash
npm install @trueyy/web
```

Import the default CSS once:

```ts
import "@trueyy/web/styles.css";
```

## Usage

```tsx
import { TrueyyProvider, TrueyyMonitor, TrueyyJoin, TrueyyReplay } from "@trueyy/web";

// Interviewer page
<TrueyyProvider token={interviewerToken} theme={{ primary: "#3B82F6" }}>
  <TrueyyMonitor onRiskAlert={(e) => acmeAnalytics.track("risk", e)} />
</TrueyyProvider>

// Candidate join page
<TrueyyProvider token={candidateToken}>
  <TrueyyJoin meetingUrl={zoomUrl} cortexUrl="https://api.trueyy.com" />
</TrueyyProvider>

// Post-hoc replay (no live socket; pulls from your API)
<TrueyyReplay
  sessionId={sessionId}
  fetchSessionDetail={async (id) => {
    const res = await fetch(`/our-ats/trueyy/sessions/${id}`);
    return res.json();
  }}
/>
```
