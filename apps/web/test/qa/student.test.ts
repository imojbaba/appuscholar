import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictUrl } from "@appuscholar/core";
import { createShimFetch, type ShimLogEntry } from "../../qa/provider-shim/core.mjs";

// origins.ts refuses a database that is not on this machine, whatever the shell has; none is touched here.
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const MESSAGES = path.join(__dirname, "../../messages");
const json = <T,>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

describe("T (qa/support/dict.ts)", () => {
  const en = json<Record<string, string>>(path.join(MESSAGES, "en.json"));
  const hi = json<Record<string, string>>(path.join(MESSAGES, "hi.json"));

  it("gives the dictionary's sentence, as the app's t() does", async () => {
    const { T } = await import("../../qa/support/dict");
    expect(T("vault_pill_yours")).toBe(en["vault_pill_yours"]);
    expect(T("vault_pill_locked")).toBe(en["vault_pill_locked"]);
  });

  it("fills {vars}, and leaves one it is not given", async () => {
    const { T } = await import("../../qa/support/dict");
    expect(T("tab_name_count", { name: "Find", n: 3 })).toBe("Find (3)");
    expect(T("tab_name_count", { name: "Find" })).toBe("Find ({n})");
  });

  it("reads the Hindi file in Hindi, and the English sentence where Hindi lacks the key", async () => {
    const { T } = await import("../../qa/support/dict");
    expect(T("vault_pill_yours", undefined, "hi")).toBe(hi["vault_pill_yours"]);
    expect(T("vault_pill_yours", undefined, "hi")).not.toBe(T("vault_pill_yours"));
    const onlyEnglish = Object.keys(en).find((k) => !(k in hi));
    if (onlyEnglish) expect(T(onlyEnglish, undefined, "hi")).toBe(en[onlyEnglish]);
  });

  it("reads the tools' files too, and never a marker key", async () => {
    const { T } = await import("../../qa/support/dict");
    const stats = json<Record<string, string>>(path.join(MESSAGES, "tools", "stats.en.json"));
    expect(T("stats_check_nc_title")).toBe(stats["stats_check_nc_title"]);
    const statsHi = json<Record<string, string>>(path.join(MESSAGES, "tools", "stats.hi.json"));
    expect(Object.keys(statsHi).some((k) => k.startsWith("$"))).toBe(true); // the draft marker is in the file ...
    expect(() => T("$draft", undefined, "hi")).toThrow(/no such key/); // ... and is not a sentence
  });

  it("throws for a key no dictionary has, naming it", async () => {
    const { T } = await import("../../qa/support/dict");
    expect(() => T("no_such_key_anywhere")).toThrow(/no such key in the dictionaries: no_such_key_anywhere/);
  });
});

