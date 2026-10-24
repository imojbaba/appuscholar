// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 11: how an AI request learns of the participant list and the plan (controller rulings R1 and R41; spec 2026-10-24-participants-design.md §8.3).
 * - ensureList (lib/tools/participants/store.ts): the list the window holds, else one read of the `participants` blob with a headless client when the vault is open (so a pop-out,
 *   which has no DocumentLayer, still checks names). It never raises a passphrase prompt and never writes.
 * - readNamesCtx (lib/ai/namesRead.ts): the list, the plan's mode and whether the list is locked, as callAI's CallCtx.names gives them. With the vault locked the project's blob listing
 *   (the one "Export all my work" makes) says whether a list exists at all.
 * The api is an in-memory stand-in with the blob routes; the vault is a status and a "sealed:" wrapper.
 */

const h = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

import { ApiError } from "../lib/api";
import { readNamesCtx } from "../lib/ai/namesRead";
import { emptyList, type ParticipantList } from "../lib/blobs/kinds/participants";
import type { BlobVault } from "../lib/blobs/useProjectBlob";
import { addPerson } from "../lib/tools/participants/list";
import { ensureList, listFor, publishList, resetLists } from "../lib/tools/participants/store";

type Wire = { body: string; keyVersion: number; version: number };
let server: { blobs: Map<string, Wire>; calls: Array<{ path: string; method: string }>; failGet: Set<string> };
let status: string;
const ensureUnlocked = vi.fn(async () => false);
const vault = (): BlobVault => ({
  known: async () => status as never,
  ensureUnlocked,
  encryptBody: async () => { throw new Error("vault-locked"); },
  decryptBody: async (doc: { bodyHtml: string; keyVersion: number }) => {
    if (doc.keyVersion === 0) return doc.bodyHtml;
    if (status !== "unlocked" && status !== "migrating") throw new Error("vault-locked");
    return doc.bodyHtml.replace(/^sealed:/, "");
  }
});

const sealed = (v: unknown) => "sealed:" + JSON.stringify(v);
const put = (projectId: string, kind: string, v: unknown, keyVersion = 1, body = keyVersion === 0 ? JSON.stringify(v) : sealed(v)) => { server.blobs.set(projectId + "/" + kind, { body, keyVersion, version: 4 }); };
const PRIYA: ParticipantList = addPerson(emptyList(), { name: "Priya Sharma", spellings: ["Priya"], joined: "2026-10-01" }).list;
const gets = (kind?: string) => server.calls.filter((c) => c.method === "GET" && (kind === undefined || c.path.endsWith("/blobs/" + kind)));

beforeEach(() => {
  server = { blobs: new Map(), calls: [], failGet: new Set() };
  status = "unlocked";
  ensureUnlocked.mockClear();
  resetLists();
  h.api.mockReset().mockImplementation(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    server.calls.push({ path, method });
    const list = /^\/projects\/([^/]+)\/blobs$/.exec(path);
    if (list) return [...server.blobs.entries()].filter(([k]) => k.startsWith(list[1] + "/")).map(([k, b]) => ({ kind: k.split("/")[1], keyVersion: b.keyVersion, updatedAt: "2026-10-24T00:00:00.000Z" }));
    const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
    if (!m) throw new ApiError(404, "not-found");
    const key = m[1] + "/" + decodeURIComponent(m[2]!);
    if (method !== "GET") throw new Error("a request that must not write wrote: " + method + " " + path);
    if (server.failGet.has(key)) throw new ApiError(500, "error");
    const b = server.blobs.get(key);
    if (!b) throw new ApiError(404, "not-found");
    return { kind: decodeURIComponent(m[2]!), body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-24T00:00:00.000Z", version: b.version };
  });
});

