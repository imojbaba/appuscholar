// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE, AP_STAGES, apBuild, apCardText, buildWalkPrompt, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";
import { withPanelFixes } from "../scripts/i18n-overrides.mjs";

/*
 * Analyse a paper, part 2 (v1 apWalkShow 10048-10064, apDraft/apReveal/apSetStage 10114-10122, apCardText/apCardDownload 10124-10136, apRender's walk and card
 * 11300-11332). The expected text is v1's own, read from core's golden fixture test/golden/appanel/cases.json (`golden:capture appanel`): what v1 drew (textContent),
 * stored in appu_ap_notes, asked in its confirm, and wrote into paper-card.txt, for the same inputs. (v1's cards side by side, apAcross* 9936-9985, are Compare's now: test/compare.test.tsx.)
 */

type BlobState = { value: unknown; loading?: boolean; locked?: boolean; broken?: boolean };
const h = vi.hoisted(() => ({
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  download: vi.fn(),
  blobs: {} as Record<string, BlobState>,
  sets: [] as Array<{ kind: string; update: boolean }>,
  listeners: new Set<() => void>(),
  projectId: "p-1" as string | null,
  /** Every blob the mocked hook was asked to open: [kind, projectId] (a null project reads nothing). */
  opened: [] as Array<[string, string | null]>,
  openExport: vi.fn(),
}));
const EMPTY: BlobState = { value: null };
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  // The real hook's guard: in a place's own window (?window=1) every kind of another stage is read-only (v1 1964, D-S2-43).
  const { blobWritable } = await import("../lib/popout/mode");
  const sub = (l: () => void) => { h.listeners.add(l); return () => { h.listeners.delete(l); }; };
  return {
    useProjectBlob: (kind: string, projectId: string | null) => {
      h.opened.push([kind, projectId]);
      const s = React.useSyncExternalStore(sub, () => (projectId ? h.blobs[kind] ?? EMPTY : EMPTY), () => EMPTY);
      return {
        value: s.value, loading: !!s.loading, locked: !!s.locked, broken: !!s.broken, readOnly: !blobWritable(kind as never),
        set: (u: unknown) => {
          if (!blobWritable(kind as never)) return;
          h.sets.push({ kind, update: typeof u === "function" });
          const cur = h.blobs[kind]?.value ?? null;
          h.blobs[kind] = { value: typeof u === "function" ? (u as (p: unknown) => unknown)(cur) : u };
          for (const l of h.listeners) l();
        },
        flush: async () => true,
      };
    },
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => null }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: h.projectId ? { id: h.projectId } : null, projectId: h.projectId, pendingAnalyse: null, setPendingAnalyse: () => {}, openExport: h.openExport }) }));
vi.mock("@/lib/shelf/useShelf", () => ({ useShelf: () => ({ projectId: "p-1", index: [], loading: false, locked: false, broken: false, error: false, loadPaper: async () => null }) }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: h.download }));

