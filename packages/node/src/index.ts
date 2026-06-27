import { HttpClient, type ClientOptions } from "./client.js";
import { Interviews } from "./interviews.js";
import { Team } from "./team.js";
import { Billing } from "./billing.js";
import { Reports } from "./reports.js";
import { Tokens } from "./tokens.js";
import { Webhooks } from "./webhooks.js";

export class Trueyy {
  /** Interviews = process + rounds (the same model as the dashboard). */
  public readonly interviews: Interviews;
  /** Invite interviewers + list members. */
  public readonly team: Team;
  /** Read-only billing (plans, subscription, usage, invoices). */
  public readonly billing: Billing;
  /** Per-round analysis reports. */
  public readonly reports: Reports;
  /** Mint short-lived browser tokens for embedding the monitor/join UI. */
  public readonly tokens: Tokens;
  /** Verify inbound webhook signatures. */
  public readonly webhooks: Webhooks;

  constructor(opts: ClientOptions) {
    if (!opts?.apiKey) {
      throw new Error("Trueyy: apiKey is required (TRUEYY_API_KEY)");
    }
    const http = new HttpClient(opts);
    this.interviews = new Interviews(http);
    this.team = new Team(http);
    this.billing = new Billing(http);
    this.reports = new Reports(http);
    this.tokens = new Tokens(http);
    this.webhooks = new Webhooks();
  }
}

export type { ClientOptions } from "./client.js";
export * from "./types.js";
export {
  TrueyyError,
  TrueyyAuthError,
  TrueyyNotFoundError,
  TrueyyValidationError,
  TrueyyRateLimitError,
  TrueyyServerError,
} from "./errors.js";
