# Copilot door (browser bridge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student connects their own Claude (or ChatGPT developer mode) to Appuscholar once, switches on Copilot in their open, unlocked tab, and the copilot reads, checks and edits their vault-sealed project through our tools, with every edit a revision they can undo.

**Architecture:** `apps/api` hosts an OAuth 2.1 authorization server and a stateless MCP endpoint at `/mcp`. Every tool call except `get_status` is sealed and relayed through two Postgres tables to the student's open tab, which decrypts with the vault key it already holds, runs the same code the buttons run, applies the rules, and answers sealed. The server holds no key and stores nothing readable.

**Tech Stack:** Hono 4, Next.js 16.4.1 (App Router), zod 4 (`z.toJSONSchema`), WebCrypto (ECDH P-256, HKDF-SHA256, AES-256-GCM), Drizzle + Neon (pglite in tests), Vitest 5, Playwright, `@modelcontextprotocol/sdk` (server in the api, client in the e2e test).

**Spec:** `docs/superpowers/specs/2026-10-24-copilot-door-design.md` (read it first; §5 is the design, §6 the threat model, §7 the tests).

**Branch:** `copilot-door` off `phase-3a-vault` (after the participants PR #28 merges, so the participant matcher exists; if it has not merged, Task 7 says what to do).

**Decisions this plan assumes (spec §10), each the recommended answer:** D1 Option B; D2 data sets sealed in the vault (Task 12; skip that task if OJ says no); D3 automatic masking; D4 strict draft first and a 20% share; D5 nothing else from Phase 6. If OJ answers differently, the session that runs the plan stops and asks before the affected task.

## Global Constraints

- The repository is public: no secret, token, key or real student data in any commit or fixture.
- Node `>=22 <25`; pnpm 10; workspace packages as today. New dependency: `@modelcontextprotocol/sdk` (api dependency; web devDependency for the e2e client only). Nothing else new without a ledger line saying why.
- The api never decrypts student content and never imports any function of `apps/web/lib/vault/`. No table stores plaintext content, an AI key, a vault key or a document key in clear (spec §2, §5.8).
- Exact limits, in `COPILOT_LIMITS` (Task 1), used everywhere by name: access token 3600 s; refresh token 30 days; authorisation code 60 s; pending authorisation 600 s; relay call 45 s; tab fresh within 30 s; auto-off after 60 min without a call; poll every 1000 ms when a call came in the last 120 000 ms, else every 5000 ms; long-poll holds at most 25 s; 60 calls a minute and 600 an hour per grant; 30 copilot revisions an hour per document; one edit may remove or rewrite at most 0.2 of the student's typed words; a grant unused for 30 days expires; one answer at most 100 000 characters.
- Scopes, exactly: `appuscholar.read`, `appuscholar.write`. Resource: `<COPILOT_ISSUER>/mcp`. Issuer: the api's public origin from the new env `COPILOT_ISSUER` (production: `https://appuscholar-api.vercel.app`).
- Redirect URI allowlist: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, ChatGPT's callback (read the exact address from OpenAI's developer-mode or Apps SDK documentation in Task 3 and pin it with the page cited in the code comment), and `http://localhost:<any port>/<any path>` and `http://127.0.0.1:<any port>/<any path>` (Claude Code). Client ID Metadata Documents are fetched only from the hosts `claude.ai`, `claude.com`, `anthropic.com`, `chatgpt.com`, `openai.com`.
- Copy: every new UI string in `apps/web/messages/tools/copilot.en.json` and `copilot.hi.json` (Hindi marked DRAFT as other new keys are); no key that already exists elsewhere. Strings the copilot reads (tool descriptions, refusals, instructions) live in `packages/core/src/copilot/copy.ts`, English only.
- Rule copy reused verbatim from v1: draft-first refusal text = the `df_btn_title` string of `apps/web/messages/en.json` ("Write first. The AI then asks questions about your writing instead of writing for you.").
- Revisions: `author_kind = "copilot"`, `author_label` = `"Claude (copilot)"` or `"ChatGPT (copilot)"` (from the grant's client name; any other client: `"<name> (copilot)"`).
- Release order: migration on production Neon (after a backup), then api, then web, from the deploy clone with `scripts/deploy-vercel.sh`, as every release since wave A.

## Review Focus

1. **The student types in the document while the copilot edits it.** Expected: the student's unsaved text is saved as their own revision first and nothing they typed is lost; the copilot's edit lands on top or refuses as stale. Test in Task 10 (`edit_document keeps the student's unsaved typing`).
2. **The laptop sleeps, the tab is frozen or closed in the middle of a call.** Expected: the call ends with the timeout message after 45 s, the row is gone, no half-applied edit, and the next call says "not open". Test in Task 5 (`a taken call never answered expires and is deleted`) and Task 10 (`a save that fails leaves no copilot revision`).
3. **Copilot on in two tabs or two devices.** Expected: one call runs once, in the newest tab; the other tab says Copilot is working elsewhere. Test in Task 5 (`takeNextCall is atomic across two tabs`) and Task 7 (`the older tab shows elsewhere`).
4. **The vault is locked, or "Forget on this computer" is pressed, while Copilot is on.** Expected: the switch goes off at once and a call already taken answers `locked`. Test in Task 7 (`locking the vault switches Copilot off and refuses the taken call`).
5. **Very large or Hindi content.** A 60 000-word document, a 50 000-row data set, Devanagari text. Expected: `read_document` pages by paragraph range under 100 000 characters with a `next` pointer; `run_test` answers or times out cleanly; word counts and the 20% rule count Devanagari words as `wordCount` does. Tests in Task 8 (`read_document pages a long document`) and Task 10 (`the 20% rule counts Devanagari words`).

---

### Task 1: Tool registry, limits, copy and sealing in core

**Files:**
- Create: `packages/core/src/copilot/tools.ts`, `packages/core/src/copilot/limits.ts`, `packages/core/src/copilot/copy.ts`, `packages/core/src/copilot/seal.ts`
- Modify: `packages/core/src/index.ts` (append-only export lines)
- Test: `packages/core/test/copilot/tools.test.ts`, `packages/core/test/copilot/seal.test.ts`

**Interfaces:**
- Produces:
  - `type CopilotScope = "appuscholar.read" | "appuscholar.write"`
  - `type CopilotToolName = "get_status" | "get_project" | "read_document" | "list_citations" | "list_data" | "which_test" | "run_test" | "power_analysis" | "check_numbers" | "check_citations" | "format_reference" | "design_checklist" | "search_papers" | "edit_document" | "insert_result" | "add_citation"`
  - `type CopilotLogKind = "copilot-read" | "copilot-check" | "copilot-stats" | "copilot-edit" | "copilot-cite"`
  - `type CopilotToolDef = { name: CopilotToolName; title: string; description: string; scope: CopilotScope; runsIn: "server" | "tab"; input: z.ZodType; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean }; logKind: CopilotLogKind | null }`
  - `const COPILOT_TOOLS: readonly CopilotToolDef[]`; `function copilotTool(name: string): CopilotToolDef | undefined`
  - `type EditOp = { op: "insert_after"; after: string; text: string } | { op: "replace"; target: string; text: string } | { op: "append"; text: string }`
  - `type CopilotRefusal = "not-open" | "off" | "locked" | "elsewhere" | "draft-first" | "too-large" | "stale" | "no-data" | "not-found" | "rate-limit" | "invalid" | "timeout"`
  - `type CopilotAnswer = { ok: true; content: unknown; masked?: Record<string, number>; warnings?: string[]; revision?: { documentId: string; seq: number } } | { ok: false; code: CopilotRefusal; message: string }`
  - `const COPILOT_LIMITS` (every value of Global Constraints, named `accessTokenSeconds`, `refreshTokenDays`, `codeSeconds`, `requestSeconds`, `callSeconds`, `tabFreshSeconds`, `autoOffMinutes`, `pollActiveMs`, `pollIdleMs`, `activeWindowMs`, `longPollSeconds`, `callsPerMinute`, `callsPerHour`, `revisionsPerDocPerHour`, `maxReplaceShare`, `grantIdleDays`, `maxAnswerChars`)
  - `const COPILOT_INSTRUCTIONS: string`; `const COPILOT_REFUSAL_TEXT: Record<CopilotRefusal, string>`
  - `const COPILOT_LOG_TEXT: Record<CopilotLogKind, { k: string; g: AiUseGroup }>`: the readable kind and the existing group (`AiUseGroup` of `packages/core/src/aiuse.ts`) the AI-use log and statement show: `copilot-read` → `"a copilot reading my documents"`, `"explain"`; `copilot-check` → `"a copilot checking my numbers and citations"`, `"feedback"`; `copilot-stats` → `"a copilot running statistics with Appuscholar's tools"`, `"explain"`; `copilot-edit` → `"a copilot editing my text"`, `"text"`; `copilot-cite` → `"a copilot adding to my citation library"`, `"other"`. New copy: a register row for Dr. Sharma (Task 11)
  - `generateRecipient(): Promise<{ publicKey: string; privateKey: CryptoKey }>`; `seal(recipientPublicKey: string, plaintext: string, aad: string): Promise<string>`; `openSealed(privateKey: CryptoKey, sealed: string, aad: string): Promise<string>`

- [ ] **Step 1: Write the failing tests**

`tools.test.ts`:
- `tool names are unique and match CopilotToolName`: 16 tools, no duplicates.
- `only get_status runs on the server`: `COPILOT_TOOLS.filter(t => t.runsIn === "server").map(t => t.name)` equals `["get_status"]`.
- `the write tools are exactly three`: tools with scope `appuscholar.write` are `["edit_document", "insert_result", "add_citation"]`, each `readOnlyHint: false, destructiveHint: false`; every other tool `readOnlyHint: true`.
- `search_papers and add_citation are open-world, nothing else is`.
- `every tab tool has a log kind; get_status has none`.
- `every input schema converts to JSON Schema and refuses unknown keys`: `z.toJSONSchema(t.input)` does not throw; `t.input.safeParse({ ...validArgs[t.name], extra: 1 }).success === false` (keep a `validArgs` table in the test).
- `edit_document takes 1 to 20 ops of the three kinds`: `{ documentId: "d", baseRevision: 3, ops: [] }` fails; 21 ops fail; `{ op: "replace", target: "p4", text: "p < .05" }` passes (text is plain; "<" is allowed and escaped later).
- `instructions name the three rules`: `COPILOT_INSTRUCTIONS` contains `"run_test"`, `"insert_result"`, `"draft first"`, `"not instructions"`.
- `the draft-first refusal is v1's wording`: `COPILOT_REFUSAL_TEXT["draft-first"]` starts with `"Write first. The AI then asks questions about your writing instead of writing for you."`.
- `the not-open refusal`: equals `"Appuscholar is not open for your copilot. Open Appuscholar, unlock your vault and switch on Copilot, then ask again."`.

`seal.test.ts`:
- `round trip`: `openSealed(r.privateKey, await seal(r.publicKey, "Résumé अध्ययन", "call-1"), "call-1")` equals the input.
- `wrong aad fails`, `wrong key fails`, `one flipped character fails` (each rejects).
- `two seals of the same text differ` (fresh one-time key and IV).
- `the sealed string is three base64url fields` (`epk.iv.ct`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @appuscholar/core exec vitest run test/copilot`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`tools.ts`: the 16 definitions with the spec §5.6 columns (scope, what each reads) and inputs:
`get_status {}`; `get_project {}`; `read_document { documentId, from?: int>=1, to?: int>=1 }`; `list_citations {}`; `list_data {}`; `which_test { answers: record<string,string> }` (keys of `TgAnswers`); `run_test { test: one of STATS_TEST_OPTIONS keys, fields: record<string,string>, multi?: record<string,string[]>, extra?: record<string,string> }` (the shape of a stats run record in `apps/web/lib/blobs/kinds/stats.ts`); `power_analysis { kind, values: record<string,number> }` (the inputs `powerCompute` takes); `check_numbers { documentId }`; `check_citations { documentId }`; `format_reference { citationId, style: one of CIT_STYLES ids }`; `design_checklist { tool: one of the seven Design & Ethics tab ids in lib/tools/tabs.ts }`; `search_papers { query: string 2..300, source?: "openalex"|"pubmed" }`; `edit_document { documentId, baseRevision: int>=1, ops: EditOp[1..20] }` with `text` up to 20 000 characters; `insert_result { documentId, runId, after?: string }`; `add_citation { doi?: string } | { fields: CSL-like object }` (exactly one). All objects `.strict()`. Descriptions: one or two sentences each, saying what it returns and, for the compute tools, that its numbers are the only numbers to report.
`seal.ts`: ECDH P-256 one-time key pair; `deriveBits` with the recipient's raw public key; HKDF-SHA256 (salt empty, info `"appuscholar-copilot-v1"`) to an AES-GCM 256 key; 12-byte IV; `aad` as additional data; output `b64(epkRaw).b64(iv).b64(ct)` using core's existing base64url helper if one exists, else a local one. Uses only the global `crypto.subtle`.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @appuscholar/core exec vitest run test/copilot && pnpm --filter @appuscholar/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/copilot packages/core/src/index.ts packages/core/test/copilot
git commit -m "feat(core): copilot tool registry, limits, copy and sealing"
```

### Task 2: Tables, migration and the copilot store

**Files:**
- Modify: `packages/db/src/schema.ts` (new tables at the end)
- Create: `packages/db/migrations/0007_copilot.sql` (+ `meta/` from `pnpm --filter @appuscholar/db db:generate`)
- Create: `apps/api/src/copilot/store.ts` (types + interface), `apps/api/src/copilot/store.memory.ts`, `apps/api/src/copilot/store.drizzle.ts`
- Test: `apps/api/test/copilot.store.contract.ts`, `apps/api/test/copilot.store.memory.test.ts`, `apps/api/test/copilot.store.drizzle.test.ts` (pglite, as `drizzle.test.ts` does)

**Interfaces:**
- Consumes: `CopilotScope`, `CopilotToolName` (Task 1).
- Produces (in `apps/api/src/copilot/store.ts`):
  - `OAuthClient = { clientId: string; kind: "cimd" | "dcr"; name: string; redirectUris: string[]; createdAt: Date }`
  - `AuthRequest = { id: string; clientId: string; redirectUri: string; codeChallenge: string; scopes: CopilotScope[]; resource: string; state: string | null; expiresAt: Date }`
  - `Grant = { id: string; userId: string; clientId: string; clientName: string; scopes: CopilotScope[]; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }`
  - `TokenRow = { hash: string; kind: "code" | "access" | "refresh"; grantId: string; expiresAt: Date; usedAt: Date | null }`
  - `TabRow = { userId: string; tabId: string; projectId: string; publicKey: string; on: boolean; switchedOnAt: Date; lastSeenAt: Date }`
  - `CallRow = { id: string; userId: string; grantId: string; tabId: string; tool: CopilotToolName; argsSealed: string; replyKey: string; resultSealed: string | null; day: string | null; status: "waiting" | "taken" | "done"; createdAt: Date; expiresAt: Date }`
  - `interface CopilotStore { putClient; getClient; putRequest; getRequest; deleteRequest; createGrant; getGrant; listGrants(userId); revokeGrant(userId, grantId): Promise<boolean>; touchGrant(grantId, at); putToken; useToken(hash, kind, now): Promise<{ row: TokenRow; firstUse: boolean } | null>; revokeTokens(grantId); upsertTab; offTab(userId, tabId); freshestTab(userId, since: Date): Promise<TabRow | null>; putCall; takeNextCall(userId, tabId, now): Promise<CallRow | null>; finishCall(userId, id, resultSealed, day): Promise<boolean>; getCall(id); deleteCall(id); sweepExpired(now): Promise<number>; hit(key: string, bucket: string): Promise<number>; eraseUser(userId) }`

- [ ] **Step 1: Write the failing contract tests** (run against both stores)
- `a client round-trips`; `a request expires` (getRequest after `expiresAt` returns null).
- `grants are per user`: `listGrants(b)` empty after `createGrant(a, …)`; `revokeGrant(b, gid)` false.
- `useToken marks a code used once`: first call `firstUse: true`, second `firstUse: false` (the caller treats the second as reuse); expired token returns null; revoked grant's tokens return null after `revokeTokens`.
- `freshestTab picks the newest switched-on tab seen since`: two tabs, newest wins; an `on: false` tab never returned; a tab older than `since` not returned.
- `takeNextCall is atomic across two tabs`: two concurrent `takeNextCall(u, tabA)` on one waiting call of tabA: exactly one returns the row; a call for tabA is never returned to tabB; a call of user b never returned to user a.
- `finishCall needs the same user and a taken call`: false for another user, for `waiting`, for `done`.
- `a taken call never answered expires and is deleted`: `sweepExpired(now > expiresAt)` returns 1 and `getCall` null.
- `hit counts per key and bucket`: 3 hits → 3; another bucket → 1.
- `eraseUser removes grants, tokens, tabs and calls of that user only`.
- `no content column in the clear`: the drizzle test inserts a call with `argsSealed = await seal(...)` and checks the table holds only the sealed string (the blindness grep of Task 11 covers all tables).

- [ ] **Step 2: Run, see them fail**

Run: `pnpm --filter @appuscholar/api exec vitest run test/copilot.store`
Expected: FAIL.

- [ ] **Step 3: Implement** the six tables of spec §5.8 (`oauth_clients`, `oauth_requests`, `copilot_grants`, `oauth_tokens`, `copilot_tabs`, `copilot_calls`) plus `copilot_rates (key, bucket, count)`, every user-keyed table `references(users.id, { onDelete: "cascade" })`; generate `0007_copilot.sql`. `takeNextCall` in Drizzle: one `UPDATE … SET status='taken' WHERE id = (SELECT id … WHERE user_id=$1 AND tab_id=$2 AND status='waiting' AND expires_at > now ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`. `hit`: `INSERT … ON CONFLICT (key, bucket) DO UPDATE SET count = count + 1 RETURNING count`.

- [ ] **Step 4: Run, see them pass**

Run: `pnpm --filter @appuscholar/api exec vitest run test/copilot.store && pnpm --filter @appuscholar/db test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db apps/api/src/copilot apps/api/test/copilot.store*
git commit -m "feat(db,api): copilot tables and store"
```

### Task 3: OAuth discovery and client registration

**Files:**
- Create: `apps/api/src/copilot/oauth/allowlist.ts`, `apps/api/src/copilot/oauth/metadata.ts`, `apps/api/src/copilot/oauth/register.ts`, `apps/api/src/routes/oauth.ts`
- Modify: `apps/api/src/config.ts` (read `COPILOT_ISSUER`; in production required once `COPILOT_ENABLED=1`), `apps/api/src/app.ts` (`AppOptions.copilot?: { store: CopilotStore; issuer: string; webOrigin: string; fetch?: typeof fetch; now?: () => Date }`; mount routes only when set), `apps/api/src/index.ts` and `apps/api/src/vercel.ts` (construct the store)
- Test: `apps/api/test/oauth.metadata.test.ts`, `apps/api/test/oauth.register.test.ts`

**Interfaces:**
- Consumes: `CopilotStore` (Task 2), `COPILOT_LIMITS` (Task 1).
- Produces: `isAllowedRedirect(uri: string): boolean`; `isAllowedMetadataHost(url: string): boolean`; `resolveClient(store, clientId, deps): Promise<OAuthClient | null>` (a URL client id fetches and caches its metadata document; any other id is looked up as a DCR client); routes `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-protected-resource/mcp`, `GET /.well-known/oauth-authorization-server`, `POST /oauth/register`.

- [ ] **Step 1: Write the failing tests**
- `protected resource metadata`: JSON has `resource: "<issuer>/mcp"`, `authorization_servers: ["<issuer>"]`, `scopes_supported: ["appuscholar.read", "appuscholar.write"]`; both well-known paths answer it.
- `authorization server metadata`: `issuer`, `authorization_endpoint: "<issuer>/oauth/authorize"`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `response_types_supported: ["code"]`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported` includes `offline_access`.
- `redirect allowlist`: true for the two Claude addresses, the pinned ChatGPT address, `http://localhost:33418/callback`, `http://127.0.0.1:5555/x`; false for `https://claude.ai.evil.com/api/mcp/auth_callback`, `http://claude.ai/api/mcp/auth_callback`, `https://example.com/cb`, `http://localhost.evil.com/cb`.
- `DCR registers an allowlisted client`: `POST /oauth/register { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" }` → 201 with a `client_id`; any non-allowlisted URI → 400 `invalid_redirect_uri`; `token_endpoint_auth_method` other than `none` → 400.
- `a metadata document is fetched only from allowed hosts`: `resolveClient(store, "https://evil.example/c.json", { fetch })` returns null and `fetch` was never called; from `https://claude.ai/…` with a stub fetch returning `{ client_id: <same url>, client_name: "Claude", redirect_uris: [allowlisted] }` → client cached (second call does not fetch); a document whose `client_id` differs from its URL → null; a body over 5 KB or a fetch over 5 s → null; a redirect not on the list → null.

- [ ] **Step 2: Run, see them fail**

Run: `pnpm --filter @appuscholar/api exec vitest run test/oauth.metadata test/oauth.register`
Expected: FAIL.

- [ ] **Step 3: Implement.** Pin the ChatGPT callback from OpenAI's docs (comment with the URL of the page and the date read). Metadata fetch: `redirect: "error"`, timeout 5 s, size cap 5 KB, `content-type` JSON.

- [ ] **Step 4: Run, see them pass**

Run: same command, plus `pnpm --filter @appuscholar/api test`
Expected: PASS, whole api suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): OAuth discovery and client registration for the copilot door"
```

### Task 4: Authorise, consent, token and revoke

**Files:**
- Create: `apps/api/src/copilot/oauth/flow.ts` (code, PKCE, token issue, refresh rotation), `apps/web/app/(app)/connect/consent/page.tsx`, `apps/web/components/copilot/Consent.tsx`, `apps/web/messages/tools/copilot.en.json`, `apps/web/messages/tools/copilot.hi.json`
- Modify: `apps/api/src/routes/oauth.ts`
- Test: `apps/api/test/oauth.flow.test.ts`, `apps/web/test/copilot/consent.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: routes `GET /oauth/authorize`, `GET /oauth/requests/:id` (student api token; returns `{ clientName, redirectHost, scopes }`), `POST /oauth/requests/:id/approve { scopes }` and `POST /oauth/requests/:id/deny` (student api token; return `{ redirect: string }`), `POST /oauth/token`, `POST /oauth/revoke`; `hashToken(t: string): string` (SHA-256 hex); `issueTokens(store, grant, now): Promise<{ access_token; refresh_token; token_type: "Bearer"; expires_in: 3600; scope }>`.

- [ ] **Step 1: Write the failing api tests** (`oauth.flow.test.ts`, the memory store, a registered DCR client, a fixed clock)
- `authorize redirects to the consent page`: valid params → 302 to `<webOrigin>/connect/consent?request=<id>`.
- `authorize refuses bad requests without redirecting to unknown places`: unknown client → 400 page (no redirect); redirect URI not registered for the client → 400 (no redirect); `code_challenge_method=plain` or missing → redirect with `error=invalid_request`; `resource` other than `<issuer>/mcp` → redirect with `error=invalid_target`.
- `approve returns the redirect with code, state and iss`: `redirect` has `code`, the original `state`, `iss=<issuer>`; deny returns `error=access_denied` with `state` and `iss`; another user's token on the request → 404; the student must have accepted the terms (else 403 `terms`, as the AI routes).
- `token exchanges a code once with the right verifier`: wrong verifier → 400 `invalid_grant`; second use of the code → 400 and the grant revoked; after 60 s → 400; wrong `resource` → 400 `invalid_target`; success → access and refresh tokens, `expires_in: 3600`.
- `refresh rotates`: refresh → new pair; the old refresh again → 400 and every token of the grant stops working.
- `revoke`: `POST /oauth/revoke` with a refresh token → the grant's tokens stop working.
- `tokens are stored hashed`: no row of `oauth_tokens` contains the issued token string.
- `a write scope left out at consent is not granted`: approve with `["appuscholar.read"]` → token `scope` is `appuscholar.read`.

Web (`consent.test.tsx`, testing-library as other component tests): shows the client name, the redirect host and the two scope lines (write ticked by default, can be unticked); Allow posts `approve` with the ticked scopes and navigates to the returned `redirect`; Cancel posts `deny` and navigates; an expired request shows the "this request has expired" line.

- [ ] **Step 2: Run, see them fail**

Run: `pnpm --filter @appuscholar/api exec vitest run test/oauth.flow` and `pnpm --filter @appuscholar/web exec vitest run test/copilot/consent`
Expected: FAIL.

- [ ] **Step 3: Implement.** The consent page lives under `(app)` so the existing sign-in and terms gates apply; it calls the api with `apiFetch`. Copy (English; Hindi DRAFT): title "Connect <client> to Appuscholar"; line "<client> wants to work on your Appuscholar project while your Appuscholar tab is open."; scope lines "Read and check your work" and "Make edits, saved as revisions you can undo"; buttons "Allow" and "Cancel"; note "What your copilot reads goes to <provider> under your account with them. Appuscholar stores none of it." Write `audit_log` action `copilot-connected` on approve.

- [ ] **Step 4: Run, see them pass**

Run: the two commands above, then `pnpm --filter @appuscholar/api test && pnpm --filter @appuscholar/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api apps/web
git commit -m "feat: copilot OAuth authorise, consent, token and revoke"
```

### Task 5: The relay

**Files:**
- Create: `apps/api/src/copilot/relay.ts`, `apps/api/src/routes/bridge.ts`
- Modify: `apps/api/src/app.ts` (mount `/copilot/bridge/*` behind `apiAuth`)
- Test: `apps/api/test/relay.test.ts`, `apps/api/test/bridge.routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `type RelayDeps = { store: CopilotStore; now: () => Date; sleep: (ms: number) => Promise<void>; pollMs?: number }`
  - `relayCall(deps, call: { userId: string; grantId: string; tool: CopilotToolName; args: unknown }): Promise<{ kind: "answer"; answer: CopilotAnswer; day: string } | { kind: "not-open" } | { kind: "timeout" }>`
  - Routes (student api token): `POST /copilot/bridge/heartbeat { tabId, projectId, publicKey, on: boolean }` → 204; `GET /copilot/bridge/next?tabId=` → 200 `{ id, tool, argsSealed, replyKey }` or 204 after at most 25 s; `POST /copilot/bridge/result/:id { resultSealed, day }` → 204, 404 (unknown or another user's), 409 (not taken).

- [ ] **Step 1: Write the failing tests** (fake clock and `sleep`; a test tab built from `generateRecipient`)
- `no fresh tab answers not-open at once`: no tab, or last seen 31 s ago, or `on: false` → `not-open`, and no call row written.
- `a call reaches the tab and the answer comes back`: the test tab polls `next`, opens `argsSealed` with its key and aad = call id, seals `{ ok: true, content: "x" }` to `replyKey`, posts result; `relayCall` resolves `answer` with that content and `day`; the row is deleted.
- `the database never holds the arguments in clear`: args `{ documentId: "d1", marker: "PLAINTEXT-MARKER" }` → the stored row's fields do not contain `PLAINTEXT-MARKER`.
- `a taken call never answered expires and is deleted`: after 45 s `timeout`, row gone.
- `takeNextCall is atomic across two tabs` (route level): two `next` requests for one call → one 200, one 204.
- `another user cannot take or answer`: user b's `next` never sees user a's call; b posting a result for a's call → 404.
- `long-poll returns 204 after 25 s with nothing waiting`.
- `heartbeat with on: false switches the tab off` (the next relayCall answers not-open).
- `expired rows of anyone are swept on the next call`.

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/api exec vitest run test/relay test/bridge` → FAIL.
- [ ] **Step 3: Implement.** `relayCall` creates the handler's one-time recipient, seals `JSON.stringify(args)` to the tab's `publicKey` with aad = call id, writes the row, polls `getCall` every `pollMs` (default 300) until `done` or `callSeconds`, opens `resultSealed` with its private key, deletes the row. `next` polls `takeNextCall` every 500 ms up to `longPollSeconds`.
- [ ] **Step 4: Run, see them pass** — same command, then `pnpm --filter @appuscholar/api test` → PASS.
- [ ] **Step 5: Commit** — `git add apps/api && git commit -m "feat(api): sealed relay between /mcp and the student's tab"`

### Task 6: The `/mcp` endpoint

**Files:**
- Create: `apps/api/src/copilot/bearer.ts`, `apps/api/src/routes/mcp.ts`, `apps/api/src/copilot/log.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/package.json` (`@modelcontextprotocol/sdk`), `apps/api/vercel.json` (`"functions": { "api/index.js": { "maxDuration": 60 } }`: `/mcp` waits up to 45 s and the long-poll 25 s; today's file sets no limit, so the platform default applies, which is UNKNOWN for this project)
- Test: `apps/api/test/mcp.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `store.appendAiUse`, `store.getUser` (existing `Store`).
- Produces: `copilotBearer(deps)`: Hono middleware setting `{ userId, grantId, scopes, clientName }` or answering 401 with `WWW-Authenticate: Bearer resource_metadata="<issuer>/.well-known/oauth-protected-resource/mcp"`; `POST /mcp` (and `GET /mcp` → 405); `copilotLogEntry(grant, tool, day): AiUseEntry` (`d` = the tab's day; `p` = `claude` or `chatgpt` from the client name, else `copilot`; `m` = `copilot`; `k` and `g` = `COPILOT_LOG_TEXT[tool.logKind]`).

- [ ] **Step 1: Write the failing tests** (use the SDK client over Hono's `app.request`, or raw JSON-RPC bodies; a fake tab answering through the relay as in Task 5)
- `no token → 401 with resource_metadata`; `a token for another resource → 401`; `a revoked grant → 401`; `an expired access token → 401`.
- `initialize returns the server name and instructions`: `serverInfo.name === "appuscholar"`, `instructions === COPILOT_INSTRUCTIONS`.
- `tools/list equals the registry`: 16 tools, names, annotations and `inputSchema` equal `z.toJSONSchema(def.input)`.
- `a write tool without the write scope → 403 insufficient_scope with scope="appuscholar.write"`.
- `invalid arguments → a tool error, nothing relayed`.
- `get_status with no tab says not open` and is answered without the relay and without a log row; `get_status with a fresh tab` answers `{ open: true, draftFirst, projectId }` with `draftFirst` from the student's settings and no title (titles are sealed; `get_project` gives it).
- `read_document is relayed and answered`; one `ai_use_log` row with `k: "a copilot reading my documents"`, `g: "explain"`, the tab's `day`, provider `claude`, and nothing from the document.
- `a refused call is logged too` (the tab answers `{ ok: false, code: "draft-first" }` → one row, `isError: true` in the result, the refusal text as the content).
- `the AI-use log off setting writes no row` (`settings.aiLogOff: true`).
- `the 61st call in a minute answers rate-limit`; the counter is per grant.
- `touchGrant on every call`; `a grant unused for 30 days answers 401`.

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/api exec vitest run test/mcp` → FAIL.
- [ ] **Step 3: Implement.** Stateless Streamable HTTP with JSON responses. Builder's call between the SDK's web-standard Streamable HTTP server transport and `@hono/mcp`; write the choice and why in the ledger. A relay `not-open` or `timeout` becomes a tool result with `isError: true` and `COPILOT_REFUSAL_TEXT[...]` (never an HTTP error, so the copilot reads it to the student).
- [ ] **Step 4: Run, see them pass** — same, then `pnpm --filter @appuscholar/api test && pnpm --filter @appuscholar/api build` → PASS.
- [ ] **Step 5: Commit** — `git add apps/api && git commit -m "feat(api): MCP endpoint for the copilot door"`

### Task 7: The tab bridge, the Copilot pill and list, the outgoing filter

**Files:**
- Create: `apps/web/lib/copilot/bridge.ts` (the loop, no React), `apps/web/lib/copilot/useCopilot.tsx` (provider and hook), `apps/web/lib/copilot/filter.ts`, `apps/web/lib/copilot/executors/index.ts`, `apps/web/components/copilot/CopilotPill.tsx`, `apps/web/components/copilot/CopilotList.tsx`
- Modify: `apps/web/components/frame/AppHeader.tsx` (pill beside the account menu, only when the account has a grant), the provider tree where `VaultProvider` is mounted
- Test: `apps/web/test/copilot/bridge.test.ts`, `apps/web/test/copilot/filter.test.ts`, `apps/web/test/copilot/pill.test.tsx`

**Interfaces:**
- Consumes: `seal`, `openSealed`, `generateRecipient`, `COPILOT_LIMITS`, `CopilotAnswer` (Task 1); bridge routes (Task 5); `useVault()` (`status`, `lock`); `apiFetch`.
- Produces:
  - `type ExecCtx = { projectId: string; callId: string; vault: Pick<VaultValue, "decryptBody" | "encryptBody" | "ensureUnlocked">; now: () => Date }`
  - `type Executor = (args: unknown, ctx: ExecCtx) => Promise<CopilotAnswer>`; `registerExecutor(name: CopilotToolName, run: Executor): void`; `executorFor(name): Executor | undefined`
  - `type CopilotEvent = { at: Date; tool: CopilotToolName; documentTitle?: string; outcome: "done" | CopilotRefusal; revision?: { documentId: string; seq: number; previousSeq: number }; warnings?: string[] }`
  - `useCopilot(): { connected: boolean; on: boolean; elsewhere: boolean; events: CopilotEvent[]; switchOn(): Promise<void>; switchOff(): void }`
  - `filterAnswer(a: CopilotAnswer, m: Matcher | null): CopilotAnswer` (masks every string inside `content`; adds counts to `masked`)

- [ ] **Step 1: Write the failing tests**
- `bridge.test.ts` (fake fetch, fake clock): `switchOn registers a key and heartbeats`; `a call is opened, executed, filtered, sealed and posted`; `an unknown tool answers invalid`; `an executor that throws answers invalid and the loop continues`; `polls every 1 s after a call and every 5 s when idle`; `switches itself off after 60 minutes without a call`; `locking the vault switches Copilot off and refuses the taken call` (the taken call answers `locked`); `the older tab shows elsewhere` (heartbeat answer says another tab is newer); `the tab validates arguments against the registry schema` (an unknown field answers `invalid`, the executor is not called); `executors import no secret` (a test reads every file under `apps/web/lib/copilot/` and fails on an import of `lib/ai/keys`, `lib/ai/useKeys`, `lib/vault/crypto` or `lib/vault/remember`).
- `filter.test.ts`: an email and a phone number in nested strings are masked with `maskText` and counted; with a matcher built by `buildMatcher` from two test people, their names become their codes and `masked.participant === 2`; numbers and ids are untouched; Devanagari text passes through except matched names.
- `pill.test.tsx`: hidden without a grant; "Copilot off" → click with the vault unlocked → "Copilot on: Claude can work on Thesis"; with the vault locked, the click asks to unlock first; the list shows events newest first, with Undo on edits.

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/web exec vitest run test/copilot` → FAIL.
- [ ] **Step 3: Implement.** The participant matcher comes from the participants module merged by PR #28 (`buildMatcher`, `findNames`, `replaceFinds` in `packages/core/src/participants.ts`, list read the way the Participants tab reads it). If PR #28 is not in the base, ship `filterAnswer` with `m = null`, mark the participant tests `it.todo`, and record it as the one open item in the ledger and the PR. The tab's private key is created non-extractable. Copy: "Copilot off", "Copilot on: <client> can work on <project>", "Copilot is working in another tab", "Unlock your vault to switch on Copilot", the list's outcome lines (spec §5.1 step 4).
- [ ] **Step 4: Run, see them pass** — same, then `pnpm --filter @appuscholar/web test` → PASS.
- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "feat(web): copilot bridge in the student's tab"`

### Task 8: Read tools

**Files:**
- Create: `apps/web/lib/copilot/paragraphs.ts`, `apps/web/lib/copilot/executors/read.ts`
- Test: `apps/web/test/copilot/paragraphs.test.ts`, `apps/web/test/copilot/read.test.ts`

**Interfaces:**
- Consumes: `registerExecutor`, `ExecCtx` (Task 7); the documents and blobs clients (`apiFetch`, `createBlobClient` with `headless: true`); `getData(projectId)` from `lib/tools/stats/lab.ts`.
- Produces: `type Paragraph = { id: string; text: string; origin: "student" | "ai" | "source" | "mixed"; words: number }`; `toParagraphs(html: string): Paragraph[]` (ids `p1`…`pN` in document order over block elements; `origin` from `ai-ins` and the source mark); executors `get_project`, `read_document`, `list_citations`, `list_data`.

- [ ] **Step 1: Write the failing tests**
- `paragraphs.test.ts`: headings, paragraphs and list items each get one id in order; a paragraph wholly inside `ai-ins` is `ai`; source-marked is `source`; partly AI is `mixed`; word counts match `wordCount`.
- `read.test.ts`: `read_document` returns `{ documentId, title, revision, words, paragraphs }` decrypted with `ctx.vault.decryptBody`; `read_document pages a long document` (a 60 000-word fixture → answer under `maxAnswerChars`, `next: { from }` present, the second page starts where the first ended); `from`/`to` select a range; a deleted or unknown document → `not-found`; a document of another project → `not-found`; `get_project` returns title, stage and documents (ids, titles, kinds, word counts); `list_citations` returns entries with the reference in the project style; `list_data` with data loaded returns name, columns, types and `rows: n` and no cell value (fixture with the cell `"ZZ-UNIQUE-77"` → not in the JSON); without data → `no-data`.

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/web exec vitest run test/copilot/paragraphs test/copilot/read` → FAIL.
- [ ] **Step 3: Implement.** `toParagraphs` uses `DOMParser` (the tab is a browser; tests run in jsdom). Source-marked text carries `"thirdParty": true`.
- [ ] **Step 4: Run, see them pass** — same → PASS.
- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "feat(web): copilot read tools"`

### Task 9: Compute tools

**Files:**
- Create: `apps/web/lib/copilot/executors/compute.ts`, `apps/web/lib/copilot/runs.ts`
- Test: `apps/web/test/copilot/compute.test.ts`

**Interfaces:**
- Consumes: Task 7–8; core `tgNext`, `tgRes`, `runStats`, `STAT_TESTS`, `powerCompute`, `numbersCheck`, `ccAnalyse`, `citFmt`, `oaSearch`, `pmSearch`; the Design & Ethics blobs as the tool panels read them.
- Produces: `rememberRun(projectId, run: { id: string; test: string; sentence: string; record: StatsRuns[string] }): void`; `runFor(projectId, id)`; executors `which_test`, `run_test`, `power_analysis`, `check_numbers`, `check_citations`, `format_reference`, `design_checklist`, `search_papers`.

- [ ] **Step 1: Write the failing tests**
- `run_test` on a fixture data set gives the same APA sentence as the Statistics lab's runner for the same choices (call the lab's own path in the test and compare strings exactly); returns `runId`, tables of group statistics, assumptions and warnings; never a cell value (distinctive-value check as Task 8); unknown column → `invalid`; no data → `no-data`; the run is remembered for `insert_result`.
- `which_test` returns the guide's next question or result for given answers, equal to `tgNext`/`tgRes`.
- `power_analysis` equals `powerCompute` for the same inputs.
- `check_numbers` equals `numbersCheck` on the document's text (findings worded as prompts to look again).
- `check_citations` equals `ccAnalyse` on the document and library.
- `format_reference` equals `citFmt` for the entry and style; unknown citation → `not-found`.
- `design_checklist` returns the open items of the named tool; its text never contains "exempt" as a verdict (fixture with every item done → the committee line of rule 9 is present).
- `search_papers` calls only `oaSearch` or `pmSearch` with the query (a fetch spy sees only `api.openalex.org` or `eutils.ncbi.nlm.nih.gov` hosts) and returns titles, authors, year, DOI and abstract marked `thirdParty: true`.

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/web exec vitest run test/copilot/compute` → FAIL.
- [ ] **Step 3: Implement** each executor as a thin adapter over the function the panel already calls; no new arithmetic.
- [ ] **Step 4: Run, see them pass** — same → PASS.
- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "feat(web): copilot compute tools"`

### Task 10: Write tools, copilot revisions and undo

**Files:**
- Create: `apps/web/lib/copilot/edit.ts`, `apps/web/lib/copilot/executors/write.ts`, `apps/web/lib/copilot/save.ts`
- Modify: `apps/api/src/routes/documents.ts` (`PUT /documents/:id` accepts `copilotCall`), `apps/api/src/app.ts` (give `documentRoutes` the copilot store)
- Test: `apps/web/test/copilot/edit.test.ts`, `apps/web/test/copilot/write.test.ts`, `apps/api/test/documents.copilot.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 7–9; `accCheck` (core accuracy), `originCount`, `wordCount`, `sanitizeHtml`; the workspace's `flushOpen` and the reload the history panel's Restore uses (`useProject` in `components/document/DocBar.tsx` shows both).
- Produces: `applyOps(html: string, ops: EditOp[]): { ok: true; html: string; typedWords: number; removedTypedWords: number } | { ok: false; code: "invalid" | "not-found" }`; `saveCopilotRevision(doc, html, callId): Promise<{ seq: number; previousSeq: number }>`; executors `edit_document`, `insert_result`, `add_citation`; api: `PUT /documents/:id` with `copilotCall` stores `authorKind: "copilot"`, `authorLabel: "<client> (copilot)"`.

- [ ] **Step 1: Write the failing tests**
- `edit.test.ts`: insert after `p2`, replace `p3`, append; the new text is escaped (`"p < .05"` stays text) and wrapped in `ai-ins`; unknown paragraph id → `not-found`; `removedTypedWords` counts only student-typed words; `the 20% rule counts Devanagari words` (a Hindi fixture).
- `write.test.ts`: draft first on → `edit_document` and `insert_result` answer `draft-first` with v1's text, `add_citation` still works; `removedTypedWords / typedWords > 0.2` → `too-large`, at exactly 0.2 → saved; `baseRevision` older than the current → `stale`; `edit_document keeps the student's unsaved typing` (open document with held text: a web revision with the typed text is saved first, then the copilot revision on top; the final HTML contains both); `a save that fails leaves no copilot revision` (api answers 500 → answer `invalid`, the document unchanged); unverified numbers in the inserted text are listed in `warnings` (`accCheck`); `insert_result` inserts the run's sentence linked to its run as the lab's Insert does and records it in `stats_runs`; the 31st copilot revision of a document within an hour → `rate-limit`; `add_citation` by DOI looks up through `citLookup` and runs the retraction check; the answer carries `revision: { documentId, seq }` and the event list gets Undo.
- `documents.copilot.test.ts`: `copilotCall` of a `taken` call of that user for `edit_document` on that document → revision `author_kind "copilot"`, label `"Claude (copilot)"`; a `waiting`, `done`, other-user, other-document or other-tool call → 403 `copilot-call`; without `copilotCall` → `"web"` as today; restore of the previous seq works as today (the Undo path).

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/web exec vitest run test/copilot/edit test/copilot/write` and `pnpm --filter @appuscholar/api exec vitest run test/documents.copilot` → FAIL.
- [ ] **Step 3: Implement.** `applyOps` parses with `DOMParser`, builds paragraphs as `<p>` from plain text (blank line = new paragraph), wraps new text as `insertAiText` marks it, runs `sanitizeHtml`. For a document open in the editor: `flushOpen()`, save the copilot revision, then load it into the editor the way Restore does. Undo in the copilot list calls the existing `POST /documents/:id/restore/:seq` with `previousSeq`.
- [ ] **Step 4: Run, see them pass** — the commands above, then `pnpm --filter @appuscholar/web test && pnpm --filter @appuscholar/api test` → PASS.
- [ ] **Step 5: Commit** — `git add apps/web apps/api && git commit -m "feat: copilot edits as revisions, with draft first, the 20% rule and undo"`

### Task 11: The Copilot page, disconnect, the AI-use statement, end to end, walk sheet

**Files:**
- Create: `apps/web/components/workspace/dialogs/Copilot.tsx`, `apps/api/src/routes/copilotGrants.ts`, `apps/web/e2e/copilot.spec.ts`, `docs/walkthroughs/copilot.md`, `apps/api/test/copilot.blindness.test.ts`
- Modify: the account menu in `apps/web/components/frame/AppHeader.tsx` (item "Copilot"), `packages/core/src/aiustatementV2.ts` (copilot kinds named), `docs/superpowers/specs/parity-deviations.md` (rows: statement wording, automatic masking vs v1 rule 2, the 20% rule, new copilot copy, all `proposed` for Dr. Sharma), the privacy notice text where the AI-gateway paragraph lives, `apps/web/messages/tools/copilot.*.json`
- Test: `apps/web/test/copilot/dialog.test.tsx`, `packages/core/test/copilot/statement.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `GET /me/copilot/grants` → `[{ id, clientName, createdAt, lastUsedAt }]`; `DELETE /me/copilot/grants/:id` → 204 (revokes tokens, writes `audit_log` `copilot-disconnected`); `eraseUser` also calls `copilotStore.eraseUser`.

- [ ] **Step 1: Write the failing tests**
- `dialog.test.tsx`: shows the address (the web's existing `NEXT_PUBLIC_API_URL` + `/mcp`) with Copy; the Claude steps (Customize → Connectors → Add custom connector) and the ChatGPT steps (Settings → Apps → Advanced settings → Developer mode) with the plain line that ChatGPT may not allow edits on every plan; lists grants with "connected <date>" and "last used <time>"; Disconnect asks once and removes the row.
- `statement.test.ts`: with copilot log rows, `aiuBuildV2` names copilot use (provider and kinds) and never says "no AI".
- `copilot.blindness.test.ts` (Drizzle store on pglite): run every tab tool through `/mcp` with a fake tab that uses the real executors' outputs for a fixture containing the sentence "The marigold protocol reduced anxiety", the participant name "Ishaan Verma" and the cell value "ZZ-UNIQUE-77"; then read every row of every table and assert none of the three strings appears; capture `console` output during the run and assert the same.
- `copilot.spec.ts` (Playwright, the pglite recipe in `apps/web/e2e/support/`): a test student signs in, accepts terms, sets up the vault, writes a document and pastes a data set; an MCP SDK client in the test performs the OAuth flow (the test clicks Allow on the consent page) with PKCE and `resource`; the student switches on Copilot; the client calls `read_document`, `run_test`, `insert_result`, `edit_document`; the page shows the AI-marked edit and the copilot list with Undo; Undo restores the text; Copilot off → the next call returns the not-open text; Disconnect → the next call is 401.
- Grants routes: per user, 404 for another user's grant.

- [ ] **Step 2: Run, see them fail** — `pnpm --filter @appuscholar/web exec vitest run test/copilot/dialog`, `pnpm --filter @appuscholar/core exec vitest run test/copilot/statement`, `pnpm --filter @appuscholar/api exec vitest run test/copilot.blindness` → FAIL.
- [ ] **Step 3: Implement.** Walk sheet `docs/walkthroughs/copilot.md` from spec §7 "Live walk": numbered rows with the expected result in on-screen words, blank result column, rows for Claude web, Claude on the phone with the laptop tab open, the tab left in the background 10 minutes, ChatGPT developer mode on Plus.
- [ ] **Step 4: Run, see them pass** — the three commands, then the whole gate: `pnpm lint && pnpm typecheck && pnpm test` and the Playwright suite as CI runs it (`lsof -iTCP:8788 -iTCP:3000` first: a leftover server is reused silently) → all PASS.
- [ ] **Step 5: Commit** — `git add -A apps packages docs && git commit -m "feat: copilot page, disconnect, AI-use statement, e2e and walk sheet"`

### Task 12 (only if OJ answers yes to Decision 2): data sets sealed in the vault

**Files:**
- Create: `apps/web/lib/blobs/kinds/statsData.ts` (kind `stats_data`)
- Modify: `apps/web/lib/blobs/kinds.ts`, `apps/api/src/routes/blobWrite.ts` (kind mirrored; plaintext refused, as the participants kind is), `lib/frame/stages.ts` (`KIND_STAGE`), `apps/web/components/tools/stats/DataIntake.tsx` (the question "Keep this data in my vault? Only you can open it." once per data set, default unticked until the student answers), `apps/web/lib/tools/stats/lab.ts` (load the kept set after unlock), `apps/web/lib/blobs/kinds/stats.ts` (comment: ruling R1 superseded by Decision 2)
- Test: `apps/web/test/tools/stats/keep.test.tsx`, `apps/api/test/blobs.statsData.test.ts`

- [ ] **Step 1: Write the failing tests:** kept data reopens after a reload and unlock; not kept → nothing written (the blob route sees no request); the api refuses a plaintext `stats_data` body (409 `vault-required`); `list_data` and `run_test` read a kept set after a reload; erasing a project deletes it; the blindness test of Task 11 extended to a kept set.
- [ ] **Step 2: Run, see them fail.** **Step 3: Implement.** **Step 4: Run, see them pass** (`pnpm --filter @appuscholar/web test && pnpm --filter @appuscholar/api test`).
- [ ] **Step 5: Commit** — `git commit -m "feat: keep a data set sealed in the vault (Decision 2)"`

### Task 13: Security review by a fresh Opus reviewer

Done by a reviewer who has not seen the build: a fresh subagent on Opus, given the spec (§5, §6, §7), this plan and the whole branch diff against `phase-3a-vault`, and nothing else.

- [ ] **Step 1: Dispatch the reviewer** with this brief: "Review the copilot door branch against the spec's threat model (§6). For each of: OAuth (PKCE, redirect and metadata allowlists, code single use, refresh rotation and reuse, audience binding, iss, consent CSRF, terms gate); the relay (sealing, aad, who can take and answer a call, expiry, plaintext in any table, log line or error message); the tab (executors' reach, outgoing filter, HTML from the copilot, schema validation on both sides); the rules (draft first, the 20% rule, stale revisions, `copilotCall` check, rate limits, AI-use log without text); revocation paths; erasure. Report each finding with file and line, a concrete failure scenario, and severity (must fix before release / should fix / note). Do not edit code."
- [ ] **Step 2: Fix every "must fix"** with a failing test first, one commit per finding (`fix(copilot): <finding>`); log "should fix" and "note" items in the ledger as deferred, with the reviewer's words.
- [ ] **Step 3: Re-run the gate:** `pnpm lint && pnpm typecheck && pnpm test` and the Playwright suite → all PASS.
- [ ] **Step 4: Ask the same reviewer to confirm each must-fix is closed;** record its verdict in the ledger.
- [ ] **Step 5: Push and open the PR** against `phase-3a-vault` with the spec, this plan, the review verdict and the deferred list in the description. Release (migration backup → 0007 → api → web) and the live walk need OJ and the Mac.

## Release 2 (a later plan, after the live walk)

Tools served without the tab (which-test guide, power, reference formatting from given fields, paper search); whatever the ChatGPT walk shows; v1's viva and devil's-advocate prompts as MCP prompts; the closeness check as a tool; the sealed inbox only if students ask (spec §4.5, §9).
