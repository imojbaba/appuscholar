import { Hono } from "hono";
import { z } from "zod";
import { VaultExistsError, VaultKeypairExistsError, VaultStaleError, type Store } from "../store/types";
import type { AuthEnv } from "../auth";

const Wrap = z.string().min(1).max(10_000);
const PublicKey = z.string().min(1).max(2_000);
/** The sharing keypair comes as a pair or not at all. */
const pairOk = (b: { publicKey?: string | null; privateKeyWrapped?: string | null }) => (b.publicKey == null) === (b.privateKeyWrapped == null);
// The keypair is null where the browser has no X25519; checkWrapped (a sentinel under the vault key) is always there.
const Create = z.object({ passWrapped: Wrap, recoveryWrapped: Wrap, checkWrapped: Wrap, publicKey: PublicKey.nullable(), privateKeyWrapped: Wrap.nullable() }).strict()
  .refine(pairOk, { message: "keypair is a pair" });
const Wraps = z.object({
  passWrapped: Wrap.optional(), recoveryWrapped: Wrap.optional(),
  // Added once, by a later unlock, when the vault was set up without X25519.
  publicKey: PublicKey.optional(), privateKeyWrapped: Wrap.optional(),
  // The updatedAt of the record the client changed: another tab or device may have changed it since (409 stale).
  expectUpdatedAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), { message: "date" }).optional(),
  reason: z.enum(["passphrase-changed", "recovery-used", "keypair-added"])
}).strict()
  .refine((b) => b.passWrapped !== undefined || b.recoveryWrapped !== undefined || b.publicKey !== undefined, { message: "no wrap" })
  .refine(pairOk, { message: "keypair is a pair" })
  .refine((b) => (b.reason === "keypair-added") === (b.passWrapped === undefined && b.recoveryWrapped === undefined), { message: "reason" });

/** The server stores only wrapped keys: it never sees a passphrase, a recovery code or an unwrapped key. */
export function vaultRoutes(store: Store) {
  const r = new Hono<AuthEnv>();
  // Mounted ahead of meRoutes, so it makes sure the user row exists itself (vault_keys has a foreign key to users). An erased user never gets here: apiAuth answers 401.
  r.use("*", async (c, next) => {
    await store.ensureUser(c.get("userId"), c.get("email"));
    await next();
  });

  r.get("/", async (c) => {
    const v = await store.getVault(c.get("userId"));
    return v ? c.json(v) : c.json({ error: "no-vault" }, 404);
  });

  r.put("/", async (c) => {
    const body = Create.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    try {
      const v = await store.putVault(userId, body.data);
      await store.appendAudit(userId, "vault-setup");
      return c.json(v, 201);
    } catch (e) {
      if (e instanceof VaultExistsError) return c.json({ error: "vault-exists" }, 409);
      throw e;
    }
  });

  r.patch("/wraps", async (c) => {
    const body = Wraps.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    const { reason, expectUpdatedAt, ...wraps } = body.data;
    let v;
    try {
      v = await store.updateVaultWraps(userId, wraps, { expectUpdatedAt: expectUpdatedAt === undefined ? undefined : new Date(expectUpdatedAt) });
    } catch (e) {
      if (e instanceof VaultStaleError) return c.json({ error: "stale" }, 409);
      if (e instanceof VaultKeypairExistsError) return c.json({ error: "keypair-exists" }, 409);
      throw e;
    }
    if (!v) return c.json({ error: "no-vault" }, 404);
    await store.appendAudit(userId, reason);
    return c.json(v);
  });

  r.post("/complete", async (c) => {
    const userId = c.get("userId");
    const v = await store.getVault(userId);
    if (!v) return c.json({ error: "no-vault" }, 404);
    // Never while a plaintext revision is left (a stale tab's write, a restore during the run): the client runs another pass first.
    if (!v.complete) {
      const left = await store.countPlaintextRevisions(userId);
      if (left > 0) return c.json({ error: "plaintext-remains", count: left }, 409);
    }
    // Completing twice is harmless and is logged once.
    if (!v.complete && (await store.markVaultComplete(userId))) await store.appendAudit(userId, "migration-complete");
    return c.body(null, 204);
  });

  return r;
}
