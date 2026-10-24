// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookmarkletSourceV3, captureRecordV2 } from "@appuscholar/core";
import type { StoredEntry } from "../lib/blobs/kinds";
import en from "../messages/en.json";

/*
 * The adding screen (wave B Task 20, register row D-S2-125, walk faults W5, W6 and W13): the tab the bookmark opens. It shows the paper before anything else, asks for the passphrase only
 * when the student presses Keep it (and only if the vault is on and locked), then asks which project, keeps the paper through Task 18's keepEntry, says so, and closes the tab once the keep
 * is on the server. The workspace never renders in it. The bookmark itself is a section of Find ("Add from any journal page").
 */
type Blob = { value: StoredEntry[] | null; loading: boolean; locked: boolean; broken?: boolean; error?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
type Vault = { status: string; known: ReturnType<typeof vi.fn>; ensureUnlocked: ReturnType<typeof vi.fn>; decryptBody: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  api: vi.fn(),
  me: null as unknown as { id: string; activeProjectId: string | null; scratchProjectId: string },
  vault: null as unknown as Vault,
  /** One citations blob per project id. */
  blobs: {} as Record<string, Blob>,
  /** Every mounted useProjectBlob re-renders when a blob changes, as the real hook does. */
  listeners: new Set<() => void>()
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {} }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useEffect, useState } = await import("react");
  return {
    useProjectBlob: (kind: string, projectId: string | null) => {
      const [, bump] = useState(0);
      useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      return (kind === "citations" && projectId ? h.blobs[projectId] : undefined) ?? { value: null, loading: false, locked: false, set: () => {}, flush: async () => true };
    }
  };
});
vi.mock("@/components/workspace/dialogs/Passphrase", () => ({ PassphraseHost: () => <div data-testid="pass-host" /> }));
vi.mock("@/components/workspace/dialogs/VaultRecover", () => ({ VaultRecoverHost: () => <div data-testid="recover-host" /> }));
// The workspace must not render on /add: if the page mounted the shell, rendering it would throw.
vi.mock("@/components/frame/ProjectShell", () => ({ ProjectShell: () => { throw new Error("the project shell must not render on /add"); } }));

import { AddingPaper, CLOSE_AFTER_MS } from "../components/literature/AddingPaper";
import { AddFromPage } from "../components/literature/AddFromPage";
import AddPage from "../app/(app)/add/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const t = (k: string, vars?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, x: string) => (vars && x in vars ? String(vars[x]) : m));

/** The bookmarklet's hash for a payload, encoded as the bookmarklet encodes it (btoa of the UTF-8 JSON). */
const hashOf = (d: Record<string, string>) => "#capture=" + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(d)))));
/** What bookmarkletSourceV3 sends from a PubMed page. */
const PM = { title: "Sleep timing and exam anxiety in first-year students", author: "Schaefer EM; Gonzalez CB; Lee K", year: "2024", source: "Scientific reports", doi: "10.1038/s41598-024-00001-x", url: "https://pubmed.ncbi.nlm.nih.gov/41234567/", volume: "9", issue: "1", pages: "13317" };
const PM_ENTRY = captureRecordV2(PM);

const project = (id: string, title: string, over: Record<string, unknown> = {}) => ({ id, title, titleKeyVersion: 0, deks: [], field: "", stage: "idea", status: "active", contentLang: "en", kind: "project", ...over });
const PROJECTS = [project("p1", "Exam anxiety study"), project("p2", "ct:Thesis on sleep", { titleKeyVersion: 1, deks: [{ v: 1 }] }), project("p3", "Old project", { status: "complete" })];

