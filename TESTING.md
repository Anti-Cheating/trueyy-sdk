# Testing the Trueyy SDK

The SDK test suites are **end-to-end with no mocks**. `@trueyy-sdk/node` and
`@trueyy-sdk/web-core` run against a **real Cortex backend** that the harness boots
for you; `@trueyy-sdk/web` renders the React components in a real DOM (jsdom).

## Prerequisites

1. **The Cortex repo checked out locally.** The tests boot Cortex's actual
   server (`Cortex/src/index.ts`) as a child process — they do **not** hit npm
   or `api.trueyy.com`. By default Cortex is expected as a **sibling** of this
   repo:

   ```
   Anti Cheating/
   ├── Cortex/        ← the backend
   └── trueyy-sdk/    ← this repo
   ```

   On a different layout, point the harness at Cortex with an env var:

   ```bash
   CORTEX_DIR=/abs/path/to/Cortex ./localtest.sh
   ```

2. **Docker Postgres + Redis** (Cortex's `docker compose` stack). The runner
   brings them up if they aren't already running.

3. Cortex deps installed (`cd ../Cortex && npm install`) and a `Cortex/.env`
   with a working `DATABASE_URL` (the harness swaps the DB name to
   `cortex_test`).

## Run everything (recommended)

```bash
./localtest.sh           # brings up PG+Redis, prepares cortex_test,
                         # runs all 3 packages with coverage, then cleans up
./localtest.sh --plain   # same, without the coverage report (faster)
```

`localtest.sh` cleans up on exit: it drops `cortex_test`, kills any spawned
Cortex process, and stops **only** the containers it started (it never tears
down a stack that was already running).

## Run a single package

```bash
# requires cortex_test prepared once: (cd ../Cortex && npm run test:e2e:setup)
pnpm -F @trueyy-sdk/node      test:cov   # spawns a real Cortex on :4567
pnpm -F @trueyy-sdk/web-core  test:cov   # spawns a real Cortex on :4568
pnpm -F @trueyy-sdk/web       test:cov   # jsdom only, no backend
```

## What hits the backend

| Package | Calls a real Cortex? |
|---|---|
| `@trueyy-sdk/node` | **Yes** — every resource over real HTTP to the spawned server (webhook `verify()` uses a real local HTTP receiver + genuine HMAC). |
| `@trueyy-sdk/web-core` | **Partly** — `WsClient`/`TrueyyClient` use the real Cortex Socket.io; `helperBridge` uses a real local HTTP server standing in for the desktop Helper daemon. |
| `@trueyy-sdk/web` | **No** — pure DOM rendering; `<TrueyyReplay>` uses the consumer's `fetchSessionDetail` callback. |

## Env knobs

| Var | Default | Purpose |
|---|---|---|
| `CORTEX_DIR` | `../Cortex` | Path to the Cortex repo the harness boots. |
| `SDK_TEST_CORTEX_PORT` | `4567` (node) / `4568` (web-core) | Port the spawned Cortex listens on. |
