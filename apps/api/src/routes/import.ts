import { Hono } from "hono";
import { z } from "zod";
import { originCount, sanitizeHtml, wordCount } from "@appuscholar/core";
import type { Store } from "../store/types";
import type { AuthEnv } from "../auth";

/**
 * The client parses (and, for locked backups, decrypts) the v1 file and sends only the documents, in batches.
 * The first batch creates the project; later batches pass its projectId. Every body is sanitised here regardless.
 */
const Body = z.object({
  exported: z.string().max(100),
  projectTitle: z.string().trim().min(1).max(300),
  projectId: z.string().min(1).max(100).optional(),
  documents: z.array(z.object({ title: z.string().trim().max(500), bodyHtml: z.string() })).min(1).max(1000)
});

/** Vercel rejects function request bodies above 4.5 MB; the web client batches imports to stay well below this. */
export const DEFAULT_MAX_IMPORT_BYTES = 4.5 * 1024 * 1024;

export function importRoutes(store: Store, maxRequestBytes = DEFAULT_MAX_IMPORT_BYTES) {
  const r = new Hono<AuthEnv>();
  r.post("/v1", async (c) => {
    const raw = await c.req.text();
    if (raw.length > maxRequestBytes) return c.json({ error: "too-large" }, 413);
    let json: unknown; try { json = JSON.parse(raw); } catch { return c.json({ error: "invalid" }, 400); }
    const body = Body.safeParse(json);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    const { exported, projectTitle, projectId, documents } = body.data;
    const project = projectId ? await store.getProject(userId, projectId) : await store.createProject(userId, projectTitle);
    if (!project) return c.json({ error: "not-found" }, 404);
    const label = exported ? `v1 backup ${exported.slice(0, 10)}` : "v1 backup";
    let imported = 0;
    for (const d of documents) {
      const clean = sanitizeHtml(d.bodyHtml);
      const created = await store.createDocument(userId, project.id, d.title || "Untitled", "draft", { bodyHtml: clean, authorKind: "import", authorLabel: label, wordCount: wordCount(clean), originStats: originCount(clean) });
      if (created) imported++;
    }
    return c.json({ projectId: project.id, imported }, 201);
  });
  return r;
}