function blob(value: StoredEntry[] | null, over: Partial<Blob> = {}): Blob {
  const b: Blob = { value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true), ...over };
  // The blob client applies an update to what it holds, as useProjectBlob's does.
  b.set.mockImplementation((u: StoredEntry[] | ((p: StoredEntry[] | null) => StoredEntry[])) => { b.value = typeof u === "function" ? u(b.value) : u; for (const l of h.listeners) l(); });
  return b;
}
/** The blob changed under the screen (a read landed, a failure cleared): every hook re-renders. */
async function changed() { await act(async () => { for (const l of h.listeners) l(); await Promise.resolve(); }); await settle(); }
const stored = (projectId: string) => h.blobs[projectId]!.value ?? [];

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function settle(ms = 0) {
  await act(async () => { if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms); else await new Promise((r) => setTimeout(r, ms)); });
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 300; i++) { if (pred()) return; await settle(vi.isFakeTimers() ? 5 : 5); }
  throw new Error("condition not reached");
}
async function mount(hash: string = hashOf(PM)) {
  window.history.replaceState(null, "", "/add" + hash);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<AddingPaper />); });
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await Promise.resolve(); }); await settle(); }
const choices = () => $$('[data-testid="add-choice"]');
const choiceNames = () => choices().map((c) => c.querySelector('[data-testid="add-choice-name"]')!.textContent);
const status = () => tid("add-status")!.textContent!;
/** Presses Keep it and, on the project list, the project whose name is `name`; waits for the list. */
async function keepIn(name: string) {
  await click(tid("add-keep"));
  await until(() => choices().length > 0);
  await until(() => choiceNames().includes(name));
  await click(choices()[choiceNames().indexOf(name)]!);
}

beforeEach(() => {
  h.me = { id: "u1", activeProjectId: "p2", scratchProjectId: "scratch" };
  h.vault = {
    status: "locked",
    known: vi.fn(async () => "locked"),
    ensureUnlocked: vi.fn(async () => { h.vault.status = "unlocked"; return true; }),
    decryptBody: vi.fn(async (d: { bodyHtml: string }) => d.bodyHtml.replace(/^ct:/, ""))
  };
  h.api.mockReset().mockImplementation(async (path: string) => {
    if (path === "/projects") return PROJECTS;
    throw new Error("unexpected request " + path);
  });
  h.blobs = { p1: blob([]), p2: blob([]), p3: blob([]), scratch: blob([]) };
  vi.spyOn(window, "close").mockImplementation(() => {});
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the adding screen shows the paper before any passphrase (W5)", () => {
  it("heading, title, authors, year and journal come from the address; nothing is asked, loaded or written yet", async () => {
    await mount();
    expect($("h1")!.textContent).toBe("Adding this paper");
    expect(tid("add-title")!.textContent).toBe(PM.title);
    const facts = tid("add-facts")!.textContent!;
    expect(facts).toContain("Schaefer, EM; Gonzalez, CB; Lee, K");
    expect(facts).toContain("2024");
    expect(facts).toContain("Scientific reports");
    expect(tid("add-keep")!.textContent).toBe("Keep it");
    expect(h.vault.known).not.toHaveBeenCalled();
    expect(h.vault.ensureUnlocked).not.toHaveBeenCalled();
    expect(h.api).not.toHaveBeenCalled();
    for (const b of Object.values(h.blobs)) expect(b.set).not.toHaveBeenCalled();
    // The unlock window can open in this tab.
    expect(tid("pass-host")).not.toBeNull();
    expect(tid("recover-host")).not.toBeNull();
  });

  it("what the page did not give reads Not found on that page, never a blank or a guess", async () => {
    await mount(hashOf({ title: "A paper with only a title", author: "", year: "", source: "", doi: "", url: "" }));
    const dds = $$('[data-testid="add-facts"] dd').map((d) => d.textContent);
    expect(dds).toEqual([t("add_not_found"), t("add_not_found"), t("add_not_found")]);
  });

  it("W30: a year that is not four digits is not shown", async () => {
    await mount(hashOf({ ...PM, year: "09/1" }));
    expect(tid("add-facts")!.textContent).not.toContain("09/1");
  });

  it("an address with no paper, or one that cannot be read, says so and offers the project list", async () => {
    await mount("");
    expect(tid("add-keep")).toBeNull();
    expect(tid("add-none")!.textContent).toBe(t("add_none"));
    expect($('a[href="/"]')!.textContent).toBe(t("add_home"));
    act(() => { roots.splice(0)[0]!.unmount(); });
    document.body.innerHTML = "";
    await mount("#capture=%%%");
    expect(tid("add-keep")).toBeNull();
    expect(tid("add-none")!.textContent).toBe(t("add_unreadable"));
  });
});

