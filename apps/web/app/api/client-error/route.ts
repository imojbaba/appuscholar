import { buildOf, errorClass, routeOf } from "@/lib/errors/sanitize";

const MAX_BODY = 1024;
const CAP_PER_MINUTE = 30;
// Best effort: one counter per server instance. A cold start resets it; that is fine for a log-flood brake.
let windowMinute = 0;
let windowCount = 0;

const done = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/** Reads at most MAX_BODY bytes; null when the body is longer. */
async function readLimited(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    size += value.byteLength;
    if (size > MAX_BODY) { void reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}

/**
 * A browser tells us a page threw. Keeps the error class name, the route (path only, ids masked), the build and a request id, and logs
 * exactly those: never a message, a stack, a query, a user id, or any other body field.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) return done(403);
  const text = await readLimited(req);
  if (text === null) return done(413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return done(400); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return done(400);
  const b = body as Record<string, unknown>;

  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== windowMinute) { windowMinute = minute; windowCount = 0; }
  if (windowCount >= CAP_PER_MINUTE) return done(204);
  windowCount += 1;

  const requestId = req.headers.get("x-vercel-id") || crypto.randomUUID();
  console.log(JSON.stringify({ kind: "client-error", name: errorClass(b.name), route: routeOf(b.route), build: buildOf(b.build), requestId }));
  return done(204);
}
