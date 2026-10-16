# Phase 3A: The Researcher's Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documents and their revisions are encrypted in the browser under a per-user vault key that only the student's passphrase (or a one-time recovery code) can open; the server stores ciphertext it cannot read, existing plaintext is migrated, and export, account erasure and an audit log exist.

**Architecture:** Envelope encryption in the browser with WebCrypto: a random vault key (VK) wrapped twice (passphrase via PBKDF2, recovery code), one data key (DEK) per document wrapped under VK, AES-GCM per revision with a `key_version`. The Hono api gains a `vault_keys` table, an `audit_log`, ciphertext-aware document routes that refuse plaintext once a user's vault is complete, and account erasure. The web app gains a `useVault` provider that unlocks once per session, encrypts on autosave, decrypts on load, runs the one-off migration, and the dialogs for setup, recovery sheet, passphrase change, export and erasure. Metadata (titles, stages, counts) stays plaintext.

**Tech Stack:** TypeScript, WebCrypto (`crypto.subtle`, also in Node 24 for vitest), Next.js 16, Hono, Drizzle + Postgres (Neon; pglite in tests), Playwright, JSZip (already a dependency of the Word export path; confirm in `apps/web/package.json`, add if absent).

**Spec:** `docs/superpowers/specs/2026-10-16-vault-design.md` (amends `docs/superpowers/specs/2026-10-13-appuscholar-v2-design.md` §6). Blueprint context: `Scholarly/appuscholar-blueprint/BLUEPRINT.md` §8 "Phase 3A".

## Global Constraints

- Blob encoding everywhere: base64url without padding, fields joined by ".", as `apps/web/lib/ai/keys.ts` does today (`salt.iv.ciphertext` for passphrase wraps, `iv.ciphertext` for key wraps and revision bodies).
- PBKDF2-SHA-256, 310,000 iterations, 16-byte salt, for the VK passphrase wrap and the recovery wrap; AES-GCM 256 with a 12-byte IV everywhere; a fresh IV per encryption, never reused.
- VK, DEKs and the X25519 private key never leave the browser in clear. The api has no decrypt code path; no server file imports WebCrypto for decryption.
- `key_version` 0 means plaintext HTML in `body_html`; `>= 1` means `body_html` holds `iv.ciphertext` of the HTML under the document's DEK of that version.
- After `vault_complete`, a document write with `keyVersion: 0` is answered `409 {"error":"vault-required"}`.
- No plaintext fallback: a decrypt failure shows the document as locked, never as empty, and never saves.
- Copy rule from Phase 2: every student-facing string goes through `t()` with an English value and a Hindi draft marked for review; no new English literals in components.
- Passphrase dialog copy follows v1's key-lock wording (`apps/web/components/workspace/dialogs/Passphrase.tsx`); the wrong-passphrase sentence is v1's: "Wrong passphrase — nothing was unlocked. Try again."
- Tests: vitest (`pnpm --filter <pkg> test`), api store contract in `apps/api/test/store.contract.ts` runs against both stores, Playwright on the pglite recipe (`apps/web/e2e/support/pglite-postgres.mjs`).
- Commits: conventional prefixes, one task per commit range; never commit `.env*`.

## Review Focus

1. A student types while the vault is locked (session expired after a reload): autosave must hold the change and prompt, never send plaintext and never drop the text. Test in Task 7.
2. Two tabs, one migrates while the other saves: the second tab's plaintext save must be refused with 409 and the tab must reload the document and re-encrypt. Test in Task 7 (the 409 retry case).
3. Recovery code with a typo (wrong code): nothing changes, the message says the code did not match, and the old passphrase still works. Test in Task 10.
4. A document whose DEK is missing or corrupt on the server: the editor shows "This document cannot be opened on this device" and the rest of the list still works. Test in Task 7.
5. Account erasure while a second tab is open: the second tab's next request gets 401, and no row of the user remains, audit excepted. Test in Task 3.

---

## File structure

- `apps/web/lib/vault/crypto.ts`: pure WebCrypto functions (Task 1).
- `apps/web/lib/vault/remember.ts`: IndexedDB "remember on this computer" for the wrapped VK, per user (Task 5).
- `apps/web/lib/vault/useVault.tsx`: React provider, session state, unlock/setup/recover/change, per-document DEK cache, `encryptBody`/`decryptBody` (Task 5).
- `apps/web/lib/vault/migrate.ts`: one-off migration of plaintext revisions (Task 8).
- `apps/web/lib/vault/export.ts`: zip of the decrypted work (Task 10).
- `apps/web/components/workspace/dialogs/VaultSetup.tsx`, `RecoverySheet.tsx`, `VaultRecover.tsx`, `ChangePassphrase.tsx`, `EraseAccount.tsx` (Tasks 6, 10).
- `apps/web/components/workspace/VaultPill.tsx` (Task 6).
- `packages/db/src/schema.ts` + `packages/db/migrations/0003_vault.sql` (Task 2).
- `apps/api/src/store/types.ts`, `memory.ts`, `drizzle.ts` (Task 2); `apps/api/src/routes/vault.ts`, `documents.ts`, `me.ts`, `import.ts` (Tasks 3, 9).
- `apps/web/scripts/i18n-overrides.mjs` (V2_STRINGS) and `extract-v1-i18n.mjs` (Task 4).
- `apps/web/e2e/phase3a-vault.spec.ts`, `docs/walkthroughs/phase-3a.md` (Task 11).

---

### Task 1: Vault crypto module

**Files:**
- Create: `apps/web/lib/vault/crypto.ts`
- Test: `apps/web/test/vaultCrypto.test.ts`

