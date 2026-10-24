import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/client-error/route";

const URL_ = "https://app.example.test/api/client-error";
let logs: string[];
let minute = 0;
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
  // Each test sits in its own minute so the per-minute cap never leaks into the next.
  minute += 1;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 24, 10, minute, 5)));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function req(body: unknown, headers: Record<string, string> = {}, raw = false) {
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ? (body as string) : JSON.stringify(body) });
}

describe("POST /api/client-error", () => {
  it("the log line holds only the four allowed fields", async () => {
    const res = await POST(req({
      name: "TypeError", route: "/projects/abc?token=SECRET123#frag", build: "abc1234",
      message: "student@example.test failed", stack: "at secret (file.js:1)", email: "student@example.test",
      auth: "Bearer eyJhbGciOiJIUzI1NiJ9.fake.fake", url: "https://evil.test/x?token=SECRET123#x"
    }));
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0]!) as Record<string, string>;
    expect(Object.keys(line).sort()).toEqual(["build", "kind", "name", "requestId", "route"]);
    expect(line.kind).toBe("client-error");
    expect(line.name).toBe("TypeError");
    expect(line.build).toBe("abc1234");
    for (const bad of ["student@example.test", "Bearer", "eyJ", "SECRET123", "#frag", "stack", "evil.test", "message"]) expect(logs[0]).not.toContain(bad);
  });

  it("a URL or a hostile name in the fields is neutralised", async () => {
    const res = await POST(req({ name: "student@example.test", route: "https://evil.test/x?token=SECRET123#x", build: "<script>" }));
    expect(res.status).toBe(204);
    const line = JSON.parse(logs[0]!) as Record<string, string>;
    expect(line).toMatchObject({ name: "Error", route: "/", build: "unknown" });
    expect(logs[0]).not.toMatch(/SECRET123|evil|example\.test|script/);
  });

  it("uses x-vercel-id as the request id, else a fresh uuid", async () => {
    await POST(req({ name: "Error", route: "/", build: "dev" }, { "x-vercel-id": "bom1::abcde-123" }));
    expect(JSON.parse(logs[0]!).requestId).toBe("bom1::abcde-123");
    await POST(req({ name: "Error", route: "/", build: "dev" }));
    expect(JSON.parse(logs[1]!).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a route with ids is masked", async () => {
    await POST(req({ name: "Error", route: "/projects/0f8fad5bd9cb469fa16570867728950e/doc/1234567/edit", build: "dev" }));
    expect(JSON.parse(logs[0]!).route).toBe("/projects/:id/doc/:id/edit");
  });

  it("a body over 1 KB is 413 and logs nothing", async () => {
    const res = await POST(req({ name: "Error", route: "/", build: "dev", blob: "x".repeat(50 * 1024) }));
    expect(res.status).toBe(413);
    expect(logs).toHaveLength(0);
  });

  it("bad JSON, an array and null are 400", async () => {
    expect((await POST(req("{nope", {}, true))).status).toBe(400);
    expect((await POST(req([1, 2]))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect(logs).toHaveLength(0);
  });

  it("cross-origin is 403; same-origin and no Origin pass", async () => {
    expect((await POST(req({ name: "Error" }, { origin: "https://evil.test" }))).status).toBe(403);
    expect(logs).toHaveLength(0);
    expect((await POST(req({ name: "Error" }, { origin: "https://app.example.test" }))).status).toBe(204);
    expect((await POST(req({ name: "Error" }))).status).toBe(204);
    expect(logs).toHaveLength(2);
  });

  it("over the cap logs nothing and answers 204", async () => {
    for (let i = 0; i < 30; i++) expect((await POST(req({ name: "Error", route: "/", build: "dev" }))).status).toBe(204);
    expect(logs).toHaveLength(30);
    const res = await POST(req({ name: "Error", route: "/", build: "dev" }));
    expect(res.status).toBe(204);
    expect(logs).toHaveLength(30);
  });
});
