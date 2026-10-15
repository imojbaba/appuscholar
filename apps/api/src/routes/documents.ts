import { Hono } from "hono";
import { z } from "zod";
import { sanitizeHtml, wordCount } from "@appuscholar/core";
import type { Store } from "../store/types";
import type { AuthEnv } from "../auth";

const Put = z.object({ bodyHtml: z.string(), title: z.string().trim().min(1).max(200).optional() });
const Patch = z.object({ title: z.string().trim().min(1).max(200) });
const Move = z.object({ projectId: z.string().min(1) });

export function documentRoutes(store: Store, maxBodyBytes: number) {
  const r = new Hono<AuthEnv>();

  r.get("/:id", async (c) => {
    const d = await store.getDocument(c.get("userId"), c.req.param("id"));
    return d ? c.json(d) : c.json({ error: "not-found" }, 404);
  });

  r.put("/:id", async (c) => {
    const raw = await c.req.text();
    if (raw.length > maxBodyBytes) return c.json({ error: "too-large" }, 413);
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return c.json({ error: "invalid" }, 400); }
    const body = Put.safeParse(parsed);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    const current = await store.getDocument(userId, c.req.param("id"));
    if (!current) return c.json({ error: "not-found" }, 404);
    if (body.data.title && body.data.title !== current.title) await store.renameDocument(userId, current.id, body.data.title);
    const clean = sanitizeHtml(body.data.bodyHtml);
    if (clean === current.bodyHtml) {
      const rev = await store.getRevision(userId, current.id, current.currentSeq);
      return c.json({ document: await store.getDocument(userId, current.id), revision: rev, created: false });
    }
    const rev = await store.appendRevision(userId, current.id, { bodyHtml: clean, authorKind: "web", authorLabel: c.get("email"), wordCount: wordCount(clean) });
    return c.json({ document: await store.getDocument(userId, current.id), revision: rev, created: true });
  });

  /** Rename only. Never touches the body and never creates a revision, so it cannot race the editor's autosave. */
  r.patch("/:id", async (c) => {
    let parsed: unknown; try { parsed = await c.req.json(); } catch { return c.json({ error: "invalid" }, 400); }
    const body = Patch.safeParse(parsed);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const d = await store.renameDocument(c.get("userId"), c.req.param("id"), body.data.title);
    return d ? c.json(d) : c.json({ error: "not-found" }, 404);
  });

  /** Move a document into another of the user's projects (v1: a project is a label). 404 for a foreign or missing project or document. */
  r.post("/:id/move", async (c) => {
    const body = Move.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const d = await store.moveDocument(c.get("userId"), c.req.param("id"), body.data.projectId);
    return d ? c.json(d) : c.json({ error: "not-found" }, 404);
  });

  r.get("/:id/revisions", async (c) => {
    const list = await store.listRevisions(c.get("userId"), c.req.param("id"));
    return list ? c.json(list) : c.json({ error: "not-found" }, 404);
  });

  r.get("/:id/revisions/:seq", async (c) => {
    const seq = Number(c.req.param("seq"));
    if (!Number.isInteger(seq) || seq < 1) return c.json({ error: "invalid" }, 400);
    const rev = await store.getRevision(c.get("userId"), c.req.param("id"), seq);
    return rev ? c.json(rev) : c.json({ error: "not-found" }, 404);
  });

  r.post("/:id/restore/:seq", async (c) => {
    const seq = Number(c.req.param("seq"));
    if (!Number.isInteger(seq) || seq < 1) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    const old = await store.getRevision(userId, c.req.param("id"), seq);
    if (!old) return c.json({ error: "not-found" }, 404);
    const rev = await store.appendRevision(userId, old.documentId, { bodyHtml: old.bodyHtml, authorKind: "restore", authorLabel: `restored revision ${seq}`, wordCount: old.wordCount });
    return c.json({ document: await store.getDocument(userId, old.documentId), revision: rev });
  });

  return r;
}
