// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { docInnerText, escHTML, ncFmtP, rtHash, rtSetRecord, statsParseText, type ParsedData } from "@appuscholar/core";
import en from "../messages/en.json";
import hiAll from "../messages/hi.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";
import { editorExtensions } from "../lib/editorExtensions";

/*
 * Task B6: the Check tab: the numbers check (v1 ncDlg and ncOpen 12351-12367, ncJump 12368) and results linked to their data (v1 rtDlg, rtScan 12272, rtRerunOne 12313,
 * rtRerun 12331, rtRerunAll 12340). The numbers cases are core's golden fixtures (packages/core/test/golden/numbers: v1 driven in jsdom, 148 documents), read here.
 */

type Judged = { status: "ok" | "warn" | "error"; note: string; pcalc?: number | { $n: string } };
type Find = { raw: string; op: string; pStr: string };
type Gold = { id: string; text?: string; html?: string; textContent?: string; find: Find[]; judged: Judged[] };
const FIX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/numbers/cases.json"), "utf8")) as { cases: Gold[]; summary: Array<{ id: string; shown: string }> };

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  text: "",
  docs: [] as Array<{ id: string; title: string; text: string; html: string }>,
  /** The document access: reads and writes as the writing window does; `rewrite` is replaced by a test that wants a refusal. */
  rewrite: null as null | ((id: string, html: string) => Promise<boolean>),
  rewrites: [] as Array<{ id: string; html: string }>,
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  state: {} as Record<string, { loading?: boolean; locked?: boolean; broken?: boolean; error?: boolean }>,
  forces: new Set<() => void>(),
  editor: null as unknown,
  project: { projectId: "p1", docOpen: true, openDocument: vi.fn(), selectDoc: vi.fn(async (_id: string) => true), currentDoc: null as null | { id: string } },
  confirm: vi.fn((_m?: unknown) => true)
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.project }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/editor/docAccess", () => ({
  useDocAccess: () => ({
    text: () => h.text,
    allDocuments: async () => h.docs.map((d) => ({ ...d })),
    rewriteDocument: async (id: string, html: string) => {
      h.rewrites.push({ id, html });
      if (h.rewrite) return h.rewrite(id, html);
      const d = h.docs.find((x) => x.id === id);
      if (!d) return false;
      d.html = html; d.text = docInnerText(html);
      return true;
    }
  })
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer, useRef, useEffect } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      const alive = useRef(true);
      useEffect(() => { alive.current = true; h.forces.add(force); return () => { alive.current = false; h.forces.delete(force); }; }, [force]);
      const s = h.state[kind] ?? {};
      return {
        value: h.store[kind] ?? null, loading: s.loading ?? false, locked: s.locked ?? false, broken: s.broken ?? false, error: s.error ?? false, readOnly: false,
        set: (next: unknown) => {
          if (!alive.current) return;
          const v = typeof next === "function" ? (next as (p: unknown) => unknown)(h.store[kind] ?? null) : next;
          h.store[kind] = v;
          h.writes.push({ kind, json: JSON.stringify(v) });
          force();
        },
        flush: async () => true
      };
    }
  };
});