describe("Keep it: the passphrase, then Choose a project", () => {
  it("a vault that is on and locked asks for the passphrase first; then the projects open, the current one first, the scratch space last", async () => {
    await mount();
    await click(tid("add-keep"));
    expect(h.vault.ensureUnlocked).toHaveBeenCalledTimes(1);
    await until(() => choices().length === 4);
    expect($("h2")!.textContent).toBe("Choose a project");
    // The sealed title is opened; the active project (p2) leads; finished projects come last; the scratch space is the last row.
    expect(choiceNames()).toEqual(["Thesis on sleep", "Exam anxiety study", "Old project", t("scratch_name")]);
    expect(choices()[0]!.textContent).toContain(t("add_current"));
    expect(choices()[1]!.textContent).not.toContain(t("add_current"));
    // The passphrase came before the list was asked for.
    expect(h.vault.ensureUnlocked.mock.invocationCallOrder[0]!).toBeLessThan(h.api.mock.invocationCallOrder[0]!);
    expect(tid("add-keep")).toBeNull();
  });

  it("a vault that is off asks for nothing", async () => {
    h.vault.status = "off";
    h.vault.known = vi.fn(async () => "off");
    h.api.mockImplementation(async () => [project("p1", "Exam anxiety study"), project("p2", "Thesis on sleep")]);
    await mount();
    await click(tid("add-keep"));
    await until(() => choices().length > 0);
    expect(h.vault.ensureUnlocked).not.toHaveBeenCalled();
    expect(choiceNames()).toEqual(["Thesis on sleep", "Exam anxiety study", t("scratch_name")]);
  });

  it("Keep it is busy while the passphrase is asked: a second press does not ask again", async () => {
    let answer!: (ok: boolean) => void;
    h.vault.ensureUnlocked = vi.fn(() => new Promise<boolean>((r) => { answer = (ok) => { h.vault.status = "unlocked"; r(ok); }; }));
    await mount();
    await click(tid("add-keep"));
    await click(tid("add-keep"));
    expect(h.vault.ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(tid("add-keep")!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { answer(true); await Promise.resolve(); });
    await until(() => choices().length > 0);
  });

  it("a passphrase left unanswered keeps nothing and says what is needed; Keep it asks again", async () => {
    h.vault.ensureUnlocked = vi.fn(async () => false);
    await mount();
    await click(tid("add-keep"));
    expect(status()).toContain(t("add_locked"));
    expect(choices()).toHaveLength(0);
    expect(h.api).not.toHaveBeenCalled();
    h.vault.ensureUnlocked = vi.fn(async () => { h.vault.status = "unlocked"; return true; });
    await click(tid("add-keep"));
    await until(() => choices().length > 0);
    expect(status()).not.toContain(t("add_locked"));
  });

  it("a project list that cannot be loaded says so, and Try again loads it", async () => {
    let fail = true;
    h.api.mockImplementation(async (path: string) => { if (path === "/projects" && !fail) return PROJECTS; throw new Error("offline"); });
    await mount();
    await click(tid("add-keep"));
    await until(() => !!tid("add-projects-fail"));
    expect(tid("add-projects-fail")!.textContent).toContain(t("add_projects_fail"));
    fail = false;
    await click(tid("add-projects-retry"));
    await until(() => choices().length > 0);
  });

  it("every project button is a 44 px target on a phone (the rule is in the stylesheet block)", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const start = css.indexOf("/* Adding this paper (wave B Task 20");
    const end = css.indexOf("/* end Adding this paper */");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\brgba?\(/);
    expect(block).toMatch(/var\(--/);
    expect(block).not.toMatch(/(^|[;{\s])width:\s*\d+px/m);
    expect(block).toMatch(/\.addpaper-choice[^{]*\{[^}]*min-height:\s*44px/);
    expect(block).toMatch(/\.addpaper-keep[^{]*\{[^}]*min-height:\s*44px/);
    expect(block).toMatch(/@media \(max-width: 700px\)/);
  });
});

describe("choosing a project keeps the paper through keepEntry", () => {
  it("the paper joins that project's library with a pid and on the reading list; the tab closes only after the keep is on the server (B2-R16)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let release!: (ok: boolean) => void;
    h.blobs.p1!.flush = vi.fn(() => new Promise<boolean>((r) => { release = r; }));
    await mount();
    await keepIn("Exam anxiety study");
    expect(stored("p1")).toHaveLength(1);
    expect(stored("p1")[0]).toMatchObject({ ...PM_ENTRY, rl: true, pid: expect.stringMatching(/^k/) });
    // Nothing else was written, and the other projects were not touched.
    expect(h.blobs.p2!.set).not.toHaveBeenCalled();
    // Still saving: no "Kept" yet, and the tab is not closed, however long it waits.
    expect(status()).toContain(t("add_keeping", { project: "Exam anxiety study" }));
    await settle(CLOSE_AFTER_MS * 3);
    expect(window.close).not.toHaveBeenCalled();
    expect(tid("add-back")).toBeNull();
    // The flush answered: Kept in {project}, Back to my project, and the tab closes a moment later.
    await act(async () => { release(true); await Promise.resolve(); });
    await settle();
    expect(status()).toContain("Kept in Exam anxiety study.");
    expect(tid("add-back")!.textContent).toBe("Back to my project");
    expect(tid("add-back")!.getAttribute("href")).toBe("/p/p1");
    expect(window.close).not.toHaveBeenCalled();
    await settle(CLOSE_AFTER_MS);
    expect(window.close).toHaveBeenCalledTimes(1);
    // The tab stayed open (the browser would not close it): the student is told they can.
    expect(tid("add-close")!.textContent).toBe("You can close this tab.");
  });

  it("the scratch space is a place to keep it too, and its way back is the writing place", async () => {
    await mount();
    await keepIn(t("scratch_name"));
    await until(() => !!tid("add-back"));
    expect(stored("scratch")).toHaveLength(1);
    expect(tid("add-back")!.getAttribute("href")).toBe("/p/scratch/writing");
  });

  it("a keep the server did not take is not said to be kept, and the tab is not closed; Try again saves it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.blobs.p1!.flush = vi.fn(async () => false);
    await mount();
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-unsaved"));
    expect(status()).toContain(t("add_unsaved"));
    expect(status()).not.toContain("Kept in");
    await settle(CLOSE_AFTER_MS * 3);
    expect(window.close).not.toHaveBeenCalled();
    h.blobs.p1!.flush.mockImplementation(async () => true);
    await click(tid("add-unsaved-retry"));
    await until(() => !!tid("add-back"));
    expect(status()).toContain("Kept in Exam anxiety study.");
    // The retry only sends what is held; it keeps nothing a second time.
    expect(stored("p1")).toHaveLength(1);
    await settle(CLOSE_AFTER_MS);
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("waits for the library to be read before it decides anything", async () => {
    h.blobs.p1 = blob(null, { loading: true });
    await mount();
    await keepIn("Exam anxiety study");
    expect(status()).toContain(t("add_keeping", { project: "Exam anxiety study" }));
    expect(h.blobs.p1.set).not.toHaveBeenCalled();
    expect(tid("add-back")).toBeNull();
    // The read lands: the paper is kept on what was read, once.
    h.blobs.p1.loading = false;
    h.blobs.p1.value = [{ ...PM_ENTRY, doi: "10.1/other", title: "A different paper that was already kept earlier", pid: "kx", rl: true } as StoredEntry];
    await changed();
    await until(() => !!tid("add-back"));
    expect(h.blobs.p1.set).toHaveBeenCalledTimes(1);
    expect(stored("p1")).toHaveLength(2);
    expect(status()).toContain("Kept in Exam anxiety study.");
  });
});

describe("keeping a paper twice says it is already kept (R15)", () => {
  it("the same paper is already kept, nothing is added, and the tab still closes after its flush", async () => {
    h.blobs.p1 = blob([{ ...PM_ENTRY, pid: "kold", rl: true } as StoredEntry]);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mount();
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-back"));
    expect(status()).toContain(t("add_already", { project: "Exam anxiety study" }));
    expect(status()).not.toContain("Kept in");
    expect(h.blobs.p1.set).not.toHaveBeenCalled();
    expect(stored("p1")).toHaveLength(1);
    expect(h.blobs.p1.flush).toHaveBeenCalled();
    await settle(CLOSE_AFTER_MS);
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("\"Smith JA\" and \"Smith, JA\" captures of one paper are one: the DOI decides", async () => {
    await mount(hashOf({ ...PM, author: "Smith JA" }));
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-back"));
    expect(status()).toContain("Kept in Exam anxiety study.");
    act(() => { roots.splice(0)[0]!.unmount(); });
    document.body.innerHTML = "";
    await mount(hashOf({ ...PM, author: "Smith, JA", title: "The same paper, titled another way" }));
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-back"));
    expect(status()).toContain(t("add_already", { project: "Exam anxiety study" }));
    expect(stored("p1")).toHaveLength(1);
  });

  it("a kept paper with no authors gets them from the capture, and the screen says so with wave A's sentence (W1 does not regress)", async () => {
    const authorless: StoredEntry = { ...PM_ENTRY, author: "", volume: "", issue: "", pages: "", pid: "kold", rl: true };
    h.blobs.p1 = blob([authorless]);
    await mount();
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-back"));
    expect(status()).toContain(t("add_already", { project: "Exam anxiety study" }));
    expect(status()).toContain(t("cap_filled", { title: PM.title }));
    expect(stored("p1")).toHaveLength(1);
    expect(stored("p1")[0]).toMatchObject({ pid: "kold", author: "Schaefer, EM; Gonzalez, CB; Lee, K", volume: "9", issue: "1", pages: "13317" });
  });
});

describe("a library that cannot be used", () => {
  it("a library that does not open on this device is never written, and says so", async () => {
    h.blobs.p1 = blob(null, { broken: true });
    await mount();
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-failed"));
    expect(status()).toContain(t("vault_cite_broken"));
    expect(h.blobs.p1.set).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
    expect(tid("add-retry")).toBeNull();
  });

  it("a library that could not be read says the paper was not kept, and Try again reads it again", async () => {
    h.blobs.p1 = blob(null, { error: true });
    await mount();
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-failed"));
    expect(status()).toContain(t("add_keep_fail"));
    expect(h.blobs.p1.set).not.toHaveBeenCalled();
    h.blobs.p1 = blob([]);
    await click(tid("add-retry"));
    await until(() => !!tid("add-back"));
    expect(stored("p1")).toHaveLength(1);
  });
});

describe("the adding tab never shows the workspace and offers Back to my project (W13)", () => {
  it("only the adding screen is drawn: no header, no frame, no document, no place", async () => {
    await mount();
    await keepIn("Exam anxiety study");
    await until(() => !!tid("add-back"));
    for (const id of ["frame", "wordmark", "app-header", "document-card", "panel-find", "project-list"]) expect(tid(id), id).toBeNull();
    expect($$("header, nav")).toHaveLength(0);
    expect($$("main")).toHaveLength(1);
    expect(tid("adding-paper")).not.toBeNull();
  });

  it("the /add page is the adding screen alone: the project shell is never mounted", async () => {
    const el = document.body.appendChild(document.createElement("div"));
    const root = createRoot(el);
    roots.push(root);
    window.history.replaceState(null, "", "/add" + hashOf(PM));
    await act(async () => { root.render(<AddPage />); });
    expect(tid("adding-paper")).not.toBeNull();
  });
});

describe("Add from any journal page (W6)", () => {
  it("the heading, the line and the button read as the canvas gives them; the button is a link whose href is the bookmark for this address", async () => {
    const el = document.body.appendChild(document.createElement("div"));
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<AddFromPage />); });
    expect($("h2")!.textContent).toBe("Add from any journal page");
    expect(el.textContent).toContain("Drag this button to your bookmarks bar. On a paper's page, click it to keep that paper here.");
    const a = tid("add-bookmark") as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.textContent).toContain("Keep in Appuscholar");
    expect(a.getAttribute("href")).toBe("javascript:" + encodeURIComponent(bookmarkletSourceV3(window.location.origin)));
    expect(decodeURIComponent(a.getAttribute("href")!.slice("javascript:".length))).toContain(window.location.origin + "/add#capture=");
    expect(a.getAttribute("draggable")).toBe("true");
    // A click does nothing (the student drags it); it does not follow the javascript: address.
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("no emoji in the section's words", () => {
    for (const k of ["addpage_h", "addpage_line", "addpage_btn"]) expect(E[k], k).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("the new words", () => {
  it("no emoji, no em-dash, in any of them, in either language", async () => {
    const hi = (await import("../messages/hi.json")).default as Record<string, string>;
    const keys = Object.keys(E).filter((k) => /^(add_|addpage_)/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(24);
    for (const k of keys) {
      for (const s of [E[k]!, hi[k]!]) {
        expect(s, k).toBeTruthy();
        expect(s, k).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(s, k).not.toContain("—");
      }
    }
    // Student-facing words that are banned from new copy.
    for (const k of keys) expect(E[k], k).not.toMatch(/Matrix|Shelf|Quick read|Pop out/);
  });
});
