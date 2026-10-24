import { Hono, type Context } from "hono";
import { DekExistsError, VersionConflictError, type ProjectBlob, type Store } from "../store/types";
import { checkSealed } from "./docWrite";
import { BlobPutSchema, BlobRewriteSchema, isBlobKind, resolveBlobWrite } from "./blobWrite";
import type { AuthEnv } from "../auth";

/** What a client sees of a blob. */
const wire = (b: ProjectBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: b.deks, updatedAt: b.updatedAt, version: b.version });
/**
 * If-Match carries the version the client read, quoted as GET's and PUT's ETag or bare, never half quoted. Absent is undefined (a tab from
 * before wave A); malformed is null.
 */
const IF_MATCH = /^(?:"(\d+)"|(\d+))$/;
const readIfMatch = (h: string | undefined): number | undefined | null => {
  if (h === undefined) return undefined;
  const m = IF_MATCH.exec(h.trim());
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * Per-project stage data, one blob per (project, kind), mounted under /projects. Every route answers 404 for a project that is not the
 * user's (the scratch project is one of theirs), then 400 for a kind outside the list. Bodies follow the documents' vault rules.
 */
export function blobRoutes(store: Store, maxBodyBytes: number) {
  const r = new Hono<AuthEnv>();

  const owned = async (c: Context<AuthEnv>) => (await store.getProject(c.get("userId"), c.req.param("id")!)) !== null;
  /** The raw body, checked against the size limit before it is parsed, as documents do; a string is the error to answer with. */
  const readJson = async (c: Context<AuthEnv>): Promise<{ data: unknown } | "too-large" | "invalid"> => {
    const raw = await c.req.text();
    if (raw.length > maxBodyBytes) return "too-large";
    try { return { data: JSON.parse(raw) }; } catch { return "invalid"; }
  };

  /** Every blob without its body, with its version (what a tab compares before it reads a body again). */
  r.get("/:id/blobs", async (c) => {
    const list = await store.listBlobs(c.get("userId"), c.req.param("id"));
    return list ? c.json(list) : c.json({ error: "not-found" }, 404);
  });

  r.get("/:id/blobs/:kind", async (c) => {
    if (!(await owned(c))) return c.json({ error: "not-found" }, 404);
    const kind = c.req.param("kind");
    if (!isBlobKind(kind)) return c.json({ error: "invalid" }, 400);
    const b = await store.getBlob(c.get("userId"), c.req.param("id"), kind);
    if (!b) return c.json({ error: "not-found" }, 404);
    c.header("ETag", `"${b.version}"`);
    return c.json(wire(b));
  });

  /**
   * Creates or replaces the blob. keyVersion 0 is refused with 409 vault-required once the user has a vault record, and always for a kind in
   * SEALED_ONLY_KINDS (the participant list). With If-Match (the version the client read; "0" for a blob it has never seen) the write lands
   * only on that version, else 409 version-conflict with the current one; a missing blob is version 0, so a save naming a version above 0
   * never recreates a blob deleted elsewhere.
   */
  r.put("/:id/blobs/:kind", async (c) => {
    if (!(await owned(c))) return c.json({ error: "not-found" }, 404);
    const kind = c.req.param("kind");
    if (!isBlobKind(kind)) return c.json({ error: "invalid" }, 400);
    const expectedVersion = readIfMatch(c.req.header("if-match"));
    if (expectedVersion === null) return c.json({ error: "invalid" }, 400);
    const read = await readJson(c);
    if (read === "too-large") return c.json({ error: "too-large" }, 413);
    if (read === "invalid") return c.json({ error: "invalid" }, 400);
    const body = BlobPutSchema.safeParse(read.data);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId"), projectId = c.req.param("id");
    const current = await store.getBlob(userId, projectId, kind);
    // A stale tab hears version-conflict before any rule judged against a blob it has not seen; the store checks again, atomically.
    if (expectedVersion !== undefined && (current?.version ?? 0) !== expectedVersion) return c.json({ error: "version-conflict", version: current?.version ?? 0 }, 409);
    const w = await resolveBlobWrite(store, userId, kind, current?.deks ?? [], body.data);
    if (!w.ok) return c.json({ error: w.error }, w.status);
    try {
      const b = await store.putBlob(userId, projectId, kind, { body: w.body, keyVersion: w.keyVersion, dek: w.addDek, expectedVersion });
      if (!b) return c.json({ error: "not-found" }, 404);
      c.header("ETag", `"${b.version}"`);
      return c.json(wire(b));
    } catch (e) {
      if (e instanceof VersionConflictError) return c.json({ error: "version-conflict", version: e.current }, 409);
      if (e instanceof DekExistsError) return c.json({ error: "dek-exists" }, 409);
      throw e;
    }
  });

  /** Deletes the blob: 204, or 404 when there is none (a Reading shelf paper removed from the shelf takes its text with it). */
  r.delete("/:id/blobs/:kind", async (c) => {
    if (!(await owned(c))) return c.json({ error: "not-found" }, 404);
    const kind = c.req.param("kind");
    if (!isBlobKind(kind)) return c.json({ error: "invalid" }, 400);
    return (await store.deleteBlob(c.get("userId"), c.req.param("id"), kind)) ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });

  /**
   * Migration only: replaces an existing blob's body with its ciphertext, adding the dek in the same step (a plaintext blob has none yet).
   * Closed once the vault is complete.
   */
  r.put("/:id/blobs/:kind/rewrite", async (c) => {
    if (!(await owned(c))) return c.json({ error: "not-found" }, 404);
    const kind = c.req.param("kind");
    if (!isBlobKind(kind)) return c.json({ error: "invalid" }, 400);
    const read = await readJson(c);
    if (read === "too-large") return c.json({ error: "too-large" }, 413);
    if (read === "invalid") return c.json({ error: "invalid" }, 400);
    const body = BlobRewriteSchema.safeParse(read.data);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId"), projectId = c.req.param("id");
    if ((await store.getVault(userId))?.complete) return c.json({ error: "migration-closed" }, 409);
    const current = await store.getBlob(userId, projectId, kind);
    if (!current) return c.json({ error: "not-found" }, 404);
    const sealed = checkSealed(current.deks, body.data.body, body.data.keyVersion, body.data.dek);
    if (!sealed.ok) return c.json({ error: sealed.error }, sealed.status);
    try {
      const b = await store.rewriteBlob(userId, projectId, kind, { body: body.data.body, keyVersion: body.data.keyVersion, dek: sealed.addDek });
      return b ? c.json(wire(b)) : c.json({ error: "not-found" }, 404);
    } catch (e) {
      if (e instanceof DekExistsError) return c.json({ error: "dek-exists" }, 409);
      throw e;
    }
  });

  return r;
}
