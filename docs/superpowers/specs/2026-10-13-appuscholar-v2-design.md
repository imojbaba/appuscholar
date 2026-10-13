# Appuscholar v2 — design spec

Date: 2026-10-13
Status: draft for review by OJ (imojbaba), then Dr. Shiv Raj Sharma
Origin: re-platforming of srssg74-crypto/appuscholer (single-file browser app, v55, all rights reserved, Dr. Shiv Raj Sharma). This repo is a private derivative built for his review. Copyright in the original design, text and logic remains his. Nothing in this repo is published until he agrees to terms.

## 1. Purpose and success criteria

Appuscholar is a research and writing assistant for psychology students in India. v1 runs entirely in the browser with no server, student-pasted AI keys, and no durable storage. v2 keeps the product and its guidance model intact and adds:

- A server and database so work is stored, versioned and reachable from any device.
- Two doors into the same core: the web UI, and an MCP server so a student's own Claude or ChatGPT can act as a copilot on the same project.
- Three ways to pay for AI in the web UI: Sign in with ChatGPT (plan allowance), the student's own API key, or the operator's metered key.
- Participant data encrypted with a student passphrase; the server never holds plaintext participant data.
- Fixes for the two verified XSS sinks, a Content-Security-Policy, tests on the statistics engine, and a modular codebase.

Success: Dr. Sharma opens a private preview URL, signs in, creates a project, writes with versions, runs a test on an encrypted dataset, connects Claude as a copilot via MCP and sees Claude's edit appear as a revision. He can judge the direction in under an hour. The whole v1 feature list is present by the end of phase 5.

Users: psychology students (18+), their supervisors; one operator (OJ) at first. Expected scale for the MVP: tens of users.

## 2. Non-goals

- No public launch, app-store listing or marketing site.
- No realtime multi-user editing of one document.
- No native mobile app. Responsive web plus PWA install is enough.
- No change to the pedagogical rules of v1 (draft-first, generate-before-reveal, questions not text, numbers computed in code). They are ported as-is.
- No new AI providers beyond the six in v1.

## 3. Architecture (approach B: separate frontend and backend services)

```
apps/web      Next.js 15 (App Router), Vercel project "appuscholar-web"
apps/api      Hono on Node 22, Vercel project "appuscholar-api", Dockerfile for later migration
packages/core pure TypeScript, no DOM, no Node APIs: stats, APA, citations, ethics rules, PD scan, scale scoring
packages/db   Drizzle ORM schema + migrations, Neon Postgres client
packages/ui   shared React components (guide characters, stage bar, dialogs)
```

- `apps/web` talks to `apps/api` over HTTPS with a session JWT from Auth.js. It also imports `packages/core` directly so private stats run in the browser.
- `apps/api` hosts the REST API, the AI gateway, the MCP server at `/mcp`, and background jobs (usage meters, revoke list).
- `packages/core` is the only place numbers are computed. Both apps import it. It has no side effects and is 100% unit-testable.
- Hosting: both apps on Vercel under team ojbabas-projects. Neon Postgres via Vercel Marketplace. Vercel Blob for PDFs and images. All three are plain Postgres, OAuth and S3-style storage underneath; migration is configuration.

## 4. Data model (Postgres, Drizzle)

| Table | Key columns | Notes |
|---|---|---|
| users | id, email, name, locale (en/hi), created_at, terms_accepted_at, age_confirmed | Auth.js tables alongside |
| credentials | user_id, provider, mode (chatgpt_plan / own_key / metered), encrypted_key, key_iv, created_at | own_key is ciphertext encrypted with the student passphrase key; server cannot read it |
| projects | id, user_id, title, field, stage, content_lang, created_at | one active project per session |
| documents | id, project_id, title, kind (draft/notes/consent/protocol…), current_revision_id | |
| document_revisions | id, document_id, seq, body_html, author_kind (web/copilot/import/restore), author_label, word_count, origin_stats_json, created_at | append-only; "undo Claude" = restore a revision |
| citations | id, project_id, csl_json, style_cache_json, source (manual/openalex/pubmed/crossref/capture), retracted_at | |
| datasets | id, project_id, name, column_manifest_json (names, types, pd_flags), ciphertext_blob_url, iv, kdf_params_json, rows_count | ciphertext only on the server |
| stat_runs | id, dataset_id, test_key, params_json, result_json, apa_text, run_where (browser/copilot), created_at | result stored plaintext only if student opted in; default stores APA text only |
| ethics_records | id, project_id, kind (pathway/protocol/consent/registration/pi/budget/ai_statement), data_json, revision | |
| qual_codes, qual_tags | hierarchical codes and span tags per document revision | phase 5 |
| ai_use_log | id, user_id, project_id, provider, model, purpose, credential_mode, tokens_in, tokens_out, created_at | never prompt or answer text |
| usage_meters | user_id, month, metered_tokens_used, cap | for operator-key mode |
| copilot_sessions | user_id, dataset_key_ciphertext, expires_at | 8-hour unlock window, see §6 |
| licences | id, user_id, code_id, exp, revoked_at | ports v1 ECDSA codes; optional in v2 since auth replaces the gate |