import { AnalysePanel } from "../components/tools/analyse/AnalysePanel";
import { getAp, resetAp, setAp } from "../lib/analyse/useApDoc";
import { loadPaper } from "../lib/analyse/intake";
import { apWalkShow } from "../lib/analyse/walk";
import { NOTES_POPOUT, notePut, resetBrokenAnswers, type ApNotesStore } from "../lib/analyse/notes";
import { downloadCard } from "../lib/analyse/cards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type View = {
  stages: Array<{ text: string; title: string; on: boolean }>; h4: string;
  boxes: Array<{ text: string; banner: string | null; quotes: Array<{ text: string; bad: boolean }>; notStated: string[]; ok: string | null }>;
  tryPlaceholder: string; tryValue: string; show: { text: string; disabled: boolean }; chk: { placeholder: string; value: string } | null; reveal: string | null; nav: Array<{ text: string; disabled: boolean }>;
};
type Note = { stages: Record<string, { mine?: string; res?: Record<string, unknown> }>; card: Record<string, string>; title?: string };
type Fx = {
  walks: Array<{ id: string; paper: string; consent: boolean; stage: number; k: string; mine: string | null; reply: string; docId: string; opts: Array<Record<string, unknown>>; toasts: string[]; res: Record<string, unknown> | null; stored: Note | null; before: View; view: View; revealed: View | null }>;
  navs: Array<{ stage: number; view: View }>;
  typed: Note;
  cards: Array<{ id: string; note: Note | null; refs: unknown; docId: string; boxes: Array<{ text: string; muted: string[] }>; fields: Array<{ label: string; rows: string; value: string }>; button: string; text: string }>;
  cardTyped: Note;
};
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/appanel/cases.json"), "utf8")) as Fx;
const FETCH = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { refcheck: { refs: Record<string, unknown> } };
type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };
const CORPUS = JSON.parse(readFileSync(join(CORE_TEST, "golden/analyse/papers.json"), "utf8")) as Paper[];
const SAMPLE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;
function paperOf(id: string): { title: string; pages: string[]; src: string; sample: boolean } {
  if (id === "sample@apSample") return { title: SAMPLE_TITLE, pages: [...AP_SAMPLE], src: "pdf", sample: true };
  if (id === "sample-x3") return { title: SAMPLE_TITLE + " (three times)", pages: [...AP_SAMPLE, ...AP_SAMPLE, ...AP_SAMPLE], src: "pdf", sample: false };
  const p = CORPUS.find((x) => x.id === id)!;
  return p.from === "AP_SAMPLE" ? { title: SAMPLE_TITLE, pages: [...AP_SAMPLE], src: p.src, sample: false } : { title: p.title!, pages: p.pages!, src: p.src, sample: false };
}

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) {
  for (let i = 0; i < 300; i++) { if (pred()) return; await settle(5); }
  throw new Error("condition not reached");
}
async function mount(ui: ReactNode = <AnalysePanel />) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(ui); });
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const quiet = { toast: () => {}, t: (k: string, v?: Record<string, string | number>) => (v ? E[k]!.replace(/\{(\w+)\}/g, (m, x: string) => (x in v ? String(v[x]) : m)) : E[k]!) };
const load = (id: string) => { const p = paperOf(id); act(() => { expect(loadPaper(p.title, p.pages, p.src, p.sample, quiet)).toBe(true); }); };
const notes = () => (h.blobs.ap_notes?.value ?? null) as Record<string, Note> | null;
async function openTab(k: "walk" | "card") { await click(tid("ap-tab-" + k)); }
/**
 * An element's textContent with each textarea's text as the student sees it (its value): v1 draws a box again with the typed words inside the <textarea> (escHTML(AP.chkDraft[k]), 11316), so
 * its textContent holds them; React sets a controlled textarea's value, which textContent does not show.
 */
