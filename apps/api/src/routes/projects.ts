import { Hono } from "hono";
import { z } from "zod";
import { originCount } from "@appuscholar/core";
import { PROJECT_STAGES, PROJECT_STATUSES, type OriginStats, type Store } from "../store/types";
import { summariseAiUse } from "./ai";
import type { AuthEnv } from "../auth";

const Create = z.object({ title: z.string().trim().min(1).max(200), stage: z.enum(PROJECT_STAGES).optional() });
const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  stage: z.enum(PROJECT_STAGES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  contentLang: z.enum(["en", "hi"]).optional()
}).refine(v => v.title !== undefined || v.stage !== undefined || v.status !== undefined || v.contentLang !== undefined, { message: "empty patch" });
const CreateDoc = z.object({ title: z.string().trim().min(1).max(200), kind: z.string().trim().min(1).max(40).default("draft") });

const DAY = 86_400_000;
/** The Monday (UTC) of the ISO week containing `t`, as epoch milliseconds. */
function weekStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
}

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
    const revs: Awaited<ReturnType<Store["listRevisions"]>>[] = [];
    for (const d of own) {
      const rs = await store.listRevisions(userId, d.id);
      revs.push(rs);
      // Revisions stored before the tracker existed carry no stats: count the current text instead.
      const latest = rs?.[0]?.originStats ?? originCount((await store.getDocument(userId, d.id))?.bodyHtml ?? "");
      docs.push({ id: d.id, title: d.title, kind: d.kind, stats: latest });
    }
    const sources = list.filter((d) => d.kind === "source").map((d) => ({ title: d.title, words: d.wordCount }));
    // The last 8 ISO weeks: per week, each document's newest revision made before the next week begins; weeks with no revision are left out.
    const weekly: { weekStart: string; typed: number; ai: number }[] = [];
    const thisWeek = weekStart(Date.now());
    for (let i = 7; i >= 0; i--) {
      const start = thisWeek - i * 7 * DAY, end = start + 7 * DAY;
      let typed = 0, ai = 0, seen = false;
      for (const rs of revs) {
        const rev = (rs ?? []).find((x) => x.createdAt.getTime() < end && x.originStats);
        if (rev?.originStats) { typed += rev.originStats.typed; ai += rev.originStats.ai; seen = true; }
      }
      if (seen) weekly.push({ weekStart: new Date(start).toISOString().slice(0, 10), typed, ai });
    }
    return c.json({ docs, sources, weekly, aiLog: summariseAiUse(await store.listAiUse(userId)) });
  });
  return r;
}