describe("qaKey (qa/support/student.ts)", () => {
  const replies = [{ match: "Improve this text", reply: "better" }];
  const prompt = "Improve this text: it was long.";
  function shim(sleep = vi.fn(async () => {})) {
    const log: ShimLogEntry[] = [];
    const original = vi.fn(async () => new Response("original", { status: 200 }));
    const fetchLike = createShimFetch(original as unknown as typeof fetch, { replies, log: (e) => void log.push(e), sleep });
    const ask = (key: string) =>
      fetchLike("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: "m", messages: [{ role: "user", content: prompt }] })
      });
    return { ask, log, original, sleep };
  }

  it("makes a key of its own each time, in the shape the fake provider reads", async () => {
    const { qaKey } = await import("../../qa/support/student");
    const a = qaKey();
    const b = qaKey();
    expect(a).toMatch(/^gsk_qa_ok_[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
    expect(qaKey("slow3000")).toMatch(/^gsk_qa_slow3000_[0-9a-f]{12}$/);
  });

  it("is a key the fake provider answers (ok), fails as asked (fail429), and waits for (slow<ms>)", async () => {
    const { qaKey } = await import("../../qa/support/student");
    const { ask, log, original, sleep } = shim();
    const ok = qaKey("ok");
    expect((await ask(ok)).status).toBe(200);
    expect((await ask(qaKey("fail429"))).status).toBe(429);
    expect((await ask(qaKey("slow250"))).status).toBe(200);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(log[0]).toMatchObject({ key: ok, mode: "ok", outcome: "answered" });
    expect(log.map((e) => e.mode)).toEqual(["ok", "fail429", "slow250"]);
    expect(original).not.toHaveBeenCalled();
  });

  it("refuses a mode the fake provider does not know, so a typo cannot become an 'invalid' key", async () => {
    const { qaKey } = await import("../../qa/support/student");
    expect(() => qaKey("fail404" as never)).toThrow(/mode/);
    expect(() => qaKey("slow" as never)).toThrow(/mode/);
    expect(() => qaKey("" as never)).toThrow(/mode/);
  });
});

describe("providerCalls (qa/support/student.ts)", () => {
  it("is the provider log's lines for one key", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qa-student-test-"));
    const file = path.join(dir, "provider-calls.jsonl");
    const entry = (key: string, prompt: string) => JSON.stringify({ t: 1, key, mode: "ok", host: "api.groq.com", kind: null, prompt, outcome: "answered" });
    writeFileSync(file, [entry("gsk_qa_ok_aaaa", "one"), entry("gsk_qa_ok_bbbb", "two"), entry("gsk_qa_ok_aaaa", "three")].join("\n") + "\n");
    vi.stubEnv("QA_PROVIDER_LOG", file);
    vi.resetModules();
    try {
      const { providerCalls } = await import("../../qa/support/student");
      expect((await providerCalls("gsk_qa_ok_aaaa")).map((e) => e.prompt)).toEqual(["one", "three"]);
      expect(await providerCalls("gsk_qa_ok_zzzz")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- routeServices, with a context that records what it is given ------------------------------------------------------------------------------------------

type Answer = { how: "fulfill"; status: number; headers: Record<string, string>; body: string } | { how: "abort"; reason: string } | { how: "fallback" } | { how: "unrouted" };
type Stub = { match: (url: URL) => boolean; handler: (route: unknown) => unknown };

function stubContext() {
  const routes: Stub[] = [];
  const context = { route: async (match: Stub["match"], handler: Stub["handler"]) => void routes.push({ match, handler }) } as unknown as BrowserContext;
  /** What the browser would be told when it asks for `url`: the last route that matches (as in Playwright), or "unrouted" when none does. */
  async function ask(url: string, method = "GET"): Promise<Answer> {
    const u = new URL(url);
    const hit = [...routes].reverse().find((r) => r.match(u));
    if (!hit) return { how: "unrouted" };
    let answer: Answer = { how: "unrouted" };
    await hit.handler({
      request: () => ({ url: () => url, method: () => method }),
      fulfill: async (o: { status: number; headers?: Record<string, string>; body?: string }) => void (answer = { how: "fulfill", status: o.status, headers: o.headers ?? {}, body: o.body ?? "" }),
      abort: async (reason: string) => void (answer = { how: "abort", reason }),
      fallback: async () => void (answer = { how: "fallback" }),
      continue: async () => void (answer = { how: "fallback" })
    });
    return answer;
  }
  return { context, ask, routes };
}

type Recording = { url: string; status: number; headers: Record<string, string>; body: string };
const readRecordings = (dir: string): Recording[] =>
  readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => json<Recording>(path.join(dir, f)));
const E2E_RECORDED = path.join(__dirname, "../../e2e/fixtures/recorded");
const CORE_RECORDED = path.join(__dirname, "../../../../packages/core/test/fetch/recorded");

describe("routeServices (qa/support/services.ts)", () => {
  const retractions = () => readRecordings(E2E_RECORDED).find((r) => r.url.includes("api.openalex.org") && r.url.includes("is_retracted"))!;
  const pubmed = () => readRecordings(CORE_RECORDED).find((r) => r.url.startsWith("https://eutils.ncbi.nlm.nih.gov/"))!;
  const setup = async (o?: { fail?: Array<"openalex" | "pubmed" | "crossref" | "dictionary">; allowLive?: boolean }) => {
    const { routeServices } = await import("../../qa/support/services");
    const stub = stubContext();
    const seen = await routeServices(stub.context, o);
    return { ...stub, ...seen };
  };

  it("answers a recorded request with the recording, readable by the page (CORS)", async () => {
    const rec = retractions();
    const { ask, asked, refused } = await setup();
    const a = await ask(rec.url);
    expect(a).toMatchObject({ how: "fulfill", status: rec.status, body: rec.body });
    expect((a as { headers: Record<string, string> }).headers).toMatchObject({ "access-control-allow-origin": "*", "content-type": rec.headers["content-type"] });
    expect(asked).toEqual([rec.url]);
    expect(refused).toEqual([]);
  });

  it("answers from the core fetchers' corpus too, as the stage-2 journey does", async () => {
    const rec = pubmed();
    const { ask } = await setup();
    expect(await ask(rec.url)).toMatchObject({ how: "fulfill", status: rec.status, body: rec.body });
  });

  it("answers a service address no recording fits with 599 (readable by the page), and says so", async () => {
    const { ask, asked, refused } = await setup();
    const url = "https://api.openalex.org/works?search=nothing-recorded-for-this";
    const a = await ask(url);
    expect(a).toMatchObject({ how: "fulfill", status: 599, body: "not recorded" });
    expect((a as { headers: Record<string, string> }).headers["access-control-allow-origin"]).toBe("*");
    expect(asked).toEqual([url]);
    expect(refused).toEqual([url]);
  });

  it("refuses every other address outside this machine with 599 (no CORS: the page's request fails)", async () => {
    const { ask, refused } = await setup();
    const a = await ask("https://example.org/anything?q=1");
    expect(a).toMatchObject({ how: "fulfill", status: 599 });
    expect((a as { headers: Record<string, string> }).headers["access-control-allow-origin"]).toBeUndefined();
    expect(refused).toEqual(["https://example.org/anything?q=1"]);
  });

  it("answers the dictionary from the Words golden's payloads, 404 included, by the address the app builds", async () => {
    const golden = json<{ dict: { fetch: Array<{ word: string; status: number; payload: unknown }> } }>(path.join(__dirname, "../../../../packages/core/test/golden/words/cases.json")).dict.fetch;
    const { ask, refused } = await setup();
    for (const c of golden) {
      const a = await ask(dictUrl(c.word));
      expect(a, c.word).toMatchObject({ how: "fulfill", status: c.status, body: JSON.stringify(c.payload) });
    }
    expect(refused).toEqual([]);
    expect(await ask(dictUrl("qwertyuiop"))).toMatchObject({ how: "fulfill", status: 599 });
    expect(refused).toEqual([dictUrl("qwertyuiop")]);
  });

  it("answers a preflight for a service, and does not count it as a request the app made", async () => {
    const { ask, asked } = await setup();
    const a = await ask("https://api.crossref.org/works/10.1/x", "OPTIONS");
    expect(a).toMatchObject({ how: "fulfill", status: 204 });
    expect((a as { headers: Record<string, string> }).headers["access-control-allow-origin"]).toBe("*");
    expect(asked).toEqual([]);
  });

  it("makes the named services fail the way a service that is down fails (the page's request is dropped), and the others still answer", async () => {
    const rec = pubmed();
    const oa = retractions();
    const { ask, asked, refused } = await setup({ fail: ["pubmed", "dictionary"] });
    expect(await ask(rec.url)).toEqual({ how: "abort", reason: "connectionfailed" });
    expect(await ask(dictUrl("study"))).toEqual({ how: "abort", reason: "connectionfailed" });
    expect(await ask(oa.url)).toMatchObject({ how: "fulfill", status: oa.status });
    expect(asked).toEqual([rec.url, dictUrl("study"), oa.url]);
    expect(refused).toEqual([]); // a failure on purpose is not a request nobody could answer
  });

  it("sends the services to the real ones only when asked, and still refuses everything else", async () => {
    const rec = retractions();
    const live = await setup({ allowLive: true });
    expect(await live.ask(rec.url)).toEqual({ how: "fallback" });
    expect(await live.ask("https://example.org/")).toMatchObject({ how: "fulfill", status: 599 });
    const both = await setup({ allowLive: true, fail: ["openalex"] });
    expect(await both.ask(rec.url)).toEqual({ how: "abort", reason: "connectionfailed" }); // a named failure wins
    expect(live.asked).toEqual([rec.url, "https://example.org/"]);
  });

  it("does not touch this machine: the web app, the api, localhost, 127.0.0.1, [::1] and what is not http", async () => {
    const { QA_API_ORIGIN, QA_WEB_ORIGIN } = await import("../../qa/support/origins");
    const { ask, asked } = await setup();
    for (const url of [QA_API_ORIGIN + "/me/vault", QA_WEB_ORIGIN + "/", "http://localhost:1/x", "http://127.0.0.1:1/x", "http://[::1]:1/x", "data:text/plain,hello", "blob:http://localhost:3010/abc"]) {
      expect(await ask(url), url).toEqual({ how: "unrouted" });
    }
    expect(asked).toEqual([]);
  });

  it("starts a router of its own for each call (what one case asked is not another's)", async () => {
    const a = await setup();
    const b = await setup();
    await a.ask("https://api.openalex.org/works?search=zzz");
    expect(a.asked).toHaveLength(1);
    expect(b.asked).toEqual([]);
  });

  it("names the four services' hosts, for qa.allow({ hosts })", async () => {
    const { SERVICE_HOSTS } = await import("../../qa/support/services");
    expect([...SERVICE_HOSTS].sort()).toEqual(["api.crossref.org", "api.dictionaryapi.dev", "api.openalex.org", "eutils.ncbi.nlm.nih.gov"]);
  });
});
