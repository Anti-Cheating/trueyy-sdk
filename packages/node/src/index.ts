import { HttpClient, type ClientOptions } from "./client.js";
import { Sessions } from "./sessions.js";
import { Reports } from "./reports.js";
import { Webhooks } from "./webhooks.js";

export class Trueyy {
  public readonly sessions: Sessions;
  public readonly reports: Reports;
  public readonly webhooks: Webhooks;

  constructor(opts: ClientOptions) {
    if (!opts?.apiKey) {
      throw new Error("Trueyy: apiKey is required (TRUEYY_API_KEY)");
    }
    const http = new HttpClient(opts);
    this.sessions = new Sessions(http);
    this.reports = new Reports(http);
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
