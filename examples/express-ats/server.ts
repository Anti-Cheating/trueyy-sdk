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
    // 1. Ensure the interviewer exists, then reference them by id.
    await trueyy.team.invite({ email: req.body.interviewer.email, role: "Member" });
    const { members } = await trueyy.team.members();
    const interviewer = members.find((m) => m.email === req.body.interviewer.email);
    if (!interviewer) {
      res.status(409).json({ error: "Interviewer must accept their invite before scheduling" });
      return;
    }

    // 2. Create the interview + round 1.
    const interview = await trueyy.interviews.create({
      role: req.body.role ?? "Interview",
      candidate_email: req.body.candidate.email,
      candidate_first_name: req.body.candidate.first_name,
      candidate_last_name: req.body.candidate.last_name,
      first_round: {
        round_name: req.body.round_name ?? "Round 1",
        interviewer_user_id: interviewer.id,
        scheduled_start_at: req.body.start,
        scheduled_end_at: req.body.end,
        timezone: req.body.timezone ?? "UTC",
        meeting_link: req.body.zoom_url,
      },
    });

    // 3. Mint browser tokens for your candidate + interviewer UIs.
    const candidate = await trueyy.tokens.mint(interview.round_id, "candidate");
    const interviewerToken = await trueyy.tokens.mint(interview.round_id, "interviewer");

    res.json({ interview_id: interview.id, round_id: interview.round_id, candidate, interviewer: interviewerToken });
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
