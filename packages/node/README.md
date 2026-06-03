# @trueyy/node

Server SDK for [Trueyy](https://trueyy.com). Mint session tokens, query sessions, handle webhooks from a Node.js backend.

## Install

```bash
npm install @trueyy/node
```

## Usage

```ts
import express from "express";
import { Trueyy } from "@trueyy/node";

const trueyy = new Trueyy({ apiKey: process.env.TRUEYY_API_KEY! });
const app = express();

// Schedule an interview.
app.post("/internal/schedule", express.json(), async (req, res) => {
  const session = await trueyy.sessions.create({
    external_id: req.body.acme_id,
    candidate: req.body.candidate,
    interviewer: req.body.interviewer,
    scheduled_start_at: req.body.start,
    scheduled_end_at:   req.body.end,
    meeting_url:        req.body.zoom_url,
  });
  res.json(session);
});

// Webhook receiver.
app.post("/webhooks/trueyy",
  express.raw({ type: "application/json" }),
  trueyy.webhooks.verify(process.env.TRUEYY_WEBHOOK_SECRET!),
  (req, res) => {
    const { event_type, data } = req.trueyy!.event;
    // dispatch...
    res.sendStatus(200);
  }
);
```
