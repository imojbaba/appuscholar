// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildShelfSummaryPromptV2, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

/*
 * Your take first, then the AI summary (wave B Task 28, register row D-S2-132; canvas Read). The reader's first tab asks for the student's own two lines before the AI summary opens
 * (twelve words), keeps both with the paper (`ap_notes` at `p:<pid>`: `take`, and `summary` with its time and whether the whole paper was sent), and shows them on return. It is mounted
 * through the reader over the real notes client, shelf store and library on a fake blob api that keeps versions as the server does (so a 409 replays, and a locked vault is a vault that
 * throws vault-locked). The engine is wave A's buildShelfSummaryPromptV2 with v1's options; this file checks the prompt is that one and the options are v1's.
 */

type SBlob = { projectId: string; kind: string; body: string; keyVersion: number; version: number };
const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), go: vi.fn(async (_href: string) => true), callAI: vi.fn(async (..._a: unknown[]) => "OK"), query: ""
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(h.query), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/lit/reading/ka" }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
/** A vault that is off, or on and locked (it throws vault-locked, as the real one does) or on and open. Bodies it seals are "sealed:" + the text, key version 1. */
const vault = {
  status: "off", sealed: false, locked: false,
  known: async () => (vault.sealed ? "on" : "off"),
  ensureUnlocked: async () => !vault.locked,
  encryptBody: async (_d: unknown, s: string) => { if (vault.locked) throw new Error("vault-locked"); return { bodyHtml: "sealed:" + s, keyVersion: 1 }; },
  decryptBody: async (d: { bodyHtml: string; keyVersion: number }) => {
    if (d.keyVersion === 0) return d.bodyHtml;
    if (vault.locked) throw new Error("vault-locked");
    return d.bodyHtml.replace(/^sealed:/, "");
  }
};
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", go: h.go, openExport: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" }, settings: { field: "education" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: vi.fn() }));

