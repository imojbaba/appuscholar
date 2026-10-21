// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), go: vi.fn(async () => true),
  vault: null as unknown,
  me: { id: "u1", activeProjectId: "p1", scratchProjectId: "s1" }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {}, update: async () => undefined, reload: async () => undefined }) }));
vi.mock("@/lib/vault/useVault", async (orig) => ({ ...(await orig<typeof import("../lib/vault/useVault")>()), useVault: () => h.vault }));
// The title is plain here (titles.test pins sealed ones).
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
const project = { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [], field: "Psychology", stage: "idea", status: "active", contentLang: "en", kind: "research" };
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project, projectId: "p1", go: h.go, place: null }) }));

import { ProjectHome, highlightCache } from "../components/frame/ProjectHome";
import { heldBlobs } from "../lib/blobs/held";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; heldBlobs.clear(); highlightCache.clear(); vi.useRealTimers(); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => q(id)?.textContent ?? "";
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = createRoot(el);
  roots.push(r);
  act(() => { r.render(<ProjectHome />); });
  return r;
}
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));

const vaultOff = { status: "off", known: async () => "off", ensureUnlocked: async () => true, decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml, encryptBody: async () => { throw new Error("unused"); } };
const READ = "Time: Medium. One semester is tight.\nPeople: High. Volunteers are easy to find.\nEthics: Low. The committee meets monthly.\nVerdict: go ahead, with two changes";

/** What the server holds: the project's work and its blobs by kind; `keyVersion` 1 makes every blob sealed. */
let server: { marks: Record<string, { readyAt: string }>; blobs: Record<string, { value: unknown; updatedAt: string; version?: number }>; keyVersion: number; workFails: number; blobFails: Record<string, number> };
const work = () => [{
  ...project, userId: "u1", createdAt: "2026-10-01T00:00:00Z", stageMarks: server.marks, documentCount: 1, lastEditedAt: null,
  blobs: Object.entries(server.blobs).map(([kind, b]) => ({ kind, updatedAt: b.updatedAt, version: b.version ?? 1 })), draftWords: 423, draftEditedAt: "2026-10-10T00:00:00Z"
}];
beforeEach(() => {
  h.vault = vaultOff;
  h.go.mockClear();
  h.toast.mockClear();
  server = {
    marks: {}, keyVersion: 0, workFails: 0, blobFails: {},
    blobs: {
      idea_intake: { value: { topic: "Does a fixed bedtime lower exam anxiety?", resources: "About 60 volunteers", timeframe: "One semester", constraints: "No trackers", read: { text: READ, at: "2026-10-05T00:00:00Z" } }, updatedAt: "2026-10-05T00:00:00Z" },
      citations: { value: [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }], updatedAt: "2026-10-20T10:00:00Z" },
      shelf_index: { value: [{ id: "sp1", title: "Schaefer 2019", file: "s.pdf", size: 1, added: "2026-10-06", total: 3, kept: 3 }], updatedAt: "2026-10-06T00:00:00Z" },
      "shelf_paper:sp1": { value: { pages: ["p"], notes: [{ id: "n1", page: 1, quote: "q", note: "", at: "x" }, { id: "n2", page: 2, quote: "r", note: "", at: "y" }], cells: {} }, updatedAt: "2026-10-06T00:00:00Z" }
    }
  };
  h.api.mockReset();
  h.api.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === "/projects?include=work") {
      if (server.workFails > 0) { server.workFails--; throw new Error("network"); }
      return work();
    }
    const mark = /^\/projects\/p1\/stages\/(\w+)\/ready$/.exec(path);
    if (mark) {
      if (init?.method === "POST") server.marks[mark[1]!] = { readyAt: "2026-10-21T09:00:00Z" };
      else delete server.marks[mark[1]!];
      return project;
    }
    const blob = /^\/projects\/p1\/blobs\/(.+)$/.exec(path);
    if (blob) {
      const kind = decodeURIComponent(blob[1]!);
      const b = server.blobs[kind];
      if ((server.blobFails[kind] ?? 0) > 0) { server.blobFails[kind]!--; const { ApiError } = await import("../lib/api"); throw new ApiError(500, "server"); }
      if (!b) { const { ApiError } = await import("../lib/api"); throw new ApiError(404, "not-found"); }
      return { kind, body: server.keyVersion ? "sealed-" + kind : JSON.stringify(b.value), keyVersion: server.keyVersion, deks: [], updatedAt: b.updatedAt, version: b.version ?? 1 };
    }
    throw new Error("unexpected " + path);
  });
});

