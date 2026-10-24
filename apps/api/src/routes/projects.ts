import { Hono, type Context } from "hono";
import { z } from "zod";
import { originCount } from "@appuscholar/core";
import { NoTitle, PlainTitle, SealedTitle, WriteFields, checkTitle, resolveWrite, titleOf } from "./docWrite";
import { DekExistsError, PROJECT_STAGES, PROJECT_STATUSES, type OriginStats, type ProjectStage, type Store, type WrappedDek } from "../store/types";
import { foldWeekly, summariseAiLog, type DatedStats } from "./writingRecord";
import type { AuthEnv } from "../auth";

const Stage = z.object({ stage: z.enum(PROJECT_STAGES).optional() });
const Create = z.union([Stage.extend(PlainTitle.shape), Stage.extend(SealedTitle.shape)]);
const PatchFields = z.object({
  stage: z.enum(PROJECT_STAGES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  contentLang: z.enum(["en", "hi"]).optional()
});
const Patch = z.union([PatchFields.extend(PlainTitle.shape), PatchFields.extend(SealedTitle.shape), PatchFields.extend(NoTitle.shape)])
  .refine(v => v.title !== undefined || v.stage !== undefined || v.status !== undefined || v.contentLang !== undefined, { message: "empty patch" });
/** How long ago, by the client's own stopwatch, its first check began: the server turns it into a time on its own clock. A day at most. */
const ClaimAiUse = z.object({ secondsAgo: z.number().min(0).max(24 * 3600) });
const DocFields = z.object({ kind: z.string().trim().min(1).max(40).default("draft") });
/**
 * A document can also be created with its first body, in the same shape as PUT /documents/:id (ciphertext needs its dek here, since the document
 * has none yet). A sealed title shares that dek: the document's deks are one list, for its title and its revisions.
 */
const CreateDocFields = DocFields.extend({
  ...WriteFields,
  bodyHtml: WriteFields.bodyHtml.default(""),
  // The only author a client may name is an import (a v1 backup); anything else is refused, never taken for "web". The label counts only with it.
  authorKind: z.literal("import").optional(),
  authorLabel: z.string().trim().min(1).max(100).optional()
});
const CreateDocBody = z.union([CreateDocFields.extend(PlainTitle.shape), CreateDocFields.extend(SealedTitle.shape)]);
const dekOf = (b: object): WrappedDek | undefined => ("dek" in b ? (b.dek as WrappedDek | undefined) : undefined);

export function projectRoutes(store: Store, maxBodyBytes: number) {
  const r = new Hono<AuthEnv>();
  /** `?include=work` adds each project's blobs (no bodies) and draft words, for the stage states; without it the list is as before wave B. */
  r.get("/", async (c) => {
    const userId = c.get("userId");
    return c.json(c.req.query("include") === "work" ? await store.listProjectWork(userId) : await store.listProjects(userId));
  });
  /** A sealed title must bring its dek: a new project has none. */
  r.post("/", async (c) => {
    const body = Create.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const title = titleOf(body.data)!;
    const check = checkTitle([], title, dekOf(body.data));
    if (!check.ok) return c.json({ error: check.error }, check.status);
    return c.json(await store.createProject(c.get("userId"), { ...title, dek: check.addDek }, body.data.stage), 201);
  });
  r.patch("/:id", async (c) => {
    const body = Patch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId"), id = c.req.param("id");
    const { stage, status, contentLang } = body.data;
    const title = titleOf(body.data);
    let dek: WrappedDek | undefined;
    if (title && title.titleKeyVersion > 0) {
      const current = await store.getProject(userId, id);
      if (!current) return c.json({ error: "not-found" }, 404);
      const check = checkTitle(current.deks, title, dekOf(body.data));
      if (!check.ok) return c.json({ error: check.error }, check.status);
      dek = check.addDek;
    }
    try {
      const p = await store.updateProject(userId, id, { stage, status, contentLang, ...title, ...(dek ? { dek } : {}) });
      return p ? c.json(p) : c.json({ error: "not-found" }, 404);
    } catch (e) {
      if (e instanceof DekExistsError) return c.json({ error: "dek-exists" }, 409);
      throw e;
    }
  });
  /**
   * Marks a stage Ready (POST) or not (DELETE), stamped with the server's clock: a device clock hours off never decides Ready or Reopened.
   * The request has no body; one that is sent is ignored.
   */
  const mark = (ready: boolean) => async (c: Context<AuthEnv>) => {
    const stage = c.req.param("stage")!;
    if (!(PROJECT_STAGES as readonly string[]).includes(stage)) return c.json({ error: "invalid" }, 400);
    const p = await store.markStage(c.get("userId"), c.req.param("id")!, stage as ProjectStage, ready, new Date());
    return p ? c.json(p) : c.json({ error: "not-found" }, 404);
  };
  r.post("/:id/stages/:stage/ready", mark(true));
  r.delete("/:id/stages/:stage/ready", mark(false));
  /**
   * First run checks the idea before its project exists, so that AI use is logged with no project and the project's AI-use statement would
   * leave it out. Saving the project claims the user's rows with no project since the first check began.
   */
  r.post("/:id/ai-use/claim", async (c) => {
    const body = ClaimAiUse.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId"), id = c.req.param("id");
    if (!(await store.getProject(userId, id))) return c.json({ error: "not-found" }, 404);
    return c.json({ claimed: await store.claimAiUse(userId, id, new Date(Date.now() - body.data.secondsAgo * 1000)) });
  });
  r.delete("/:id", async (c) => {
    const ok = await store.deleteProject(c.get("userId"), c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });
  /** `?includeDeleted=1` also lists soft-deleted documents (with `deletedAt` set): the vault migration must reach them. */
  r.get("/:id/documents", async (c) => {
    const list = await store.listDocuments(c.get("userId"), c.req.param("id"), { includeDeleted: c.req.query("includeDeleted") === "1" });
    return list ? c.json(list) : c.json({ error: "not-found" }, 404);
  });
  r.post("/:id/documents", async (c) => {
    const raw = await c.req.text();
    if (raw.length > maxBodyBytes) return c.json({ error: "too-large" }, 413);
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return c.json({ error: "invalid" }, 400); }
    const body = CreateDocBody.safeParse(parsed);
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    const w = await resolveWrite(store, userId, [], body.data);
    if (!w.ok) return c.json({ error: w.error }, w.status);
    // The body's dek is the only one a new document can have, so a sealed title must be under it.
    const title = titleOf(body.data)!;
    const check = checkTitle(w.addDek ? [w.addDek] : [], title);
    if (!check.ok) return c.json({ error: check.error }, check.status);
    const d = await store.createDocument(userId, c.req.param("id"), title, body.data.kind, { bodyHtml: w.bodyHtml, ...(body.data.authorKind === "import" ? { authorKind: "import" as const, authorLabel: body.data.authorLabel ?? "v1 backup" } : { authorKind: "web" as const, authorLabel: c.get("email") }), wordCount: w.wordCount, keyVersion: w.keyVersion, originStats: w.originStats }, w.addDek ? [w.addDek] : []);
    return d ? c.json(d, 201) : c.json({ error: "not-found" }, 404);
  });
  /**
   * The data behind "My writing" and the writing-process record. `docs`, `sources` and `weekly` belong to this project; `aiLog` is the
   * student's whole AI-use log (the log is the student's own record, kept per user and not per project).
   */
  r.get("/:id/writing-record", async (c) => {
    const userId = c.get("userId");
    const list = await store.listDocuments(userId, c.req.param("id"));
    if (!list) return c.json({ error: "not-found" }, 404);
    const own = list.filter((d) => d.kind !== "source").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const docs: { id: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; kind: string; stats: OriginStats }[] = [];
    const perDoc: DatedStats[][] = [];
    for (const d of own) {
      const revs = (await store.listRevisions(userId, d.id)) ?? [];
      // Every writer stores stats; only revisions saved before the tracker existed lack them, and those are counted from their text.
      const stats = async (r: (typeof revs)[number]): Promise<OriginStats> => r.originStats ?? originCount((await store.getRevision(userId, d.id, r.seq))?.bodyHtml ?? "");
      const dated: DatedStats[] = [];
      for (const r of revs) dated.push({ at: r.createdAt.getTime(), stats: await stats(r) });
      perDoc.push(dated);
      const newest = revs[0];
      docs.push({ id: d.id, title: d.title, titleKeyVersion: d.titleKeyVersion, deks: d.deks, kind: d.kind, stats: newest ? await stats(newest) : originCount("") });
    }
    const sources = list.filter((d) => d.kind === "source").map((d) => ({ id: d.id, title: d.title, titleKeyVersion: d.titleKeyVersion, deks: d.deks, words: d.wordCount }));
    const weekly = foldWeekly(perDoc, Date.now());
    const user = await store.getUser(userId);
    return c.json({ docs, sources, weekly, aiLog: summariseAiLog(await store.listAiUse(userId), user?.settings.aiLogOff === true) });
  });
  return r;
}
