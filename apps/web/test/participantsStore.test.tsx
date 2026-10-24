// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 5: the participant list's state (spec 2026-10-24-participants-design.md §5 "Vault" and §6; rulings R1, R16 and R17). Three parts:
 * - the store other code in the window reads (lib/tools/participants/store.ts);
 * - useParticipants: reads only once the vault is open (never raises a passphrase prompt), refuses when the vault is off, saves through the blob's
 *   update form so a code is always allocated from the latest list (allocatesFromTheLatestValue), and asks first before replacing a list that does not open (R16);
 * - SEALED_ONLY in useProjectBlob: with the vault off, a save of the participants kind sends nothing and holds nothing (R17).
 * The vault is a stand-in (a status and a "sealed:" wrapper), the api an in-memory server with the blob routes' versions, so the real blob client runs.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), ensure: vi.fn(), status: "unlocked" as string }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/vault/useVault", () => {
  const open = () => h.status === "unlocked" || h.status === "migrating";
  return {
    useVault: () => ({
      status: h.status,
      known: async () => h.status,
      ensureUnlocked: async () => { h.ensure(); return open(); },
      encryptBody: async (_doc: unknown, text: string) => { if (!open()) throw new Error("vault-locked"); return { bodyHtml: "sealed:" + text, keyVersion: 1 }; },
      decryptBody: async (doc: { bodyHtml: string }) => { if (!open()) throw new Error("vault-locked"); return doc.bodyHtml.replace(/^sealed:/, ""); }
    })
  };
});

import { ApiError } from "../lib/api";
import { emptyList, type ParticipantList } from "../lib/blobs/kinds/participants";
import { blobId } from "../lib/blobs/kinds";
import { heldBlobs } from "../lib/blobs/held";
import { BLOB_SAVE_DEBOUNCE_MS, SEALED_ONLY, useProjectBlob, type ProjectBlob } from "../lib/blobs/useProjectBlob";
import { addPerson } from "../lib/tools/participants/list";
import { listFor, publishList, resetLists, subscribeList, useListFor } from "../lib/tools/participants/store";
import { useParticipants } from "../lib/tools/participants/useParticipants";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- The api: the blob routes with their versions, in memory --------------------------------------------------------------------------------------

type SBlob = { body: string; keyVersion: number; version: number };
type Call = { path: string; method: string; body?: { body: string; keyVersion: number }; ifMatch?: string };
/** `gate`: while set, a GET is not answered until it resolves (a read still under way). */
let server: { blobs: Map<string, SBlob>; calls: Call[]; failGet: boolean; failPut: boolean; gate: Promise<void> | null };
const puts = () => server.calls.filter((c) => c.method === "PUT");
const gets = () => server.calls.filter((c) => c.method === "GET");
const key = (projectId: string, kind: string) => projectId + "/" + kind;
const seal = (value: unknown) => "sealed:" + JSON.stringify(value);
const seed = (projectId: string, value: unknown, body = seal(value)) => { server.blobs.set(key(projectId, "participants"), { body, keyVersion: 1, version: 1 }); };
/** What the server holds for the project's participants blob, opened. */
const stored = (projectId = "p1"): ParticipantList | null => {
  const b = server.blobs.get(key(projectId, "participants"));
  return b ? (JSON.parse(b.body.replace(/^sealed:/, "")) as ParticipantList) : null;
};

