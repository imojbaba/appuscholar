import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";

export type AuthEnv = { Variables: { userId: string; email: string } };

export function apiAuth(secret: string) {
  const key = new TextEncoder().encode(secret);
  return createMiddleware<AuthEnv>(async (c, next) => {
    const h = c.req.header("authorization") ?? "";
    const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!tok) return c.json({ error: "unauthorized" }, 401);
    try {
      const { payload } = await jwtVerify(tok, key, { algorithms: ["HS256"] });
      if (!payload.sub) return c.json({ error: "unauthorized" }, 401);
      c.set("userId", payload.sub);
      c.set("email", typeof payload.email === "string" ? payload.email : "");
      await next();
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
  });
}
