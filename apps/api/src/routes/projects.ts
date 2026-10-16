import { Hono } from "hono";
import { z } from "zod";
import { originCount } from "@appuscholar/core";
import { WriteFields, resolveWrite } from "./docWrite";
import { PROJECT_STAGES, PROJECT_STATUSES, type OriginStats, type Store } from "../store/types";
import { foldWeekly, summariseAiLog, type DatedStats } from "./writingRecord";
import type { AuthEnv } from "../auth";

const Create = z.object({ title: z.string().trim().min(1).max(200), stage: z.enum(PROJECT_STAGES).optional() });
const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  stage: z.enum(PROJECT_STAGES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  contentLang: z.enum(["en", "hi"]).optional()
}).refine(v => v.title !== undefined || v.stage !== undefined || v.status !== undefined || v.contentLang !== undefined, { message: "empty patch" });
const CreateDoc = z.object({ title: z.string().trim().min(1).max(200), kind: z.string().trim().min(1).max(40).default("draft") });
/** A document can also be created with its first body, in the same shape as PUT /documents/:id (ciphertext needs its dek here, since the document has none yet). */
const CreateDocBody = CreateDoc.extend({ ...WriteFields, bodyHtml: WriteFields.bodyHtml.default("") });

export function projectRoutes(store: Store) {
  const r = new Hono<AuthEnv>();
  r.get("/", async (c) => c.json(await store.listProjects(c.get("userId"))));
  r.post("/", async (c) => {
    const body = Create.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return c.json(await store.createProject(c.get("userId"), body.data.title, body.data.stage), 201);
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
  /** `?includeDeleted=1` also lists soft-deleted documents (with `deletedAt` set): the vault migration must reach them. */
  r.get("/:id/documents", async (c) => {
    const list = await store.listDocuments(c.get("userId"), c.req.param("id"), { includeDeleted: c.req.query("includeDeleted") === "1" });
    return list ? c.json(list) : c.json({ error: "not-found" }, 404);
  });
  r.post("/:id/documents", async (c) => {
    const body = CreateDocBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const userId = c.get("userId");
    const w = await resolveWrite(store, userId, [], body.data);
    if (!w.ok) return c.json({ error: w.error }, w.status);
    const d = await store.createDocument(userId, c.req.param("id"), body.data.title, body.data.kind, { bodyHtml: w.bodyHtml, authorKind: "web", authorLabel: c.get("email"), wordCount: w.wordCount, keyVersion: w.keyVersion, originStats: w.originStats }, w.addDek ? [w.addDek] : []);
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
    const docs: { id: string; title: string; kind: string; stats: OriginStats }[] = [];
    const perDoc: DatedStats[][] = [];
    for (const d of own) {
      const revs = (await store.listRevisions(userId, d.id)) ?? [];
      // Every writer stores stats; only revisions saved before the tracker existed lack them, and those are counted from their text.
      const stats = async (r: (typeof revs)[number]): Promise<OriginStats> => r.originStats ?? originCount((await store.getRevision(userId, d.id, r.seq))?.bodyHtml ?? "");
      const dated: DatedStats[] = [];
      for (const r of revs) dated.push({ at: r.createdAt.getTime(), stats: await stats(r) });
      perDoc.push(dated);
      const newest = revs[0];
      docs.push({ id: d.id, title: d.title, kind: d.kind, stats: newest ? await stats(newest) : originCount("") });
    }
    const sources = list.filter((d) => d.kind === "source").map((d) => ({ title: d.title, words: d.wordCount }));
    const weekly = foldWeekly(perDoc, Date.now());
    const user = await store.getUser(userId);
    return c.json({ docs, sources, weekly, aiLog: summariseAiLog(await store.listAiUse(userId), user?.settings.aiLogOff === true) });
  });
  return r;
}
