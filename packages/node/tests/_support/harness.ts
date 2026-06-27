import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CORTEX_DIR = "/Users/darshvaghela/Documents/Anti Cheating/Cortex";
const PORT = 4567;
const BASE = `http://127.0.0.1:${PORT}`;
const TSX = `${CORTEX_DIR}/node_modules/.bin/tsx`;

export interface SdkSeed {
  apiKey: string;
  interviewerId: string;
  interviewerEmail: string;
  companyId: string;
  ownerToken: string;
}
export interface Backend extends SdkSeed { baseUrl: string; }

function cortexTestDbUrl(): string {
  const env = readFileSync(`${CORTEX_DIR}/.env`, "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("Cortex .env has no DATABASE_URL");
  return m[1].trim().replace(/\/[^/?]+(\?|$)/, "/cortex_test$1");
}

let proc: ChildProcess | null = null;

/** Spawn the REAL Cortex server against cortex_test, then seed a tenant + key. */
export async function startBackend(): Promise<Backend> {
  const dbUrl = cortexTestDbUrl();
  const childEnv = { ...process.env, DATABASE_URL: dbUrl, PORT: String(PORT), TEST_MODE: "true", NODE_ENV: "test" };

  proc = spawn(TSX, ["src/index.ts"], { cwd: CORTEX_DIR, env: childEnv, stdio: "ignore" });

  let up = false;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) { up = true; break; } } catch { /* not ready */ }
    await sleep(500);
  }
  if (!up) { stopBackend(); throw new Error("Cortex did not become healthy on :" + PORT); }

  const out = execFileSync(TSX, ["tests/e2e/_support/seed-sdk.ts"], { cwd: CORTEX_DIR, env: childEnv, encoding: "utf8" });
  const line = out.split("\n").find((l) => l.startsWith("SDK_SEED "));
  if (!line) throw new Error("seed-sdk produced no SDK_SEED line:\n" + out);
  const seed = JSON.parse(line.slice("SDK_SEED ".length)) as SdkSeed;
  return { baseUrl: BASE, ...seed };
}

export function stopBackend(): void {
  if (proc) { proc.kill("SIGKILL"); proc = null; }
}
