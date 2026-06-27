import express from "express";
import { Trueyy, type SessionRole } from "@trueyy/node";

/**
 * Reference ATS backend — exercises EVERY @trueyy/node API surface:
 *   interviews (create / list / get / addRound / cancel)
 *   tokens     (mint — candidate / interviewer / helper)
 *   reports    (get)
 *   team       (invite / members / invites)
 *   billing    (plans / subscription / usage / invoices — read-only)
 *   webhooks   (verify)
 *
 * In a real ATS these would sit behind YOUR auth; here they're plain routes
 * so you can curl each one and see the SDK call it maps to.
 */
const trueyy = new Trueyy({
  apiKey: process.env.TRUEYY_API_KEY ?? "tk_live_PUT_YOUR_TOKEN_HERE",
  baseUrl: process.env.TRUEYY_BASE_URL ?? "http://localhost:4000",
});

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

/** Async route wrapper — forwards the SDK's HTTP status (e.g. 404, 422) through. */
const h =
  (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch((err: unknown) => {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({ error: (err as Error).message });
    });

// ─────────────────────────── Interviews ───────────────────────────

/**
 * Schedule an interview — the realistic core flow:
 * invite the interviewer → create the interview + round 1 → mint browser tokens.
 */
app.post(
  "/internal/schedule-interview",
  express.json(),
  h(async (req, res) => {
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

    res.json({
      interview_id: interview.id,
      round_id: interview.round_id,
      candidate,
      interviewer: interviewerToken,
    });
  }),
);

/** List interviews (paginated; optional ?search=&limit=&offset=). */
app.get(
  "/internal/interviews",
  h(async (req, res) => {
    const page = await trueyy.interviews.list({
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    res.json(page);
  }),
);

/** Fetch one interview with all its rounds + per-round analysis summary. */
app.get(
  "/internal/interviews/:id",
  h(async (req, res) => {
    res.json(await trueyy.interviews.get(req.params.id!));
  }),
);

/** Add another round (a different interviewer / day) to an existing interview. */
app.post(
  "/internal/interviews/:id/rounds",
  express.json(),
  h(async (req, res) => {
    const round = await trueyy.interviews.addRound(req.params.id!, {
      round_name: req.body.round_name,
      interviewer_user_id: req.body.interviewer_user_id,
      scheduled_start_at: req.body.start,
      scheduled_end_at: req.body.end,
      timezone: req.body.timezone ?? "UTC",
      meeting_link: req.body.zoom_url,
    });
    res.json(round);
  }),
);

/** Cancel the interview (and every round that hasn't started yet). */
app.delete(
  "/internal/interviews/:id",
  h(async (req, res) => {
    await trueyy.interviews.cancel(req.params.id!);
    res.sendStatus(204);
  }),
);

// ─────────────────────────── Tokens ───────────────────────────

/**
 * Mint a fresh short-lived browser token for a round. role is one of
 * "candidate" | "interviewer" | "helper". Your frontend calls this (via your
 * auth) to (re)embed <TrueyyJoin> / <TrueyyMonitor>, or to refresh a token
 * that's about to expire (the React provider's onTokenExpiring hook).
 */
app.post(
  "/internal/rounds/:roundId/token",
  express.json(),
  h(async (req, res) => {
    const role = (req.body.role ?? "candidate") as SessionRole;
    res.json(await trueyy.tokens.mint(req.params.roundId!, role));
  }),
);

// ─────────────────────────── Reports ───────────────────────────

/** The final per-round report (risk score, pulses, windows, transcript). */
app.get(
  "/internal/reports/:roundId",
  h(async (req, res) => {
    res.json(await trueyy.reports.get(req.params.roundId!));
  }),
);

// ─────────────────────────── Team ───────────────────────────

app.post(
  "/internal/team/invite",
  express.json(),
  h(async (req, res) => {
    res.json(await trueyy.team.invite({ email: req.body.email, role: req.body.role ?? "Member" }));
  }),
);

app.get(
  "/internal/team/members",
  h(async (_req, res) => {
    res.json(await trueyy.team.members());
  }),
);

app.get(
  "/internal/team/invites",
  h(async (_req, res) => {
    res.json(await trueyy.team.invites());
  }),
);

// ─────────────────────── Billing (read-only) ───────────────────────
// Plans/usage/invoices are readable here; actual plan changes happen in the
// Trueyy dashboard, never via the SDK.

app.get(
  "/internal/billing",
  h(async (_req, res) => {
    const [plans, subscription, usage, invoices] = await Promise.all([
      trueyy.billing.plans(),
      trueyy.billing.subscription(),
      trueyy.billing.usage(),
      trueyy.billing.invoices(),
    ]);
    res.json({ plans, subscription, usage, invoices });
  }),
);

// ─────────────────────────── Webhooks ───────────────────────────

/**
 * Webhook receiver — mounted with express.raw() so HMAC verification works
 * against the raw bytes. The middleware validates the signature, enforces the
 * replay window, and puts the parsed event on req.trueyy.event.
 */
app.post(
  "/webhooks/trueyy",
  express.raw({ type: "application/json" }),
  trueyy.webhooks.verify(process.env.TRUEYY_WEBHOOK_SECRET ?? "REPLACE_ME"),
  (req, res) => {
    const { event_type, data } = req.trueyy!.event;
    switch (event_type) {
      case "session.ready":
        console.log("Candidate joined + helper online:", data);
        break;
      case "session.transcript_segment":
        console.log("Transcript fragment:", data);
        break;
      case "session.risk_pulse":
        console.log("Layer-1 risk pulse:", data);
        break;
      case "session.window_result":
        console.log("Layer-2 window analysis:", data);
        break;
      case "session.image_analysis_result":
        console.log("Layer-3 image analysis:", data);
        break;
      case "session.ended":
        console.log("Session ended:", data);
        break;
      case "session.report_ready":
        console.log("Final report ready:", data); // → fetch via reports.get(round_id)
        break;
      case "session.cancelled":
        console.log("Session cancelled:", data);
        break;
      default:
        console.log("Unhandled event:", event_type, data);
    }
    res.sendStatus(200);
  },
);

app.listen(PORT, () => {
  console.log(`Express ATS example listening on http://localhost:${PORT}`);
});
