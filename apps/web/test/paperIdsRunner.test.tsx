// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredEntry } from "../lib/blobs/kinds";
import { heldBlobs } from "../lib/blobs/held";
import { createBlobServer, fakeVault, unlock, type FakeVault, type Server } from "./support/blobServer";
import { SDT_DOI, todayLibrary, todayShelf } from "./support/paperFixtures";

/*
 * The paper-id migration as the project shell starts it (wave B, Task 17, rulings B2-R4 to R6): once per project per unlock per tab, only when the vault is off or
 * unlocked and complete, never in a place's own window, and its citations step goes through the shell's shared library, so the panels that are open see the ids.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), vault: null as unknown }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" } }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", project: { id: "p1" } }) }));

import { CiteLibraryProvider, useLibrary, type Library } from "../lib/cite/useLibrary";
import { PAPER_IDS_WAIT_MS, PaperIdsRunner, resetPaperIdsRun } from "../components/frame/PaperIdsRunner";
import type { PaperIdsState } from "../lib/papers/migrate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let server: Server;
let states: string[];
const roots: Root[] = [];
const seen: { library: Library | null } = { library: null };

/** What an open panel reads: the shell's shared library, passively (it never asks for the passphrase). */
function Panel() {
  const library = useLibrary({ passive: true });
  useEffect(() => { seen.library = library; });
  return null;
}
async function mount(): Promise<{ rerender(): Promise<void> }> {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const render = () => root.render(
    <CiteLibraryProvider><PaperIdsRunner onState={(pid: string, s: PaperIdsState) => states.push(pid + ":" + s)} /><Panel /></CiteLibraryProvider>
  );
  await act(async () => { render(); });
  return { rerender: async () => { await act(async () => { render(); }); } };
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const last = () => states.at(-1);
/** The calls made since the `from`th that are the migration's: everything but the shell's library reading its own blob, which it does whether or not the migration runs. */
const migrationCalls = (from: number) => server.calls.slice(from).filter((c) => !(c.method === "GET" && c.path.endsWith("/blobs/citations")));

/** Today's library and reading list, plain (the vault is off) or sealed under `vault`. */
async function seedPlain(vault?: FakeVault) {
  const lib = await todayLibrary();
  const { index, papers } = todayShelf();
  const put = (kind: string, value: unknown) => (vault ? server.putSealed(vault, kind, value) : Promise.resolve(server.putPlain(kind, value)));
  await put("citations", lib);
  await put("shelf_index", index);
  for (const [id, p] of Object.entries(papers)) await put("shelf_paper:" + id, p);
  server.vaultExists = !!vault;
  return { lib, index };
}

beforeEach(async () => {
  server = createBlobServer("p1");
  h.vault = await fakeVault({ status: "off" });
  h.api.mockReset().mockImplementation(server.api);
  states = [];
  seen.library = null;
  heldBlobs.clear();
  resetPaperIdsRun();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("the shell starts the migration", () => {
  it("with the vault off it runs at once, writes the ids through the shared library, and the open panels see them without reloading", async () => {
    const { lib } = await seedPlain();
    await mount();
    await until(() => last() === "p1:done");
    const stored = (await server.value<StoredEntry[]>("citations"))!;
    expect(stored).toHaveLength(lib.length);
    expect(stored.every((e) => /^k[0-9a-z]+$/.test(e.pid ?? ""))).toBe(true);
    // The panel that is open reads the same blob the migration wrote through: the ids are there with no remount.
    expect(seen.library!.lib.map((e) => (e as StoredEntry).pid)).toEqual(stored.map((e) => e.pid));
    // One write of the library, by the shell's client; the reading list is linked to those very ids.
    expect(server.puts("citations")).toHaveLength(1);
    const index = (await server.value<{ pid?: string; doi?: string }[]>("shelf_index"))!;
    expect(index[0]!.pid).toBe(stored.find((e) => e.doi === SDT_DOI)!.pid);
    expect(states[0]).toBe("p1:running");
  });

  it("settles as done with nothing to write, and sends no PUT", async () => {
    await mount();
    await until(() => last() === "p1:done");
    expect(server.puts()).toEqual([]);
  });

  it("runs once per project per tab: another mount of the shell finds it done and reads nothing", async () => {
    await seedPlain();
    await mount();
    await until(() => last() === "p1:done");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    states = [];
    const calls = server.calls.length;
    await mount();
    await until(() => last() === "p1:done");
    // The shell's library reads its own blob as it mounts; the migration itself reads and writes nothing.
    expect(migrationCalls(calls)).toEqual([]);
  });

  it("a locked vault is settled as locked at once and nothing is read; the unlock runs it", async () => {
    const vault = await fakeVault({ status: "unlocked", complete: true });
    h.vault = vault;
    await seedPlain(vault);
    vault.lock();
    server.calls.length = 0;
    const m = await mount();
    await until(() => last() === "p1:locked");
    expect(server.calls).toEqual([]);
    expect(vault.prompts).toBe(0);
    // The passphrase is typed (anywhere: the header pill, the document): the shell renders again with the vault open.
    unlock(vault);
    await m.rerender();
    await until(() => last() === "p1:done");
    const stored = (await server.value<StoredEntry[]>("citations", vault))!;
    expect(stored.every((e) => !!e.pid)).toBe(true);
    expect(server.find("citations")!.keyVersion).toBeGreaterThanOrEqual(1);
    expect(vault.prompts).toBe(0);
  });

  it.each([["migrating", { status: "migrating" as const }], ["unlocked but not complete", { status: "unlocked" as const, complete: false }]])(
    "a vault %s is settled as busy, so a tab does not wait for it, and nothing is read",
    async (_n, o) => {
      h.vault = await fakeVault(o);
      server.calls.length = 0;
      await mount();
      await until(() => last() === "p1:busy");
      expect(migrationCalls(0)).toEqual([]);
    }
  );

  it("never in a place's own window", async () => {
    await seedPlain();
    server.calls.length = 0;
    window.history.replaceState(null, "", "/p/p1/lit/find?window=1");
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(server.calls.filter((c) => c.path.includes("/blobs/") && c.method === "PUT")).toEqual([]);
    expect(states).not.toContain("p1:running");
  });

  it("a stage check that cannot be made means no write at all, and busy", async () => {
    await seedPlain();
    const real = server.api;
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/projects?")) throw new Error("offline");
      return real(path, init);
    });
    await mount();
    await until(() => last() === "p1:busy");
    expect(server.puts()).toEqual([]);
  });

  it("a tab is not kept waiting: after a while the run is reported as busy while it carries on", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const real = server.api;
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/blobs/citations")) await gate;
      return real(path, init);
    });
    await mount();
    expect(last()).toBe("p1:running");
    await act(async () => { await vi.advanceTimersByTimeAsync(PAPER_IDS_WAIT_MS + 10); });
    expect(last()).toBe("p1:busy");
    // The run carries on once the library answers, and settles as done (the timers are still the test's).
    release();
    for (let i = 0; i < 200 && last() !== "p1:done"; i++) await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(last()).toBe("p1:done");
  });
});