describe("the project home", () => {
  it("the home reads every project's states from one request", async () => {
    mount();
    await until(() => text("home-detail-lit").includes("2 highlights"));
    const urls = h.api.mock.calls.map(([u]) => u as string);
    expect(urls.filter((u) => /\/projects\?include=work$/.test(u))).toHaveLength(1);
    expect(urls.filter((u) => /\/projects\/[^/]+\/blobs$/.test(u))).toHaveLength(0);
    expect(text("home-detail-lit")).toBe(fill(en.detail_lit, { kept: 4, read: 1, highlights: 2, cards: 0 }));
    expect(text("home-detail-idea")).toBe(fill(en.detail_idea, { verdict: "go ahead, with two changes" }));
    expect(text("home-detail-writing")).toBe(fill(en.detail_writing, { words: 423 }));
    expect(text("home-state-idea")).toBe(en.state_in_progress);
    expect(text("home-state-lit")).toBe(en.state_in_progress);
  });

  it("the question card shows the four facts and the verdict; Edit and the suggestion go through go()", async () => {
    mount();
    await until(() => !!q("home-question"));
    expect(text("home-q-text")).toBe("Does a fixed bedtime lower exam anxiety?");
    expect(q("home-question")!.querySelector("dl")!.textContent).toBe("PeopleAbout 60 volunteersTimeOne semesterLimitsNo trackersFieldPsychology");
    expect(text("home-q-verdict")).toBe(fill(en.home_verdict, { verdict: "go ahead, with two changes" }));
    await until(() => text("home-next-say") === fill(en.next_read, { n: 2 }));
    expect(text("home-next-btn")).toBe(en.next_btn_reading);
    act(() => { q("home-next-btn")!.click(); });
    expect(h.go).toHaveBeenLastCalledWith("/p/p1/lit/reading");
    act(() => { q("home-q-edit")!.click(); });
    expect(h.go).toHaveBeenLastCalledWith("/p/p1/idea");
    act(() => { q("home-open-writing")!.click(); });
    expect(h.go).toHaveBeenLastCalledWith("/p/p1/writing");
  });

  it("Mark ready, then an edit in that stage, shows Reopened, from the server's times with the device clock hours off", async () => {
    // The device clock is seven hours behind the server's: the states come from the server's times alone.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T02:00:00Z"));
    const r = mount();
    await until(() => text("home-state-lit") === en.state_in_progress);
    expect(text("home-open-lit")).toBe(en.home_act_continue);
    act(() => { q("home-more-lit")!.click(); });
    expect(text("home-mark-lit")).toBe(en.home_mark_ready);
    await act(async () => { q("home-mark-lit")!.click(); });
    await until(() => text("home-state-lit") === en.state_ready);
    expect(h.api).toHaveBeenCalledWith("/projects/p1/stages/lit/ready", { method: "POST" });
    expect(text("home-open-lit")).toBe(en.home_act_reopen);

    // A paper kept after the mark: the next visit home shows the stage reopened, and it can be marked ready again.
    server.blobs.citations!.updatedAt = "2026-10-21T10:00:00Z";
    act(() => { r.unmount(); });
    mount();
    await until(() => text("home-state-lit") === en.state_reopened);
    expect(text("home-open-lit")).toBe(en.home_act_continue);
    act(() => { q("home-more-lit")!.click(); });
    expect(text("home-mark-lit")).toBe(en.home_mark_ready);
  });

  it("Not ready yet takes the mark back", async () => {
    server.marks.idea = { readyAt: "2026-10-21T09:00:00Z" };
    mount();
    await until(() => text("home-state-idea") === en.state_ready);
    act(() => { q("home-more-idea")!.click(); });
    expect(text("home-mark-idea")).toBe(en.home_mark_unready);
    await act(async () => { q("home-mark-idea")!.click(); });
    await until(() => text("home-state-idea") !== en.state_ready);
    expect(h.api).toHaveBeenCalledWith("/projects/p1/stages/idea/ready", { method: "DELETE" });
  });

  it("stages not built yet say so in words", async () => {
    mount();
    await until(() => !!q("home-stages"));
    for (const s of ["design", "collect", "review"]) {
      expect(text("home-detail-" + s)).toBe(en.detail_not_built);
      expect(text("home-state-" + s)).toBe(en.state_not_started);
      expect(text("home-open-" + s)).toBe(en.home_act_open);
    }
    expect(document.body.textContent).not.toMatch(/Needs your attention|Recent work/);
  });

  it("a locked vault shows the unlock sentence, never empty cards; the home opens after the passphrase", async () => {
    let passphrase = false;
    const unlocked = { ...vaultOff, status: "unlocked", known: async () => "unlocked", decryptBody: async (d: { bodyHtml: string }) => JSON.stringify(server.blobs[d.bodyHtml.replace(/^sealed-/, "")]!.value) };
    const ensureUnlocked = vi.fn(async () => { if (!passphrase) return false; h.vault = unlocked; return true; });
    h.vault = { ...vaultOff, status: "locked", known: async () => "locked", ensureUnlocked, decryptBody: async () => { throw new Error("vault-locked"); } };
    server.keyVersion = 1;
    const r = mount();
    await until(() => !!q("home-locked"));
    expect(text("home-locked")).toContain(en.home_locked);
    expect(q("home-question")).toBeNull();
    expect(q("home-stages")).toBeNull();
    expect(q("home-next")).toBeNull();
    const before = ensureUnlocked.mock.calls.length;
    passphrase = true;
    await act(async () => { q("home-unlock")!.click(); });
    expect(ensureUnlocked.mock.calls.length).toBeGreaterThan(before);
    // The vault's status moves on (its provider re-renders the page): the home opens.
    act(() => { r.render(<ProjectHome />); });
    await until(() => text("home-q-text") === "Does a fixed bedtime lower exam anxiety?");
    expect(q("home-locked")).toBeNull();
    await until(() => text("home-detail-lit").includes("2 highlights"));
  });

  it("highlight counts are read once per paper version: a repeat visit reads none, a changed version re-reads only that paper", async () => {
    server.blobs.shelf_index!.value = [...(server.blobs.shelf_index!.value as unknown[]), { id: "sp2", title: "Lee 2021", file: "l.pdf", size: 1, added: "2026-10-07", total: 2, kept: 2 }];
    server.blobs["shelf_paper:sp2"] = { value: { pages: ["p"], notes: [{ id: "m1", page: 1, quote: "q", note: "", at: "x" }], cells: {} }, updatedAt: "2026-10-07T00:00:00Z", version: 4 };
    const paperReads = () => h.api.mock.calls.map(([u]) => u as string).filter((u) => u.includes("/blobs/shelf_paper"));
    let r = mount();
    await until(() => text("home-detail-lit").includes("3 highlights"));
    expect(paperReads().sort()).toEqual(["/projects/p1/blobs/shelf_paper%3Asp1", "/projects/p1/blobs/shelf_paper%3Asp2"]);

    act(() => { r.unmount(); });
    h.api.mockClear();
    r = mount();
    await until(() => text("home-detail-lit").includes("3 highlights"));
    await act(async () => { await new Promise((res) => setTimeout(res, 50)); });
    expect(h.api.mock.calls.map(([u]) => u as string)).toContain("/projects?include=work");
    expect(paperReads()).toEqual([]);

    // sp2 gains two highlights: its version moves on, and only it is read again.
    server.blobs["shelf_paper:sp2"]!.value = { pages: ["p"], notes: [{ id: "m1", page: 1, quote: "q", note: "", at: "x" }, { id: "m2", page: 1, quote: "r", note: "", at: "y" }, { id: "m3", page: 1, quote: "s", note: "", at: "z" }], cells: {} };
    server.blobs["shelf_paper:sp2"]!.version = 5;
    act(() => { r.unmount(); });
    h.api.mockClear();
    mount();
    await until(() => text("home-detail-lit").includes("5 highlights"));
    expect(paperReads()).toEqual(["/projects/p1/blobs/shelf_paper%3Asp2"]);
    expect(highlightCache.has("p1:sp2:4")).toBe(false);
    expect(highlightCache.get("p1:sp2:5")).toBe(3);
  });

  it("a failed load of the project's work shows the error line with Retry, never a spinner for good", async () => {
    server.workFails = 1;
    mount();
    await until(() => !!q("home-error"));
    expect(text("home-error")).toContain(en.home_load_fail);
    expect(q("home-loading")).toBeNull();
    expect(text("home-retry")).toBe(en.home_retry);
    await act(async () => { q("home-retry")!.click(); });
    await until(() => text("home-detail-writing") === fill(en.detail_writing, { words: 423 }));
    expect(q("home-error")).toBeNull();
  });

  it("a failed read of the idea shows the error line with Retry, never \"No question yet\"", async () => {
    server.blobFails.idea_intake = 1;
    mount();
    await until(() => !!q("home-error"));
    expect(text("home-error")).toContain(en.home_load_fail);
    expect(q("home-question")).toBeNull();
    expect(document.body.textContent).not.toContain(en.place_question_none);
    expect(document.body.textContent).not.toContain(en.detail_idea_none);
    await act(async () => { q("home-retry")!.click(); });
    await until(() => text("home-q-text") === "Does a fixed bedtime lower exam anxiety?");
    expect(q("home-error")).toBeNull();
  });

  it("a stored read that does not parse counts as checked: the card shows it as it came, and the suggestion moves on", async () => {
    (server.blobs.idea_intake!.value as { read: { text: string } }).read.text = "Looks doable in a term.\nAsk the school early.";
    mount();
    await until(() => !!q("home-question"));
    expect(text("home-q-verdict")).toBe("Looks doable in a term.\nAsk the school early.");
    expect(document.body.textContent).not.toContain(en.home_verdict_none);
    expect(text("home-detail-idea")).toBe(en.detail_idea_checked);
    await until(() => text("home-next-say") === fill(en.next_read, { n: 2 }));
  });

  it("Export project waits for the export place: disabled, and says where the account export is", async () => {
    mount();
    await until(() => !!q("home-export"));
    expect((q("home-export") as HTMLButtonElement).disabled).toBe(true);
    expect(q("home-export")!.title).toBe(en.home_out_soon);
  });
});