**Interfaces:**
- Produces:
  - `type Wrapped = string` (base64url fields joined by ".")
  - `generateVaultKey(): Promise<CryptoKey>` (AES-GCM 256, extractable)
  - `wrapWithPassphrase(vk: CryptoKey, pass: string): Promise<Wrapped>` (`salt.iv.ct`, 310,000 rounds)
  - `unwrapWithPassphrase(blob: Wrapped, pass: string): Promise<CryptoKey>` (throws `VaultError("wrong-passphrase")`)
  - `generateRecoveryCode(): string` (20 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, grouped `XXXXX-XXXXX-XXXXX-XXXXX`)
  - `wrapWithRecovery(vk, code): Promise<Wrapped>` / `unwrapWithRecovery(blob, code): Promise<CryptoKey>` (same KDF as the passphrase, code normalised: upper-case, hyphens and spaces removed; throws `VaultError("wrong-code")`)
  - `generateDek(): Promise<CryptoKey>`; `wrapKey(key: CryptoKey, vk: CryptoKey): Promise<Wrapped>` (`iv.ct` of the raw key); `unwrapKey(blob, vk): Promise<CryptoKey>`
  - `encryptText(text: string, key: CryptoKey): Promise<Wrapped>` (`iv.ct`); `decryptText(blob, key): Promise<string>` (throws `VaultError("corrupt")`)
  - `generateKeypair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }>` (X25519 via `crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])`); `wrapPrivateKey(priv, vk): Promise<Wrapped>`; `unwrapPrivateKey(blob, vk): Promise<CryptoKey>`
  - `class VaultError extends Error { constructor(public code: "wrong-passphrase" | "wrong-code" | "corrupt" | "no-crypto") }`
  - `VAULT_KDF_ITERATIONS = 310_000`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { generateVaultKey, wrapWithPassphrase, unwrapWithPassphrase, generateRecoveryCode, wrapWithRecovery, unwrapWithRecovery, generateDek, wrapKey, unwrapKey, encryptText, decryptText, generateKeypair, wrapPrivateKey, unwrapPrivateKey, VaultError, VAULT_KDF_ITERATIONS } from "@/lib/vault/crypto";

