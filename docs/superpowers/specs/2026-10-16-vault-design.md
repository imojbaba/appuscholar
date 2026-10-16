# The researcher's vault: design decision (amends the v2 spec §6)

Written 2026-10-16 from OJ's direction: "a vault for a researcher that is only accessible to them unless they share, with our encryption and passphrase, which should solve privacy yet stay persistent without being only on the device." Every line marked **Ruling** is the session's call and OJ can overturn it; lines marked **OJ** are his words.

## Intent

v1 kept everything in the browser, so nothing left the device. v2 keeps everything on a server so it survives a lost laptop and follows the student across devices. The vault gives back v1's privacy on top of v2's persistence: the server stores the student's work as ciphertext it cannot read, and only the student, or someone the student grants, can open it.

## Goals
- A student's documents and datasets are unreadable to the operator, to Neon, and to anyone who copies the database. (OJ)
- The same work opens on any device after sign-in plus passphrase. (OJ)
- Sharing is an explicit grant from the student, revocable. (OJ)
- A forgotten passphrase is recoverable once, by a code the student kept, and the UI says plainly what is lost otherwise.

## Non-goals
- Hiding titles, project names, stages, status, dates and word counts from the server: lists and the stage model need them. **Ruling**: metadata stays plaintext; titles count as metadata.
- Hiding the text of an AI request from the provider the student chose: the passage must reach the provider in clear. The gateway never stores it (already true). The privacy notice says this.
- Protecting against a compromised browser or a student who shares their passphrase.

## Anti-goals (failure even if it "works")
- A student loses a thesis to a forgotten passphrase without ever having been offered the recovery sheet.
- Any code path that falls back to writing plaintext silently.
- A migration that leaves some revisions readable and some not without saying so.

## What is encrypted, from when
| Data | Today | After the vault |
|---|---|---|
| Document body and every revision | plaintext | ciphertext |
| Datasets (Phase 4) | ciphertext by the existing §6 design | unchanged, same key hierarchy |
| Ask Appuscholar chat history (Phase 2 keeps it in the browser only) | not stored | ciphertext if ever stored |
| Citation library, reading shelf notes, ethics records (Phase 3 and 4) | not built | ciphertext from their first version, so no later migration |
| Writing record and origin stats (word counts by origin) | plaintext | plaintext (counts, not text) |
| AI-use log | plaintext (provider, model, kind, group, day; never text) | unchanged |
| Locked AI keys | ciphertext under the passphrase | moved under the vault key hierarchy below, one passphrase for everything |
| Titles, project names, stage, status, settings | plaintext | plaintext |

## Key hierarchy (**Ruling**, standard envelope encryption)
- **Vault key (VK)**: one random 256-bit AES key per user, generated in the browser the first time the student sets a passphrase. Never leaves the browser in clear.
- **Passphrase wrap**: PBKDF2-SHA256(passphrase, per-user salt, 310,000 iterations) → KEK; VK wrapped with AES-GCM under KEK, stored server-side with salt, iterations and IV. Changing the passphrase re-wraps VK only; nothing else is re-encrypted.
- **Recovery wrap**: a 128-bit recovery code generated in the browser, shown once as a downloadable sheet (`appuscholar-recovery.txt`) and never stored by us; VK wrapped under a key derived from the code, stored server-side. Recovery = enter the code, unwrap VK, set a new passphrase.
- **Document keys (DEK)**: one random 256-bit key per document, wrapped under VK and stored with the document. Every revision of a document is AES-GCM under its DEK with a fresh IV. Per-document keys exist so that sharing one document means wrapping one DEK, not exposing VK.
- **Sharing (built in Phase 7, designed now)**: each user gets an X25519 keypair; the public key is stored plain, the private key wrapped under VK. A grant = the document's DEK wrapped to the recipient's public key, with a role (reader, commenter, editor), stored in a `document_grants` table. Revoke = delete the grant and rotate the DEK on the next save. Supervisor and statistician roles are grants on a project's documents and datasets.

## Behaviour the student sees
- First time: the AI Provider / Key dialog's "Protect with a passphrase" becomes the vault passphrase for everything, with the same two-prompt flow v1 uses, then the recovery sheet download with a checkbox "I have saved it". The dialog copy says what the passphrase protects and what is lost without it.
- Each session: one passphrase prompt on the first action that needs VK (open a document, save, unlock a key), reusing the key lock's session model. "Remember on this computer" keeps the wrapped VK in IndexedDB per user, like v1's remembered keys, and sign-out offers to forget it (same dialog as the keys today).
- No passphrase set yet: documents stay plaintext and the header shows a quiet amber "Vault off" pill that opens the setup. **Ruling**: no student is forced to set a passphrase on day one, so the first-run journey of the blueprint does not change.
- Migration: on the first unlock after the feature ships, the browser re-encrypts every plaintext document and revision of that user in one job with a progress line, then the server marks the user `vault_complete`. Until then the pill reads "Vault: migrating".

