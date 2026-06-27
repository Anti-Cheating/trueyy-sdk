import type { HttpClient } from "./client.js";

/** Billing = READ-ONLY. List plans, current subscription, usage, invoices.
 *  Plan upgrade/subscribe/cancel are intentionally NOT here — those happen
 *  in the Trueyy dashboard. */
export class Billing {
  constructor(private http: HttpClient) {}
  plans(): Promise<unknown> { return this.http.request<unknown>({ method: "GET", path: "/v1/billing/plans" }); }
  subscription(): Promise<unknown> { return this.http.request<unknown>({ method: "GET", path: "/v1/billing/subscription" }); }
  invoices(): Promise<unknown> { return this.http.request<unknown>({ method: "GET", path: "/v1/billing/invoices" }); }
  usage(): Promise<unknown> { return this.http.request<unknown>({ method: "GET", path: "/v1/billing/usage" }); }
}