describe("vault crypto", () => {
  it("round-trips a text through DEK under VK under a passphrase", async () => {
    const vk = await generateVaultKey();
    const blob = await wrapWithPassphrase(vk, "correct horse");
    expect(blob.split(".")).toHaveLength(3);
    const vk2 = await unwrapWithPassphrase(blob, "correct horse");
    const dek = await generateDek();
    const dekBlob = await wrapKey(dek, vk);
    const dek2 = await unwrapKey(dekBlob, vk2);
    const ct = await encryptText("<p>Procrastination delays important work.</p>", dek);
    expect(ct).not.toContain("Procrastination");
    expect(await decryptText(ct, dek2)).toBe("<p>Procrastination delays important work.</p>");
  });
  it("rejects a wrong passphrase with a typed error", async () => {
    const vk = await generateVaultKey();
    const blob = await wrapWithPassphrase(vk, "right");
    await expect(unwrapWithPassphrase(blob, "wrong")).rejects.toMatchObject({ code: "wrong-passphrase" });
  });
  it("recovery code: 20 characters in four groups, normalised on use", async () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(code).not.toMatch(/[01IO]/);
    const vk = await generateVaultKey();
    const blob = await wrapWithRecovery(vk, code);
    const vk2 = await unwrapWithRecovery(blob, code.toLowerCase().replace(/-/g, " "));
    const dek = await generateDek();
    expect(await unwrapKey(await wrapKey(dek, vk), vk2)).toBeTruthy();
    await expect(unwrapWithRecovery(blob, "AAAAA-AAAAA-AAAAA-AAAAA")).rejects.toMatchObject({ code: "wrong-code" });
  });
  it("uses a fresh IV per encryption and flags a corrupt blob", async () => {
    const dek = await generateDek();
    const a = await encryptText("same", dek), b = await encryptText("same", dek);
    expect(a).not.toBe(b);
    await expect(decryptText(a.slice(0, -4) + "AAAA", dek)).rejects.toMatchObject({ code: "corrupt" });
  });
  it("wraps and unwraps an X25519 private key", async () => {
    const vk = await generateVaultKey();
    const kp = await generateKeypair();
    expect(kp.publicKeyB64.length).toBeGreaterThan(30);
    const priv = await unwrapPrivateKey(await wrapPrivateKey(kp.privateKey, vk), vk);
    expect(priv.algorithm.name).toBe("X25519");
  });
  it("pins the KDF cost", () => { expect(VAULT_KDF_ITERATIONS).toBe(310_000); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @appuscholar/web test -- vaultCrypto`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `apps/web/lib/vault/crypto.ts`**

Reuse the base64url helpers by moving `b64`/`unb64` from `apps/web/lib/ai/keys.ts` into `apps/web/lib/vault/encoding.ts` (exported `b64`, `unb64`) and importing them in both files; keys.ts behaviour unchanged. `wrapKey` exports the raw key (`crypto.subtle.exportKey("raw", key)`) and AES-GCM encrypts it under VK; `unwrapKey` imports raw as AES-GCM 256 non-extractable with `["encrypt","decrypt"]`. The private key is exported as `pkcs8`. `VaultError("no-crypto")` is thrown when `crypto.subtle` is missing.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @appuscholar/web test -- vaultCrypto keys`
Expected: PASS (keys.test.ts still green after the helper move).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/vault apps/web/lib/ai/keys.ts apps/web/test/vaultCrypto.test.ts
git commit -m "feat(web): vault crypto module with passphrase and recovery wraps, per-document keys and an X25519 keypair"
```

---

### Task 2: Schema, migration 0003 and store methods

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0003_vault.sql` (and the `meta/_journal.json` entry, generated with `pnpm --filter @appuscholar/db db:generate`)
- Modify: `apps/api/src/store/types.ts`, `apps/api/src/store/memory.ts`, `apps/api/src/store/drizzle.ts`
- Test: `apps/api/test/store.contract.ts` (runs under `memory.test.ts` and `drizzle.test.ts`)

**Interfaces:**
- Produces (schema): table `vault_keys` (`user_id` text PK → users cascade, `pass_wrapped` text, `recovery_wrapped` text, `public_key` text, `private_key_wrapped` text, `complete` boolean default false, `created_at`, `updated_at`); `documents.deks` jsonb not null default `[]` (array of `{ v: number; wrapped: string }`); `document_revisions.key_version` integer not null default 0; table `audit_log` (`id` text PK, `user_id` text not null, no foreign key, `action` text, `target` text nullable, `at` timestamp default now, index on user_id).
- Produces (types): `type VaultRecord = { passWrapped: string; recoveryWrapped: string; publicKey: string; privateKeyWrapped: string; complete: boolean; updatedAt: Date }`; `type WrappedDek = { v: number; wrapped: string }`; `NewRevision` gains `keyVersion: number` (required) and `DocumentRevision`/`DocumentWithBody` gain `keyVersion: number`; `DocumentWithBody` and `DocumentSummary` gain `deks: WrappedDek[]`; `type AuditAction = "signin" | "vault-setup" | "passphrase-changed" | "recovery-used" | "migration-complete" | "export" | "document-deleted" | "project-deleted" | "account-erased"`.
- Produces (Store):
  - `getVault(userId): Promise<VaultRecord | null>`
  - `putVault(userId, v: Omit<VaultRecord, "complete" | "updatedAt">): Promise<VaultRecord>` (creates; a second call throws `VaultExistsError`)
  - `updateVaultWraps(userId, patch: { passWrapped?: string; recoveryWrapped?: string }): Promise<VaultRecord | null>`
  - `markVaultComplete(userId): Promise<boolean>`
  - `addDek(userId, documentId, dek: WrappedDek): Promise<DocumentSummary | null>` (rejects a duplicate `v`)
  - `rewriteRevision(userId, documentId, seq, patch: { bodyHtml: string; keyVersion: number }): Promise<RevisionSummary | null>` (in place; `createdAt` unchanged)
  - `appendAudit(userId, action: AuditAction, target?: string): Promise<void>`; `listAudit(userId): Promise<{ action: AuditAction; target: string | null; at: Date }[]>`
  - `eraseUser(userId): Promise<boolean>` (deletes credentials, ai_use_log, vault_keys, projects with cascade, the user; audit rows stay)

- [ ] **Step 1: Add contract tests to `apps/api/test/store.contract.ts`**

```ts
it("vault record: create once, update wraps, mark complete", async () => {
  expect(await s.getVault(a)).toBeNull();
  const v = await s.putVault(a, { passWrapped: "s.i.c", recoveryWrapped: "s.i.r", publicKey: "pk", privateKeyWrapped: "i.p" });
  expect(v.complete).toBe(false);
  await expect(s.putVault(a, { passWrapped: "x", recoveryWrapped: "y", publicKey: "z", privateKeyWrapped: "w" })).rejects.toBeInstanceOf(VaultExistsError);
  expect((await s.updateVaultWraps(a, { passWrapped: "s2.i2.c2" }))!.passWrapped).toBe("s2.i2.c2");
  expect(await s.markVaultComplete(a)).toBe(true);
  expect((await s.getVault(a))!.complete).toBe(true);
  expect(await s.getVault(b)).toBeNull();
});
it("revisions carry a key version and deks attach to the document", async () => {
  const p = await s.createProject(a, "P");
  const d = (await s.createDocument(a, p.id, "D", "draft", { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: "t", wordCount: 1, keyVersion: 0 }))!;
  expect(d.keyVersion).toBe(0);
  expect(d.deks).toEqual([]);
  expect((await s.addDek(a, d.id, { v: 1, wrapped: "i.k" }))!.deks).toEqual([{ v: 1, wrapped: "i.k" }]);
  await expect(s.addDek(a, d.id, { v: 1, wrapped: "dup" })).rejects.toThrow();
  const r = (await s.appendRevision(a, d.id, { bodyHtml: "aXYZ.bQ", authorKind: "web", authorLabel: "t", wordCount: 9, keyVersion: 1 }))!;
  expect(r.keyVersion).toBe(1);
  expect((await s.getDocument(a, d.id))!.bodyHtml).toBe("aXYZ.bQ");
  const rw = (await s.rewriteRevision(a, d.id, 1, { bodyHtml: "cT.dU", keyVersion: 1 }))!;
  expect(rw.keyVersion).toBe(1);
  expect((await s.getRevision(a, d.id, 1))!.bodyHtml).toBe("cT.dU");
  expect(await s.rewriteRevision(b, d.id, 1, { bodyHtml: "no", keyVersion: 1 })).toBeNull();
});
it("audit survives erasure; erasure removes every other row", async () => {
  const p = await s.createProject(a, "P");
  await s.createDocument(a, p.id, "D", "draft", { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: "t", wordCount: 1, keyVersion: 0 });
  await s.putCredential(a, "groq", "s.i.c");
  await s.appendAudit(a, "export");
  expect(await s.eraseUser(a)).toBe(true);
  expect(await s.getUser(a)).toBeNull();
  expect(await s.listProjects(a)).toEqual([]);
  expect(await s.getCredentials(a)).toEqual([]);
  expect((await s.listAudit(a)).map((x) => x.action)).toEqual(["export", "account-erased"]);
  expect(await s.eraseUser(a)).toBe(false);
});
```

Update every existing `createDocument`/`appendRevision` call in the contract and route tests to pass `keyVersion: 0`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @appuscholar/api test`
Expected: FAIL, `getVault` is not a function; type errors on `keyVersion`.

- [ ] **Step 3: Schema and migration**

Add the tables and columns to `packages/db/src/schema.ts` as listed in Interfaces, then `pnpm --filter @appuscholar/db db:generate` and rename the output to `0003_vault.sql`; check the journal tag matches. `eraseUser` in drizzle is one transaction; `eraseUser` appends the `account-erased` audit row itself, last. `rewriteRevision` keeps `id`, `seq`, `created_at`, `author_*`, `word_count`, `origin_stats`.

- [ ] **Step 4: Store implementations and types**

Implement in `memory.ts` and `drizzle.ts`; export `VaultExistsError` from `types.ts`. `DocumentSummary.deks` is read from the row in `listDocuments` and `getDocument`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @appuscholar/db test && pnpm --filter @appuscholar/api test`
Expected: PASS for both stores.

- [ ] **Step 6: Commit**

```bash
git add packages/db apps/api/src/store apps/api/test
git commit -m "feat(db,api): vault_keys and audit_log tables, per-document deks, revision key_version, rewrite and erase store methods"
```

---

### Task 3: Vault, document and erasure routes

**Files:**
- Create: `apps/api/src/routes/vault.ts`
- Modify: `apps/api/src/routes/documents.ts`, `apps/api/src/routes/me.ts`, `apps/api/src/routes/projects.ts` (document create path, if documents are created there; otherwise `documents.ts`), `apps/api/src/app.ts` (mount)
- Test: `apps/api/test/vault.routes.test.ts`, `apps/api/test/app.test.ts` (document write cases)

**Interfaces:**
- Consumes: Task 2 store methods.
- Produces (HTTP, all under the existing bearer auth and terms gate):
  - `GET /me/vault` → `200 VaultRecord` or `404 {error:"no-vault"}`
  - `PUT /me/vault` body `{ passWrapped, recoveryWrapped, publicKey, privateKeyWrapped }` → `201 VaultRecord`; `409 {error:"vault-exists"}`; audit `vault-setup`
  - `PATCH /me/vault/wraps` body `{ passWrapped?: string; recoveryWrapped?: string; reason: "passphrase-changed" | "recovery-used" }` → `200 VaultRecord`; audit by `reason`
  - `POST /me/vault/complete` → `204`; audit `migration-complete`
  - `GET /me/audit` → `200 { entries: [...] }`
  - `POST /me/export-audit` → `204`; audit `export` (the browser calls it after building the zip)
  - `DELETE /me` → `204`; the token is rejected afterwards (`401`); audit `account-erased`
  - `PUT /documents/:id` body becomes `{ bodyHtml: string; keyVersion: number; wordCount?: number; originStats?: OriginStats; dek?: WrappedDek; title?: string }`. When `keyVersion === 0` the server sanitises and counts as today. When `keyVersion >= 1` it stores `bodyHtml` untouched, requires `wordCount` and `originStats`, and must find `keyVersion` in the document's `deks` (or in `dek`, which it adds first); otherwise `400 {error:"unknown-key-version"}`. If the user's vault is complete and `keyVersion === 0` → `409 {error:"vault-required"}`.
  - Document creation (wherever `POST` creates a document) accepts the same body shape.
  - `POST /documents/:id/deks` body `{ v: number; wrapped: string }` → `200 DocumentSummary`; `409 {error:"dek-exists"}` on a duplicate `v`.
  - `PUT /documents/:id/revisions/:seq/rewrite` body `{ bodyHtml, keyVersion }` → `200 RevisionSummary`; allowed only while the vault is not complete (`409 {error:"migration-closed"}` after); `keyVersion` must exist in `deks`.
  - `GET /documents/:id` and `GET /documents/:id/revisions/:seq` return `keyVersion` and `deks`.
  - `POST /documents/:id/restore/:seq` copies `bodyHtml` and `keyVersion` from the old revision without touching the body.

- [ ] **Step 1: Write the failing route tests**

```ts
describe("vault routes", () => {
  it("creates once, patches wraps with a reason, completes, and audits each", async () => {
    expect((await req("GET", "/me/vault")).status).toBe(404);
    const made = await req("PUT", "/me/vault", { passWrapped: "s.i.c", recoveryWrapped: "s.i.r", publicKey: "pk", privateKeyWrapped: "i.p" });
    expect(made.status).toBe(201);
    expect((await req("PUT", "/me/vault", { passWrapped: "a", recoveryWrapped: "b", publicKey: "c", privateKeyWrapped: "d" })).status).toBe(409);
    expect((await req("PATCH", "/me/vault/wraps", { passWrapped: "n.e.w", reason: "passphrase-changed" })).status).toBe(200);
    expect((await req("POST", "/me/vault/complete")).status).toBe(204);
    const audit = await (await req("GET", "/me/audit")).json();
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(["vault-setup", "passphrase-changed", "migration-complete"]);
  });
  it("refuses plaintext after completion and accepts ciphertext with a known key version", async () => {
    const doc = await makeDoc(); // helper: project + document with keyVersion 0
    await req("PUT", "/me/vault", {...});
    const enc = await req("PUT", `/documents/${doc.id}`, { bodyHtml: "aA.bB", keyVersion: 1, wordCount: 3, originStats: ZERO_STATS, dek: { v: 1, wrapped: "i.k" } });
    expect(enc.status).toBe(200);
    expect((await (await req("GET", `/documents/${doc.id}`)).json()).bodyHtml).toBe("aA.bB");
    expect((await req("PUT", `/documents/${doc.id}`, { bodyHtml: "cC.dD", keyVersion: 2, wordCount: 1, originStats: ZERO_STATS })).status).toBe(400);
    await req("POST", "/me/vault/complete");
    expect((await req("PUT", `/documents/${doc.id}`, { bodyHtml: "<p>plain</p>", keyVersion: 0 })).status).toBe(409);
    expect((await req("PUT", `/documents/${doc.id}/revisions/1/rewrite`, { bodyHtml: "x.y", keyVersion: 1 })).status).toBe(409);
  });
  it("rewrite keeps seq and created_at and is scoped to the owner", async () => { /* assert seq 1 unchanged, createdAt equal, other user → 404 */ });
  it("DELETE /me erases and the token stops working", async () => {
    expect((await req("DELETE", "/me")).status).toBe(204);
    expect((await req("GET", "/me")).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @appuscholar/api test -- vault.routes`
Expected: FAIL, 404 on `/me/vault`.

- [ ] **Step 3: Implement the routes**

`vault.ts` exports `vaultRoutes(store: Store)`, mounted under `/me/vault` in `app.ts`; `/me/audit`, `/me/export-audit` and `DELETE /me` go in `me.ts`. In `documents.ts` replace the `Put` schema with the new shape and branch on `keyVersion`. `ensureUser` must not recreate an erased user from a stale token: `DELETE /me` records the user id in a `erased_users` set in the memory store and an `erased` boolean is unnecessary in drizzle because the JWT's `sub` no longer matches a row and the auth middleware already answers 401 when `getUser` is null (verify; if `ensureUser` recreates, change the middleware to recreate only on the sign-in path).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @appuscholar/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): vault routes, ciphertext-aware document writes with key versions, revision rewrite for migration, audit and account erasure"
```

---

### Task 4: v2 strings for the vault in both dictionaries

**Files:**
- Modify: `apps/web/scripts/i18n-overrides.mjs` (add `V2_STRINGS`), `apps/web/scripts/extract-v1-i18n.mjs` (merge them), `apps/web/messages/en.json`, `apps/web/messages/hi.json` (regenerated)
- Test: `apps/web/test/i18n.test.ts`

**Interfaces:**
- Produces: `export const V2_STRINGS: Record<string, { en: string; hi: string }>` with the keys below; the extract script writes `en` into en.json and `hi` into hi.json for every key, after the v1 extraction and the overrides. Keys (English values are the product copy; Hindi values are drafts with the same `// DRAFT — reviewed by: (pending)` marker as HINDI_DRAFTS):
  - `vault_pill_off`: "Vault off" · `vault_pill_locked`: "Vault locked" · `vault_pill_on`: "Vault on" · `vault_pill_migrating`: "Vault: securing your documents…"
  - `vault_setup_h2`: "Protect your work with a passphrase"
  - `vault_setup_intro`: "Your documents are saved under your account, locked so that only this passphrase opens them. Nobody at Appuscholar can read them. If you lose the passphrase and the recovery sheet, the documents cannot be recovered."
  - `vault_setup_btn`: "Set passphrase" · `vault_setup_later`: "Not now"
  - `vault_sheet_h2`: "Your recovery sheet" · `vault_sheet_intro`: "If you forget the passphrase, this code is the only way back in. Save the file somewhere safe. Appuscholar does not keep a copy."
  - `vault_sheet_download`: "⬇ Download recovery sheet" · `vault_sheet_saved`: "I have saved it" · `vault_sheet_done`: "Done"
  - `vault_unlock_h2`: "Unlock your vault" · `vault_unlock_hint`: "Type the passphrase that protects your documents."
  - `vault_wrong`: "Wrong passphrase — nothing was unlocked. Try again." (same sentence as the key lock)
  - `vault_forgot`: "Forgot it? Use your recovery sheet" · `vault_recover_h2`: "Recover with your code" · `vault_recover_code`: "Recovery code" · `vault_recover_new`: "New passphrase" · `vault_recover_btn`: "Recover and set passphrase" · `vault_recover_bad`: "That code did not match. Check the sheet and try again." · `vault_recovered`: "Vault recovered ✓ — a new recovery sheet is ready"
  - `vault_change_h2`: "Change passphrase" · `vault_change_old`: "Current passphrase" · `vault_change_new`: "New passphrase" · `vault_change_btn`: "Change" · `vault_changed`: "Passphrase changed ✓"
  - `vault_migrating_n`: "Securing document {n} of {total}…" · `vault_migrated`: "All your documents are now locked in your vault ✓"
  - `vault_doc_locked`: "This document is locked. Unlock your vault to read it." · `vault_doc_broken`: "This document cannot be opened on this device. Nothing was changed."
  - `vault_save_locked`: "Unlock your vault to save your changes." · `vault_remember`: "Remember on this computer" · `vault_forget_q`: "Forget the vault on this computer?"
  - `help_export_btn`: "⬇ Export all my work" · `export_done`: "Export ready ✓" · `help_erase_btn`: "Delete my account" · `erase_h2`: "Delete your account?" · `erase_intro`: "Everything under your account is deleted: projects, documents and their versions, keys and the AI-use log. This cannot be undone. Export first if you want a copy." · `erase_confirm_word`: "DELETE" · `erase_type`: "Type {word} to confirm" · `erase_btn`: "Delete everything" · `erased`: "Your account has been deleted."
  - `import_v1_vault`: "Your backup is read on this computer and saved locked in your vault."

- [ ] **Step 1: Write the failing test**

```ts
it("v2 vault strings exist in both dictionaries with the draft marker on Hindi", () => {
  for (const k of ["vault_pill_off", "vault_setup_h2", "vault_wrong", "erase_btn", "import_v1_vault"]) {
    expect(en[k]).toBeTruthy();
    expect(hi[k]).toBeTruthy();
  }
  expect(en.vault_wrong).toBe("Wrong passphrase — nothing was unlocked. Try again.");
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @appuscholar/web test -- i18n` → FAIL, `en.vault_pill_off` undefined.

- [ ] **Step 3: Implement** — add `V2_STRINGS` and the merge step; regenerate with `node apps/web/scripts/extract-v1-i18n.mjs` (confirm the invocation in the script header); the i18n coverage test must still pass (new copy is not a v1 value).

- [ ] **Step 4: Run** — `pnpm --filter @appuscholar/web test -- i18n` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): v2 vault strings in English with Hindi drafts, merged by the extraction script"`

---

### Task 5: Vault session state in the browser

**Files:**
- Create: `apps/web/lib/vault/remember.ts`, `apps/web/lib/vault/useVault.tsx`
- Modify: `apps/web/components/workspace/dialogs/Passphrase.tsx` (new ask kinds), `apps/web/app/(workspace)/layout.tsx` or wherever `KeysProvider` is mounted (mount `VaultProvider` beside it)
- Test: `apps/web/test/vaultRemember.test.ts`, `apps/web/test/useVault.test.tsx`

**Interfaces:**
- Consumes: Task 1 functions; Task 3 routes; `askPassphrase` from Passphrase.tsx; `apiFetch`.
- Produces:
  - `PassphraseAsk` gains `{ kind: "vault-unlock" }`, `{ kind: "vault-choose" }`, `{ kind: "vault-confirm" }` (copy from Task 4 keys).
  - `remember.ts`: `rememberVault(userId: string, passWrapped: string, vkRaw: ArrayBuffer): Promise<void>` stores the VK raw bytes encrypted under a random device key kept in IndexedDB (store `appu_vault`, key `userId`) — i.e. "remember on this computer" means the vault opens without the passphrase on this device, as v1's remembered keys do; `readRemembered(userId): Promise<ArrayBuffer | null>`; `forgetRemembered(userId): Promise<void>`; `hasRemembered(userId): Promise<boolean>`.
  - `useVault(): VaultValue` where `type VaultValue = { status: "loading" | "off" | "locked" | "unlocked" | "migrating"; complete: boolean; setup(pass: string, remember: boolean): Promise<{ recoveryCode: string }>; unlock(pass: string, remember: boolean): Promise<void>; unlockRemembered(): Promise<boolean>; recover(code: string, newPass: string): Promise<{ recoveryCode: string }>; changePassphrase(oldPass: string, newPass: string): Promise<void>; lock(): void; forgetThisComputer(): Promise<void>; ensureUnlocked(): Promise<boolean> /* prompts via askPassphrase("vault-unlock") until correct or cancelled */; encryptBody(doc: { id: string; deks: WrappedDek[] }, html: string): Promise<{ bodyHtml: string; keyVersion: number; dek?: WrappedDek }>; decryptBody(doc: { id: string; deks: WrappedDek[]; bodyHtml: string; keyVersion: number }): Promise<string>; migrating: { n: number; total: number } | null }`.
  - `encryptBody` uses the highest `v` in `deks` (unwrapping and caching the DEK per document id); when `deks` is empty it generates a DEK, wraps it, returns it as `dek: { v: 1, wrapped }` for the server to add. `decryptBody` with `keyVersion 0` returns `bodyHtml` unchanged; a missing `v` or a `VaultError("corrupt")` throws `VaultError("corrupt")`.
  - On sign-out (the existing `clearSession` path in `useKeys`/Help): `lock()` and, when the student chose "Forget and sign out", `forgetThisComputer()`.

- [ ] **Step 1: Write the failing tests**

```ts
// vaultRemember.test.ts (fake-indexeddb in devDependencies; add if absent)
it("remembers per user and forgets", async () => {
  const raw = crypto.getRandomValues(new Uint8Array(32)).buffer;
  await rememberVault("u1", "s.i.c", raw);
  expect(await hasRemembered("u1")).toBe(true);
  expect(await hasRemembered("u2")).toBe(false);
  expect(new Uint8Array((await readRemembered("u1"))!)).toEqual(new Uint8Array(raw));
  await forgetRemembered("u1");
  expect(await readRemembered("u1")).toBeNull();
});
// useVault.test.tsx (render with a mocked apiFetch; mock askPassphrase)
it("setup creates the record, returns a recovery code and leaves the vault unlocked", async () => { /* status "off" → setup("pw", false) → PUT /me/vault called with 4 wrapped fields → status "unlocked", code matches the group pattern */ });
it("unlock with the wrong passphrase keeps the vault locked and throws wrong-passphrase", async () => { /* GET /me/vault returns a record wrapped with "right"; unlock("wrong") rejects; status still "locked" */ });
it("encryptBody adds a dek on first use and decryptBody reads it back", async () => { /* deks [] → result has dek v1; decryptBody with deks [dek] and the returned bodyHtml → original html */ });
it("decryptBody of keyVersion 0 passes through; corrupt ciphertext throws corrupt", async () => {});
it("ensureUnlocked prompts until correct and returns false on cancel", async () => { /* askPassphrase mock returns "wrong", then null → false; "wrong", then "right" → true */ });
```

- [ ] **Step 2: Run** → FAIL, modules missing.
- [ ] **Step 3: Implement** `remember.ts`, `useVault.tsx` and the Passphrase ask kinds. `VaultProvider` reads `GET /me/vault` once after `/me` resolves; `status` is "off" on 404, "locked" on 200, then tries `unlockRemembered()`.
- [ ] **Step 4: Run** `pnpm --filter @appuscholar/web test -- vault` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): vault session provider with setup, unlock, recovery, passphrase change and per-document encryption"`

---

### Task 6: Setup flow, recovery sheet, the Vault pill and key re-wrap

**Files:**
- Create: `apps/web/components/workspace/dialogs/VaultSetup.tsx`, `apps/web/components/workspace/dialogs/RecoverySheet.tsx`, `apps/web/components/workspace/VaultPill.tsx`
- Modify: `apps/web/components/workspace/dialogs/ProviderKey.tsx` (the "pass" mode), `apps/web/components/workspace/Header.tsx` (pill next to the version), `apps/web/lib/ai/useKeys.tsx` (lazy re-wrap)
- Test: `apps/web/test/vaultSetup.test.tsx`, `apps/web/test/vaultPill.test.tsx`, `apps/web/test/useKeys.test.tsx` (extend)

**Interfaces:**
- Consumes: `useVault` (Task 5), `downloadBlob` from `apps/web/lib/export/download.ts`, `V2_STRINGS` keys.
- Produces:
  - `VaultSetup` dialog: passphrase twice (v1's choose/confirm prompts), "Remember on this computer" checkbox, "Set passphrase" / "Not now"; on success opens `RecoverySheet` with the code shown once, the download button (file `appuscholar-recovery.txt`, content: the code, the account email, the date, and two sentences from `vault_sheet_intro`), the "I have saved it" checkbox that enables "Done".
  - `VaultPill`: amber `vault_pill_off` (opens VaultSetup), grey `vault_pill_locked` (calls `ensureUnlocked`), green `vault_pill_on` (opens a small menu: Change passphrase, Forget on this computer), purple `vault_pill_migrating` with the `{n}/{total}` title. `data-testid="vault-pill"`.
  - ProviderKey "Protect with a passphrase": when the vault is "off", saving a key in "pass" mode first runs `VaultSetup` (the vault passphrase becomes the key passphrase), then locks the key with the same passphrase as today. When the vault exists, the key is locked under VK instead: `useKeys.save(p, key, "pass")` without `pass` wraps the key with `wrapKey`-style `encryptText(key, vk)` and stores the blob with a `v2:` prefix in `credentials`; `getUnlocked` for a `v2:` blob decrypts with VK after `ensureUnlocked()`; a legacy blob (no prefix) is unlocked with `askPassphrase("unlock")` as today and then re-saved as `v2:` (lazy re-wrap), with the old blob replaced.
  - The welcome tour's "Set up my key" path is unchanged (it opens ProviderKey).

- [ ] **Step 1: Write the failing tests**

```ts
it("VaultSetup requires matching passphrases, then shows the sheet and enables Done after the checkbox", async () => {});
it("the recovery sheet file is named appuscholar-recovery.txt and contains the code", async () => { /* spy downloadBlob */ });
it("VaultPill shows off/locked/on/migrating from status and opens setup when off", async () => {});
it("saving a key in pass mode with the vault off runs setup first, then stores a v2: blob", async () => {});
it("a legacy blob unlocks with the key passphrase and is re-saved as v2:", async () => {});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the three components and the two integrations. The pill sits left of the language toggle at 1440 and inside the phone header's second row (see `design/mockups/05` for the phone header).
- [ ] **Step 4: Run** `pnpm --filter @appuscholar/web test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): vault setup and recovery sheet dialogs, header vault pill, AI keys locked under the vault with lazy re-wrap"`

---

### Task 7: Documents are encrypted on save and decrypted on load

**Files:**
- Modify: `apps/web/lib/useAutosave.ts`, `apps/web/components/workspace/Workspace.tsx` (document load, restore-deleted, new document), `apps/web/components/document/DocBar.tsx` (New), `apps/web/lib/import/run.ts` (file import creates encrypted documents), `apps/web/lib/templates.ts` only if it creates documents (verify; otherwise untouched), `apps/web/lib/writingRecord.ts` only if it reads `bodyHtml` (verify; it should read counts only)
- Test: `apps/web/test/useAutosave.test.ts` (extend), `apps/web/test/documentLoad.test.tsx`

**Interfaces:**
- Consumes: `useVault().encryptBody/decryptBody/ensureUnlocked/status`; `wordCount` and `originCount` from `@appuscholar/core` (now computed in the browser for encrypted saves).
- Produces:
  - `useAutosave(docId, initialHtml, initialSeq, opts: { encrypt: (html: string) => Promise<{ bodyHtml: string; keyVersion: number; wordCount: number; originStats: OriginStats; dek?: WrappedDek }> })`. The save callback sends that object. When the vault is "locked", the autosaver keeps the dirty text, sets status `"locked"` (new `SaveStatus` value) and calls `ensureUnlocked()` once; on success it saves, on cancel it stays dirty and the badge reads `vault_save_locked`. `shouldWarnOnUnload("locked")` is true.
  - Document load: after `GET /documents/:id`, `decryptBody` runs before the editor mounts; `VaultError` → the editor area shows `vault_doc_broken` (corrupt) or `vault_doc_locked` (cancelled unlock) with the Doc list still usable.
  - A `409 vault-required` on save: reload the document from the server, re-encrypt, retry once; if it fails again, surface the error badge.
  - New documents and imports: with the vault "unlocked" or "locked" (exists), bodies are encrypted at creation (`ensureUnlocked` first); with the vault "off" they stay plaintext (`keyVersion 0`).

- [ ] **Step 1: Write the failing tests**

```ts
it("autosave sends ciphertext with counts and a first dek when the vault is unlocked", async () => { /* PUT body has keyVersion 1, wordCount 9, originStats, dek.v 1, and bodyHtml not containing the sentence */ });
it("autosave with the vault locked keeps the text, prompts once, saves after unlock", async () => { /* ensureUnlocked mock resolves true on second call; status sequence dirty → locked → saving → saved */ });
it("autosave with the vault locked and the prompt cancelled stays dirty and warns on unload", async () => {});
it("a 409 vault-required reloads the document, re-encrypts and retries once", async () => {});
it("load decrypts keyVersion 1 and passes keyVersion 0 through", async () => {});
it("a corrupt body shows vault_doc_broken and keeps the Doc list", async () => {});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per Interfaces. Keep `createAutosaver`'s retry schedule; add the `locked` state before the retry loop.
- [ ] **Step 4: Run** `pnpm --filter @appuscholar/web test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): documents encrypt on save and decrypt on load, locked-vault autosave holds the text, counts computed in the browser"`

