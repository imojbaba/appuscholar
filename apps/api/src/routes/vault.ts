import { Hono } from "hono";
import { z } from "zod";
import { VaultExistsError, type Store } from "../store/types";
import type { AuthEnv } from "../auth";

const Wrap = z.string().min(1).max(10_000);
const Create = z.object({ passWrapped: Wrap, recoveryWrapped: Wrap, publicKey: z.string().min(1).max(2_000), privateKeyWrapped: Wrap }).strict();
const Wraps = z.object({ passWrapped: Wrap.optional(), recoveryWrapped: Wrap.optional(), reason: z.enum(["passphrase-changed", "recovery-used"]) }).strict()
  .refine((b) => b.passWrapped !== undefined || b.recoveryWrapped !== undefined, { message: "no wrap" });

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
    const { reason, ...wraps } = body.data;
    const v = await store.updateVaultWraps(userId, wraps);
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
