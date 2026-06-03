import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebhookEvent } from "./types.js";

const MAX_AGE_SEC = 300; // 5 min replay window

declare module "node:http" {
  interface IncomingMessage {
    trueyy?: { event: WebhookEvent };
  }
}

/**
 * Express-compatible middleware factory. Mount AFTER express.raw() so
 * the raw body is available for HMAC verification.
 *
 *   app.post("/webhooks/trueyy",
 *     express.raw({ type: "application/json" }),
 *     trueyy.webhooks.verify(secret),
 *     (req, res) => { req.trueyy!.event; });
 */
export class Webhooks {
  // Static — no constructor state needed.
  verify(secret: string) {
    return (
      req: IncomingMessage & { body?: unknown },
      res: ServerResponse,
      next: (err?: unknown) => void
    ): void => {
      const header = (req.headers["x-trueyy-signature"] as string | undefined) ?? "";
      const eventId = (req.headers["x-trueyy-event-id"] as string | undefined) ?? "";
      const eventType = (req.headers["x-trueyy-event-type"] as string | undefined) ?? "";
      if (!header || !eventId || !eventType) {
        sendError(res, 401, "Missing Trueyy webhook headers");
        return;
      }

      // Express express.raw() puts the raw bytes in req.body as Buffer.
      const rawBody = bufferLike(req.body);
      if (rawBody === null) {
        sendError(res, 400, "Raw body unavailable — wrap with express.raw()");
        return;
      }

      if (!verifySignatureHeader(secret, header, rawBody)) {
        sendError(res, 401, "Bad signature");
        return;
      }

      let parsed: WebhookEvent;
      try {
        parsed = JSON.parse(rawBody.toString("utf8")) as WebhookEvent;
      } catch {
        sendError(res, 400, "Body is not JSON");
        return;
      }

      req.trueyy = { event: parsed };
      next();
    };
  }
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

function bufferLike(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return null;
}

function verifySignatureHeader(
  secret: string,
  header: string,
  rawBody: Buffer
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return i === -1 ? [kv, ""] : [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - t) > MAX_AGE_SEC) return false;

  const mac = createHmac("sha256", secret);
  mac.update(`${t}.${rawBody.toString("utf8")}`);
  const expected = mac.digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
