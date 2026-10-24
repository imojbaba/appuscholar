import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Task C8, Review Focus 1: the service worker caches only hashed static assets, the icons and the one offline page; never the app's HTML, never
 * /api, never a response with Set-Cookie. public/sw.js is plain script, so these tests run it in a stub scope (a `self` with addEventListener and
 * a fake CacheStorage) and call its `decide` function and its three listeners.
 */
const SW = readFileSync(join(__dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://app.test";

type Req = { method: string; url: string; mode: string; headers: { get(k: string): string | null } };
const req = (path: string, o: Partial<Req> & { rsc?: boolean } = {}): Req => ({
  method: o.method ?? "GET", url: path.startsWith("http") ? path : ORIGIN + path, mode: o.mode ?? "cors",
  headers: { get: (k: string) => (o.rsc && k.toLowerCase() === "rsc" ? "1" : null) }
});
const nav = (path: string) => req(path, { mode: "navigate" });
type Res = { ok: boolean; type: string; headers: { get(k: string): string | null; has(k: string): boolean }; clone(): Res; tag?: string };
const res = (o: { ok?: boolean; type?: string; ct?: string; setCookie?: boolean; tag?: string } = {}): Res => {
  const h: Record<string, string> = { "content-type": o.ct ?? "application/javascript" };
  if (o.setCookie) h["set-cookie"] = "sid=1";
  const r: Res = { ok: o.ok ?? true, type: o.type ?? "basic", headers: { get: (k) => h[k.toLowerCase()] ?? null, has: (k) => k.toLowerCase() in h }, clone: () => r, tag: o.tag };
  return r;
};

function fakeCaches(seed: Record<string, Record<string, Res>> = {}) {
  const store = new Map<string, Map<string, Res>>(Object.entries(seed).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const keyOf = (r: string | Req) => (typeof r === "string" ? (r.startsWith("http") ? r : ORIGIN + r) : r.url);
  const cache = (name: string) => ({
    addAll: async (urls: string[]) => { for (const u of urls) (store.get(name) ?? store.set(name, new Map()).get(name)!).set(keyOf(u), res({ tag: u })); },
    put: async (r: Req, v: Res) => { (store.get(name) ?? store.set(name, new Map()).get(name)!).set(keyOf(r), v); },
    match: async (r: string | Req) => store.get(name)?.get(keyOf(r))
  });
  return {
    store,
    open: async (name: string) => cache(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (r: string | Req) => { for (const m of store.values()) { const hit = m.get(keyOf(r)); if (hit) return hit; } return undefined; }
  };
}

function load(opts: { caches?: ReturnType<typeof fakeCaches>; fetch?: (r: Req) => Promise<Res> } = {}) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const caches = opts.caches ?? fakeCaches();
  const calls = { fetch: [] as Req[], skipWaiting: 0, claim: 0 };
  const ctx: Record<string, unknown> = {
    URL, caches, console,
    location: { origin: ORIGIN },
    addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; },
    skipWaiting: async () => { calls.skipWaiting++; },
    clients: { claim: async () => { calls.claim++; } },
    fetch: async (r: Req) => { calls.fetch.push(r); if (!opts.fetch) throw new Error("no fetch"); return opts.fetch(r); }
  };
  ctx.self = ctx;
  vm.runInNewContext(SW, ctx);
  const decide = ctx.decide as (r: Req, s?: Res) => string;
  const VER = ctx.VER as string;
  /** Fires a fetch event; `responded` is undefined when the worker did not call respondWith (the browser then goes to the network itself). */
  async function fire(r: Req) {
    let responded: Promise<Res> | undefined;
    listeners.fetch({ request: r, respondWith: (p: Promise<Res>) => { responded = p; }, waitUntil: () => {} });
    return responded ? await responded.then((v) => ({ value: v }), (e) => ({ error: e as Error })) : undefined;
  }
  async function lifecycle(name: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners[name]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  return { decide, VER, fire, lifecycle, caches, calls, listeners };
}

describe("the service worker's decide(request, response?) (Review Focus 1)", () => {
  const { decide } = load();

  it("ignores API calls, cross-origin requests, non-GET requests, the worker file and app data fetches: they go straight to the network", () => {
    expect(decide(req("/api/auth/session"))).toBe("ignore");
    expect(decide(req("/api/anything", { mode: "same-origin" }))).toBe("ignore");
    expect(decide(req("https://api.openalex.org/works?search=x"))).toBe("ignore");
    expect(decide(req("http://localhost:8788/projects"))).toBe("ignore");
    expect(decide(req("/projects", { method: "POST" }))).toBe("ignore");
    expect(decide(req("/_next/static/chunks/a.js", { method: "POST" }))).toBe("ignore");
    expect(decide(req("/sw.js"))).toBe("ignore");
    expect(decide(req("/projects?_rsc=abc", { rsc: true }))).toBe("ignore");
    expect(decide(req("/p/123"))).toBe("ignore");
    expect(decide(req("/manifest.webmanifest"))).toBe("ignore");
  });

  it("answers a navigation from the network and ignores one that succeeds: the page is never stored", () => {
    expect(decide(nav("/projects"))).toBe("navigate");
    expect(decide(nav("/p/123"))).toBe("navigate");
    expect(decide(nav("/projects"), res({ ct: "text/html; charset=utf-8" }))).toBe("pass");
    expect(decide(nav("/api/export"))).toBe("ignore");
    expect(decide(nav(ORIGIN.replace("app.test", "other.test") + "/projects"))).toBe("ignore");
  });

  it("keeps cache-first only the hashed static assets, fonts and the icons", () => {
    expect(decide(req("/_next/static/chunks/abc123.js"))).toBe("cache-first");
    expect(decide(req("/_next/static/media/font.woff2"))).toBe("cache-first");
    expect(decide(req("/icon-192.png"))).toBe("cache-first");
    expect(decide(req("/icon-512.png"))).toBe("cache-first");
    expect(decide(req("/fonts/x.woff2"))).toBe("cache-first");
    expect(decide(req("/_next/image?url=%2Fa.png&w=64"))).toBe("ignore");
  });

  it("stores a cache-first response only when it is a plain successful same-origin file: never one with Set-Cookie, never HTML, never an error or an opaque answer", () => {
    const r = req("/_next/static/chunks/abc123.js");
    expect(decide(r, res())).toBe("store");
    expect(decide(r, res({ setCookie: true }))).toBe("skip");
    expect(decide(r, res({ ct: "text/html" }))).toBe("skip");
    expect(decide(r, res({ ok: false }))).toBe("skip");
    expect(decide(r, res({ type: "opaque" }))).toBe("skip");
    expect(decide(r, res({ type: "cors" }))).toBe("skip");
  });
});

describe("the service worker's listeners", () => {
  it("install precaches the offline page and the two icons, and nothing else", async () => {
    const w = load();
    await w.lifecycle("install");
    expect(w.VER).toBe("appu-wc-1");
    expect([...w.caches.store.get(w.VER)!.keys()].sort()).toEqual([ORIGIN + "/icon-192.png", ORIGIN + "/icon-512.png", ORIGIN + "/offline.html"]);
    expect(w.calls.skipWaiting).toBe(1);
  });

  it("activate removes old appu- caches and keeps the current one and caches that are not ours", async () => {
    const w = load({ caches: fakeCaches({ "appu-wc-0": {}, "appu-v55-2026.10.13": {}, "appu-wc-1": {}, "other-app": {} }) });
    await w.lifecycle("activate");
    expect([...w.caches.store.keys()].sort()).toEqual(["appu-wc-1", "other-app"]);
    expect(w.calls.claim).toBe(1);
  });

  it("a navigation that succeeds is passed through untouched and nothing is stored", async () => {
    const page = res({ ct: "text/html", tag: "the page" });
    const w = load({ fetch: async () => page });
    const out = await w.fire(nav("/p/123"));
    expect(out).toEqual({ value: page });
    expect([...w.caches.store.values()].every((m) => m.size === 0)).toBe(true);
  });

  it("a navigation answers the offline page only when the network fails", async () => {
    const c = fakeCaches();
    const w = load({ caches: c });
    await w.lifecycle("install");
    const out = (await w.fire(nav("/p/123"))) as { value: Res };
    expect(out.value.tag).toBe("/offline.html");
    // A 500 from the server is a response, not a network failure: it is passed through.
    const w2 = load({ fetch: async () => res({ ok: false, ct: "text/html", tag: "500" }) });
    expect(((await w2.fire(nav("/p/123"))) as { value: Res }).value.tag).toBe("500");
  });

  it("does not call respondWith for API calls, other origins and non-GET requests: the browser goes to the network by itself", async () => {
    const w = load({ fetch: async () => res() });
    expect(await w.fire(req("/api/auth/session"))).toBeUndefined();
    expect(await w.fire(req("https://api.crossref.org/works"))).toBeUndefined();
    expect(await w.fire(req("/projects", { method: "PUT" }))).toBeUndefined();
    expect(w.calls.fetch).toEqual([]);
    expect([...w.caches.store.values()].every((m) => m.size === 0)).toBe(true);
  });

  it("serves a hashed asset from the saved copy first, and saves a fresh one from the network", async () => {
    const hit = res({ tag: "saved" });
    const url = ORIGIN + "/_next/static/chunks/a.js";
    const w = load({ caches: fakeCaches({ "appu-wc-1": { [url]: hit } }), fetch: async () => res({ tag: "fresh" }) });
    expect(((await w.fire(req("/_next/static/chunks/a.js"))) as { value: Res }).value.tag).toBe("saved");
    expect(w.calls.fetch).toEqual([]);
    const w2 = load({ fetch: async () => res({ tag: "fresh" }) });
    await w2.fire(req("/_next/static/chunks/b.js"));
    await new Promise((r) => setTimeout(r, 0));
    expect(w2.caches.store.get("appu-wc-1")?.get(ORIGIN + "/_next/static/chunks/b.js")?.tag).toBe("fresh");
    const w3 = load({ fetch: async () => res({ setCookie: true }) });
    await w3.fire(req("/_next/static/chunks/c.js"));
    await new Promise((r) => setTimeout(r, 0));
    expect(w3.caches.store.get("appu-wc-1")?.size ?? 0).toBe(0);
  });
});