---

### Task 8: One-off migration of plaintext documents

**Files:**
- Create: `apps/web/lib/vault/migrate.ts`
- Modify: `apps/web/lib/vault/useVault.tsx` (run after the first unlock when `!complete`), `apps/web/components/workspace/VaultPill.tsx` (progress title)
- Test: `apps/web/test/vaultMigrate.test.ts`

**Interfaces:**
- Consumes: `GET /projects`, `GET /projects/:id/documents` (whatever lists documents today; verify the path in `Workspace.tsx`), `GET /documents/:id/revisions`, `GET /documents/:id/revisions/:seq`, `PUT /documents/:id/revisions/:seq/rewrite`, `POST /me/vault/complete`, Task 5 `encryptBody`.
- Produces: `migrateToVault(deps: { listAll(): Promise<{ id: string; deks: WrappedDek[] }[]>; listRevisions(id): Promise<{ seq: number; keyVersion: number }[]>; getRevision(id, seq): Promise<{ bodyHtml: string; keyVersion: number }>; addDek(id, dek: WrappedDek): Promise<void>; rewrite(id, seq, body: { bodyHtml: string; keyVersion: number }): Promise<void>; complete(): Promise<void>; encrypt: VaultValue["encryptBody"]; onProgress(n: number, total: number): void }): Promise<{ rewritten: number }>`. Order: documents by id; within a document, revisions ascending; every `keyVersion 0` revision is rewritten; a document with no deks gets one via `addDek` (`POST /documents/:id/deks` from Task 3). Deleted documents (`deletedAt` set) are included. Idempotent: a re-run after an interruption rewrites only what is still plaintext, then completes.