function textOf(el: Element): string {
  const c = el.cloneNode(true) as Element;
  const live = [...el.querySelectorAll("textarea")];
  [...c.querySelectorAll("textarea")].forEach((ta, i) => { ta.textContent = live[i]!.value; });
  return c.textContent!;
}
/** The walk tab as the capture reads v1's (walkView in appanel/capture.ts). */
function walkView(): View {
  const h4 = $("#apMain h4")!;
  const after: Element[] = [];
  for (let e = h4.nextElementSibling; e; e = e.nextElementSibling) after.push(e);
  const boxes = after.filter((e) => e.classList.contains("ap-box"));
  const nav = after[after.length - 1]!;
  const tryBox = $("#apTry") as HTMLTextAreaElement;
  const show = $("#apShowBtn") as HTMLButtonElement;
  const chk = $("#apChk") as HTMLTextAreaElement | null;
  return {
    stages: [...h4.previousElementSibling!.querySelectorAll("button")].map((b) => ({ text: b.textContent!, title: b.getAttribute("title")!, on: b.getAttribute("data-on") === "true" })),
    h4: h4.textContent!,
    boxes: boxes.map((b) => ({
      text: textOf(b),
      banner: b.querySelector(".ap-banner")?.textContent ?? null,
      quotes: [...b.querySelectorAll("blockquote")].map((q) => ({ text: q.textContent!, bad: q.classList.contains("ap-bad") })),
      notStated: [...b.querySelectorAll("li")].map((li) => li.textContent!),
      ok: b.querySelector("div.ap-ok")?.textContent ?? null,
    })),
    tryPlaceholder: tryBox.getAttribute("placeholder")!, tryValue: tryBox.value,
    show: { text: show.textContent!, disabled: show.disabled },
    chk: chk ? { placeholder: chk.getAttribute("placeholder")!, value: chk.value } : null,
    reveal: $("#apRevealBtn")?.textContent ?? null,
    nav: [...nav.querySelectorAll("button")].map((b) => ({ text: b.textContent!, disabled: (b as HTMLButtonElement).disabled })),
  };
}
async function blobText(call: unknown[]): Promise<string> {
  const b = call[1] as Blob;
  expect(b.type).toBe("text/csv;charset=utf-8");
  // Read as bytes: a text read would drop the byte-order mark v1 writes first.
  const bytes = await new Promise<ArrayBuffer>((done) => { const r = new FileReader(); r.onload = () => done(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

beforeEach(() => {
  resetAp();
  h.toast.mockReset(); h.download.mockReset(); h.openExport.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.blobs = {}; h.sets = []; h.opened = []; h.projectId = "p-1";
  resetBrokenAnswers();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Walk me through it (apWalkShow 10048-10064, apRender 11300-11320)", () => {
  it("the tab opens (no toast any more); the Lesson is not offered (W23)", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    await openTab("walk");
    expect(getAp().mode).toBe("walk");
    expect(tid("ap-walk")).not.toBeNull();
    await openTab("card");
    expect(getAp().mode).toBe("card");
    expect(tid("ap-tab-lesson")).toBeNull();
    expect(toasts()).toEqual([]);
    expect(getAp().mode).toBe("card");
  });

  it.each(FX.walks.map((w) => [w.id, w] as const))("%s: the stage drawn, the call, the toasts, the reply's sections and the stored note are v1's", async (_id, w) => {
    await mount();
    load(w.paper);
    if (w.consent) act(() => { setAp({ ok: true }); });
    await openTab("walk");
    await click(tid("ap-stages")!.querySelectorAll("button")[w.stage] as HTMLElement);
    if (w.mine !== null) typeIn($("#apTry") as HTMLTextAreaElement, w.mine);
    expect(walkView()).toEqual(w.before);
    h.callAI.mockResolvedValue(w.reply);
    await click($("#apShowBtn"));
    await until(() => !getAp().busy);
    expect(toasts()).toEqual(w.toasts);
    const doc = getAp().doc!;
    expect(doc.id).toBe(w.docId);
    if (w.opts.length) {
      const built = buildWalkPrompt(fieldLabel("psychology"), doc, AP_STAGES[w.stage]!, w.mine ?? "");
      expect(h.callAI.mock.calls).toEqual([[built.prompt, { temp: 0.2, max: 2000, noLang: true }]]);
      expect([{ max: built.max, temp: built.temp, noLang: built.noLang }]).toEqual(w.opts);
    } else expect(h.callAI).not.toHaveBeenCalled();
    expect(walkView()).toEqual(w.view);
    expect(notes()?.[w.docId] ? { stages: { [w.k]: notes()![w.docId]!.stages[w.k] } } : null).toEqual(w.stored ? { stages: { [w.k]: w.stored.stages[w.k] } } : (w.mine !== null ? { stages: { [w.k]: { mine: w.mine } } } : null));
    if (w.stored) expect(notes()![w.docId]!.title).toBe(w.stored.title);
    if (w.revealed) {
      expect(tid("ap-suggested")).toBeNull();
      typeIn($("#apChk") as HTMLTextAreaElement, "My check answer");
      await click($("#apRevealBtn"));
      expect(walkView()).toEqual(w.revealed);
      // The check answer is the tab's memory only (AP.chkDraft), never stored.
      expect(JSON.stringify(notes())).not.toContain("My check answer");
    }
  });

  it("every write is an update of the stored notes, so two papers keep their own words (keyed by v1's docId)", async () => {
    const other = { a1: { stages: { design: { mine: "Kept" } }, card: { verdict: "Kept too" }, title: "Another paper" } };
    h.blobs.ap_notes = { value: structuredClone(other) };
    await mount();
    load("sample@apSample");
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "Sample words");
    const sampleId = getAp().doc!.id;
    load("pasted-headings");
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "Pasted words");
    const pastedId = getAp().doc!.id;
    expect(sampleId).not.toBe(pastedId);
    expect(notes()).toEqual({
      ...other,
      [sampleId]: { stages: { gap: { mine: "Sample words" } }, card: {}, title: SAMPLE_TITLE },
      [pastedId]: { stages: { gap: { mine: "Pasted words" } }, card: {}, title: paperOf("pasted-headings").title },
    });
    expect(h.sets.every((s) => s.update)).toBe(true);
    // Loading the sample again brings its words back (v1's apLoad 9888-9889).
    load("sample@apSample");
    await openTab("walk");
    expect(($("#apTry") as HTMLTextAreaElement).value).toBe("Sample words");
  });

  it("moving between stages: the stored reply ✓ on its button, the first and last stage's buttons disabled, as v1 draws them", async () => {
    await mount();
    load("sample@apSample");
    const id = getAp().doc!.id;
    h.blobs.ap_notes = { value: { [id]: { stages: { gap: { mine: "Stored words", res: FX.walks[0]!.res } }, card: {}, title: SAMPLE_TITLE } } };
    await openTab("walk");
    for (const n of FX.navs) {
      await click(tid("ap-stages")!.querySelectorAll("button")[n.stage] as HTMLElement);
      expect(walkView(), String(n.stage)).toEqual(n.view);
    }
    await click(tid("ap-prev"));
    expect(getAp().stage).toBe(10);
    await click($("#apNextBtn"));
    expect(getAp().stage).toBe(11);
    expect(($("#apNextBtn") as HTMLButtonElement).disabled).toBe(true);
    // Typing again keeps the stage's reply (apDraft 10118).
    await click(tid("ap-stages")!.querySelectorAll("button")[0] as HTMLElement);
    typeIn($("#apTry") as HTMLTextAreaElement, "Typed again");
    expect(notes()![id]).toEqual({ ...FX.typed, title: SAMPLE_TITLE });
  });

  it("an abstract keeps the walk-through closed", async () => {
    await mount();
    load("abstract-only");
    const walk = tid("ap-tab-walk") as HTMLButtonElement;
    expect(walk.disabled).toBe(true);
    await click(walk);
    act(() => { setAp({ mode: "walk" }); });
    expect(tid("ap-walk")).toBeNull();
  });

  it("a reply for a paper no longer loaded is dropped, and nothing runs while a request is running", async () => {
    await mount();
    load("sample@apSample");
    let answer: (s: string) => void = () => {};
    h.callAI.mockImplementation(() => new Promise<string>((r) => { answer = r; }));
    await openTab("walk");
    await click($("#apShowBtn"));
    expect(getAp().busy).toBe(true);
    await click($("#apShowBtn"));
    expect(h.callAI).toHaveBeenCalledTimes(1);
    load("pasted-headings");
    await act(async () => { answer(FX.walks[0]!.reply); await new Promise((r) => setTimeout(r, 0)); });
    expect(getAp().busy).toBe(false);
    expect(getAp().res).toEqual({});
    expect(notes()).toBeNull();
  });

  it("each reply names its paper, from this visit and from the stored note (W20)", async () => {
    await mount();
    load("sample@apSample");
    await openTab("walk");
    h.callAI.mockResolvedValue(FX.walks[0]!.reply);
    await click($("#apShowBtn"));
    await until(() => !getAp().busy);
    expect(tid("ap-about")).toHaveProperty("textContent", "About: " + SAMPLE_TITLE);
    expect(tid("ap-about")!.compareDocumentPosition(tid("ap-walk-reply")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getAp().res[AP_STAGES[0]!.k]!.title).toBe(SAMPLE_TITLE);
    // The stored reply is the paper's own: it carries no title, and the line shows the paper loaded.
    expect(JSON.stringify(notes())).not.toContain('"title":"' + SAMPLE_TITLE + '","partial"');
    act(() => { setAp({ res: {} }); });
    expect(tid("ap-about")).toHaveProperty("textContent", "About: " + SAMPLE_TITLE);
  });

  it("a failed call toasts its sentence and stores nothing", async () => {
    const put = vi.fn(() => true);
    act(() => { loadPaper(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true, quiet); });
    await apWalkShow({ callAI: async () => { throw new Error("Your AI key was refused."); }, field: "psychology", toast: h.toast, t: quiet.t, mine: () => "", put });
    expect(toasts()).toEqual(["Your AI key was refused."]);
    expect(put).not.toHaveBeenCalled();
    expect(getAp().busy).toBe(false);
  });
});

describe("Paper card (apRender 11325-11331, apCardText 10124-10135)", () => {
  it.each(FX.cards.map((c) => [c.id, c] as const))("%s: the boxes, the four fields and paper-card.txt are v1's", async (_id, c) => {
    await mount();
    load("sample@apSample");
    const id = getAp().doc!.id;
    expect(id).toBe(c.docId);
    if (c.note) h.blobs.ap_notes = { value: { [id]: { ...c.note, title: SAMPLE_TITLE } } };
    act(() => { setAp({ refs: (c.refs === "fetch" ? FETCH.refcheck.refs : c.refs) as never }); });
    await openTab("card");
    const boxes = $$("#apMain [data-testid=ap-card] .ap-box").map((b) => ({ text: b.textContent!, muted: [...b.querySelectorAll("span")].map((s) => s.textContent!) }));
    expect(boxes).toEqual(c.boxes);
    expect(["strengths", "weak", "verdict", "notes"].map((f) => {
      const ta = $("#apC_" + f) as HTMLTextAreaElement;
      return { label: $(`label[for="apC_${f}"]`)!.textContent, rows: ta.getAttribute("rows"), value: ta.value };
    })).toEqual(c.fields);
    // Wave B Task 12 (D-S2-42): v1's download is now Export, which opens the project's export place with the reading notes ticked (W11).
    expect(c.button).toBeTruthy();
    expect($("#apCardBtn")!.textContent).toBe(E.exp_link);
    await click($("#apCardBtn"));
    expect(h.openExport).toHaveBeenLastCalledWith("notes");
    expect(h.download).not.toHaveBeenCalled();
    // The card's own text (apCardDownload) is still v1's.
    const stored = notes()?.[id];
    downloadCard(quiet.t, { title: SAMPLE_TITLE, note: { ...stored, card: stored?.card ?? {} } as never, refs: getAp().refs });
    expect(h.download.mock.calls.map((x) => x[0])).toEqual(["paper-card.txt"]);
    const text = await blobText(h.download.mock.calls[0]!);
    expect(text).toBe("﻿" + withPanelFixes(c.text));
    expect(text.slice(1)).toBe(apCardText({
      title: SAMPLE_TITLE, note: stored, refs: getAp().refs, stages: AP_STAGES,
      L: { head: E.ap2_paper_card_head!, myWords: E.ap2_my_words_2!, notWritten: E.ap2_not_written!, reading: E.ap2_reading_3!, refHead: E.ap2_reference_list_check_head!, doisRead: E.ap2_dois_read!, known: E.ap2_known_to_openalex!, flagged: E.ap2_flagged_as_retracted!, none: E.ap2_none_flagged!, warning: E.ap2_a_warning_signal_only!, strengths: E.ap2_strengths_2!, weak: E.ap2_weaknesses_2!, verdict: E.ap2_my_verdict_in_one!, notes: E.ap2_my_notes!, closing: E.ap2_made_with_appuscholer_parts! },
    }));
    expect(text.endsWith(E.ap2_made_with_appuscholer_parts + "\n")).toBe(true);
  });

  it("given a notes store (the Reading tab's), the card reads and writes that store and never opens a blob of its own", async () => {
    const given = {
      all: {}, unread: false, loading: false, locked: false, broken: false, readOnly: false, cols: null,
      note: vi.fn(() => ({ stages: {}, card: { strengths: "From the shared store" }, title: SAMPLE_TITLE })),
      put: vi.fn((_doc: { id: string; title: string }, _fn: (n: unknown) => void) => true), setCols: vi.fn(() => true)
    } satisfies ApNotesStore;
    // The panel's own blob holds a different note for the same paper: it must not be what the card shows.
    h.blobs.ap_notes = { value: { "anything": { stages: {}, card: { strengths: "From the panel's own blob" }, title: SAMPLE_TITLE } } };
    await mount(<AnalysePanel notes={given} />);
    load("sample@apSample");
    await openTab("card");
    expect(given.note).toHaveBeenCalledWith(getAp().doc!.id);
    expect(($("#apC_strengths") as HTMLTextAreaElement).value).toBe("From the shared store");
    typeIn($("#apC_strengths") as HTMLTextAreaElement, "From the shared store, edited");
    expect(given.put).toHaveBeenCalledTimes(1);
    expect(given.put.mock.calls[0]![0]).toMatchObject({ id: getAp().doc!.id });
    // Nothing was written to the panel's own blob, and no project was opened for it to read.
    expect(h.sets).toEqual([]);
    expect(h.opened.filter(([kind, project]) => kind === "ap_notes" && project !== null)).toEqual([]);
    expect(notes()).toEqual({ anything: { stages: {}, card: { strengths: "From the panel's own blob" }, title: SAMPLE_TITLE } });
  });

  it("each field is saved as it is typed, an update merged into the paper's note (apCardField 10121)", async () => {
    await mount();
    load("sample@apSample");
    await openTab("card");
    typeIn($("#apC_weak") as HTMLTextAreaElement, "Typed weakness");
    expect(notes()![getAp().doc!.id]).toEqual(FX.cardTyped);
    typeIn($("#apC_verdict") as HTMLTextAreaElement, "V");
    expect(notes()![getAp().doc!.id]!.card).toEqual({ weak: "Typed weakness", verdict: "V" });
    expect(h.sets.map((s) => s.update)).toEqual([true, true]);
  });
});

describe("a stored note that does not open on this device (ruling R16)", () => {
  it("the first write over broken notes asks first; no keeps it as it is for this panel, yes replaces it", async () => {
    h.blobs.ap_notes = { value: null, broken: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    load("sample@apSample");
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "a");
    typeIn($("#apTry") as HTMLTextAreaElement, "ab");
    expect(confirm.mock.calls).toEqual([[E.vault_ap_broken_confirm]]);
    expect(h.sets).toEqual([]);
    // The words stay in the box (the tab's memory), as v1's AP.tryDraft.
    expect(($("#apTry") as HTMLTextAreaElement).value).toBe("ab");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    confirm.mockReset().mockReturnValue(true);
    await mount();
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "abc");
    typeIn($("#apTry") as HTMLTextAreaElement, "abcd");
    expect(confirm.mock.calls).toEqual([[E.vault_ap_broken_confirm]]);
    expect(notes()![getAp().doc!.id]!.stages.gap).toEqual({ mine: "abcd" });
  });

  it("R16 is asked per blob, not per panel: a yes given in one panel holds for the other panel of the same project (wave B Task 21)", async () => {
    h.blobs.ap_notes = { value: null, broken: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await mount();
    load("sample@apSample");
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "a");
    expect(confirm.mock.calls).toEqual([[E.vault_ap_broken_confirm]]);
    // A second panel on the same project and blob (Compare reads the notes too): the blob is still shown as broken to it, and it asks nothing.
    h.blobs.ap_notes = { value: null, broken: true };
    await act(async () => { for (const l of h.listeners) l(); });
    await mount();
    await openTab("walk");
    typeIn($$("#apTry").at(-1) as HTMLTextAreaElement, "ab");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.sets.filter((x) => x.kind === "ap_notes")).toHaveLength(2);
  });

  it("a no is the panel's own: the next panel asks again; another project's blob is another question", async () => {
    h.blobs.ap_notes = { value: null, broken: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    load("sample@apSample");
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "a");
    typeIn($("#apTry") as HTMLTextAreaElement, "ab");
    expect(confirm).toHaveBeenCalledTimes(1);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    confirm.mockReturnValue(true);
    await mount();
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "abc");
    expect(confirm).toHaveBeenCalledTimes(2);
    // The same blob kind of another project is asked about on its own.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.projectId = "p-2";
    h.blobs.ap_notes = { value: null, broken: true };
    await mount();
    await openTab("walk");
    typeIn($("#apTry") as HTMLTextAreaElement, "abcd");
    expect(confirm).toHaveBeenCalledTimes(3);
  });
});

