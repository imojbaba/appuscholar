import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../packages/db/src/schema";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { DrizzleStore } from "../src/store/drizzle";

const SECRET = "test-secret-test-secret-test-secret-1234";
/** A pglite built in the test (and migrated) takes seconds on a slow runner; the default 5 s is too tight. */
const PGLITE_TIMEOUT = 30_000;
const make = (store = new MemoryStore()) => ({ store, app: createApp({ store, jwtSecret: SECRET }) });

describe("health", () => {
  afterEach(() => vi.restoreAllMocks());

  it("/health still answers ok without touching the store", async () => {
    const store = new MemoryStore();
    const ping = vi.spyOn(store, "ping");
    const res = await createApp({ store, jwtSecret: SECRET }).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(ping).not.toHaveBeenCalled();
  });

  it("/health/db is 200 {ok:true} when the store answers, with no sign-in", async () => {
    const { app, store } = make();
    const ping = vi.spyOn(store, "ping");
    const res = await app.request("/health/db");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("a failing ping leaks nothing", async () => {
    const { app, store } = make();
    store.failPing = Object.assign(new Error("connect failed postgres://user:secret@host/db"), { code: "ECONNREFUSED" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request("/health/db");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"ok":false}');
    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("postgres://");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("connect failed");
    expect(spy.mock.calls.flat()).toEqual(["health/db failed", "Error", "ECONNREFUSED"]);
  });

  it("a failure that is not an Error still answers 503 and logs no value", async () => {
    const { app, store } = make();
    store.failPing = "postgres://user:secret@host/db" as unknown as Error;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request("/health/db");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"ok":false}');
    expect(spy.mock.calls.flat()).toEqual(["health/db failed", "unknown", "none"]);
  });

  it("an error name or code that is not a short token is logged as other", async () => {
    const { app, store } = make();
    store.failPing = Object.assign(new Error("x"), { name: "connect failed postgres://user:secret@host/db", code: "a b" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request("/health/db");
    expect(res.status).toBe(503);
    expect(spy.mock.calls.flat()).toEqual(["health/db failed", "other", "other"]);
  });

  it("a hung ping answers 503 after 5 seconds and logs Timeout", async () => {
    vi.useFakeTimers();
    try {
      const { app, store } = make();
      vi.spyOn(store, "ping").mockReturnValue(new Promise<void>(() => {}));
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const pending = app.request("/health/db");
      await vi.advanceTimersByTimeAsync(4999);
      expect(spy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      const res = await pending;
      expect(res.status).toBe(503);
      expect(await res.text()).toBe('{"ok":false}');
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(spy.mock.calls.flat()).toEqual(["health/db failed", "Timeout", "none"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a prompt ping leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const { app } = make();
      const res = await app.request("/health/db");
      expect(res.status).toBe(200);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("both answers are no-store", async () => {
    const { app, store } = make();
    expect((await app.request("/health/db")).headers.get("cache-control")).toBe("no-store");
    store.failPing = new Error("x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await app.request("/health/db")).headers.get("cache-control")).toBe("no-store");
  });

  it("a Drizzle-wrapped driver error is read through its cause and leaks nothing", async () => {
    const d = drizzle(new PGlite(), { schema });
    const cause = Object.assign(new Error("connect failed postgres://user:secret@host/db"), { name: "NeonDbError", code: "ECONNREFUSED" });
    vi.spyOn(d, "execute").mockRejectedValue(Object.assign(new Error("Failed query: select 1 postgres://user:secret@host/db"), { cause }));
    const app = createApp({ store: new DrizzleStore(d), jwtSecret: SECRET });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request("/health/db");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"ok":false}');
    expect(spy.mock.calls.flat()).toEqual(["health/db failed", "NeonDbError", "ECONNREFUSED"]);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("select 1");
    expect(logged).not.toContain("postgres://");
  }, PGLITE_TIMEOUT);

  it("the Drizzle store pings pglite", async () => {
    const d = drizzle(new PGlite(), { schema });
    await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url)) });
    const app = createApp({ store: new DrizzleStore(d), jwtSecret: SECRET });
    await expect(new DrizzleStore(d).ping()).resolves.toBeUndefined();
    const res = await app.request("/health/db");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  }, PGLITE_TIMEOUT);
});