## Server rules
- `documents.content` and `document_revisions.content` become `bytea` ciphertext plus `iv`; `documents.dek_wrapped` holds the wrapped DEK. The API never has a decrypt path; a unit test asserts that no plaintext of a known sentence appears in any table after a save.
- Export: the browser decrypts and builds the zip (documents as .docx and .html, datasets as CSV, the writing record). Deletion: the API deletes the rows; the audit log keeps the fact. Both are tested routines, as DPDP needs.
- Audit log: a small `audit_log` table (user, action, target, at, ip prefix) for sign-in, passphrase set or changed, recovery used, export, delete, grant, revoke. Plain, because it holds no content.
- Revisions: append-only ciphertext. **Ruling**: keep every revision for 30 days, then one per day, then one per week after a year; a background job on the server prunes by timestamp without reading content.
- Doors: the MCP door (Phase 6) runs where the student is, with VK unlocked by the student for that session; a server-side agent never holds VK. The AI gateway is unchanged: the browser sends plaintext passages per request over TLS.

## What this costs
- Server-side search across documents is gone; search is in-browser over the open project. Acceptable (v1 had none).
- Every reload needs the passphrase unless remembered; the key lock already asks for it, so the student sees one prompt, not two.
- Larger rows (ciphertext plus IV, base64 in JSON). Negligible at thesis sizes.

## Phasing (**Ruling**)
- Phase 3A (first sub-phase of Phase 3): vault key, passphrase and recovery sheet, document and revision encryption, migration of existing plaintext, export and delete routines, audit log, tests. Built before Research and Citation so their stored data is encrypted from day one.
- Phase 4: datasets join the hierarchy (the existing §6 design, keyed under VK).
- Phase 7: sharing and roles.

## Tests the plan must include
- Round trip: write, save, open in a fresh browser context with the passphrase, read.
- Wrong passphrase: nothing decrypts, nothing is sent, the error is the one sentence v1 uses for keys.
- Recovery: lose the passphrase, use the code, set a new passphrase, everything opens.
- Passphrase change: no document re-encryption; old passphrase stops working.
- Migration: a user with plaintext documents and revisions ends with zero plaintext rows and the same text.
- Server blindness: a test that saves a known sentence and greps every table.
- Export and delete: the zip has the text; after delete the rows are gone and the audit row exists.
- Remember on this computer and forget on sign-out, per user, as the keys do today.

## Open for OJ (changes what gets built)
1. Titles plaintext (ruling above) or encrypted with lists shown only after unlock.
2. Vault optional with a "Vault off" pill (ruling) or mandatory at first sign-in.
3. Revision retention (ruling: 30 days full, then daily, then weekly).
4. Region: Singapore or Mumbai; independent of the vault but decided before the pilot.

## Answers from the builder check (2026-10-16)
1. **Phase map.** BLUEPRINT §8 (with Phase 3A and Phase 7 added 2026-10-16) is current; the v2 spec's §11 is superseded. Datasets and the copilot tables do not exist yet. The key lock exists in code: `apps/web/lib/ai/keys.ts` (`lockKey`, `unlockKeyBlob`, blob `salt.iv.ciphertext` base64url, PBKDF2 250,000 rounds) and `apps/web/lib/ai/useKeys.tsx` (`save(p, key, mode, pass)`, `forget`, server blobs via `/me/credentials`). The vault reuses that code and raises the rounds to 310,000 for VK wrapping only.
2. **MCP and the vault.** **Ruling**: the X25519 keypair is created in 3A (one extra wrapped column), so a hosted copilot can seal a revision to the student without holding VK; reading documents through a hosted MCP needs the student's browser session to unwrap for it, which is Phase 6 design. No server-side key escrow. **Open for OJ**: whether the Phase 6 door is hosted (claude.ai connector) or local; a hosted door without escrow cannot read documents on its own.
3. **Locked AI keys.** They stay in `credentials` as today. **Ruling**: at vault setup the student's passphrase is the vault passphrase; each existing locked key is re-wrapped under VK the next time the student unlocks it (lazy), and the old blob is deleted then. A key locked under a different, forgotten passphrase is re-entered, as in v1.
4. **Real data exists** (production Neon, 64 documents and 64 revisions on 2026-10-16). **Rulings**: the migration rewrites revision rows in place (same id, seq, timestamps; content and `key_version` change) and writes one audit row; after `vault_complete` the server rejects a plaintext body with 409 `vault-required`; the v1 backup import moves to the browser (parse, encrypt, create) in 3A and the server route is removed; there is no offline queue in v2.
5. **Key versions.** **Ruling**: `document_revisions.key_version` (integer) and `documents.deks` (jsonb array of wrapped DEKs by version) from the start, so a Phase 7 revoke rotates forward without re-encrypting history.
6. **Deletion and audit.** Three levels: document soft delete (exists), project delete (exists, cascades), and account erasure (new in 3A: every row of the user, then the user). **Ruling**: `audit_log.user_id` has no foreign key and survives erasure; no IP is stored.
