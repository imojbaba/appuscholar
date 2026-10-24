// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeLibrary, type CitationEntry } from "@appuscholar/core";
import type { StoredEntry } from "../lib/blobs/kinds";
import { createBlobServer, fakeVault, type FakeVault, type Server } from "./support/blobServer";
import { importedFromV1 } from "./support/paperFixtures";

/*
 * The library writes every kept paper with its id (wave B, Task 17): whatever changes the library (a Keep, the citation form, the capture, a library file import, the classic
 * sources, a Crossref fill) goes through useLibrary().update, which gives an entry without a pid one. The blob is the real client over a fake api.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), vault: null as unknown }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" } }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", project: { id: "p1" } }) }));

import { CiteLibraryProvider, useLibrary, type Library } from "../lib/cite/useLibrary";
import { citeImport, citeLoadClassics } from "../lib/cite/share";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let server: Server;
let vault: FakeVault;
const roots: Root[] = [];
const box: { library: Library | null } = { library: null };

function Probe() {
  const library = useLibrary();
  useEffect(() => { box.library = library; });
  return null;
}
async function mount(): Promise<Library> {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<CiteLibraryProvider><Probe /></CiteLibraryProvider>); });
  for (let i = 0; i < 200 && box.library!.loading; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  return box.library!;
}
const lib = () => box.library!;
const flush = () => act(async () => { await lib().flush(); });
const stored = async () => (await server.value<StoredEntry[]>("citations")) ?? [];

const A: CitationEntry = { author: "Lee, Kim", year: "2021", title: "Sleep and mood in first-year students", source: "Journal of Sleep", doi: "10.1/a", type: "Journal article", style: "apa" };
const B: CitationEntry = { author: "Rao, Priya", year: "2019", title: "Exam stress and attention", source: "Stress and Health", type: "Journal article", style: "apa" };
const C: CitationEntry = { author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", source: "Erlbaum", doi: "10.4324/9780203771587", type: "Book", style: "apa" };

beforeEach(async () => {
  server = createBlobServer("p1");
  vault = await fakeVault({ status: "off" });
  h.vault = vault;
  h.api.mockReset().mockImplementation(server.api);
  box.library = null;
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });

describe("a pid for every library entry", () => {
  it("every library entry gets a pid once and keeps it across saves", async () => {
    await mount();
    act(() => { lib().add(A); });
    await flush();
    const first = (await stored())[0]!;
    expect(first).toMatchObject(A);
    expect(first.pid).toMatch(/^k[0-9a-z]+$/);

    act(() => { lib().add(B); });
    await flush();
    act(() => { lib().update((prev) => prev.map((e) => ({ ...e, source: e.source + " (checked)" }))); });
    await flush();
    act(() => { lib().fillEmpty((e) => e.title === B.title, { doi: "10.2/b" }); });
    await flush();
    const now = await stored();
    expect(now).toHaveLength(2);
    expect(now[0]!.pid).toBe(first.pid);
    expect(now[1]!.pid).toMatch(/^k[0-9a-z]+$/);
    expect(now[1]!.pid).not.toBe(first.pid);
    expect(now[1]).toMatchObject({ title: B.title, doi: "10.2/b", source: "Stress and Health (checked)" });
    // What the panels read has the pids too.
    expect(lib().lib.map((e) => (e as StoredEntry).pid)).toEqual(now.map((e) => e.pid));
  });

  it("an entry an older tab saves without a pid gets one on the next save, and the entries that had one keep it", async () => {
    // A tab on the build before this one saved B after the migration gave A its pid.
    server.putPlain("citations", [{ ...A, pid: "kmigrated01" }, B]);
    await mount();
    expect(lib().lib).toHaveLength(2);
    act(() => { lib().add(C); });
    await flush();
    const now = await stored();
    expect(now.map((e) => e.title)).toEqual([A.title, B.title, C.title]);
    expect(now[0]!.pid).toBe("kmigrated01");
    expect(now[1]!.pid).toMatch(/^k[0-9a-z]+$/);
    expect(now[2]!.pid).toMatch(/^k[0-9a-z]+$/);
    expect(new Set(now.map((e) => e.pid)).size).toBe(3);
  });

  it("a library file import and the classic sources get pids", async () => {
    await mount();
    const text = JSON.stringify(await importedFromV1());
    await act(async () => { await citeImport(new File([text], "psychology-class-library.json"), { lib: lib().lib, update: lib().update, t: (k) => k, toast: () => {}, read: async () => text }); });
    await flush();
    const afterImport = await stored();
    const merged = mergeLibrary([], JSON.parse(text));
    expect(afterImport).toHaveLength(merged.ok ? merged.lib.length : -1);
    expect(afterImport.length).toBeGreaterThanOrEqual(4);
    expect(afterImport.every((e) => /^k[0-9a-z]+$/.test(e.pid ?? ""))).toBe(true);

    act(() => { citeLoadClassics({ lib: lib().lib, update: lib().update, toast: () => {} }); });
    await flush();
    const all = await stored();
    expect(all.length).toBeGreaterThan(afterImport.length);
    expect(all.every((e) => /^k[0-9a-z]+$/.test(e.pid ?? ""))).toBe(true);
    expect(new Set(all.map((e) => e.pid)).size).toBe(all.length);
    // The first entries kept the pid they were given.
    expect(all.slice(0, afterImport.length).map((e) => e.pid)).toEqual(afterImport.map((e) => e.pid));
  });

  it("an authorless entry in a library file is still left out (v1's rule), and the rest are not", async () => {
    await mount();
    const text = JSON.stringify([{ title: "No author at all" }, { author: "Iyer, Karthik", title: "Measuring attention with mobile games" }]);
    await act(async () => { await citeImport(new File([text], "x.json"), { lib: lib().lib, update: lib().update, t: (k) => k, toast: () => {}, read: async () => text }); });
    await flush();
    const now = await stored();
    expect(now.map((e) => e.title)).toEqual(["Measuring attention with mobile games"]);
    expect(now[0]!.pid).toMatch(/^k/);
  });

  it("an entry is removed even from a copy that has no pid (the panel was showing the library before the ids arrived)", async () => {
    server.putPlain("citations", [{ ...A, pid: "kmigrated01" }, { ...B, pid: "kmigrated02" }]);
    await mount();
    act(() => { lib().remove(A); });
    await flush();
    expect((await stored()).map((e) => e.title)).toEqual([B.title]);
  });

  it("a broken library is not replaced unasked, and no pid is written over it", async () => {
    server.putPlain("citations", { not: "a library" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    expect(lib().broken).toBe(true);
    act(() => { lib().add(A); });
    await flush();
    expect(confirm).toHaveBeenCalled();
    expect(server.puts("citations")).toEqual([]);
    confirm.mockRestore();
  });
});