describe("notePut is apNotePut (9895) as an update", () => {
  it("creates the note with stages, card and the title, keeps the other papers, and never changes what it was given", () => {
    const prev = { a: { stages: { gap: { mine: "x" } }, card: { verdict: "v" }, title: "A" } };
    const frozen = structuredClone(prev);
    const doc = apBuild(SAMPLE_TITLE, [...AP_SAMPLE], "pdf");
    const next = notePut(prev, doc, (n) => { n.stages.gap = { ...n.stages.gap, mine: "y" }; });
    expect(prev).toEqual(frozen);
    expect(next).toEqual({ ...prev, [doc.id]: { stages: { gap: { mine: "y" } }, card: {}, title: SAMPLE_TITLE } });
    expect(Object.keys(next[doc.id]!)).toEqual(["stages", "card", "title"]);
    expect(notePut(null, doc, () => {})).toEqual({ [doc.id]: { stages: {}, card: {}, title: SAMPLE_TITLE } });
  });
});

describe("stored notes not read yet, locked or not openable are never shown as empty (Task 12's rule: unread is not empty)", () => {
  const stored = (id: string) => ({ a1: { stages: { design: { mine: "Saved design words" } }, card: { verdict: "Saved verdict" }, title: "Paper one" }, [id]: { stages: { gap: { mine: "Saved gap words" } }, card: { weak: "Saved weakness" }, title: SAMPLE_TITLE } });

  it("locked: the locked line in place of the cards, no field to type in, nothing written; once the vault opens the saved words are there, unchanged", async () => {
    h.blobs.ap_notes = { value: null, locked: true };
    await mount();
    load("sample@apSample");
    const id = getAp().doc!.id;
    await openTab("card");
    expect(tid("ap-card")!.textContent).toBe("Paper card. Your own words come first. Edit freely; it saves as you type, in this browser." + E.vault_ap_locked);
    expect($("#apC_weak")).toBeNull();
    expect($("#apCardBtn")).toBeNull();
    await openTab("walk");
    const box = $("#apTry") as HTMLTextAreaElement;
    expect([box.readOnly, box.value, ($("#apShowBtn") as HTMLButtonElement).disabled, tid("ap-notes-locked")!.textContent]).toEqual([true, "", true, E.vault_ap_locked]);
    typeIn(box, "New words over nothing seen");
    expect(h.sets).toEqual([]);
    expect(getAp().tryDraft).toEqual({});
    // The vault opens: the stored notes are read, as they were.
    await act(async () => { h.blobs.ap_notes = { value: stored(id) }; for (const l of h.listeners) l(); });
    expect(($("#apTry") as HTMLTextAreaElement).value).toBe("Saved gap words");
    expect(tid("ap-notes-locked")).toBeNull();
    await openTab("card");
    expect(($("#apC_weak") as HTMLTextAreaElement).value).toBe("Saved weakness");
    expect(notes()).toEqual(stored(id));
  });

  it("being read: neither the empty sentences nor a field, and no locked line (W8)", async () => {
    h.blobs.ap_notes = { value: null, loading: true };
    await mount();
    load("sample@apSample");
    await openTab("card");
    expect(tid("ap-card")!.textContent).toBe("Paper card. Your own words come first. Edit freely; it saves as you type, in this browser.");
    expect($("#apC_notes")).toBeNull();
    await openTab("walk");
    expect(($("#apTry") as HTMLTextAreaElement).readOnly).toBe(true);
    typeIn($("#apTry") as HTMLTextAreaElement, "x");
    expect(h.sets).toEqual([]);
  });

  it("broken, the student keeps it: the broken line, the card's typed words stay in their boxes (memory only), the walk's reply is shown without ✓ (only a stored reply has one, v1 11302)", async () => {
    h.blobs.ap_notes = { value: null, broken: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    load("sample@apSample");
    await openTab("card");
    expect(tid("ap-notes-broken")!.textContent).toBe(E.vault_ap_broken);
    typeIn($("#apC_strengths") as HTMLTextAreaElement, "S");
    typeIn($("#apC_strengths") as HTMLTextAreaElement, "Strong");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.sets).toEqual([]);
    expect(($("#apC_strengths") as HTMLTextAreaElement).value).toBe("Strong");
    expect(tid("ap-notes-broken")).not.toBeNull();
    // Export opens the export place (Task 12); a broken store saves nothing, so the zip has what the server holds.
    await click($("#apCardBtn"));
    expect(h.openExport).toHaveBeenLastCalledWith("notes");
    await openTab("walk");
    h.callAI.mockResolvedValue(FX.walks[0]!.reply);
    await click($("#apShowBtn"));
    await until(() => !getAp().busy);
    expect(tid("ap-walk-reply")).not.toBeNull();
    expect(tid("ap-stages")!.querySelectorAll("button")[0]!.textContent).toBe("1");
    expect(h.sets).toEqual([]);
  });
});

