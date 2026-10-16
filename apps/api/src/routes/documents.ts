import { Hono } from "hono";
import { z } from "zod";
import { originCount } from "@appuscholar/core";
import { DekExistsError, type Store } from "../store/types";
import { WriteFields, WrappedDekSchema, resolveWrite } from "./docWrite";
import type { AuthEnv } from "../auth";

const Put = z.object({ ...WriteFields, title: z.string().trim().min(1).max(200).optional() });
const Rewrite = z.object({ bodyHtml: z.string(), keyVersion: z.number().int().min(1).max(1e6) }).strict();
const Patch = z.object({ title: z.string().trim().min(1).max(200).optional(), kind: z.enum(["draft", "source"]).optional() }).strict().refine((b) => b.title !== undefined || b.kind !== undefined);
const ZERO_STATS = { typed: 0, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 };
const Move = z.object({ projectId: z.string().min(1) }).strict();

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
    const w = await resolveWrite(store, userId, current.deks, body.data);
    if (!w.ok) return c.json({ error: w.error }, w.status);
    if (body.data.title && body.data.title !== current.title) await store.renameDocument(userId, current.id, body.data.title);
    if (w.addDek) {
      try { await store.addDek(userId, current.id, w.addDek); } catch (e) { if (e instanceof DekExistsError) return c.json({ error: "dek-exists" }, 409); throw e; }
    }
    if (w.bodyHtml === current.bodyHtml && w.keyVersion === current.keyVersion) {
      const rev = await store.getRevision(userId, current.id, current.currentSeq);
      return c.json({ document: await store.getDocument(userId, current.id), revision: rev, created: false });
    }
    const rev = await store.appendRevision(userId, current.id, { bodyHtml: w.bodyHtml, authorKind: "web", authorLabel: c.get("email"), wordCount: w.wordCount, keyVersion: w.keyVersion, originStats: w.originStats });
    return c.json({ document: await store.getDocument(userId, current.id), revision: rev, created: true });
  });

  /** Attaches a wrapped data key to a document. 409 if that key version is already there. */
  r.post("/:id/deks", async (c) => {
    const body = WrappedDekSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    try {
      const d = await store.addDek(c.get("userId"), c.req.param("id"), body.data);
      return d ? c.json(d) : c.json({ error: "not-found" }, 404);
    } catch (e) {
      if (e instanceof DekExistsError) return c.json({ error: "dek-exists" }, 409);
      throw e;
    }
  });

  /** Migration only: replaces one revision's plaintext with its ciphertext in place (seq, created_at, author and counts stay). Closed once the vault is complete. */
  r.put("/:id/revisions/:seq/rewrite", async (c) => {
    const seq = Number(c.req.param("seq"));
    if (!Number.isInteger(seq) || seq < 1) return c.json({ error: "invalid" }, 400);
    const raw = await c.req.text();
    if (raw.length > maxBodyBytes) return c.json({ error: "too-large" }, 413);
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return c.json({ error: "invalid" }, 400); }
    const body = Rewrite.safeParse(parsed);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    if ((await store.getVault(userId))?.complete) return c.json({ error: "migration-closed" }, 409);
    // Soft-deleted documents are included: the migration has to reach every plaintext revision.
    const doc = await store.getDocument(userId, c.req.param("id"), { includeDeleted: true });
    if (!doc) return c.json({ error: "not-found" }, 404);
    if (!doc.deks.some((k) => k.v === body.data.keyVersion)) return c.json({ error: "unknown-key-version" }, 400);
    const rev = await store.rewriteRevision(userId, doc.id, seq, body.data);
    return rev ? c.json(rev) : c.json({ error: "not-found" }, 404);
  });

  /** Rename and/or mark as source. Never touches the body and never creates a revision, so it cannot race the editor's autosave. */
  r.patch("/:id", async (c) => {
    let parsed: unknown; try { parsed = await c.req.json(); } catch { return c.json({ error: "invalid" }, 400); }
    const body = Patch.safeParse(parsed);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId"), id = c.req.param("id");
    let d = null;
    if (body.data.title !== undefined) d = await store.renameDocument(userId, id, body.data.title);
    if (body.data.kind !== undefined && (body.data.title === undefined || d)) d = await store.setDocumentKind(userId, id, body.data.kind);
    return d ? c.json(d) : c.json({ error: "not-found" }, 404);
  });

  /** Soft delete: 204, or 409 for the project's only document. Brought back within seconds by POST /:id/restore-deleted. */
  r.delete("/:id", async (c) => {
    const res = await store.softDeleteDocument(c.get("userId"), c.req.param("id"));
    if (res === null) return c.json({ error: "not-found" }, 404);
    if (res === "only-document") return c.json({ error: "only-document" }, 409);
    return c.body(null, 204);
  });

  r.post("/:id/restore-deleted", async (c) => {
    const d = await store.restoreDeletedDocument(c.get("userId"), c.req.param("id"));
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
    // The body is copied as it is: a ciphertext revision is never sanitised, and keeps the key version its body was encrypted under.
    if (old.keyVersion === 0 && (await store.getVault(userId))?.complete) return c.json({ error: "vault-required" }, 409);
    const rev = await store.appendRevision(userId, old.documentId, { bodyHtml: old.bodyHtml, authorKind: "restore", authorLabel: `restored revision ${seq}`, wordCount: old.wordCount, keyVersion: old.keyVersion, originStats: old.originStats ?? (old.keyVersion === 0 ? originCount(old.bodyHtml) : ZERO_STATS) });
    return c.json({ document: await store.getDocument(userId, old.documentId), revision: rev });
  });

  return r;
}