describe("ensureList (R1)", () => {
  it("returns the list the window holds without asking the server", async () => {
    publishList("p1", PRIYA, 2);
    expect(await ensureList("p1", vault)).toBe(PRIYA);
    expect(h.api).not.toHaveBeenCalled();
  });

  it("with none held and the vault open, reads the blob once, publishes it and returns it", async () => {
    put("p1", "participants", PRIYA);
    const got = await ensureList("p1", vault);
    expect(got?.people.map((p) => p.name)).toEqual(["Priya Sharma"]);
    expect(listFor("p1")).toBe(got);
    expect(gets("participants")).toHaveLength(1);
    // The next request finds it held.
    expect(await ensureList("p1", vault)).toBe(got);
    expect(gets("participants")).toHaveLength(1);
    expect(ensureUnlocked).not.toHaveBeenCalled();
  });

  it("writes nothing and holds nothing back: no request but the read", async () => {
    put("p1", "participants", PRIYA);
    await ensureList("p1", vault);
    expect(server.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("a project with no blob has an empty list, as the Participants tab shows it", async () => {
    const got = await ensureList("p1", vault);
    expect(got?.people).toEqual([]);
    expect(listFor("p1")).toBe(got);
  });

  it("a locked vault reads nothing, raises no passphrase prompt and publishes nothing", async () => {
    status = "locked";
    put("p1", "participants", PRIYA);
    expect(await ensureList("p1", vault)).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
    expect(ensureUnlocked).not.toHaveBeenCalled();
    expect(listFor("p1")).toBeNull();
  });

  it("the vault off holds no list: nothing is read", async () => {
    status = "off";
    expect(await ensureList("p1", vault)).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("a list that does not open, or a read that fails, is none, and nothing is published", async () => {
    put("p1", "participants", null, 1, "sealed:not json");
    expect(await ensureList("p1", vault)).toBeNull();
    put("p2", "participants", PRIYA);
    server.failGet.add("p2/participants");
    expect(await ensureList("p2", vault)).toBeNull();
    expect(listFor("p1")).toBeNull();
    expect(listFor("p2")).toBeNull();
  });

  it("a migrating vault is open", async () => {
    status = "migrating";
    put("p1", "participants", PRIYA);
    expect((await ensureList("p1", vault))?.people).toHaveLength(1);
  });
});

describe("readNamesCtx (R41)", () => {
  const ec = (idMode?: string) => ({ idMode, committee: "", title: "" });

  it("an open vault: the list and the plan's mode", async () => {
    put("p1", "participants", PRIYA);
    put("p1", "design_ec", ec("pseudonyms"));
    const c = await readNamesCtx("p1", vault);
    expect(c.locked).toBe(false);
    expect(c.mode).toBe("pseudonyms");
    expect(c.list?.people.map((p) => p.name)).toEqual(["Priya Sharma"]);
  });

  it("a plan that is not answered or not there is mode null", async () => {
    put("p1", "design_ec", ec());
    expect((await readNamesCtx("p1", vault)).mode).toBeNull();
    expect((await readNamesCtx("p2", vault)).mode).toBeNull();
  });

  it("a plan that cannot be read is mode null and does not stop the list", async () => {
    put("p1", "participants", PRIYA);
    put("p1", "design_ec", null, 1, "sealed:{{{");
    const c = await readNamesCtx("p1", vault);
    expect(c.mode).toBeNull();
    expect(c.list?.people).toHaveLength(1);
  });

  it("the held list is used and the plan is read: a Participants tab in the window", async () => {
    publishList("p1", PRIYA, 3);
    put("p1", "design_ec", ec("codes"));
    const c = await readNamesCtx("p1", vault);
    expect(c.list).toBe(PRIYA);
    expect(c.mode).toBe("codes");
    expect(gets("participants")).toHaveLength(0);
  });

  it("the vault off: the plan (stored plain) is read, there is no list and it is not locked", async () => {
    status = "off";
    put("p1", "design_ec", ec("codes"), 0);
    const c = await readNamesCtx("p1", vault);
    expect(c).toEqual({ list: null, mode: "codes", locked: false });
  });

  it("a locked vault with a list in the project: locked, learned from the blob listing, no blob read, no prompt", async () => {
    status = "locked";
    put("p1", "participants", PRIYA);
    put("p1", "idea_intake", { topic: "x" });
    const c = await readNamesCtx("p1", vault);
    expect(c).toEqual({ list: null, mode: null, locked: true });
    expect(h.api.mock.calls.map((x) => x[0])).toEqual(["/projects/p1/blobs"]);
    expect(ensureUnlocked).not.toHaveBeenCalled();
  });

  it("a locked vault and no list in the project is not a locked list", async () => {
    status = "locked";
    put("p1", "idea_intake", { topic: "x" });
    expect(await readNamesCtx("p1", vault)).toEqual({ list: null, mode: null, locked: false });
  });

  it("a locked vault whose listing cannot be read says nothing is locked: no way to tell", async () => {
    status = "locked";
    h.api.mockRejectedValue(new ApiError(500, "error"));
    expect(await readNamesCtx("p1", vault)).toEqual({ list: null, mode: null, locked: false });
  });

  it("a locked vault but a list the window already holds: the held list is used", async () => {
    status = "locked";
    publishList("p1", PRIYA, 3);
    const c = await readNamesCtx("p1", vault);
    expect(c.list).toBe(PRIYA);
    expect(c.locked).toBe(false);
  });

  it("a failed read of the list is none, not an error: the request goes on", async () => {
    put("p1", "participants", PRIYA);
    server.failGet.add("p1/participants");
    const c = await readNamesCtx("p1", vault);
    expect(c.list).toBeNull();
    expect(c.locked).toBe(false);
  });
});