import { Panel } from "../components/tools/stats/Panel";
import { getLab, patchLab, resetLabs } from "../lib/tools/stats/lab";
import { defaultForm } from "../lib/tools/stats/form";
import { runLabTest, runRecord } from "../lib/tools/stats/run";
import { toStatsForm } from "../lib/tools/stats/form";
import { numbersView } from "../lib/tools/stats/checkNumbers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const hi = statsHi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (id: string) => tid(id)?.textContent ?? "";
const fill = (s: string, vars: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const w = (key: string, vars?: Record<string, string | number>) => fill(E[key] ?? key, vars);

async function mount(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="check" projectId="p1" />); });
  return root;
}
async function click(testId: string, i = 0) {
  const el = all(testId)[i];
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
async function rerender() { await act(async () => { for (const f of [...h.forces]) f(); }); }

beforeEach(() => {
  resetLabs();
  h.text = ""; h.docs = []; h.rewrite = null; h.rewrites = []; h.store = {}; h.writes = []; h.state = {}; h.editor = null; h.confirm = vi.fn((_m?: unknown) => true);
  h.project.currentDoc = null; h.project.docOpen = true;
  h.toast.mockClear(); h.project.openDocument.mockClear(); h.project.selectDoc.mockClear();
  vi.spyOn(window, "confirm").mockImplementation((m) => h.confirm(m));
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const STATUS_LABEL = { ok: E.nc_ok, warn: E.nc_warn, error: E.nc_err } as const;
const nan = (x: Judged["pcalc"]) => (typeof x === "object" ? NaN : x);

describe("Numbers check", () => {
  it("148 numbers cases flag as v1: every golden document, through the tab, gives v1's summary line and cards", async () => {
    expect(FIX.cases).toHaveLength(148);
    expect(FIX.summary).toHaveLength(148);
    await mount();
    let withCards = 0;
    for (const [i, g] of FIX.cases.entries()) {
      // v1 read a body as the editor's textContent (12353): the golden records that text for the bodies.
      h.text = g.text ?? g.textContent!;
      await click("check-nc-run");
      expect(text("check-nc-sum"), g.id).toBe(FIX.summary[i]!.shown);
      const cards = all("check-nc-card");
      expect(cards, g.id).toHaveLength(g.find.length);
      withCards += cards.length;
      cards.forEach((card, j) => {
        const f = g.find[j]!, v = g.judged[j]!;
        expect(card.dataset.status, g.id).toBe(v.status);
        expect(card.querySelector("[data-testid=check-nc-label]")!.textContent, g.id).toBe(STATUS_LABEL[v.status]);
        expect(card.querySelector("[data-testid=check-nc-raw]")!.textContent, g.id).toBe(f.raw.trim());
        const detail = card.querySelector("[data-testid=check-nc-detail]");
        if (v.status === "ok" && !v.note) { expect(detail, g.id).toBeNull(); return; }
        expect(detail!.querySelector("[data-testid=check-nc-wrote]")!.textContent, g.id).toBe("p " + f.op + " " + f.pStr);
        const pc = nan(v.pcalc);
        expect(detail!.querySelector("[data-testid=check-nc-calc]")!.textContent, g.id).toBe(pc !== undefined && isFinite(pc) ? "p " + ncFmtP(pc) : "–");
        expect(detail!.querySelector("[data-testid=check-nc-note]")?.textContent ?? "", g.id).toBe(v.note ? E[v.note] : "");
      });
    }
    expect(withCards).toBe(FIX.cases.reduce((n, g) => n + g.find.length, 0));
    expect(withCards).toBeGreaterThan(100);
  });

  it("a document read with its paragraph breaks gives v1's statistics and verdicts; the one difference is a statistic v1 missed after a paragraph that ended in a number", () => {
    const bodies = FIX.cases.filter((g) => g.html);
    expect(bodies.length).toBe(10);
    const flat = (s: string) => s.replace(/\s+/g, " ");
    const differs: string[] = [];
    for (const g of bodies) {
      const mine = numbersView(docInnerText(g.html!));
      const same = mine.cards.length === g.find.length && mine.cards.every((c, j) => c.status === g.judged[j]!.status && flat(c.raw).replace(/ /g, "") === flat(g.find[j]!.raw.trim()).replace(/ /g, ""));
      if (!same) differs.push(g.id);
    }
    // v1's textContent ran "3.45" and the next paragraph's "t(58)" together, and "\\bt" then did not match; with the break kept it does (register row D-S2-79).
    expect(differs).toEqual(["html-glued-boundary"]);
    const glued = numbersView(docInnerText(bodies.find((g) => g.id === "html-glued-boundary")!.html!));
    expect(glued.cards.map((c) => [c.raw, c.status])).toEqual([["t(58) = 2.36, p = .022", "ok"]]);
    expect(bodies.find((g) => g.id === "html-glued-boundary")!.find).toHaveLength(0);
  });

  it("says in one sentence that nothing was found, and never calls a document fine", async () => {
    h.text = "We ran a test and it went well.";
    await mount();
    await click("check-nc-run");
    expect(text("check-nc-sum")).toBe(E.nc_none);
    expect(all("check-nc-card")).toHaveLength(0);
    h.text = "t(58) = 2.36, p = .022";
    await click("check-nc-run");
    expect(all("check-nc-card")[0]!.dataset.status).toBe("ok");
    // Rule 8: a flag is a prompt, and no flag is never shown as safe.
    expect(document.body.textContent).not.toMatch(/\b(all fine|safe|no problems?|verified|everything is)\b/i);
    expect(text("check-nc-footnote")).toBe(E.nc_note);
    expect(E.nc_note).toContain("A consistent result does not show that the right test was used.");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("'Go to this text' selects the place the card is about, the second of two identical statistics for the second card", async () => {
    const html = "<p>First: t(58) = 2.36, p = .022 and more.</p><p>Again t(58) = 2.36, p = .022 here.</p><p>t(30) = 2.04, p = .250</p>";
    const ed = new Editor({ extensions: editorExtensions, content: html });
    h.editor = ed;
    h.text = docInnerText(ed.getHTML());
    await mount();
    await click("check-nc-run");
    expect(all("check-nc-card")).toHaveLength(3);
    const sel = () => { const { from, to } = ed.state.selection; return { from, to, s: ed.state.doc.textBetween(from, to) }; };
    await click("check-nc-go", 0);
    const first = sel();
    expect(first.s).toBe("t(58) = 2.36, p = .022");
    await click("check-nc-go", 1);
    const second = sel();
    expect(second.s).toBe("t(58) = 2.36, p = .022");
    expect(second.from).toBeGreaterThan(first.from + 20);
    expect(ed.state.doc.textBetween(0, second.from).split("Again").length).toBe(2);
    await click("check-nc-go", 2);
    expect(sel().s).toBe("t(30) = 2.04, p = .250");
    expect(text("check-nc-said")).toBe("");
    ed.destroy();
  });

  it("'Go to this text' says so when the words are gone from the document, or when there is no document to select in", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>t(58) = 2.36, p = .022</p>" });
    h.editor = ed;
    h.text = "t(58) = 2.36, p = .022";
    await mount();
    await click("check-nc-run");
    ed.commands.setContent("<p>Nothing here now.</p>");
    await click("check-nc-go");
    expect(text("check-nc-said")).toBe(E.stats_check_text_gone);
    ed.destroy();
  });

  it("'Go to this text' says so when there is no editor to select in (a place's own window)", async () => {
    h.editor = null;
    h.text = "t(58) = 2.36, p = .022";
    await mount();
    await click("check-nc-run");
    await click("check-nc-go");
    expect(text("check-nc-said")).toBe(E.stats_check_text_nowhere);
  });

  it("a statistic split over two paragraphs is still found and can be gone to", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>t(58) = 2.36, p</p><p>= .022</p>" });
    h.editor = ed;
    h.text = docInnerText(ed.getHTML());
    await mount();
    await click("check-nc-run");
    expect(all("check-nc-card")).toHaveLength(1);
    await click("check-nc-go");
    expect(text("check-nc-said")).toBe("");
    expect(ed.state.selection.empty).toBe(false);
    ed.destroy();
  });
});

/* ---- results linked to their data ---- */

const csv = (b: number[]) => "group,score\n" + [5, 6, 7, 5, 6].map((x) => "A," + x).join("\n") + "\n" + b.map((x) => "B," + x).join("\n");
const parse = (b: number[]): ParsedData => statsParseText(csv(b))!;
const SIMILAR = [6, 5, 7, 6, 6], APART = [15, 16, 17, 15, 16];
const DS = "Study 1";
const sentenceOf = (d: ParsedData): string => {
  const o = runLabTest(d, "ttestInd", defaultForm(d, "ttestInd"), w);
  if (o.kind !== "ok") throw new Error("no sentence");
  return o.res.apa;
};
function recordOf(d: ParsedData, ds = DS, ts = 1000) {
  const f = defaultForm(d, "ttestInd");
  return runRecord(d, "ttestInd", toStatsForm(f), ds, sentenceOf(d), ts)!;
}
const tag = (id: string, s: string) => `<span class="stat-tag" data-run="${id}">${escHTML(s)}</span>`;
const doc = (id: string, title: string, body: string) => ({ id, title, html: body, text: docInnerText(body) });
/** The student has the changed data loaded and registered under the name; the stored lists hold the earlier run. */
function setUp(opts: { loaded?: ParsedData | null; runDs?: string } = {}) {
  const dA = parse(SIMILAR);
  const sets = rtSetRecord(dA, DS, {}, 1000);
  h.store.stats_runs = { r1: recordOf(dA, opts.runDs ?? DS), r2: recordOf(dA, opts.runDs ?? DS, 1500) };
  const loaded = opts.loaded === undefined ? parse(APART) : opts.loaded;
  h.store.stats_sets = loaded ? rtSetRecord(loaded, DS, sets, 2000) : sets;
  if (loaded) patchLab("p1", { data: loaded, registered: loaded, regName: DS });
  return { dA, old: sentenceOf(dA), sets };
}
const P = (s: string) => `<p>${s}</p>`;
const msg = (i = 0) => all("check-rt-msg")[i]?.textContent ?? "";

describe("Results linked to their data: the list", () => {
  it("lists the tagged results of every document of the project with Current, Out of date or Cannot check, and why", async () => {
    const dA = parse(SIMILAR);
    const old = sentenceOf(dA);
    const sets = rtSetRecord(dA, DS, {}, 1000);
    const changed = rtSetRecord(parse(APART), DS, sets, 7_000_000);
    const dB = parse([9, 9, 9, 9, 10]);
    h.store.stats_runs = { cur: recordOf(dA), old: recordOf(dA, DS), gone: recordOf(dB, "Missing data", 1000) };
    h.store.stats_sets = { ...changed };
    // "cur" must match the stored set, so give it the changed data's fingerprint
    (h.store.stats_runs as Record<string, { hash: string }>).cur!.hash = (changed[DS]!).hash;
    h.docs = [
      doc("d1", "Methods", P("Intro.") + P(tag("cur", old)) + P(tag("old", old))),
      doc("d2", "Results", P(tag("gone", old)) + P(tag("nobody", "t(5) = 1.00, p = .363")))
    ];
    await mount();
    expect(tid("check-rt-result")).toBeNull();
    await click("check-rt-run");
    expect(text("check-rt-sum")).toBe(w("rt_sum", { n: 4, c: 1, s: 1, u: 2 }));
    const cards = all("check-rt-card");
    expect(cards.map((c) => c.dataset.status)).toEqual(["cur", "stale", "unk", "unk"]);
    expect(cards.map((c) => c.querySelector("[data-testid=check-rt-label]")!.textContent)).toEqual([E.rt_cur, E.rt_stale, E.rt_unk, E.rt_unk]);
    expect(cards[0]!.querySelector("[data-testid=check-rt-why]")).toBeNull();
    expect(cards[1]!.querySelector("[data-testid=check-rt-why]")!.textContent).toBe(w("rt_why_stale", { d: new Date(7_000_000).toLocaleString() }));
    expect(cards[2]!.querySelector("[data-testid=check-rt-why]")!.textContent).toBe(w("stats_check_why_noset", { n: "Missing data" }));
    expect(cards[3]!.querySelector("[data-testid=check-rt-why]")!.textContent).toBe(E.rt_why_norec);
    // the second document is in the scan, and the titles are shown once there is more than one document
    expect(cards.map((c) => c.querySelector("[data-testid=check-rt-doc]")!.textContent)).toEqual([w("stats_check_in_doc", { title: "Methods" }), w("stats_check_in_doc", { title: "Methods" }), w("stats_check_in_doc", { title: "Results" }), w("stats_check_in_doc", { title: "Results" })]);
    expect(text("check-rt-note")).toBe(E.rt_note);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("an edited data set under the same name marks the tag Out of date, and a stored run for it offers re-run", async () => {
    const { old } = setUp();
    h.docs = [doc("d1", "Methods", P(tag("r1", old)))];
    await mount();
    await click("check-rt-run");
    expect(all("check-rt-card")[0]!.dataset.status).toBe("stale");
    expect(tid("check-rt-rerun")).not.toBeNull();
    expect(tid("check-rt-all")).not.toBeNull();
  });

  it("says nothing was found when the project holds no tagged result, and does not offer re-running", async () => {
    h.docs = [doc("d1", "Methods", P("No tags here."))];
    await mount();
    await click("check-rt-run");
    expect(text("check-rt-sum")).toBe(E.stats_check_rt_none);
    expect(tid("check-rt-all")).toBeNull();
  });

  it("tells a locked vault, a list still being read and a list that cannot be read apart from an empty project", async () => {
    h.state.stats_runs = { locked: true };
    await mount();
    expect(text("check-rt-waiting")).toBe(E.stats_check_rt_locked);
    expect(tid("check-rt-run")).toBeNull();
    h.state = { stats_sets: { loading: true } };
    await rerender();
    expect(text("check-rt-waiting")).toBe(E.stats_check_rt_loading);
    h.state = { stats_runs: { broken: true } };
    await rerender();
    expect(text("check-rt-waiting")).toBe(E.stats_check_rt_unreadable);
    h.state = {};
    await rerender();
    expect(tid("check-rt-run")).not.toBeNull();
  });

  it("'Go to this text' on a result in the open document selects it; one in another document offers to open that document", async () => {
    const { old } = setUp();
    const html = P("Before.") + P(tag("r1", old)) + P("After.");
    const ed = new Editor({ extensions: editorExtensions, content: html });
    h.editor = ed;
    h.project.currentDoc = { id: "d1" };
    h.docs = [doc("d1", "Methods", html), doc("d2", "Results", P(tag("r2", old)))];
    await mount();
    await click("check-rt-run");
    await click("check-rt-go", 0);
    const { from, to } = ed.state.selection;
    expect(ed.state.doc.textBetween(from, to)).toBe(old);
    expect(all("check-rt-go")).toHaveLength(1);
    await click("check-rt-open", 0);
    expect(h.project.selectDoc).toHaveBeenCalledWith("d2");
    ed.destroy();
  });
});

describe("Results linked to their data: re-run on current data", () => {
  it("replaces only that tagged sentence, keeps the tag and its run id, updates the record and says the conclusion changed", async () => {
    const { old, dA } = setUp();
    const other = P("A different paragraph with t(58) = 2.36, p = .022 in it.");
    const html = P("Intro.") + P("The groups differed: " + tag("r1", old) + " That was clear.") + other + P(tag("r2", old));
    h.docs = [doc("d1", "Methods", html)];
    await mount();
    await click("check-rt-run");
    await click("check-rt-rerun", 0);
    const neu = sentenceOf(parse(APART));
    expect(neu).not.toBe(old);
    // exactly one write, the same document with that one span's words changed and nothing else
    expect(h.rewrites).toHaveLength(1);
    expect(h.rewrites[0]!.id).toBe("d1");
    expect(h.rewrites[0]!.html).toBe(html.replace(`data-run="r1">${escHTML(old)}`, `data-run="r1">${escHTML(neu)}`));
    expect(h.rewrites[0]!.html).toContain(tag("r2", old));
    expect(h.rewrites[0]!.html).toContain(other);
    // the record: same id, new sentence, the new data's fingerprint; the other run untouched
    const runs = h.store.stats_runs as Record<string, { sentence: string; hash: string; ds: string; label: string; ts: number }>;
    expect(runs.r1!.sentence).toBe(neu);
    expect(runs.r1!.hash).toBe(rtHash(parse(APART)));
    expect(runs.r1!.hash).not.toBe(rtHash(dA));
    expect(runs.r1!.ds).toBe(DS);
    expect(runs.r1!.ts).toBeGreaterThan(1000);
    expect(runs.r2!.sentence).toBe(old);
    // the message, with the flip line (p was not significant, now it is)
    expect(msg()).toContain(E.rt_done);
    expect(tid("check-rt-flip")!.textContent).toBe(E.rt_sig_flip);
    // the list was read again: r1 is Current now, r2 still Out of date
    expect(all("check-rt-card").map((c) => c.dataset.status)).toEqual(["cur", "stale"]);
    // the Data tab's form shows the test and columns of that run
    expect(getLab("p1").test).toBe("ttestInd");
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("a result pasted twice carries one run id: re-running the second replaces the second only, and the first then says it was changed", async () => {
    const { old } = setUp();
    const html = P("One: " + tag("r1", old)) + P("Two: " + tag("r1", old));
    h.docs = [doc("d1", "Methods", html)];
    await mount();
    await click("check-rt-run");
    expect(all("check-rt-card")).toHaveLength(2);
    await click("check-rt-rerun", 1);
    const neu = sentenceOf(parse(APART));
    expect(h.rewrites[0]!.html).toBe(P("One: " + tag("r1", old)) + P("Two: " + tag("r1", neu)));
    const cards = all("check-rt-card");
    expect(cards.map((c) => c.dataset.status)).toEqual(["cur", "cur"]);
    expect(cards[0]!.querySelector("[data-testid=check-rt-edited]")).not.toBeNull();
    expect(cards[1]!.querySelector("[data-testid=check-rt-edited]")).toBeNull();
  });

  it("no flip line when the conclusion at .05 is the same", async () => {
    // the run was made on data that was already significant; changed data is significant as well
    const dA = parse(APART);
    const dB = parse([15, 16, 17, 15, 18]);
    const sets = rtSetRecord(dA, DS, {}, 1000);
    h.store.stats_runs = { r1: recordOf(dA) };
    h.store.stats_sets = rtSetRecord(dB, DS, sets, 2000);
    patchLab("p1", { data: dB, registered: dB, regName: DS });
    h.docs = [doc("d1", "Methods", P(tag("r1", sentenceOf(dA))))];
    await mount();
    await click("check-rt-run");
    await click("check-rt-rerun");
    expect(msg()).toBe(E.rt_done);
    expect(tid("check-rt-flip")).toBeNull();
  });

  it("asks before replacing text the student edited, and declining changes nothing", async () => {
    const { old } = setUp();
    h.docs = [doc("d1", "Methods", P(tag("r1", old + " (my own words added)")))];
    await mount();
    await click("check-rt-run");
    expect(tid("check-rt-edited")!.textContent).toBe(E.rt_edited);
    h.confirm = vi.fn((_m?: unknown) => false);
    await click("check-rt-rerun");
    expect(h.confirm).toHaveBeenCalledWith(E.rt_edit_warn);
    expect(E.rt_edit_warn).toBe("Re-running replaces your edited text with the new sentence. Continue?");
    expect(h.rewrites).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
    h.confirm = vi.fn((_m?: unknown) => true);
    await click("check-rt-rerun");
    expect(h.rewrites).toHaveLength(1);
    expect(h.rewrites[0]!.html).not.toContain("my own words");
  });

  it("does not ask when the sentence is as it was inserted", async () => {
    const { old } = setUp();
    h.docs = [doc("d1", "Methods", P(tag("r1", old)))];
    await mount();
    await click("check-rt-run");
    await click("check-rt-rerun");
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("with no data loaded under the run's name it says so and changes nothing", async () => {
    const { old } = setUp({ loaded: null });
    h.docs = [doc("d1", "Methods", P(tag("r1", old)))];
    await mount();
    await click("check-rt-run");
    // no data set changed in the stored list either, so the tag is current: make it out of date by a later fingerprint
    h.store.stats_sets = { [DS]: { hash: "other-hash", ts: 2000, n: 10 } };
    await rerender();
    await click("check-rt-run");
    await click("check-rt-rerun");
    expect(msg()).toBe(w("stats_check_load_first", { n: DS }));
    expect(h.rewrites).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });

  it("data loaded under another name is not used", async () => {
    const { old } = setUp();
    patchLab("p1", { regName: "Another study" });
    h.docs = [doc("d1", "Methods", P(tag("r1", old)))];
    await mount();
    await click("check-rt-run");
    await click("check-rt-rerun");
    expect(msg()).toBe(w("stats_check_load_first", { n: DS }));
    expect(h.rewrites).toHaveLength(0);
  });

  it("a column the run used that is gone says so", async () => {
    const dA = parse(SIMILAR);
    const dB = statsParseText("group,points\nA,5\nA,6\nB,15\nB,16")!;
    const sets = rtSetRecord(dA, DS, {}, 1000);
    h.store.stats_runs = { r1: recordOf(dA) };
    h.store.stats_sets = rtSetRecord(dB, DS, sets, 2000);
    patchLab("p1", { data: dB, registered: dB, regName: DS });
    h.docs = [doc("d1", "Methods", P(tag("r1", sentenceOf(dA))))];
    await mount();
    await click("check-rt-run");
    await click("check-rt-rerun");
    expect(msg()).toBe(w("rt_col_gone", { c: "score" }));
    expect(h.rewrites).toHaveLength(0);
  });

  it("a document that cannot be written (deleted, or holding unsaved text) is reported and the record stays as it was", async () => {
    const { old } = setUp();
    h.docs = [doc("d1", "Methods", P(tag("r1", old)))];
    h.rewrite = async () => false;
    await mount();
    await click("check-rt-run");
    const before = JSON.stringify(h.store.stats_runs);
    await click("check-rt-rerun");
    expect(msg()).toBe(w("stats_check_nowrite", { title: "Methods" }));
    expect(h.rewrites).toHaveLength(1);
    expect(JSON.stringify(h.store.stats_runs)).toBe(before);
    expect(h.writes).toHaveLength(0);
    expect(all("check-rt-card")[0]!.dataset.status).toBe("stale");
  });

  it("a sentence deleted since the scan is not re-run", async () => {
    const { old } = setUp();
    h.docs = [doc("d1", "Methods", P(tag("r1", old)))];
    await mount();
    await click("check-rt-run");
    h.docs = [doc("d1", "Methods", P("The student deleted it."))];
    await click("check-rt-rerun");
    expect(msg()).toBe(E.stats_check_gone);
    expect(h.rewrites).toHaveLength(0);
  });

  it("a result in a document that is not open is rewritten in that document", async () => {
    const { old } = setUp();
    h.project.currentDoc = { id: "d1" };
    h.docs = [doc("d1", "Methods", P("Open one.")), doc("d2", "Results", P("Other: " + tag("r1", old)))];
    await mount();
    await click("check-rt-run");
    await click("check-rt-rerun");
    expect(h.rewrites.map((r) => r.id)).toEqual(["d2"]);
  });

  it("'Re-run every out-of-date result' goes one by one, counts each outcome and carries on past one that cannot be re-run", async () => {
    const { old, sets } = setUp();
    // a third result, of a data set that is not loaded: it cannot be re-run
    (h.store.stats_runs as Record<string, unknown>).r3 = recordOf(parse(SIMILAR), "Study 2");
    h.store.stats_sets = { ...(h.store.stats_sets as object), "Study 2": { hash: "changed", ts: 3000, n: 10 }, ...sets, [DS]: (h.store.stats_sets as Record<string, unknown>)[DS] };
    h.docs = [doc("d1", "Methods", P(tag("r1", old)) + P(tag("r3", old))), doc("d2", "Results", P(tag("r2", old)))];
    await mount();
    await click("check-rt-run");
    expect(all("check-rt-card").map((c) => c.dataset.status)).toEqual(["stale", "stale", "stale"]);
    await click("check-rt-all");
    expect(h.rewrites.map((r) => r.id)).toEqual(["d1", "d2"]);
    const summary = text("check-rt-all-msg");
    expect(summary).toContain(w("stats_check_all_summary", { done: 2, n: 3, skipped: 0, failed: 1 }));
    expect(summary).toContain(w("stats_check_load_first", { n: "Study 2" }));
    expect(summary).toContain(E.rt_sig_flip);
    const runs = h.store.stats_runs as Record<string, { sentence: string }>;
    expect(runs.r1!.sentence).toBe(sentenceOf(parse(APART)));
    expect(runs.r2!.sentence).toBe(sentenceOf(parse(APART)));
    expect(runs.r3!.sentence).toBe(old);
    expect(all("check-rt-card").map((c) => c.dataset.status)).toEqual(["cur", "stale", "cur"]);
  });

  it("the button for every out-of-date result is not there when nothing is out of date", async () => {
    const dA = parse(SIMILAR);
    h.store.stats_runs = { r1: recordOf(dA) };
    h.store.stats_sets = rtSetRecord(dA, DS, {}, 1000);
    h.docs = [doc("d1", "Methods", P(tag("r1", sentenceOf(dA))))];
    await mount();
    await click("check-rt-run");
    expect(all("check-rt-card")[0]!.dataset.status).toBe("cur");
    expect(tid("check-rt-all")).toBeNull();
    expect(tid("check-rt-rerun")).toBeNull();
  });
});

describe("Check tab: wording", () => {
  it("every new English string has a Hindi draft with the same placeholders, and none has an em-dash or an emoji", () => {
    const keys = Object.keys(statsEn).filter((k) => k.startsWith("stats_check_"));
    expect(keys.length).toBeGreaterThanOrEqual(19);
    const slots = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys) {
      expect(hi[k], k).toBeTruthy();
      expect(slots(hi[k]!), k).toBe(slots(E[k]!));
      expect(E[k], k).not.toMatch(/—|\p{Extended_Pictographic}/u);
    }
  });

  it("the v1 keys it reuses exist in English and Hindi", () => {
    const used = ["nc_desc", "nc_ok", "nc_warn", "nc_err", "nc_rep", "nc_calc", "nc_sum", "nc_none", "nc_note", "nc_go", "nc_rescan", "nc_c_form", "nc_c_df", "nc_c_zero", "nc_c_onetail", "nc_c_round", "nc_c_typo",
      "rt_cur", "rt_stale", "rt_unk", "rt_sum", "rt_all", "rt_rerun", "rt_done", "rt_sig_flip", "rt_edit_warn", "rt_edited", "rt_failed", "rt_col_gone", "rt_dataset", "rt_inserted", "rt_note", "rt_why_norec", "rt_why_stale"];
    for (const k of used) { expect((en as Record<string, string>)[k], k).toBeTruthy(); expect((hiAll as Record<string, string>)[k], k).toBeTruthy(); }
  });
});