- [ ] **Step 1: Write the failing tests**

```ts
it("rewrites every plaintext revision in order, adds one dek per document, reports progress, then completes", async () => { /* 2 docs × 2 revisions, one already keyVersion 1 → rewritten 3; progress calls (1,2),(2,2); complete called once */ });
it("is idempotent after an interruption", async () => { /* rewrite throws on the 2nd call; second run rewrites the remaining 2 and completes */ });
it("includes soft-deleted documents", async () => {});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `useVault` runs it once per session after the first successful unlock when `complete` is false, sets `status: "migrating"`, and on success toasts `vault_migrated`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): one-off migration of plaintext revisions into the vault with progress, idempotent and including deleted documents"`

---

### Task 9: v1 backup import moves into the browser

**Files:**
- Modify: `apps/web/components/workspace/dialogs/ImportV1Dialog.tsx`, `apps/web/lib/import/v1.ts` (create if the parsing is inline today), `apps/api/src/routes/import.ts` (remove `/v1`), `apps/api/src/app.ts`
- Test: `apps/web/test/importV1.test.ts`, `apps/api/test/app.test.ts` (route gone → 404)

**Interfaces:**
- Consumes: the v1 backup JSON shape the api route validates today (`Body` in `import.ts`: `{ exported?: string; projectTitle: string; projectId?: string; documents: { title: string; bodyHtml: string }[] }`); project create `POST /projects`; document create route (Task 3 body shape); `sanitizeHtml` from `@appuscholar/core` (runs in the browser now).
- Produces: `importV1Backup(json: unknown, target: { projectId?: string; projectTitle?: string }, deps: { createProject(title): Promise<{ id: string }>; createDocument(projectId, title, body): Promise<void>; encrypt: VaultValue["encryptBody"] | null }): Promise<{ projectId: string; imported: number }>`; author label `v1 backup <date>` as today; batches of at most 20 documents between UI yields. The dialog shows `import_v1_vault` when the vault exists.