import { ApiError } from "../lib/api";
import { tFormat } from "../lib/i18n";
import { loadPaper } from "../lib/analyse/intake";
import { useApNotes } from "../lib/analyse/notes";
import { getAp, resetAp } from "../lib/analyse/useApDoc";
import { heldBlobs } from "../lib/blobs/held";
import type { ApNotes, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { takeReady } from "../lib/reader/take";
import { Reader } from "../components/reader/Reader";
import type { ShelfEntry } from "../lib/shelf/actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

// ---------------------------------------------------------------- a fake blob api with versions

let server: { blobs: SBlob[]; calls: Array<{ path: string; method: string }>; beforePut?: (kind: string) => void };
const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-19T00:00:00.000Z", version: b.version });
async function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  server.calls.push({ path, method });
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) throw new ApiError(404, "not-found");
  const projectId = m[1]!, kind = decodeURIComponent(m[2]!);
  if (method === "PUT") server.beforePut?.(kind);
  const cur = server.blobs.find((b) => b.projectId === projectId && b.kind === kind);
  if (method === "GET") { if (!cur) throw new ApiError(404, "not-found"); return wire(cur); }
  const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
  if (ifMatch !== undefined && Number(ifMatch.replace(/"/g, "")) !== (cur?.version ?? 0)) throw new ApiError(409, "version-conflict");
  const body = JSON.parse(String(init.body)) as { body: string; keyVersion: number };
  const next: SBlob = { projectId, kind, body: body.body, keyVersion: body.keyVersion, version: (cur?.version ?? 0) + 1 };
  server.blobs = [...server.blobs.filter((b) => b !== cur), next];
  return wire(next);
}
const put = (kind: string, value: unknown) => server.blobs.push({ projectId: "p1", kind, body: JSON.stringify(value), keyVersion: 0, version: 1 });
/** What the server holds for a blob, opened (a sealed body loses its prefix). */
const stored = <T,>(kind: string): T | null => { const b = server.blobs.find((x) => x.kind === kind); return b ? (JSON.parse(b.body.replace(/^sealed:/, "")) as T) : null; };
const puts = (kind: string) => server.calls.filter((c) => c.method === "PUT" && decodeURIComponent(c.path).endsWith("/blobs/" + kind));
const notesStored = () => stored<ApNotes>("ap_notes");

// ---------------------------------------------------------------- the papers

const PAGES = [
  "Open-label placebos reduce test anxiety. " + "Students given placebo pills felt calmer before the test. ".repeat(10),
  "Method. " + "Fifty-eight students took part in a randomised trial over two weeks. ".repeat(10),
  "Results. " + "Test anxiety fell more in the placebo group than in the comparison group. ".repeat(10)
];
const ABSTRACT = "Test anxiety affects many students. We asked whether open-label placebo pills, given with an honest explanation, lower test anxiety in the two weeks before an exam. Fifty-eight students took part in a randomised trial and filled in questionnaires before and after.";
const SCHAEFER: StoredEntry = { author: "Schaefer, C.; Denke, C.; Harke, H.", year: "2019", title: "Open-label placebos reduce test anxiety and improve self-management skills", source: "Scientific Reports", pid: "ka", rl: true, abstract: ABSTRACT };
const PUTWAIN: StoredEntry = { author: "Putwain, D.", year: "2008", title: "Examination stress and test anxiety", pid: "kb", rl: true, abstract: ABSTRACT };
const shelfEntry = (id: string, over: Partial<ShelfEntry> = {}): ShelfEntry => ({ id, title: "T " + id, file: id + ".pdf", size: 10, added: "2026-01-01T00:00:00.000Z", total: 3, kept: 3, ...over });
const paperOf = (pages = PAGES): ShelfPaper => ({ pages, notes: [], cells: {} });
function seed(pages = PAGES) {
  put("citations", [SCHAEFER, PUTWAIN]);
  put("shelf_index", [shelfEntry("sa", { title: SCHAEFER.title!, pid: "ka" })]);
  put("shelf_paper:sa", paperOf(pages));
}

/** Eleven words, and the same with one more: twelve is the least that unlocks the summary, on one line or on two. */
const ELEVEN = "Students given open label placebo pills felt less anxious before tests";
const TWELVE = ELEVEN + " today";
const SUMMARY = "Aim: to test open-label placebos.\nMethod: a randomised trial of 58 students.";

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 400; i++) { if (pred()) return; await settle(10); }
  throw new Error(what + " not reached");
}
/** The reader over the Reading tab's one store of the project's notes, as LitPlace mounts it. */
function Harness({ pid }: { pid: string }) {
  const notes = useApNotes("p1");
  return <Reader pid={pid} notes={notes} />;
}
async function mount(ui: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(ui); });
  await settle(20);
  return root;
}
const unmountAll = () => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; };
/** The reader on a paper's first tab, once its box is on the page. */
async function open(pid: string) {
  h.query = "";
  const root = await mount(<Harness pid={pid} />);
  await until(() => !!tid("take-box"), "the tab");
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const box = () => tid("take-box") as HTMLTextAreaElement;
const show = () => tid("take-show") as HTMLButtonElement;
/** Types the lines, presses "Show the AI summary" and waits for the gold block. */
async function summarise(lines = TWELVE) {
  typeIn(box(), lines);
  await click(show());
  await until(() => !!tid("take-summary"), "the summary");
}

beforeEach(() => {
  server = { blobs: [], calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset(); h.go.mockClear(); h.callAI.mockReset().mockResolvedValue(SUMMARY);
  h.query = "";
  vault.status = "off"; vault.sealed = false; vault.locked = false;
  heldBlobs.clear();
  resetAp();
});
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

describe("takeReady: twelve words", () => {
  it("is twelve words however they are laid out, and not eleven", () => {
    expect(takeReady("")).toBe(false);
    expect(takeReady("   \n  ")).toBe(false);
    expect(takeReady(ELEVEN)).toBe(false);
    expect(takeReady(TWELVE)).toBe(true);
    // One line is enough (v1 also wanted two lines): the label says "in two lines", the rule counts words.
    expect(takeReady("one two three four five six seven eight nine ten eleven twelve")).toBe(true);
    expect(takeReady("one two three four five six\nseven eight nine ten eleven twelve")).toBe(true);
    // Spaces and blank lines between words do not make more of them.
    expect(takeReady("one  two\n\nthree   four five six seven eight nine ten eleven")).toBe(false);
    expect(takeReady("  one two three four five six seven eight nine ten eleven twelve  ")).toBe(true);
  });
});

describe("Your take first: the lines, the button and the prompt", () => {
  it("the summary stays locked until the student's own lines have 12 words: the label asks, the line under it says what is needed, the button is off", async () => {
    seed();
    await open("ka");
    expect(tid("reader-take")!.querySelector("label")!.textContent).toBe("In two lines, what does this paper say?");
    expect((tid("reader-take")!.querySelector("label") as HTMLLabelElement).htmlFor).toBe(box().id);
    expect(box().value).toBe("");
    expect(show().textContent).toBe("Show the AI summary");
    expect(show().disabled).toBe(true);
    expect(tid("take-state")!.textContent).toBe("Write at least 12 words in your own words. The AI summary unlocks after that.");
    // The button says why it is off.
    expect(show().getAttribute("aria-describedby")).toBe(tid("take-state")!.id);
    typeIn(box(), ELEVEN);
    expect(show().disabled).toBe(true);
    expect(tid("take-state")!.textContent).toContain("at least 12 words");
    typeIn(box(), TWELVE);
    expect(show().disabled).toBe(false);
    expect(tid("take-state")!.textContent).toBe("Done. The AI summary is unlocked.");
    // Nothing was sent to the AI by unlocking it; the student asks.
    expect(h.callAI).not.toHaveBeenCalled();
    expect(tid("take-summary")).toBeNull();
    // Taking words away locks it again.
    typeIn(box(), ELEVEN);
    expect(show().disabled).toBe(true);
  });

  it("the button sends wave A's selected-passages prompt with v1's options, and the reply (trimmed) is the summary", async () => {
    seed();
    await open("ka");
    h.callAI.mockResolvedValue("  " + SUMMARY + "  \n");
    await summarise();
    expect(h.callAI).toHaveBeenCalledTimes(1);
    const [prompt, opts] = h.callAI.mock.calls[0] as [string, unknown];
    expect(prompt).toBe(buildShelfSummaryPromptV2(fieldLabel("education"), PAGES).prompt);
    expect(prompt).toContain("Summarise the paper text below under exactly these headings: Aim, Method, Key findings, Limitations.");
    expect(opts).toEqual({ temp: 0.2, max: 1000, noLang: true });
    expect(tid("take-ai-text")!.textContent).toBe(SUMMARY);
  });

  it("a long paper's limitations reach the model, and the summary says only the passages that matter were read", async () => {
    const filler = Array.from({ length: 400 }, (_, i) => `Filler sentence number ${i} about the study and nothing else of note at all.`).join("\n");
    seed(["Abstract\nWe studied students.\nIntroduction\n" + filler, "Limitations\nA limitation is that every participant came from one university.\n" + filler]);
    await open("ka");
    await summarise();
    const sent = (h.callAI.mock.calls[0] as [string])[0];
    expect(sent).toContain("A limitation is that every participant came from one university.");
    expect(sent).toContain("(selected passages: the opening, any limitations, then the discussion, method and results)");
    expect(tid("take-ai-partial")!.textContent).toBe("The paper is long, so the AI read the opening, any limitations, then the discussion, method and results.");
    await until(() => puts("ap_notes").length > 0, "the notes save");
    expect(notesStored()!["p:ka"]!.summary!.partial).toBe(true);
  });

  it("a short paper is sent whole and says nothing about passages", async () => {
    seed();
    await open("ka");
    await summarise();
    expect(tid("take-ai-partial")).toBeNull();
    await until(() => puts("ap_notes").length > 0, "the notes save");
    expect(notesStored()!["p:ka"]!.summary!.partial).toBe(false);
  });
});

describe("Your take first: the AI summary is a gold-edged block that says what it is and what to check", () => {
  it("the label never says whole paper; it says the passages that matter most, and to compare it with the two lines", async () => {
    seed();
    await open("ka");
    await summarise();
    const label = tid("take-ai-label")!;
    expect(label.textContent).toBe("AI summary of the passages that matter most. Compare it with your two lines.");
    expect(label.textContent).not.toMatch(/whole paper/i);
    expect(tid("take-summary")!.textContent).not.toMatch(/whole paper/i);
    expect(tid("take-summary")!.textContent).toContain("The AI can be wrong or miss a limitation.");
    // No sentence of the tab says the engine read the whole paper, in either language.
    for (const dict of [E, hi as Record<string, string>]) for (const [k, v] of Object.entries(dict)) if (k.startsWith("take_")) expect(v, k).not.toMatch(/whole paper|पूरे शोध-पत्र/i);
  });

  it("the block has the gold edge, and its label sits inside it", async () => {
    seed();
    await open("ka");
    await summarise();
    const block = tid("take-summary")!;
    expect(block.classList.contains("ai-read")).toBe(true);
    expect(block.contains(tid("take-ai-label"))).toBe(true);
    expect(tid("take-ai-label")!.classList.contains("ai-read-label")).toBe(true);
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(/\.ai-read\s*\{[^}]*border:\s*1px solid var\(--gold\)/.test(css)).toBe(true);
    // The student's own lines are not in the gold block: only the AI's words are.
    expect(block.contains(box())).toBe(false);
  });

  it("under it: 'Next: add this paper to your comparison', a link to Compare", async () => {
    seed();
    await open("ka");
    expect(tid("take-next")).toBeNull();
    await summarise();
    const next = tid("take-next") as HTMLAnchorElement;
    expect(next.textContent).toBe("Next: add this paper to your comparison");
    expect(next.getAttribute("href")).toBe("/p/p1/lit/compare");
    expect(tid("take-summary")!.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a second press makes the summary again, and the new one replaces the old", async () => {
    seed();
    await open("ka");
    await summarise();
    expect(show().textContent).toBe("Summarise again");
    h.callAI.mockResolvedValue("Aim: a second reading.");
    await click(show());
    await until(() => tid("take-ai-text")!.textContent === "Aim: a second reading.", "the new summary");
    await until(() => notesStored()?.["p:ka"]?.summary?.text === "Aim: a second reading.", "the save");
  });

  it("while it is being made the button is off and says so; a failed call shows the sentence with its tags removed and keeps the lines", async () => {
    seed();
    await open("ka");
    let fail!: (e: Error) => void;
    h.callAI.mockImplementation(() => new Promise<string>((_r, rej) => { fail = rej; }));
    typeIn(box(), TWELVE);
    await click(show());
    expect(tid("take-working")!.textContent).toBe("Reading the paper and writing the summary…");
    expect(show().disabled).toBe(true);
    await click(show());
    expect(h.callAI).toHaveBeenCalledTimes(1);
    await act(async () => { fail(new Error("Add your <b>Gemini</b> key first.")); await new Promise((r) => setTimeout(r, 0)); });
    expect(tid("take-failed")!.textContent).toBe("Add your Gemini key first.");
    expect(tid("take-summary")).toBeNull();
    expect(tid("take-working")).toBeNull();
    expect(show().disabled).toBe(false);
    expect(box().value).toBe(TWELVE);
    // Nothing was kept as a summary; the lines were.
    await until(() => puts("ap_notes").length > 0, "the notes save");
    expect(notesStored()!["p:ka"]!.summary).toBeUndefined();
    expect(notesStored()!["p:ka"]!.take).toBe(TWELVE);
  });

  it("an empty reply and an error with no words say v1's sentence", async () => {
    seed();
    await open("ka");
    h.callAI.mockResolvedValue("   ");
    typeIn(box(), TWELVE);
    await click(show());
    await until(() => !!tid("take-failed"), "the sentence");
    expect(tid("take-failed")!.textContent).toBe("The summary could not be made.");
    expect(tid("take-summary")).toBeNull();
    h.callAI.mockRejectedValue(new Error(""));
    await click(show());
    await until(() => tid("take-failed")?.textContent === "The summary could not be made.", "the sentence again");
    expect(tid("take-summary")).toBeNull();
  });
});

describe("Your take first: both are kept with the paper, under p:<pid>, and shown on return", () => {
  it("the take is written to the paper's note as it is typed, with the stages and card every note carries", async () => {
    seed();
    await open("ka");
    typeIn(box(), TWELVE);
    await until(() => puts("ap_notes").length > 0, "the notes save");
    const notes = notesStored()!;
    expect(Object.keys(notes)).toEqual(["p:ka"]);
    expect(notes["p:ka"]).toEqual({ stages: {}, card: {}, title: SCHAEFER.title, take: TWELVE });
  });

  it("the summary is kept with the paper and shown on return: the take and the summary survive a reload, keyed p:<pid>, and the AI is not asked again", async () => {
    seed();
    await open("ka");
    await summarise();
    await until(() => notesStored()?.["p:ka"]?.summary !== undefined, "the save");
    const note = notesStored()!["p:ka"]!;
    expect(note.take).toBe(TWELVE);
    expect(note.summary).toEqual({ text: SUMMARY, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/), partial: false });
    expect(Object.keys(notesStored()!)).toEqual(["p:ka"]);
    // A reload: nothing of the page's memory is left; the notes are read from the server.
    unmountAll();
    resetAp();
    heldBlobs.clear();
    h.callAI.mockClear();
    await open("ka");
    await until(() => box().value !== "", "the stored lines");
    expect(box().value).toBe(TWELVE);
    expect(tid("take-state")!.textContent).toBe("Done. The AI summary is unlocked.");
    expect(tid("take-ai-text")!.textContent).toBe(SUMMARY);
    expect(tid("take-ai-label")!.textContent).toBe("AI summary of the passages that matter most. Compare it with your two lines.");
    expect(show().textContent).toBe("Summarise again");
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("each paper has its own: a paper with only its abstract is summarised from the abstract, under its own pid", async () => {
    seed();
    await open("ka");
    await summarise();
    unmountAll();
    resetAp();
    await open("kb");
    expect(box().value).toBe("");
    expect(tid("take-summary")).toBeNull();
    h.callAI.mockResolvedValue("Aim: the abstract's aim.");
    await summarise("Anxiety before an exam is common and open label pills may lower it a little");
    const pages = getAp().doc!.pages;
    expect(getAp().doc!.abstractOnly).toBe(true);
    const sent = (h.callAI.mock.calls.at(-1) as [string])[0];
    expect(sent).toBe(buildShelfSummaryPromptV2(fieldLabel("education"), pages).prompt);
    expect(sent).toContain("Test anxiety affects many students.");
    await until(() => notesStored()?.["p:kb"]?.summary !== undefined, "the save");
    const notes = notesStored()!;
    expect(Object.keys(notes).sort()).toEqual(["p:ka", "p:kb"]);
    expect(notes["p:ka"]!.take).toBe(TWELVE);
    expect(notes["p:kb"]!.take).toBe("Anxiety before an exam is common and open label pills may lower it a little");
    expect(notes["p:kb"]!.summary!.text).toBe("Aim: the abstract's aim.");
  });

  it("a note the paper already had keeps its stages and card when the take is added", async () => {
    seed();
    put("ap_notes", { "p:ka": { stages: { design: { mine: "A trial." } }, card: { verdict: "Worth reading" }, title: SCHAEFER.title, pid: "ka", cells: { Sample: "58" } } });
    await open("ka");
    await summarise();
    await until(() => notesStored()?.["p:ka"]?.summary !== undefined, "the save");
    expect(notesStored()!["p:ka"]).toMatchObject({ stages: { design: { mine: "A trial." } }, card: { verdict: "Worth reading" }, pid: "ka", cells: { Sample: "58" }, take: TWELVE, summary: { text: SUMMARY } });
  });

  it("a 409 replays the take onto the newer notes, and the other window's note survives", async () => {
    seed();
    put("ap_notes", { "p:kz": { stages: {}, card: {}, title: "Already there" } });
    let raced = false;
    server.beforePut = (kind) => {
      if (kind !== "ap_notes" || raced) return;
      raced = true;
      const cur = server.blobs.find((b) => b.kind === "ap_notes")!;
      const next = { ...JSON.parse(cur.body), "p:kw": { stages: {}, card: {}, title: "Written elsewhere", take: "From the other window" } };
      server.blobs = [...server.blobs.filter((b) => b !== cur), { ...cur, body: JSON.stringify(next), version: cur.version + 1 }];
    };
    await open("ka");
    typeIn(box(), TWELVE);
    await until(() => notesStored()?.["p:ka"]?.take === TWELVE, "the replayed save");
    expect(raced).toBe(true);
    expect(notesStored()!["p:kw"]!.take).toBe("From the other window");
    expect(notesStored()!["p:kz"]!.title).toBe("Already there");
    expect(h.toast).not.toHaveBeenCalled();
  });
});

describe("Your take first: a locked vault waits", () => {
  const SAVED = "I think the pills worked even though students knew what they were taking";

  it("the box is read-only and says the notes are locked, nothing is written, and once the vault opens the saved lines are there", async () => {
    seed();
    vault.sealed = true; vault.locked = true;
    server.blobs.push({ projectId: "p1", kind: "ap_notes", body: "sealed:" + JSON.stringify({ "p:ka": { stages: {}, card: {}, title: SCHAEFER.title, take: SAVED } }), keyVersion: 1, version: 1 });
    const root = await open("ka");
    expect(box().readOnly).toBe(true);
    expect(box().value).toBe("");
    expect(tid("ap-notes-locked")!.textContent).toBe(E.vault_ap_locked);
    expect(show().disabled).toBe(true);
    // Typing into a box that only looks empty must never replace what is stored.
    typeIn(box(), TWELVE);
    await settle(1000);
    expect(puts("ap_notes")).toHaveLength(0);
    expect(h.callAI).not.toHaveBeenCalled();
    // The vault opens: the saved lines appear, unchanged, and the summary can be asked for.
    vault.locked = false; vault.status = "unlocked";
    await act(async () => { root.render(<Harness pid="ka" />); });
    await until(() => box().value === SAVED, "the saved lines");
    expect(box().readOnly).toBe(false);
    expect(tid("ap-notes-locked")).toBeNull();
    expect(show().disabled).toBe(false);
    expect(notesStored()!["p:ka"]!.take).toBe(SAVED);
    // And a change is saved sealed, on top of what was there.
    typeIn(box(), SAVED + " as well");
    await until(() => puts("ap_notes").length > 0, "the sealed save");
    expect(server.blobs.find((b) => b.kind === "ap_notes")!.keyVersion).toBe(1);
    expect(notesStored()!["p:ka"]!.take).toBe(SAVED + " as well");
  });
});

describe("Your take first: the practice paper and a pasted text", () => {
  it("the practice paper needs no tick, and its take is kept under v1's id (not p:sample)", async () => {
    put("citations", []);
    put("shelf_index", []);
    await open("sample");
    typeIn(box(), TWELVE);
    await click(show());
    await until(() => !!tid("take-summary"), "the summary");
    expect(h.callAI).toHaveBeenCalledTimes(1);
    await until(() => puts("ap_notes").length > 0, "the notes save");
    const id = getAp().doc!.id;
    expect(id).toMatch(/^a/);
    expect(Object.keys(notesStored()!)).toEqual([id]);
    expect(notesStored()![id]!.take).toBe(TWELVE);
    expect(notesStored()![id]!.summary!.text).toBe(SUMMARY);
    expect(tid("ap-consent")).toBeNull();
  });

  it("a pasted text asks for the tick first, as Ask does, and then sends the text", async () => {
    put("citations", []);
    put("shelf_index", []);
    loadPaper("My pasted paper on reading", ["Reading on paper and on screens. " + "Students read a short text and then answered questions about it. ".repeat(12)], "paste", false, { toast: h.toast, t });
    await open("pasted");
    expect(tid("ap-consent")).not.toBeNull();
    typeIn(box(), TWELVE);
    await click(show());
    expect(h.toast).toHaveBeenCalledWith(E.ap2_tick_the_box_about);
    expect(h.callAI).not.toHaveBeenCalled();
    await click($("#apOK"));
    await click(show());
    await until(() => !!tid("take-summary"), "the summary");
    expect(h.callAI).toHaveBeenCalledTimes(1);
  });

  it("a kept paper shows no tick box: the Reading list's Summarise never asked for one", async () => {
    seed();
    await open("ka");
    expect(tid("ap-consent")).toBeNull();
  });
});

describe("Your take first: the layout rules (375 px wide, tokens only)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const start = css.indexOf("/* Your take first (wave B Task 28");
  const end = css.indexOf("/* end take */");
  const block = css.slice(start, end);
  const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]!.trim() }));

  it("has its own block of the stylesheet", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("the button and the link to Compare are at least 44 px high, and the summary's words break inside long words", () => {
    for (const sel of [".rd-take-btn", ".rd-take-next"]) expect(rules.find((r) => r.sel === sel)?.body, sel).toMatch(/min-height:\s*44px/);
    expect(rules.find((r) => r.sel === ".rd-take-text")?.body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rules.find((r) => r.sel === ".rd-take-text")?.body).toMatch(/white-space:\s*pre-wrap/);
  });

  it("uses colour tokens only: no hex or rgb colour", () => {
    expect(rules.length).toBeGreaterThan(3);
    for (const r of rules) expect(r.body, r.sel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
