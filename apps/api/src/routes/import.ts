import { Hono } from "hono";
import { z } from "zod";
import { parseV1Backup, wordCount } from "@appuscholar/core";
import type { Store } from "../store/types";
import type { AuthEnv } from "../auth";

const Body = z.object({ bundleText: z.string().max(50 * 1024 * 1024) });

export function importRoutes(store: Store) {
  const r = new Hono<AuthEnv>();
  r.post("/v1", async (c) => {
    const body = Body.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const parsed = parseV1Backup(body.data.bundleText);
    if (!parsed.ok) return c.json({ error: parsed.reason }, 400);
    const userId = c.get("userId");
    const firstProject = parsed.backup.projects[0];
    const title = firstProject ? `${firstProject.title} (imported from v1)` : "Imported from v1";
    const project = await store.createProject(userId, title);
    let imported = 0;
    for (const d of parsed.backup.documents) {
      const created = await store.createDocument(userId, project.id, d.title, "draft", { bodyHtml: d.bodyHtml, authorKind: "import", authorLabel: `v1 backup ${parsed.backup.exported.slice(0, 10)}`, wordCount: wordCount(d.bodyHtml) });
      if (created) imported++;
    }
    return c.json({ projectId: project.id, imported }, 201);
  });
  return r;
}
