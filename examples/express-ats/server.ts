import express from "express";
import { Trueyy } from "@trueyy/node";

const trueyy = new Trueyy({
  apiKey: process.env.TRUEYY_API_KEY ?? "tk_live_PUT_YOUR_TOKEN_HERE",
  baseUrl: process.env.TRUEYY_BASE_URL ?? "http://localhost:4000",
});

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

/**
 * Schedule an interview. Mint Trueyy session + return interviewer_token
 * to the frontend so they can embed <TrueyyMonitor>.
 */
app.post("/internal/schedule-interview", express.json(), async (req, res) => {
  try {
    const session = await trueyy.sessions.create({
      external_id: req.body.acme_interview_id,
      candidate: req.body.candidate,
      interviewer: req.body.interviewer,
      scheduled_start_at: req.body.start,
      scheduled_end_at: req.body.end,
      meeting_url: req.body.zoom_url,
    });
    // Persist trueyy_session_id + tokens in your DB:
    //   await acmeDB.interviews.update(req.body.acme_interview_id, {
    //     trueyy_session_id: session.session_id,
    //     trueyy_interviewer_token: session.interviewer_token,
    //     trueyy_candidate_token: session.candidate_token,
    //   });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Webhook receiver — mounted with express.raw() so HMAC verification
 * works against the raw bytes.
 */
app.post(
  "/webhooks/trueyy",
  express.raw({ type: "application/json" }),
  trueyy.webhooks.verify(process.env.TRUEYY_WEBHOOK_SECRET ?? "REPLACE_ME"),
  async (req, res) => {
    const { event_type, data } = req.trueyy!.event;
    switch (event_type) {
      case "session.ready":
        console.log("Candidate joined:", data);
        break;
      case "session.transcript_segment":
        console.log("Transcript:", data);
        break;
      case "session.risk_pulse":
        console.log("Risk pulse:", data);
        break;
      case "session.ended":
        console.log("Session ended:", data);
        break;
      default:
        console.log("Unhandled event:", event_type, data);
    }
    res.sendStatus(200);
  }
);

app.listen(PORT, () => {
  console.log(`Express ATS example listening on http://localhost:${PORT}`);
});