- [ ] **Step 1: Write the failing tests** — same cases the api route tests covered (invalid JSON → `ImportError`; N documents imported; `projectId` reuse), plus "encrypts when a vault exists".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** and delete the server route and its tests.
- [ ] **Step 4: Run** `pnpm test` at the root → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web,api): v1 backup import parses and encrypts in the browser; server import route removed"`

---

### Task 10: Export, recovery, passphrase change and account erasure in Help

**Files:**
- Create: `apps/web/lib/vault/export.ts`, `apps/web/components/workspace/dialogs/VaultRecover.tsx`, `ChangePassphrase.tsx`, `EraseAccount.tsx`
- Modify: `apps/web/components/workspace/dialogs/Help.tsx` (buttons), `apps/web/components/workspace/dialogs/Passphrase.tsx` (the `vault_forgot` link on the unlock ask opens `VaultRecover`)
- Test: `apps/web/test/vaultExport.test.ts`, `apps/web/test/vaultRecover.test.tsx`, `apps/web/test/eraseAccount.test.tsx`

**Interfaces:**
- Consumes: `useVault().recover/changePassphrase`, `toWord` from `apps/web/lib/export/word.ts` (verify name), `downloadBlob`, `apiFetch("/me/export-audit")`, `apiFetch("/me", { method: "DELETE" })`, `signOut` from the session lib.
- Produces:
  - `exportAll(deps: { listProjects; listDocuments; getDocument; decrypt; writingRecordText(): Promise<string> }): Promise<Blob>` → zip named `appuscholar-export-YYYY-MM-DD.zip` with `<project>/<document>.html` and `.doc`, `writing-process-record.txt`, `index.json` (titles, stages, dates). Source papers included under `<project>/sources/`.
  - `VaultRecover`: code field (auto-formats groups), new passphrase twice, `vault_recover_btn`; wrong code → `vault_recover_bad`, nothing changes; success → new `RecoverySheet` (the old code is void) and toast `vault_recovered`.
  - `ChangePassphrase`: old, new, confirm; wrong old → `vault_wrong`; success toast `vault_changed`; no document is re-encrypted (assert no `/documents` write).
  - `EraseAccount`: the word `DELETE` typed to enable `erase_btn`; on success toast `erased`, sign out, keys and vault forgotten on this computer.