Files: Vercel Blob, keyed by user and project. Blob URLs are unguessable and the API checks ownership before returning them.

## 5. Auth and AI credentials

- Auth.js (next-auth v5) with Google, email magic link, and Sign in with ChatGPT as a custom OAuth provider. ChatGPT provider requires OpenAI partner approval; until granted, the option is hidden behind a feature flag and own-key/metered modes work.
- Session JWT carries user id and locale. `apps/api` verifies it with the shared secret.
- AI gateway (`apps/api/src/ai/`): one `complete({purpose, messages, schema?, credentialMode})` entry point. Provider adapters: openai, anthropic, google, groq, deepseek, openrouter. Failover across providers the user has credentials for, with no global state. Rate-limit and 5xx retry mapped to user-facing messages ported from v1.
- Credential modes:
  - chatgpt_plan: request signed with the student's ChatGPT OAuth token to OpenAI's partner endpoint; usage counted by OpenAI, capped per app by the student.
  - own_key: student unlocks the key client-side with their passphrase; the plaintext key is sent per request over TLS to the gateway and used once, never stored server-side. This matches v1's behaviour.
  - metered: operator key from server env; `usage_meters` enforces a monthly token cap per user; UI shows remaining allowance.
- Personal-data scan (`packages/core/pd`) runs in the gateway on every outbound prompt; flagged spans are masked or the request is refused with the v1 wording.
- TTS (lessons) goes through the same gateway; v1's bypass is removed.

## 6. Encryption and participant data