function fakeApi(path: string, init: RequestInit = {}): Promise<unknown> {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Call["body"]) : undefined;
  const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
  server.calls.push({ path, method, body, ...(ifMatch !== undefined ? { ifMatch } : {}) });
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) return Promise.reject(new ApiError(404, "not-found"));
  const k = key(m[1]!, decodeURIComponent(m[2]!));
  const cur = server.blobs.get(k);
  const wire = (b: SBlob) => ({ kind: m[2], body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-24T00:00:00.000Z", version: b.version });
  if (method === "GET") {
    if (server.failGet) return Promise.reject(new ApiError(500, "error"));
    return (server.gate ?? Promise.resolve()).then(() => (cur ? wire(cur) : Promise.reject(new ApiError(404, "not-found"))));
  }
  if (method !== "PUT") return Promise.reject(new ApiError(404, "not-found"));
  if (server.failPut) return Promise.reject(new ApiError(500, "error"));
  // As apps/api answers: ciphertext only for the participants kind, whether or not there is a vault.
  if (body!.keyVersion === 0 && m[2] === "participants") return Promise.reject(new ApiError(409, "vault-required"));
  const want = ifMatch === undefined ? undefined : Number(/^"?(\d+)"?$/.exec(ifMatch)?.[1]);
  if (want !== undefined && want !== (cur?.version ?? 0)) return Promise.reject(new ApiError(409, "version-conflict"));
  const next: SBlob = { body: body!.body, keyVersion: body!.keyVersion, version: (cur?.version ?? 0) + 1 };
  server.blobs.set(k, next);
  return Promise.resolve(wire(next));
}

// ---- Mounting ---------------------------------------------------------------------------------------------------------------------------------------

const roots: Root[] = [];
beforeEach(() => {
  server = { blobs: new Map(), calls: [], failGet: false, failPut: false, gate: null };
  h.status = "unlocked";
  h.api.mockReset();
  h.ensure.mockReset();
  h.api.mockImplementation(fakeApi);
  resetLists();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  // Whatever a blob left held for a later mount (the registry is module-wide) is not for the next test.
  for (const kind of ["participants", "qual_codes"] as const) heldBlobs.take(blobId("p1", kind));
});
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await sleep(5); }
  throw new Error("condition not reached");
}

