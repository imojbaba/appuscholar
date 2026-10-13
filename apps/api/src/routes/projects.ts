import { Hono } from "hono";
import { z } from "zod";
import type { Store } from "../store/types";
import type { AuthEnv } from "../auth";

const Create = z.object({ title: z.string().trim().min(1).max(200) });
const CreateDoc = z.object({ title: z.string().trim().min(1).max(200), kind: z.string().trim().min(1).max(40).default("draft") });

export function projectRoutes(store: Store) {
  const r = new Hono<AuthEnv>();
  r.get("/", async (c) => c.json(await store.listProjects(c.get("userId"))));
  r.post("/", async (c) => {
    const body = Create.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return c.json(await store.createProject(c.get("userId"), body.data.title), 201);
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