- At first dataset upload the student sets a passphrase. Key = PBKDF2-SHA256(passphrase, per-user salt, 310k iterations), 256-bit. Datasets are AES-GCM encrypted in the browser; the server receives ciphertext, IV, KDF params and a plaintext column manifest produced after the personal-data scan has run and the student has masked or accepted each flagged column.
- The UI states plainly: lose the passphrase, lose the datasets. A recovery sheet (downloadable one-time file containing the key wrapped with a server-generated recovery code) is offered at setup.
- Stats in the web UI run in the browser on decrypted rows via `packages/core/stats`.
- "Unlock for copilot": the browser posts the derived key to `/copilot/unlock`; `apps/api` wraps it with a server KMS key, stores it in `copilot_sessions` with an 8-hour expiry, and MCP tools can decrypt that user's datasets in memory for the duration. The student can revoke early. Every copilot stat run is logged with `run_where = copilot`.
- Document text, citations and ethics records are stored plaintext server-side (they are the student's own writing and public papers), encrypted at rest by Neon.

## 7. Core package

`packages/core` modules, each with fixture-based unit tests:

- `stats`: descriptive, t-tests, ANOVA (one/two-way, Welch, repeated), post-hoc (Tukey, Games-Howell, Dunn), non-parametric (Mann-Whitney exact, Kruskal, Wilcoxon, Spearman), chi-square and Fisher exact, correlation, OLS and logistic regression, reliability (alpha, omega), effect sizes, normality (Shapiro-Wilk), power and sensitivity analysis. Ported function by function from v1 (`stk*`, `pw*`, `gammaln`, `betai`…). Golden values from R for each test.
- `apa`: APA 7 result sentences and table shapes from `stats` outputs.
- `testGuide`: the "which test" decision tree.
- `citations`: CSL-JSON normalisation; formatters for APA 7, APA 6, MLA, Chicago, Vancouver, IEEE; in-text cross-check (`ccAnalyse`); retraction check client.
- `numbersCheck`: find and judge reported statistics in document text.
- `pd`: personal-data detection for tabular columns and free text (v1 regexes plus header names; limits stated in docs).
- `ethics`: regulatory pathway rules, PI eligibility, registration readiness, budget totals.
- `scales`: scale library definitions and scoring.
- `origin`: writing-origin tracking (typed vs inserted) over revision diffs.

No module imports React, DOM, Node `fs`, or fetch. Network clients (OpenAlex, PubMed, Crossref) live in `apps/api/src/scholar/` and are mocked in tests.

## 8. MCP door

- `apps/api` serves MCP over Streamable HTTP at `/mcp` with OAuth 2.1 authorisation code flow. Account linking page in `apps/web` shows the connector URL and a "connect" button; works as a Claude custom connector (Free/Pro/Max) and in ChatGPT developer mode (Plus/Pro).
- Tools (v1 of the door): `list_projects`, `get_document`, `save_document` (creates a `copilot` revision), `list_citations`, `add_citation`, `format_reference`, `search_papers`, `list_datasets`, `run_test` (requires an active copilot session), `explain_result`, `ethics_checklist`, `viva_question`, `pd_scan_text`.
- Resources: project summary, current document, citation library.
- Every tool call is written to `ai_use_log` with `credential_mode = mcp_client` and no text.
- The copilot cannot bypass pedagogical rules: `save_document` refuses if draft-first mode is on for that document and the revision would replace more than a configurable share of the student's typed text; it returns the rule text instead.

## 9. Web UI

- Next.js App Router, React 19, Tailwind, shadcn/ui, TipTap editor. Same six stages, same guide characters (Appu, Meera, Raj) and portraits, same Hindi UI pack migrated to `next-intl`.
- Documents stay HTML so v1 exports and backups import unchanged. Imported HTML passes through DOMPurify with an allow-list; `javascript:` and `data:` hrefs dropped. CSP meta from day one: `default-src 'self'`, `connect-src` limited to the API, provider hosts and scholarly APIs, no `unsafe-inline` scripts.
- v1 backup JSON files import into v2 (documents, citations, projects). Datasets import only through the encryption flow.
- PWA: service worker caches the shell and fonts; API responses are not cached. Offline editing queues revisions and syncs on reconnect, last-write-wins by revision seq with a conflict copy if two devices diverge.

## 10. Errors and testing

- `packages/core`: Vitest, fixture data, R golden values checked to 1e-6 where R reports them.
- `packages/db`: migration tests against a Neon branch.
- `apps/api`: integration tests with Hono's test client; provider adapters mocked; one live smoke test per provider behind an env flag.
- `apps/web`: Playwright on sign-in, create project, write and save, import v1 backup, upload dataset with passphrase, run a t-test, connect copilot, see copilot revision.
- Encryption: round-trip, wrong passphrase, expired copilot session.
- Any AI failure shows the v1 user-facing message and leaves the document untouched. Any API failure in the editor keeps the local draft and retries.
- CI: GitHub Actions on every PR runs lint, typecheck, unit, integration; Vercel preview deploys per PR.

## 11. Phases

Each phase gets its own implementation plan via the writing-plans skill. Dr. Sharma reviews after phase 1 and phase 4.

1. Platform and editor. Monorepo, both Vercel projects, Neon, Auth.js (Google + magic link), users/projects/documents/revisions, TipTap editor with autosave and revision history, v1 backup import, CSP, sanitiser, CI. Deliverable: write, save, see history, on a preview URL.
2. Core modules on the server. Port `stats`, `apa`, `testGuide`, `citations`, `numbersCheck`, `pd`, `ethics`, `scales` into `packages/core` with tests; API routes; Statistics Lab, Citation Manager and Design & Ethics UI; encryption flow for datasets.
3. AI gateway. Three credential modes, six providers, PD scan on send, AI-use log, the writing actions (Continue, Improve, Extend, draft-first feedback, devil's advocate, viva), Ask Appuscholar.
4. MCP door. OAuth server, tools and resources, copilot unlock window, account-linking page, copilot revisions in the editor.
5. Remaining modules. Qualitative coding, Chart Studio and research figures, PPT maker, reading shelf, Analyse-a-paper, lessons and lectures with TTS, style profile, words and grammar, closeness check, picture editor, Hindi completeness pass, PWA offline queue.

## 12. Open questions for Dr. Sharma (not blocking phase 1)

1. Licence and ownership terms for the v2 repo and for OJ's contribution.
2. Whether the v1 access-code gate is kept alongside sign-in, or retired.
3. Whether metered operator-key usage is free, capped, or paid by students.
4. Final wording of the privacy promise now that the server exists.
5. Participant-data policy for under-18 participants in the ethics flow.