- [ ] **Step 1: Write the failing tests**

```ts
it("export zips every document decrypted, plus the record and index", async () => { /* 2 projects, 3 docs (one source) → entries include P1/D1.html, P1/D1.doc, P2/sources/S.html, writing-process-record.txt, index.json; html contains the sentence */ });
it("recover with a wrong code changes nothing and keeps the old passphrase working", async () => {});
it("recover with the right code sets the new passphrase and shows a new sheet", async () => {});
it("change passphrase re-wraps VK only", async () => { /* PATCH /me/vault/wraps once; zero document PUTs */ });
it("erase needs the word DELETE, then calls DELETE /me and signs out", async () => {});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; Help gains `help_export_btn`, "Change passphrase" (when the vault exists) and `help_erase_btn` below the existing Sign out.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): export of all work, recovery by code, passphrase change and account erasure from Help"`

---

### Task 11: Journey e2e, walk-through script and server-blindness test

**Files:**
- Create: `apps/web/e2e/phase3a-vault.spec.ts`, `docs/walkthroughs/phase-3a.md`
- Modify: `apps/api/test/drizzle.test.ts` (blindness test), `.github/workflows/ci.yml` only if a new dependency (fake-indexeddb) needs install steps
- Test: the files above

**Interfaces:**
- Consumes: the e2e sign-in helper (`signIn` in `phase2-walkthrough.spec.ts`, extract to `apps/web/e2e/support/signin.ts` if not already shared), testids `vault-pill`, `vault-setup-*`, `vault-sheet-*`, `pp-*` (the passphrase dialog's existing ids; verify), `help-export`, `help-erase`.

- [ ] **Step 1: Write the e2e (expected to fail until wired)**

```ts
test("vault journey: setup, write, new browser context needs the passphrase, wrong passphrase, recovery, export, erase", async ({ browser, page }) => {
  // 1 sign in (new account), accept terms and welcome
  // 2 write two sentences; expect "9 words"
  // 3 click vault-pill (off) → setup "correct horse" twice, Remember unticked → sheet: read the code from data-testid="vault-code", tick saved, Done → pill "Vault on"; toast vault_migrated appears (one document migrated)
  // 4 reload → pill "Vault locked"; type in the editor → unlock prompt; cancel → status badge vault_save_locked; click pill → type "wrong" → vault_wrong toast; type "correct horse" → saved; sentences present
  // 5 new context, same account (reuse the e2e cookie) → open the document → unlock prompt → "correct horse" → text present
  // 6 Help → Change passphrase: "correct horse" → "battery staple"; reload; unlock with the new one works
  // 7 unlock prompt → Forgot → recover with the sheet code and "third pass"; reload; "third pass" opens the document; old code now fails
  // 8 Help → Export: a download named appuscholar-export-*.zip (Playwright download event)
  // 9 Help → Delete my account: type DELETE → signed out at /signin; signing in again with the same e2e email shows a fresh account (terms gate again)
});
```

- [ ] **Step 2: Server-blindness test in `drizzle.test.ts`**

```ts
it("after an encrypted save no table holds the plaintext sentence", async () => {
  // through the HTTP app against the pglite db: PUT /documents/:id with keyVersion 1 and a real ciphertext of "Procrastination delays important work."
  // then SELECT every text/jsonb column of every table (information_schema) and assert none contains "Procrastination"
});
```

- [ ] **Step 3: Run** `pnpm --filter @appuscholar/web e2e -- phase3a` on the pglite recipe → PASS; `pnpm --filter @appuscholar/api test` → PASS.

- [ ] **Step 4: Walk-through script** `docs/walkthroughs/phase-3a.md`: the same nine moments as human steps with "Expect to see" and an empty Result column, the "Build under test" pill line, and a "Not yet in this phase" section (sharing, datasets, hosted MCP).

- [ ] **Step 5: Commit** — `git commit -m "test(web,api): vault journey e2e, server-blindness test and the Phase 3A walk-through script"`

---

## Deferred from the spec (recorded, not built here)

- Revision retention pruning (30 days full, then daily, then weekly): a server job in Phase 4, when datasets add volume.
- Sharing grants, the `document_grants` table and roles: Phase 7.
- The hosted MCP door's use of the keypair: Phase 6.
- Ciphertext stays in the existing text column as base64url rather than `bytea`: a ruling for a smaller migration; revisit if row size matters.

## Deploy and sign-off (after the final review)

1. Apply migration 0003 to production Neon (`packages/db` `db:migrate` with the production URL from the scratchpad env; counts before and after).
2. Deploy api, check `/health`; deploy web, read the version pill.
3. OJ walks `docs/walkthroughs/phase-3a.md` on the live URL with a real account; the migration of his existing documents is step 3.
4. Update `terms_d1` (the vault sentence replaces "Statistics data is encrypted…") in `i18n-overrides.mjs` — flagged for the lawyer with the rest.
