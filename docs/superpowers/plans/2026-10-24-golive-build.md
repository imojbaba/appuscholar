# Go-live build: AI quota, database health, first-party errors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three go-live code items in one PR: a per-user quota on the AI gateway, a `GET /health/db` route that really asks the database, and a first-party browser error route that logs only the error class, page route, build and request id.

**Architecture:** The quota is a fixed-window counter table (`rate_counters`) incremented by one conditional upsert per window, behind a new `Store.consumeQuota` (memory and Drizzle implementations, one contract test for both). The AI routes call it just before the provider is called. `/health/db` is `Store.ping()` behind a Hono route. The error route is a Next route handler in the web app plus a small client reporter hooked to the root error boundaries and the window's error events.

**Tech Stack:** Hono + Drizzle (Neon HTTP in production, pglite in tests), vitest, Next 16 route handlers, zod.

**Spec:** the owner's go-live notes 05c (section 3, Layer 2, and section 4 checks 1, 2, 7) and 05b (sections 2.1, 2.3, 2.4, and checks 3, 5, 6). Those notes are private: the code and tests carry only what they need and quote nothing.

## Global Constraints

- The repository is public: no secret, key, password or personal data in any commit, test fixture or log line.
- Quota numbers (per user): `/ai/complete` 40 per hour and 200 per day; `/ai/test` 5 per hour and 20 per day. Windows are fixed and aligned to the epoch hour and the UTC day.
- A quota rejection is HTTP 429 `{ error: "quota", detail: "<hour|day>:<seconds to wait>" }` plus a `Retry-After` header. A rejected call does not reach the provider and does not count against the window.
- A quota rejection logs one line holding only the bucket name and the opaque user id. No text, no key, no prompt.
- `/health/db`: `{ ok: true }` (200) or `{ ok: false }` (503); the answer and the log carry no error message and no query: at most the error's name and code.
- The error route records only: error class name, page route (path only, ids masked), build version, request id. Never a message, a stack, a URL query or hash, a user id, or any body field other than those.
- Copy: new student-facing sentences are English and Hindi (Hindi is a DRAFT for the Hindi reader), sentence case, no em-dashes, no emoji.
- Not in this plan: the vault's passphrase stretching, firewall rules, Vercel settings, provider retry count and function `maxDuration`, Sentry.
- No new dependency. No deploy, no merge, no Neon or Vercel setting changed. The migration is applied by the owner, not by this plan.
- Fences: only these areas may change: `apps/api/src/{app.ts,ai/quota.ts,routes/ai.ts,store/*}`, `apps/api/test/**`, `packages/db/src/schema.ts`, `packages/db/migrations/**`, `apps/web/lib/ai/callAI.ts`, `apps/web/lib/errors/**`, `apps/web/app/api/client-error/**`, `apps/web/app/global-error.tsx`, `apps/web/app/(app)/error.tsx`, `apps/web/components/ClientErrorListener.tsx` and its one mount in `apps/web/app/layout.tsx`, `apps/web/messages/{en,hi}.json` (new keys only), `apps/web/test/**` for new files, this plan and `docs/superpowers/ledgers/2026-10-24-golive-build.md`.

## Review Focus

1. **Shared address:** two users making calls from one address do not share a quota; one user at the limit does not block another. Test in Task 1 ("quota is per user and per route").
2. **Window edge:** the call after the last second of an hour window, and the first call of the next, behave (blocked, then allowed). Test in Task 1 ("a call at the window edge is blocked; one second later it passes").
3. **Parallel calls at the limit:** 10 simultaneous calls with 3 left let exactly 3 through. Test in Task 1 on the Drizzle store ("parallel consume never exceeds the limit").
4. **Hostile error report:** a body whose fields hold an email, a token, a long URL with a query and a 50 KB blob logs none of them. Test in Task 3 ("the log line holds only the four allowed fields").
5. **A database error that prints a connection string:** `/health/db` answers 503 with no message and logs only the error name. Test in Task 2 ("a failing ping leaks nothing").

---

### Task 1: Per-user AI quota (store, migration, routes, client message)

**Files:**
- Modify: `packages/db/src/schema.ts` (add `rateCounters`), `packages/db/migrations/0007_*.sql` + `meta/` (generated with `pnpm --filter @appuscholar/db db:generate`, name `0007_rate_counters`)
- Modify: `apps/api/src/store/types.ts`, `memory.ts`, `drizzle.ts` (`consumeQuota`)
- Create: `apps/api/src/ai/quota.ts`
- Modify: `apps/api/src/app.ts` (`AppOptions.quota?`), `apps/api/src/routes/ai.ts`
- Modify: `apps/web/lib/ai/callAI.ts`, `apps/web/messages/en.json`, `apps/web/messages/hi.json`
- Test: `apps/api/test/store.contract.ts` (new `describe` inside the shared contract), `apps/api/test/ai.quota.test.ts`, `apps/web/test/callAI.quota.test.ts`