describe("in a window of another stage, where ap_notes is read-only (v1 1964; register rows D-S2-17, D-S2-43)", () => {
  it("the walk's box and the card's fields are read-only, a line says notes are saved only in the writing window, and nothing is written", async () => {
    window.history.replaceState(null, "", "/p/p-1/idea?window=1");
    try {
      await mount();
      load("sample@apSample");
      await openTab("walk");
      const box = $("#apTry") as HTMLTextAreaElement;
      expect(box.readOnly).toBe(true);
      expect(tid("ap-notes-popout")!.textContent).toBe(NOTES_POPOUT);
      typeIn(box, "Words that could not be stored");
      expect(getAp().tryDraft).toEqual({});
      await openTab("card");
      expect(["strengths", "weak", "verdict", "notes"].map((f) => ($("#apC_" + f) as HTMLTextAreaElement).readOnly)).toEqual([true, true, true, true]);
      expect(tid("ap-notes-popout")!.textContent).toBe(NOTES_POPOUT);
      typeIn($("#apC_weak") as HTMLTextAreaElement, "W");
      expect(getAp().cardDraft).toEqual({});
      expect(h.sets).toEqual([]);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("in the writing window there is no such line and the boxes can be typed in", async () => {
    await mount();
    load("sample@apSample");
    await openTab("walk");
    expect(($("#apTry") as HTMLTextAreaElement).readOnly).toBe(false);
    expect(tid("ap-notes-popout")).toBeNull();
  });
});