type Hook = ReturnType<typeof useParticipants>;
/** One useParticipants in its own root; `rerender` draws it again (the stand-in vault is read at each render). */
async function mountHook(projectId = "p1") {
  const box: { cur: Hook | null } = { cur: null };
  function Probe() { box.cur = useParticipants(projectId); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  return {
    get h(): Hook { return box.cur!; },
    rerender: async () => { await act(async () => { root.render(<Probe />); }); },
    unmount: () => { act(() => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); }
  };
}
const addNamed = (name: string) => (prev: ParticipantList) => addPerson(prev, { name, spellings: [], joined: "2026-10-24" }).list;

// ---- The store --------------------------------------------------------------------------------------------------------------------------------------

describe("the participants store", () => {
  const withOne = (): ParticipantList => addPerson(emptyList(), { name: "Priya Sharma", spellings: ["Priya"], joined: "2026-10-24" }).list;

  it("keeps the latest list published for each project, null for a project with none", () => {
    expect(listFor("p1")).toBeNull();
    const l = withOne();
    publishList("p1", l);
    expect(listFor("p1")).toBe(l);
    expect(listFor("p2")).toBeNull();
    publishList("p2", emptyList());
    expect(listFor("p1")).toBe(l);
    publishList("p1", null);
    expect(listFor("p1")).toBeNull();
    expect(listFor("p2")).toEqual(emptyList());
  });

  it("tells subscribers when a list changes, not when the same list is published again, and stops after unsubscribe", () => {
    const cb = vi.fn();
    const off = subscribeList(cb);
    const l = withOne();
    publishList("p1", l);
    expect(cb).toHaveBeenCalledTimes(1);
    publishList("p1", l);
    expect(cb).toHaveBeenCalledTimes(1);
    publishList("p1", null);
    expect(cb).toHaveBeenCalledTimes(2);
    publishList("p1", null);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    publishList("p1", l);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("useListFor draws again when its project's list is published", async () => {
    function Count({ id }: { id: string }) { const l = useListFor(id); return <b data-testid="n">{l === null ? "none" : String(l.people.length)}</b>; }
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    roots.push(root);
    await act(async () => { root.render(<Count id="p1" />); });
    const n = () => document.querySelector('[data-testid="n"]')!.textContent;
    expect(n()).toBe("none");
    await act(async () => { publishList("p1", withOne()); });
    expect(n()).toBe("1");
    await act(async () => { publishList("p2", emptyList()); });
    expect(n()).toBe("1");
    await act(async () => { publishList("p1", null); });
    expect(n()).toBe("none");
  });

  it("keeps each list with the version it came from: a publish of an older version is ignored (R22)", () => {
    const v2 = withOne();
    const v3 = addPerson(v2, { name: "Imran Khan", spellings: [], joined: "2026-10-24" }).list;
    const v3b = addPerson(v2, { name: "Sunita Devi", spellings: [], joined: "2026-10-24" }).list;
    const v4 = addPerson(v3, { name: "Rahul Jain", spellings: [], joined: "2026-10-24" }).list;
    publishList("p1", v3, 3);
    publishList("p1", v2, 2);
    expect(listFor("p1")).toBe(v3);
    // The same version is accepted (a save's provisional value, then the value the server accepted on the same base), and a newer one.
    publishList("p1", v3b, 3);
    expect(listFor("p1")).toBe(v3b);
    publishList("p1", v4, 4);
    expect(listFor("p1")).toBe(v4);
    publishList("p1", v2, 3);
    expect(listFor("p1")).toBe(v4);
    // No version is accepted whatever is held (a clear, a test), and forgets the held version: the next read of any version is taken.
    publishList("p1", null);
    expect(listFor("p1")).toBeNull();
    publishList("p1", v2, 2);
    expect(listFor("p1")).toBe(v2);
    // Versions are a project's own.
    publishList("p2", v2, 1);
    expect(listFor("p2")).toBe(v2);
  });

  it("an ignored publish tells nobody; the same list on a newer version tells nobody but moves the version on", () => {
    const l = withOne();
    const other = addPerson(l, { name: "Imran Khan", spellings: [], joined: "2026-10-24" }).list;
    const cb = vi.fn();
    publishList("p1", l, 5);
    subscribeList(cb);
    publishList("p1", other, 4);
    expect(cb).not.toHaveBeenCalled();
    publishList("p1", l, 6);
    expect(cb).not.toHaveBeenCalled();
    // Version 6 is now held, so 5 no longer gets in.
    publishList("p1", other, 5);
    expect(listFor("p1")).toBe(l);
    expect(cb).not.toHaveBeenCalled();
  });

  it("resetLists forgets every project", () => {
    publishList("p1", withOne());
    resetLists();
    expect(listFor("p1")).toBeNull();
  });
});

// ---- The vault gates the read ------------------------------------------------------------------------------------------------------------------------

describe("useParticipants and the vault", () => {
  it("a locked vault: no request is made, the state is locked, there is no list, and save refuses", async () => {
    h.status = "locked";
    seed("p1", emptyList());
    const m = await mountHook();
    await sleep(50);
    expect(m.h.state).toBe("locked");
    expect(m.h.list).toBeNull();
    expect(server.calls).toEqual([]);
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    await sleep(50);
    expect(server.calls).toEqual([]);
    expect(listFor("p1")).toBeNull();
    // It never asks for the passphrase itself.
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it("a vault still loading is not taken for off or open: state loading, no request, save refuses", async () => {
    h.status = "loading";
    const m = await mountHook();
    await sleep(50);
    expect(m.h.state).toBe("loading");
    expect(m.h.list).toBeNull();
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    expect(server.calls).toEqual([]);
  });

  it("the vault off: state off, no list, no request, and save returns false and sends nothing", async () => {
    h.status = "off";
    const m = await mountHook();
    await sleep(50);
    expect(m.h.state).toBe("off");
    expect(m.h.list).toBeNull();
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    await sleep(50);
    expect(m.h.list).toBeNull();
    expect(server.calls).toEqual([]);
  });

  it("no project open (an empty id) reads nothing and refuses to save", async () => {
    const m = await mountHook("");
    await sleep(50);
    expect(m.h.list).toBeNull();
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    expect(server.calls).toEqual([]);
  });

  it("reads once the vault opens, and drops the list again when it locks", async () => {
    h.status = "locked";
    seed("p1", addPerson(emptyList(), { name: "Priya Sharma", spellings: [], joined: "2026-10-24" }).list);
    const m = await mountHook();
    expect(m.h.state).toBe("locked");
    h.status = "unlocked";
    await m.rerender();
    await until(() => m.h.state === "ready");
    expect(m.h.list!.people.map((p) => p.code)).toEqual(["P001"]);
    expect(gets()).toHaveLength(1);
    expect(listFor("p1")).toBe(m.h.list);
    h.status = "locked";
    await m.rerender();
    expect(m.h.state).toBe("locked");
    expect(m.h.list).toBeNull();
    expect(listFor("p1")).toBeNull();
  });

  it("reads while the vault migrates, as it does when unlocked", async () => {
    h.status = "migrating";
    seed("p1", emptyList());
    const m = await mountHook();
    await until(() => m.h.state === "ready");
    expect(m.h.list).toEqual(emptyList());
  });
});

// ---- Reading and saving ------------------------------------------------------------------------------------------------------------------------------

describe("useParticipants reads and saves the sealed list", () => {
  it("with nothing stored yet: ready, an empty list starting at P001, and publishes it", async () => {
    let release = () => {};
    server.gate = new Promise<void>((r) => { release = r; });
    const m = await mountHook();
    expect(m.h.state).toBe("loading");
    expect(m.h.list).toBeNull();
    expect(listFor("p1")).toBeNull();
    await act(async () => { release(); });
    await until(() => m.h.state === "ready");
    expect(m.h.list).toEqual(emptyList());
    expect(listFor("p1")).toBe(m.h.list);
  });

  it("publishes what it reads to the store (R1)", async () => {
    const l = addPerson(emptyList(), { name: "Priya Sharma", spellings: ["Priya"], joined: "2026-10-24" }).list;
    seed("p1", l);
    const m = await mountHook();
    await until(() => m.h.state === "ready");
    expect(m.h.list).toEqual(l);
    expect(listFor("p1")).toEqual(l);
  });

  it("a hook still loading does not wipe the list another one published", async () => {
    seed("p1", addPerson(emptyList(), { name: "Priya Sharma", spellings: [], joined: "2026-10-24" }).list);
    const a = await mountHook();
    await until(() => a.h.state === "ready");
    const published = listFor("p1");
    expect(published).not.toBeNull();
    let release = () => {};
    server.gate = new Promise<void>((r) => { release = r; });
    const b = await mountHook();
    expect(b.h.state).toBe("loading");
    expect(listFor("p1")).toBe(published);
    await act(async () => { release(); });
    await until(() => b.h.state === "ready");
    expect(listFor("p1")).toEqual(published);
  });

  it("a save shows at once, reaches the store at once, and is sent sealed (never keyVersion 0) on the version it read", async () => {
    const m = await mountHook();
    await until(() => m.h.state === "ready");
    let ok = false;
    await act(async () => { ok = m.h.save(addNamed("Priya Sharma")); });
    expect(ok).toBe(true);
    expect(m.h.list!.people.map((p) => [p.code, p.name])).toEqual([["P001", "Priya Sharma"]]);
    expect(listFor("p1")).toEqual(m.h.list);
    expect(listFor("p1")!.people).toHaveLength(1);
    await until(() => puts().length === 1);
    expect(puts()[0]!.body!.keyVersion).toBe(1);
    expect(puts()[0]!.body!.body.startsWith("sealed:")).toBe(true);
    expect(puts()[0]!.ifMatch).toBe('"0"');
    expect(stored()!.people.map((p) => p.code)).toEqual(["P001"]);
    expect(stored()!.next).toBe(2);
  });

  it("allocatesFromTheLatestValue: two saves in a row on one hook get P001 and P002, not P001 twice", async () => {
    const m = await mountHook();
    await until(() => m.h.state === "ready");
    await act(async () => { m.h.save(addNamed("Priya Sharma")); m.h.save(addNamed("Imran Khan")); });
    expect(m.h.list!.people.map((p) => p.code)).toEqual(["P001", "P002"]);
    await until(() => stored()?.people.length === 2);
    expect(stored()!.people.map((p) => p.code)).toEqual(["P001", "P002"]);
    expect(stored()!.next).toBe(3);
  });

  it("allocatesFromTheLatestValue: two hooks on one blob, each adds a person, and the list ends with P001 and P002", async () => {
    const a = await mountHook();
    const b = await mountHook();
    await until(() => a.h.state === "ready" && b.h.state === "ready");
    // Neither has heard of the other's save: both read an empty list. Both save before either PUT goes out.
    await act(async () => {
      expect(a.h.save(addNamed("Priya Sharma"))).toBe(true);
      expect(b.h.save(addNamed("Imran Khan"))).toBe(true);
    });
    await until(() => stored()?.people.length === 2);
    const l = stored()!;
    expect(l.people.map((p) => p.code).sort()).toEqual(["P001", "P002"]);
    expect(l.people.map((p) => p.name).sort()).toEqual(["Imran Khan", "Priya Sharma"]);
    expect(l.next).toBe(3);
    // Once both saves have settled the store shows what the server holds, not either window's provisional P001 (R22).
    await until(() => JSON.stringify(listFor("p1")) === JSON.stringify(stored()));
    expect(listFor("p1")!.people.map((p) => p.code).sort()).toEqual(["P001", "P002"]);
    await sleep(100);
    expect(JSON.stringify(listFor("p1"))).toBe(JSON.stringify(stored()));
  });

  it("a save's provisional list (on the version it read) does not replace a newer list the store holds; the settled one does (R22)", async () => {
    const a = await mountHook();
    const b = await mountHook();
    await until(() => a.h.state === "ready" && b.h.state === "ready");
    await act(async () => { b.h.save(addNamed("Imran Khan")); });
    await until(() => stored()?.people.length === 1);
    await until(() => listFor("p1")?.people.length === 1);
    expect(stored()!.people[0]).toMatchObject({ code: "P001", name: "Imran Khan" });
    // a still holds the empty list it read on version 0. Its save is provisional until its PUT is rebased onto version 1: P001 is Imran's, not Priya's.
    await act(async () => { a.h.save(addNamed("Priya Sharma")); });
    expect(a.h.list!.people.map((p) => p.code)).toEqual(["P001"]);
    expect(listFor("p1")!.people.map((p) => [p.code, p.name])).toEqual([["P001", "Imran Khan"]]);
    await until(() => stored()?.people.length === 2);
    expect(stored()!.people.map((p) => [p.code, p.name])).toEqual([["P001", "Imran Khan"], ["P002", "Priya Sharma"]]);
    await until(() => listFor("p1")?.people.length === 2);
    expect(listFor("p1")!.people.map((p) => [p.code, p.name])).toEqual([["P001", "Imran Khan"], ["P002", "Priya Sharma"]]);
  });

  it("allocatesFromTheLatestValue: the second hook saves after the first has landed, from a value it never saw, and still gets the next code", async () => {
    const a = await mountHook();
    const b = await mountHook();
    await until(() => a.h.state === "ready" && b.h.state === "ready");
    await act(async () => { a.h.save(addNamed("Priya Sharma")); });
    await until(() => stored()?.people.length === 1);
    // b still holds the empty list it read, on version 0.
    expect(b.h.list!.people).toHaveLength(0);
    await act(async () => { b.h.save(addNamed("Imran Khan")); });
    await until(() => stored()?.people.length === 2);
    expect(stored()!.people.map((p) => [p.code, p.name])).toEqual([["P001", "Priya Sharma"], ["P002", "Imran Khan"]]);
    expect(stored()!.next).toBe(3);
    await until(() => b.h.list!.people.length === 2);
    expect(listFor("p1")!.people.map((p) => p.code)).toEqual(["P001", "P002"]);
  });

  it("a failed read is state error, not loading forever: no list, save refuses, nothing is sent (R20)", async () => {
    server.failGet = true;
    const m = await mountHook();
    await until(() => m.h.state === "error");
    expect(gets().length).toBeGreaterThan(0);
    expect(m.h.list).toBeNull();
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    await sleep(50);
    expect(puts()).toEqual([]);
    expect(listFor("p1")).toBeNull();
  });

  it("saveFailed (R24): a save the server does not take keeps the list shown and reports it; the next save that lands clears it", async () => {
    const m = await mountHook();
    await until(() => m.h.state === "ready");
    expect(m.h.saveFailed).toBe(false);
    server.failPut = true;
    await act(async () => { m.h.save(addNamed("Priya Sharma")); });
    await until(() => m.h.saveFailed);
    // The list the student made is still there, and the tab is still ready: only the save did not land.
    expect(m.h.state).toBe("ready");
    expect(m.h.list!.people.map((p) => p.code)).toEqual(["P001"]);
    expect(stored()).toBeNull();
    server.failPut = false;
    await act(async () => { m.h.save(addNamed("Rahul Verma")); });
    await until(() => stored() !== null && !m.h.saveFailed);
    expect(stored()!.people.map((p) => p.code)).toEqual(["P001", "P002"]);
  });

  it("saveFailed is false for a failed read (that is state error), for the vault off, and for a list that was saved", async () => {
    server.failGet = true;
    const bad = await mountHook();
    await until(() => bad.h.state === "error");
    expect(bad.h.saveFailed).toBe(false);
    bad.unmount();
    server.failGet = false;
    const m = await mountHook();
    await until(() => m.h.state === "ready");
    await act(async () => { m.h.save(addNamed("Priya Sharma")); });
    await until(() => puts().length === 1);
    expect(m.h.saveFailed).toBe(false);
    h.status = "off";
    await m.rerender();
    expect(m.h.state).toBe("off");
    expect(m.h.saveFailed).toBe(false);
  });

  it("retry() reads again: with the server back the state is ready with the stored list, and save works", async () => {
    const l = addPerson(emptyList(), { name: "Priya Sharma", spellings: ["Priya"], joined: "2026-10-24" }).list;
    seed("p1", l);
    server.failGet = true;
    const m = await mountHook();
    await until(() => m.h.state === "error");
    const before = gets().length;
    server.failGet = false;
    await act(async () => { m.h.retry(); });
    await until(() => m.h.state === "ready");
    expect(gets().length).toBeGreaterThan(before);
    expect(m.h.list).toEqual(l);
    expect(listFor("p1")).toEqual(l);
    await act(async () => { expect(m.h.save(addNamed("Imran Khan"))).toBe(true); });
    await until(() => stored()?.people.length === 2);
    expect(stored()!.people.map((p) => p.code)).toEqual(["P001", "P002"]);
  });

  it("retry() with the server still down stays in error, and a retry when the list is fine changes nothing", async () => {
    server.failGet = true;
    const m = await mountHook();
    await until(() => m.h.state === "error");
    await act(async () => { m.h.retry(); });
    await sleep(50);
    expect(m.h.state).toBe("error");
    server.failGet = false;
    await act(async () => { m.h.retry(); });
    await until(() => m.h.state === "ready");
    const reads = gets().length;
    await act(async () => { m.h.retry(); });
    await sleep(50);
    expect(m.h.state).toBe("ready");
    expect(gets().length).toBe(reads);
    expect(puts()).toEqual([]);
  });

  it("save refuses while the read is still in flight, and works once it lands", async () => {
    let release = () => {};
    server.gate = new Promise<void>((r) => { release = r; });
    const m = await mountHook();
    expect(m.h.state).toBe("loading");
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    await sleep(50);
    expect(m.h.list).toBeNull();
    expect(puts()).toEqual([]);
    await act(async () => { release(); });
    await until(() => m.h.state === "ready");
    // The refused save left nothing behind.
    expect(m.h.list).toEqual(emptyList());
    await act(async () => { expect(m.h.save(addNamed("Priya Sharma"))).toBe(true); });
    await until(() => stored()?.people.length === 1);
    expect(stored()!.people.map((p) => p.code)).toEqual(["P001"]);
  });

  it("a stored list that does not open is broken: save returns false, nothing is written, and the hook asks nothing (R21)", async () => {
    seed("p1", null, 'sealed:{"nope":true}');
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const m = await mountHook();
    await until(() => m.h.state === "broken");
    expect(m.h.list).toBeNull();
    expect(listFor("p1")).toBeNull();
    expect(m.h.save(addNamed("Priya Sharma"))).toBe(false);
    expect(m.h.save(addNamed("Imran Khan"))).toBe(false);
    // Past the save's debounce, so a held write would have gone out.
    await sleep(BLOB_SAVE_DEBOUNCE_MS + 200);
    expect(puts()).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    expect(m.h.state).toBe("broken");
    expect(server.blobs.get(key("p1", "participants"))!.body).toBe('sealed:{"nope":true}');
  });
});

// ---- R17: the participants kind is never stored in plaintext ----------------------------------------------------------------------------------------

describe("SEALED_ONLY (R17)", () => {
  type Mounted = { readonly b: ProjectBlob<any> };
  async function mountBlob(kind: "participants" | "qual_codes"): Promise<Mounted> {
    const box: { b: ProjectBlob<any> | null } = { b: null };
    function Probe() { box.b = useProjectBlob(kind, "p1"); return null; }
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    await act(async () => { root.render(<Probe />); });
    return { get b() { return box.b!; } };
  }

  it("holds participants, and no other kind", () => {
    expect(SEALED_ONLY.has("participants")).toBe(true);
    expect(SEALED_ONLY.has("qual_codes")).toBe(false);
    expect(SEALED_ONLY.has("design_ec")).toBe(false);
  });

  it("with the vault off, a participants save sends nothing, holds nothing, and the state reports a failed save", async () => {
    h.status = "off";
    const m = await mountBlob("participants");
    await until(() => !m.b.loading);
    act(() => { m.b.set(addPerson(emptyList(), { name: "Priya Sharma", spellings: [], joined: "2026-10-24" }).list); });
    let sent = true;
    await act(async () => { sent = await m.b.flush(); });
    expect(sent).toBe(false);
    expect(puts()).toEqual([]);
    expect(m.b.error).toBe(true);
    // Nothing is held for later: a window closing or the vault coming on does not send the names.
    roots.splice(0).forEach((r) => act(() => { r.unmount(); }));
    await sleep(20);
    expect(heldBlobs.take(blobId("p1", "participants"))).toBeFalsy();
    expect(puts()).toEqual([]);
  });

  it("with the vault off, every other kind still saves in plaintext as before (keyVersion 0)", async () => {
    h.status = "off";
    const m = await mountBlob("qual_codes");
    await until(() => !m.b.loading);
    act(() => { m.b.set([{ id: "q1", name: "Coping", parentId: null, color: "#fff" }]); });
    await act(async () => { await m.b.flush(); });
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body!.keyVersion).toBe(0);
  });

  it("with the vault open, participants saves sealed", async () => {
    const m = await mountBlob("participants");
    await until(() => !m.b.loading);
    act(() => { m.b.set(emptyList()); });
    await act(async () => { await m.b.flush(); });
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body!.keyVersion).toBe(1);
  });
});
