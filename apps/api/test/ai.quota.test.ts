import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { AI_QUOTAS, quotaRules } from "../src/ai/quota";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
const token = (sub: string) => new SignJWT({ email: sub + "@example.test" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(key);

const HOUR = 3_600_000;
/** The start of a UTC day, so the hour and the day windows both begin here. */
const DAY_START = Date.parse("2026-10-20T00:00:00Z");

describe("ai quota", () => {
  let app: ReturnType<typeof createApp>;
  let now: number;
  let called: number;
  let auth: Record<string, string>;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    called++;
    const said = JSON.parse(String(init.body)).messages[0].content as string;
    return new Response(JSON.stringify({ choices: [{ message: { content: said.includes("single word OK") ? "OK" : "generated" } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const headersFor = async (sub: string, extra: Record<string, string> = {}) => ({ authorization: "Bearer " + (await token(sub)), "content-type": "application/json", ...extra });
  const accept = async (h: Record<string, string>) => { await app.request("/me", { headers: h }); await app.request("/me/terms", { method: "POST", headers: h }); };
  const post = (path: string, body: unknown, headers = auth) => app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  const complete = (headers = auth, prompt = "Improve this text") => post("/ai/complete", { provider: "groq", apiKey: "gsk_fake_key", prompt, day: "2026-10-20" }, headers);
  const test = (headers = auth) => post("/ai/test", { provider: "groq", apiKey: "gsk_fake_key" }, headers);
  const make = (limits?: typeof AI_QUOTAS) => createApp({ store: new MemoryStore(), jwtSecret: SECRET, ai: { fetch: fakeFetch }, quota: { now: () => new Date(now), limits } });

  beforeEach(async () => {
    now = Date.parse("2026-10-20T10:10:00Z");
    called = 0;
    app = make();
    auth = await headersFor("user-one");
    await accept(auth);
  });
  afterEach(() => vi.restoreAllMocks());

  it("the quota rules are the plan's numbers: complete 40/hour 200/day, test 5/hour 20/day", () => {
    expect(quotaRules("complete", AI_QUOTAS)).toEqual([{ bucket: "complete:hour", windowSec: 3600, limit: 40 }, { bucket: "complete:day", windowSec: 86_400, limit: 200 }]);
    expect(quotaRules("test", AI_QUOTAS)).toEqual([{ bucket: "test:hour", windowSec: 3600, limit: 5 }, { bucket: "test:day", windowSec: 86_400, limit: 20 }]);
  });

  it("41st complete in an hour is 429 quota with Retry-After and detail hour:N, and the provider is not called", async () => {
    for (let i = 0; i < 40; i++) expect((await complete()).status).toBe(200);
    expect(called).toBe(40);
    const r = await complete();
    expect(r.status).toBe(429);
    // 10:10:00 is 3000 s before 11:00:00.
    expect(await r.json()).toEqual({ error: "quota", detail: "hour:3000" });
    expect(r.headers.get("retry-after")).toBe("3000");
    expect(called).toBe(40);
    // The rejected call did not count: the wait shrinks with the clock instead of restarting.
    now += 60_000;
    const again = await complete();
    expect(await again.json()).toEqual({ error: "quota", detail: "hour:2940" });
  });

  it("after the window the next call works", async () => {
    for (let i = 0; i < 40; i++) await complete();
    expect((await complete()).status).toBe(429);
    now = Date.parse("2026-10-20T11:00:00Z");
    expect((await complete()).status).toBe(200);
    expect(called).toBe(41);
  });

  it("the 201st in a day is 429 with detail day:N", async () => {
    for (let h = 0; h < 5; h++) {
      now = DAY_START + h * HOUR;
      for (let i = 0; i < 40; i++) expect((await complete()).status).toBe(200);
    }
    expect(called).toBe(200);
    now = DAY_START + 5 * HOUR;
    const r = await complete();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "quota", detail: "day:68400" });
    expect(r.headers.get("retry-after")).toBe("68400");
    expect(called).toBe(200);
    now = DAY_START + 24 * HOUR;
    expect((await complete()).status).toBe(200);
  });

  it("/ai/test: the 6th in an hour is 429, the 21st in a day is 429", async () => {
    for (let i = 0; i < 5; i++) expect((await test()).status).toBe(200);
    const sixth = await test();
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "quota", detail: "hour:3000" });
    expect(called).toBe(5);

    app = make(); auth = await headersFor("user-two"); await accept(auth); called = 0;
    for (let h = 0; h < 4; h++) {
      now = DAY_START + h * HOUR;
      for (let i = 0; i < 5; i++) expect((await test()).status).toBe(200);
    }
    now = DAY_START + 4 * HOUR;
    const r = await test();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "quota", detail: "day:72000" });
    expect(called).toBe(20);
  });

  it("complete and test have separate counters", async () => {
    for (let i = 0; i < 5; i++) await test();
    expect((await test()).status).toBe(429);
    expect((await complete()).status).toBe(200);
  });

  it("a personal-data 400 does not use a call", async () => {
    app = make({ ...AI_QUOTAS, complete: { hour: 1, day: 5 } }); auth = await headersFor("user-one"); await accept(auth);
    const refused = await complete(auth, "Improve this text mail asha@uni.example");
    expect(refused.status).toBe(400);
    expect((await complete()).status).toBe(200);
    expect((await complete()).status).toBe(429);
  });

  it("an invalid body does not use a call", async () => {
    app = make({ ...AI_QUOTAS, complete: { hour: 1, day: 5 }, test: { hour: 1, day: 5 } }); auth = await headersFor("user-one"); await accept(auth);
    expect((await post("/ai/complete", { provider: "nope" })).status).toBe(400);
    expect((await post("/ai/test", { provider: "groq" })).status).toBe(400);
    expect((await complete()).status).toBe(200);
    expect((await test()).status).toBe(200);
  });

  it("two users are independent, even from one address", async () => {
    const shared = { "x-forwarded-for": "203.0.113.7" };
    const h1 = await headersFor("user-one", shared);
    const h2 = await headersFor("user-two", shared);
    await accept(h2);
    for (let i = 0; i < 40; i++) expect((await complete(h1)).status).toBe(200);
    expect((await complete(h1)).status).toBe(429);
    expect((await complete(h2)).status).toBe(200);
  });

  it("/ai/log and /ai/log/summary are not limited", async () => {
    for (let i = 0; i < 40; i++) await complete();
    expect((await complete()).status).toBe(429);
    for (let i = 0; i < 60; i++) {
      expect((await app.request("/ai/log", { headers: auth })).status).toBe(200);
      expect((await app.request("/ai/log/summary", { headers: auth })).status).toBe(200);
    }
  });

  it("a rejection logs one line with the bucket and user id only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "gsk_fake_key", prompt = "Improve this unique-sentence-for-the-log-check";
    for (let i = 0; i < 40; i++) await complete(auth, prompt);
    expect(warn).not.toHaveBeenCalled();
    const r = await complete(auth, prompt);
    expect(r.status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]!.join(" "));
    expect(JSON.parse(line)).toEqual({ kind: "ai-quota", bucket: "complete:hour", user: "user-one" });
    for (const leak of [secret, prompt, "unique-sentence", "example.test", "Bearer"]) expect(line).not.toContain(leak);
  });
});
