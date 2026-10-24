import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { AI_QUOTAS, quotaRules } from "../src/ai/quota";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
const token = (sub: string) => new SignJWT({ email: sub + "@example.test" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(key);

/** Tests that make 100+ requests: a slow CI runner needs more than the default 5 s. */
const MANY_CALLS_TIMEOUT = 30_000;
const MINUTE = 60_000;
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
  /** Makes n calls, 19 per clock minute starting at `from`, so the per-minute rule (20) never fires; leaves the clock in the last minute used. */
  const spread = async (n: number, call: () => Response | Promise<Response>, from = now) => {
    for (let i = 0; i < n; i++) {
      now = from + Math.floor(i / 19) * MINUTE;
      expect((await call()).status).toBe(200);
    }
  };
  const make = (limits?: typeof AI_QUOTAS) => createApp({ store: new MemoryStore(), jwtSecret: SECRET, ai: { fetch: fakeFetch }, quota: { now: () => new Date(now), limits } });

  beforeEach(async () => {
    now = Date.parse("2026-10-20T10:10:00Z");
    called = 0;
    app = make();
    auth = await headersFor("user-one");
    await accept(auth);
  });
  afterEach(() => vi.restoreAllMocks());

  it("the quota rules are OJ's numbers, shortest window first: complete 20/min 150/hour 800/day, test 10/hour 40/day with no minute rule", () => {
    expect(quotaRules("complete", AI_QUOTAS)).toEqual([
      { bucket: "complete:minute", windowSec: 60, limit: 20 },
      { bucket: "complete:hour", windowSec: 3600, limit: 150 },
      { bucket: "complete:day", windowSec: 86_400, limit: 800 }
    ]);
    expect(quotaRules("test", AI_QUOTAS)).toEqual([{ bucket: "test:hour", windowSec: 3600, limit: 10 }, { bucket: "test:day", windowSec: 86_400, limit: 40 }]);
  });

  it("a limits override without a minute leaves the minute rule out", () => {
    expect(quotaRules("complete", { ...AI_QUOTAS, complete: { hour: 3, day: 9 } }).map(r => r.bucket)).toEqual(["complete:hour", "complete:day"]);
  });

  it("the 21st complete within one minute is 429 with detail minute:N, the provider is not called, and the next minute passes", async () => {
    now = Date.parse("2026-10-20T10:10:20Z");
    for (let i = 0; i < 20; i++) expect((await complete()).status).toBe(200);
    expect(called).toBe(20);
    const r = await complete();
    expect(r.status).toBe(429);
    // 10:10:20 is 40 s before 10:11:00.
    expect(await r.json()).toEqual({ error: "quota", detail: "minute:40" });
    expect(r.headers.get("retry-after")).toBe("40");
    expect(called).toBe(20);
    // The wait shrinks with the clock.
    now += 10_000;
    expect(await (await complete()).json()).toEqual({ error: "quota", detail: "minute:30" });
    now = Date.parse("2026-10-20T10:11:00Z");
    expect((await complete()).status).toBe(200);
    expect(called).toBe(21);
  });

  it("a loop of 100 complete calls in one second lets exactly 20 through", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 100; i++) statuses.push((await complete()).status);
    expect(statuses.filter(s => s === 200)).toHaveLength(20);
    expect(statuses.filter(s => s === 429)).toHaveLength(80);
    expect(statuses.slice(0, 20).every(s => s === 200)).toBe(true);
    expect(called).toBe(20);
  }, MANY_CALLS_TIMEOUT);

  it("when the minute and the hour are both full the answer names the minute", async () => {
    app = make({ ...AI_QUOTAS, complete: { minute: 2, hour: 2, day: 50 } }); auth = await headersFor("user-one"); await accept(auth);
    expect((await complete()).status).toBe(200);
    expect((await complete()).status).toBe(200);
    const r = await complete();
    expect(r.status).toBe(429);
    const body = await r.json() as { error: string; detail: string };
    expect(body.error).toBe("quota");
    expect(body.detail.startsWith("minute:")).toBe(true);
    expect(body.detail).toBe("minute:60");
    expect(called).toBe(2);
    // Next minute the minute is free but the hour is still full: now the hour is named.
    now += MINUTE;
    expect(await (await complete()).json()).toEqual({ error: "quota", detail: "hour:2940" });
  });

  it("the 151st complete in an hour is 429 with detail hour:N and Retry-After, and the provider is not called", async () => {
    const start = now;
    await spread(150, () => complete(), start);
    expect(called).toBe(150);
    // 150 calls at 19 a minute end in the 8th minute (10:17); the 151st goes in the 9th, 10:18:00, 2520 s before 11:00:00.
    now = start + 8 * MINUTE;
    const r = await complete();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "quota", detail: "hour:2520" });
    expect(r.headers.get("retry-after")).toBe("2520");
    expect(called).toBe(150);
    // The wait shrinks with the clock.
    now += MINUTE;
    expect(await (await complete()).json()).toEqual({ error: "quota", detail: "hour:2460" });
  }, MANY_CALLS_TIMEOUT);

  it("after the window the next call works", async () => {
    await spread(150, () => complete());
    now += MINUTE;
    expect((await complete()).status).toBe(429);
    now = Date.parse("2026-10-20T11:00:00Z");
    expect((await complete()).status).toBe(200);
    expect(called).toBe(151);
  }, MANY_CALLS_TIMEOUT);

  it("the 801st in a day is 429 with detail day:N", async () => {
    // Five full hours of 150, then 50 in the sixth: 800 calls, the day's whole allowance.
    for (let h = 0; h < 5; h++) await spread(150, () => complete(), DAY_START + h * HOUR);
    await spread(50, () => complete(), DAY_START + 5 * HOUR);
    expect(called).toBe(800);
    now = DAY_START + 6 * HOUR;
    const r = await complete();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "quota", detail: "day:64800" });
    expect(r.headers.get("retry-after")).toBe("64800");
    expect(called).toBe(800);
    now = DAY_START + 24 * HOUR;
    expect((await complete()).status).toBe(200);
  }, MANY_CALLS_TIMEOUT);

  it("/ai/test: the 11th in an hour is 429, the 41st in a day is 429, and there is no minute rule", async () => {
    // Ten calls in one second all pass: no minute rule on /ai/test.
    for (let i = 0; i < 10; i++) expect((await test()).status).toBe(200);
    const eleventh = await test();
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toEqual({ error: "quota", detail: "hour:3000" });
    expect(called).toBe(10);

    app = make(); auth = await headersFor("user-two"); await accept(auth); called = 0;
    for (let h = 0; h < 4; h++) {
      now = DAY_START + h * HOUR;
      for (let i = 0; i < 10; i++) expect((await test()).status).toBe(200);
    }
    now = DAY_START + 4 * HOUR;
    const r = await test();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "quota", detail: "day:72000" });
    expect(called).toBe(40);
  });

  it("complete and test have separate counters", async () => {
    for (let i = 0; i < 10; i++) await test();
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
    await spread(150, () => complete(h1));
    expect((await complete(h1)).status).toBe(429);
    expect((await complete(h2)).status).toBe(200);
  }, MANY_CALLS_TIMEOUT);

  it("/ai/log and /ai/log/summary are not limited", async () => {
    await spread(150, () => complete());
    expect((await complete()).status).toBe(429);
    for (let i = 0; i < 60; i++) {
      expect((await app.request("/ai/log", { headers: auth })).status).toBe(200);
      expect((await app.request("/ai/log/summary", { headers: auth })).status).toBe(200);
    }
  }, MANY_CALLS_TIMEOUT);

  it("a rejection logs one line with the bucket and user id only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "gsk_fake_key", prompt = "Improve this unique-sentence-for-the-log-check";
    await spread(150, () => complete(auth, prompt));
    expect(warn).not.toHaveBeenCalled();
    const r = await complete(auth, prompt);
    expect(r.status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]!.join(" "));
    expect(JSON.parse(line)).toEqual({ kind: "ai-quota", bucket: "complete:hour", user: "user-one" });
    for (const leak of [secret, prompt, "unique-sentence", "example.test", "Bearer"]) expect(line).not.toContain(leak);
  }, MANY_CALLS_TIMEOUT);

  it("a minute rejection logs the bucket complete:minute, bucket and user id only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "gsk_fake_key", prompt = "Improve this unique-sentence-for-the-log-check";
    for (let i = 0; i < 20; i++) await complete(auth, prompt);
    expect(warn).not.toHaveBeenCalled();
    const r = await complete(auth, prompt);
    expect(r.status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]!.join(" "));
    expect(JSON.parse(line)).toEqual({ kind: "ai-quota", bucket: "complete:minute", user: "user-one" });
    for (const leak of [secret, prompt, "unique-sentence", "example.test", "Bearer"]) expect(line).not.toContain(leak);
  });
});
