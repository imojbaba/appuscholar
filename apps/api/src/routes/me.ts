import { Hono } from "hono";
import { z } from "zod";
import type { Store } from "../store/types";
import type { AuthEnv } from "../auth";

export const SettingsSchema = z.object({
  lang: z.enum(["en", "hi"]),
  provider: z.string().max(20),
  draftFirst: z.boolean(),
  aiFallback: z.boolean(),
  field: z.string().max(60),
  contentLang: z.enum(["en", "hi"]),
  orcid: z.string().max(40),
  toolTab: z.string().max(20),
  sidebarCollapsed: z.boolean(),
  stageGroupsCollapsed: z.array(z.string().max(10)).max(6),
  fmtMore: z.boolean(),
  dockW: z.number().int().min(320).max(760),
  aiLogOff: z.boolean(),
  seenWelcome: z.boolean()
}).partial().strict();

const ActiveProject = z.object({ projectId: z.string().min(1).max(100).nullable() }).strict();
const CredentialBody = z.object({
  encryptedKey: z.string().max(4000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
}).strict();
const Provider = z.string().regex(/^[a-z0-9-]{1,20}$/);

export function meRoutes(store: Store) {
  const r = new Hono<AuthEnv>();
  // The e2e provider can present a JWT for a user the adapter has not written yet; every /me call makes sure the row exists first.
  r.use("*", async (c, next) => {
    await store.ensureUser(c.get("userId"), c.get("email"));
    await next();
  });

  r.get("/", async (c) => {
    const userId = c.get("userId");
    const [user, scratch] = await Promise.all([store.getUser(userId), store.getScratchProject(userId)]);
    if (!user) return c.json({ error: "server" }, 500);
    let activeProjectId = user.activeProjectId;
    if (activeProjectId && !(await store.getProject(userId, activeProjectId))) {
      await store.setActiveProject(userId, null);
      activeProjectId = null;
    }
    return c.json({
      id: user.id, email: user.email, locale: user.locale, settings: user.settings, activeProjectId,
      scratchProjectId: scratch.id, termsAcceptedAt: user.termsAcceptedAt, ageConfirmed: user.ageConfirmed
    });
  });

  r.patch("/settings", async (c) => {
    const body = SettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return c.json(await store.updateSettings(c.get("userId"), body.data));
  });

  r.patch("/active-project", async (c) => {
    const body = ActiveProject.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const ok = await store.setActiveProject(c.get("userId"), body.data.projectId);
    return ok ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });

  r.post("/terms", async (c) => {
    await store.acceptTerms(c.get("userId"), new Date());
    return c.body(null, 204);
  });

  r.get("/credentials", async (c) => {
    const creds = await store.getCredentials(c.get("userId"));
    return c.json(creds.map(({ provider, encryptedKey, updatedAt }) => ({ provider, encryptedKey, updatedAt })));
  });

  r.put("/credentials/:provider", async (c) => {
    const provider = Provider.safeParse(c.req.param("provider"));
    const body = CredentialBody.safeParse(await c.req.json().catch(() => null));
    if (!provider.success || !body.success) return c.json({ error: "invalid" }, 400);
    await store.putCredential(c.get("userId"), provider.data, body.data.encryptedKey);
    return c.body(null, 204);
  });

  r.delete("/credentials/:provider", async (c) => {
    const ok = await store.deleteCredential(c.get("userId"), c.req.param("provider"));
    return ok ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });

  return r;
}
