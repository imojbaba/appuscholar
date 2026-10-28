import { z } from "zod";
import { sanitizeHtml } from "./sanitize";
import { isLockedV1Backup } from "./v1locked";

/**
 * `origin` and `src` are kept as v1 stored them (D-W0-4, approved by OJ 2026-10-19): v1 marks a paper the student imported to read with
 * `origin: "source"` and keeps its file name in `src` (index.html 3230); every v1 reader tests `origin === "source"` (3152, 3155, 3428).
 */
export type V1Document = { id: string; title: string; bodyHtml: string; updated: number; origin?: string; src?: string };
export type V1Project = { id: string; title: string; stage?: string };
export type V1Backup = { exported: string; documents: V1Document[]; projects: V1Project[] };
export type V1ParseResult = { ok: true; backup: V1Backup } | { ok: false; reason: "not-json" | "not-appuscholar" | "no-documents" | "locked" };

const Bundle = z.object({
  app: z.literal("appuscholar"),
  v: z.number(),
  exported: z.string().optional(),
  data: z.record(z.string(), z.string())
});
// A malformed origin or src is left out (`catch`), never the document it sits on.
const RawDoc = z.object({
  id: z.string(), title: z.string().default("Untitled"), body: z.string().default(""), updated: z.number().default(0),
  origin: z.string().optional().catch(undefined), src: z.string().optional().catch(undefined)
});
// v1 saves a project as { id, name, stage, pack, status, createdAt, updatedAt } (index.html 2896): the name is `name`, and v1 never writes a `title`.
const RawProject = z.object({ id: z.string(), name: z.string().default("Untitled project"), stage: z.string().optional() });

const LOOKS_LIKE_HTML = /<(p|div|br|b|i|u|strong|em|ul|ol|li|h[1-6]|blockquote|span|img|table|thead|tbody|tr|td|th|svg|a|sup|sub|hr|pre|code|font|figure)[\s>\/]/i;

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function v1BodyToHtml(body: string): string {
  const html = LOOKS_LIKE_HTML.test(body) ? body : "<p>" + escapeText(body).replace(/\n/g, "<br>") + "</p>";
  return sanitizeHtml(html);
}

function parseJsonArray<T>(text: string | undefined, schema: z.ZodType<T>): T[] {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x) => { const r = schema.safeParse(x); return r.success ? [r.data] : []; });
  } catch { return []; }
}

export function parseV1Backup(text: string): V1ParseResult {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, reason: "not-json" }; }
  const bundle = Bundle.safeParse(json);
  if (!bundle.success) return { ok: false, reason: isLockedV1Backup(text) ? "locked" : "not-appuscholar" };
  const rawDocs = parseJsonArray(bundle.data.data["appu_docs"], RawDoc);
  if (rawDocs.length === 0) return { ok: false, reason: "no-documents" };
  const documents: V1Document[] = rawDocs.map((d) => ({
    id: d.id, title: d.title.trim() || "Untitled", bodyHtml: v1BodyToHtml(d.body), updated: d.updated,
    ...(d.origin !== undefined ? { origin: d.origin } : {}), ...(d.src !== undefined ? { src: d.src } : {})
  }));
  const projects: V1Project[] = parseJsonArray(bundle.data.data["appu_projects"], RawProject).map((p) => ({ id: p.id, title: p.name, ...(p.stage ? { stage: p.stage } : {}) }));
  return { ok: true, backup: { exported: bundle.data.exported ?? "", documents, projects } };
}

export type V1ImportDocument = { title: string; bodyHtml: string };

/**
 * Splits documents into request-sized batches so no import request exceeds `maxBytes` of bodyHtml (UTF-8).
 * A single document larger than `maxBytes` goes alone in its own batch. Order is preserved.
 */
export function chunkV1Documents<T extends V1ImportDocument>(docs: T[], maxBytes: number): T[][] {
  const enc = new TextEncoder();
  const chunks: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const d of docs) {
    const n = enc.encode(d.bodyHtml).length;
    if (cur.length && size + n > maxBytes) { chunks.push(cur); cur = []; size = 0; }
    cur.push(d);
    size += n;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