**Interfaces:**
- Produces (`store/types.ts`): `type QuotaRule = { bucket: string; windowSec: number; limit: number }`; `type QuotaResult = { ok: true } | { ok: false; bucket: string; retryAfterSec: number }`; `Store.consumeQuota(userId: string, rules: QuotaRule[], now: Date): Promise<QuotaResult>`. Rules are tried in the order given; a rule that is full stops the call and consumes nothing from it or from later rules (earlier rules keep their count, which is acceptable: the caller is blocked for at least as long).
- Produces (`ai/quota.ts`): `type QuotaLimits = Record<"complete" | "test", { hour: number; day: number }>`; `const AI_QUOTAS: QuotaLimits` (the Global Constraints numbers); `function quotaRules(route: "complete" | "test", limits: QuotaLimits): QuotaRule[]` with buckets `"<route>:hour"` (3600 s) and `"<route>:day"` (86400 s); `AppOptions.quota?: { now?: () => Date; limits?: QuotaLimits }`.
- Produces (client): `AiErrorCode` gains `"quota"`; `apiMsg("quota", detail)` returns the English or Hindi sentence (see Step 6).

- [ ] **Step 1: Contract tests (fail first).** In `store.contract.ts` add, run for both stores: `allows up to the limit, then blocks with the seconds left in the window`; `a new window passes again, and the old window's count is not carried`; `quota is per user and per bucket`; `a full first rule consumes nothing from the second`; `parallel consume never exceeds the limit` (10 `Promise.all` calls, limit 3 → exactly 3 `ok`; this must run on the Drizzle/pglite store too); `a call at the window edge is blocked; one second later it passes`; `erasing the user removes the counters` (Drizzle: FK cascade; memory: `eraseUser`).
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/api test -- store drizzle memory` → FAIL (no `consumeQuota`).
- [ ] **Step 3: Schema and migration.** `rate_counters(user_id text FK users cascade, bucket text, window_start timestamptz, count integer default 0)`, primary key `(user_id, bucket, window_start)`. Generate the migration; do not hand-edit snapshots.
- [ ] **Step 4: Implement `consumeQuota`.** Window start = `floor(now / windowSec) * windowSec`. Drizzle: one `insert … onConflictDoUpdate(count + 1) where count < limit returning` per rule (no interactive transaction exists on the Neon HTTP driver); zero rows returned means full, `retryAfterSec = windowStart + windowSec - now` rounded up, at least 1. Also delete that user's rows with `window_start` older than 2 days (one statement per call). Memory: a `Map` with the same semantics. Run Step 2's command → PASS.
- [ ] **Step 5: Route tests (fail first)** in `ai.quota.test.ts` using `createApp` with the memory store, a stub `ai.fetch`, and an injected clock: `41st complete in an hour is 429 quota with Retry-After and detail hour:N, and the provider is not called`; `after the window the next call works`; `the 201st in a day is 429 with detail day:N` (advance the clock hour by hour); `/ai/test: the 6th in an hour is 429, the 21st in a day is 429`; `a personal-data 400 does not use a call`; `an invalid body does not use a call`; `two users are independent`; `/ai/log and /ai/log/summary are not limited`; `a rejection logs one line with the bucket and user id only` (spy `console.warn`, assert no prompt, key or email in it).
- [ ] **Step 6: Implement in `routes/ai.ts`:** call `store.consumeQuota` in `/complete` after the personal-data check and immediately before `complete(...)`, and in `/test` after body validation; on `ok:false` respond 429 `{ error: "quota", detail: "<hour|day>:<retryAfterSec>" }` with `Retry-After`, and `console.warn(JSON.stringify({ kind: "ai-quota", bucket, user: userId }))`. Thread `quota` options from `createApp` into `aiRoutes`. Run the route tests → PASS.
- [ ] **Step 7: Client.** Tests in `callAI.quota.test.ts`: an `ApiError(429, "quota", "hour:1500")` becomes `AiCallError` code `quota` whose message says to try again in 25 minutes; `day:*` says to try again tomorrow; Hindi when `document.documentElement.lang` is `hi`; the failover to another provider is NOT attempted for `quota` (add it to neither `RETRIABLE` nor the provider loop). Implement in `callAI.ts` (code list, `apiMsg`, a small `quotaMessage(detail)` using `tFormat(DICTS.en, DICTS.hi, key, lang, vars)` with the keys `ai_quota_hour` ("You have used your AI calls for this hour. Try again in {minutes} minutes.") and `ai_quota_day` ("You have used your AI calls for today. Try again tomorrow."); Hindi values drafted in `hi.json`). Existing `callAI.test.ts` stays green.
- [ ] **Step 8: Run** the API suite, the two web test files, `tsc` and `eslint` for `apps/api` and `apps/web`. Commit `feat(api): per-user AI quota with fixed windows`.

### Task 2: `GET /health/db`

**Files:** Modify `apps/api/src/store/types.ts`, `memory.ts`, `drizzle.ts` (`ping()`), `apps/api/src/app.ts`; Test `apps/api/test/health.test.ts`.

**Interfaces:** Produces `Store.ping(): Promise<void>` (Drizzle: `select 1`; memory: resolves, or rejects when the test sets a failure hook on the store instance); route `GET /health/db` with no auth, answering `{ ok: true }` 200 or `{ ok: false }` 503.

- [ ] **Step 1: Tests (fail first):** `/health still answers ok without touching the store`; `/health/db is 200 {ok:true} when the store answers`; `a failing ping leaks nothing`: the store rejects with `new Error("connect failed postgres://user:secret@host/db")` and code `ECONNREFUSED` → status 503, body exactly `{"ok":false}`, and the `console.error` spy received only the error name and code strings (assert the connection string appears in no logged argument); `the Drizzle store pings pglite`.
- [ ] **Step 2: Implement** `ping` on both stores and the route (before the auth middlewares; log `console.error("health/db failed", name, code)` on failure). Run `pnpm --filter @appuscholar/api test` → PASS; `tsc`, `eslint`. Commit `feat(api): /health/db asks the database`.

### Task 3: First-party browser error route

**Files:**
- Create: `apps/web/app/api/client-error/route.ts`, `apps/web/lib/errors/sanitize.ts`, `apps/web/lib/errors/reportClientError.ts`, `apps/web/components/ClientErrorListener.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/(app)/error.tsx`
- Modify: `apps/web/app/layout.tsx` (mount `<ClientErrorListener />` inside `<body>`)
- Test: `apps/web/test/clientError.route.test.ts`, `apps/web/test/clientError.report.test.ts`

**Interfaces:**
- Produces (`sanitize.ts`): `errorClass(name: unknown): string` (`^[A-Za-z][A-Za-z0-9_]{0,59}$`, else `"Error"`); `routeOf(path: unknown): string` (path only, no query or hash, max 120 characters, each segment of 20 or more characters or containing a digit run of 6 or more replaced by `:id`, anything not starting with `/` becomes `/`); `buildOf(v: unknown): string` (`^[0-9a-f]{7}$` or `"dev"`, else `"unknown"`).
- Produces (`reportClientError.ts`): `reportClientError(error: unknown, route?: string): void`: never throws; sends `{ name, route, build }` to `/api/client-error` with `navigator.sendBeacon` (fallback `fetch` with `keepalive`); the same name + route is sent once per page load; at most 5 reports per page load.
- Route: `POST /api/client-error`, no sign-in needed. Body limit 1 KB (413); not JSON or not an object (400); a request whose `Origin` is present and differs from the request's own origin (403). It logs ONE line: `JSON.stringify({ kind: "client-error", name, route, build, requestId })` with `requestId` = `x-vercel-id` when present else a fresh `crypto.randomUUID()`; answers 204 with `cache-control: no-store`. A best-effort cap of 30 logged reports per minute per server instance (excess answers 204 without logging).

- [ ] **Step 1: Tests (fail first)** for the route: `the log line holds only the four allowed fields` (body with `message`, `stack`, an email, a bearer-looking token, a URL with `?token=…#x` as route, a 50 KB string → 413 for the blob case; for the others, the logged line parsed has exactly keys `kind,name,route,build,requestId` and none of the hostile strings appear anywhere in it); `a route with ids is masked`; `bad JSON is 400`; `cross-origin is 403`; `over the cap logs nothing and answers 204`. For the reporter: `sends name, route and build only`, `dedupes the same error`, `stops at five`, `never throws when sendBeacon and fetch throw`, `an error whose name is not a safe identifier is reported as Error`.
- [ ] **Step 2: Implement** the three library files, the route and the components. `global-error.tsx` and `(app)/error.tsx` call `reportClientError(error)` once in an effect and render a plain, translated "Something went wrong" panel with a Try again button (reuse existing dictionary keys if a matching one exists, else add `app_error_title`, `app_error_retry` in `en.json`/`hi.json`). `ClientErrorListener` adds `window` `error` and `unhandledrejection` listeners (reporting the error's name only) and removes them on unmount. Run `pnpm --filter @appuscholar/web test -- clientError` → PASS.
- [ ] **Step 3: Check** the CSP still allows the call (`connect-src 'self'`, no change) with a unit-free assertion in the report; `tsc`, `eslint`. Commit `feat(web): first-party client error route and reporter`.

### Task 4: Read-only security checks and the report (controller, no subagent)

Run, change nothing: `pnpm audit --prod`; the live site's response headers (`curl -I`); CORS with a foreign `Origin` against the API; `gitleaks` only if already installed. Record findings in the ledger and report; fix only what is inside the fences above.
