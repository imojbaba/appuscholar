import { Hono } from "hono";
import { z } from "zod";
import { PROJECT_STAGES, PROJECT_STATUSES, type Store } from "../store/types";
import type { AuthEnv } from "../auth";

const Create = z.object({ title: z.string().trim().min(1).max(200) });
const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  stage: z.enum(PROJECT_STAGES).optional(),
  status: z.enum(PROJECT_STATUSES).optional()
}).refine(v => v.title !== undefined || v.stage !== undefined || v.status !== undefined, { message: "empty patch" });
const CreateDoc = z.object({ title: z.string().trim().min(1).max(200), kind: z.string().trim().min(1).max(40).default("draft") });

export function projectRoutes(store: Store) {
  const r = new Hono<AuthEnv>();
  r.get("/", async (c) => c.json(await store.listProjects(c.get("userId"))));
  r.post("/", async (c) => {
    const body = Create.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return c.json(await store.createProject(c.get("userId"), body.data.title), 201);
  });
  r.patch("/:id", async (c) => {
    const body = Patch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const p = await store.updateProject(c.get("userId"), c.req.param("id"), body.data);
    return p ? c.json(p) : c.json({ error: "not-found" }, 404);
  });
  r.delete("/:id", async (c) => {
    const ok = await store.deleteProject(c.get("userId"), c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });
  r.get("/:id/documents", async (c) => {
    const list = await store.listDocuments(c.get("userId"), c.req.param("id"));
    return list ? c.json(list) : c.json({ error: "not-found" }, 404);
  });
  r.post("/:id/documents", async (c) => {
    const body = CreateDoc.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const d = await store.createDocument(c.get("userId"), c.req.param("id"), body.data.title, body.data.kind, { bodyHtml: "", authorKind: "web", authorLabel: c.get("email"), wordCount: 0 });
    return d ? c.json(d, 201) : c.json({ error: "not-found" }, 404);
  });
  return r;
}
