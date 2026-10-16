import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import type { Store } from "./store/types";

export type AuthEnv = { Variables: { userId: string; email: string } };

/**
 * With a store, a valid token whose user has been erased (DELETE /me) answers 401 on every route, so a stale token can neither
 * read nor recreate anything. Users the store has never seen (the e2e provider writes them lazily) are not affected.
 */
export function apiAuth(secret: string, store?: Store) {
  const key = new TextEncoder().encode(secret);
  return createMiddleware<AuthEnv>(async (c, next) => {
    const h = c.req.header("authorization") ?? "";
    const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!tok) return c.json({ error: "unauthorized" }, 401);
    try {
      const { payload } = await jwtVerify(tok, key, { algorithms: ["HS256"] });
      if (!payload.sub) return c.json({ error: "unauthorized" }, 401);
      if (store && !(await store.getUser(payload.sub)) && (await store.listAudit(payload.sub)).some((e) => e.action === "account-erased")) return c.json({ error: "unauthorized" }, 401);
      c.set("userId", payload.sub);
      c.set("email", typeof payload.email === "string" ? payload.email : "");
      await next();
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
  });
}
