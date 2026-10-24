// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE, apRefDois, buildAskPrompt, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The reader's engines, part 1 (v1 Ask 10032-10047 and apQuotesHTML 10018-10026, apNumbersHTML 10106-10110, apRefCheck/apRefHTML 11221-11270), driven through the reader's tabs (it was Analyse a
 * paper before wave B Task 27). The expected text is v1's own, read from core's golden fixture test/golden/appanel/cases.json (`golden:capture appanel`, v1 driven in jsdom on the same inputs): what
 * the toasts said, and the textContent of what apNumbersHTML and apRefHTML drew. The intake (a file, pasted text, a paper chosen) and the head of what was read are in test/reader.test.tsx; the
 * walk-through and the card are test/analyseWalk.test.tsx. A paper is loaded into the page state and the reader opens on it as a pasted text (`pasted`) or the practice paper (`sample`).
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  oaKey: null as string | null,
  query: "",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(h.query), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p-1/lit/reading/pasted" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", go: vi.fn() }) }));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: () => ({ value: null, loading: false, locked: false, set: () => {}, flush: async () => true }) }));

import { Reader } from "../components/reader/Reader";
import { useApNotes } from "../lib/analyse/notes";
import { getAp, resetAp, setAp } from "../lib/analyse/useApDoc";
import { fromPaste, loadPaper, nextIntake } from "../lib/analyse/intake";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Fx = {
  numbers: Array<{ id: string; text: string; lines: Array<{ mark: string; label: string; note: string }> }>;
  refs: Array<{ id: string; refs: unknown; busy: boolean; button: string; disabled: boolean; text: string; links: Array<{ href: string; text: string; target: string; rel: string }> }>;
  asks: Array<{ id: string; paper: string; consent: boolean; q: string; reply: string; opts: Array<Record<string, unknown>>; toasts: string[]; qDraftAfter: string; box: null | { text: string; banner: string | null; quotes: Array<{ text: string; bad: boolean }> } }>;
};
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/appanel/cases.json"), "utf8")) as Fx;
const FETCH = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { refcheck: { dois: string[]; requested: string[] } };
type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };
const CORPUS = JSON.parse(readFileSync(join(CORE_TEST, "golden/analyse/papers.json"), "utf8")) as Paper[];
type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const REC = (name: string) => JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", name), "utf8")) as Rec;
const SAMPLE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;
/** A paper of the fixture as the capture loaded it (analyse/papers.json, the sample by apSample, the sample three times). */
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
/** The reader over the Reading tab's store of notes, as LitPlace mounts it. */
function Harness({ pid }: { pid: string }) {
  const notes = useApNotes("p-1");
  return <Reader pid={pid} notes={notes} />;
}
/** The reader on the loaded paper, open on `tab`: the practice paper is `sample`, anything else loaded with `load` is shown as the pasted text. */
async function mount(tab: string, pid = "pasted") {
  h.query = "tab=" + tab;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Harness pid={pid} />); });
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function tick(el: HTMLInputElement, on: boolean) { if (el.checked !== on) act(() => { el.click(); }); }
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const quiet = { toast: () => {}, t: (k: string, v?: Record<string, string | number>) => (v ? E[k]!.replace(/\{(\w+)\}/g, (m, x: string) => (x in v ? String(v[x]) : m)) : E[k]!) };
const load = (id: string) => { const p = paperOf(id); act(() => { expect(loadPaper(p.title, p.pages, p.src, p.sample, quiet)).toBe(true); }); };

beforeEach(() => {
  resetAp();
  h.toast.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.oaKey = null; h.query = "";
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the Ask tab (apAsk 10032-10047, apQuotesHTML 10018-10026, the log 11298-11305)", () => {
  it.each(FX.asks.map((a) => [a.id, a] as const))("%s: v1's options, toasts and answer box", async (_id, c) => {
    if (c.paper === "sample@apSample") await mount("ask", "sample"); else { load(c.paper); await mount("ask"); }
    tick($("#apOK") as HTMLInputElement, c.consent);
    h.callAI.mockResolvedValue(c.reply);
    typeIn($("#apQ") as HTMLTextAreaElement, c.q);
    await click(tid("ap-ask-btn"));
    await settle();
    expect(toasts()).toEqual(c.toasts);
    expect(h.callAI.mock.calls.map((k) => k[1])).toEqual(c.opts);
    if (c.opts.length) expect(h.callAI.mock.calls[0]![0]).toBe(buildAskPrompt(fieldLabel("psychology"), getAp().doc!, c.q).prompt);
    expect(($("#apQ") as HTMLTextAreaElement).value).toBe(c.qDraftAfter);
    const box = tid("ap-answer");
    if (!c.box) { expect(box).toBeNull(); return; }
    expect(box!.textContent).toBe(c.box.text);
    expect(box!.querySelector('[data-testid="ap-banner"]')?.textContent ?? null).toBe(c.box.banner);
    expect([...box!.querySelectorAll("blockquote")].map((b) => ({ text: b.textContent, bad: b.classList.contains("ap-bad") }))).toEqual(c.box.quotes);
  });

  it("the cases reach what the brief names: one quote matched and one missed (banner with 1), the non-JSON sentence, the partial-read note", () => {
    expect(FX.asks.find((a) => a.id === "sample-json")!.box!.banner).toBe("⚠ 1 of the quotations below could not be matched to the paper text. The answer may rest on words the paper does not contain. Open the paper and check.");
    expect(FX.asks.find((a) => a.id === "sample-raw")!.box!.text).toContain(E.ap2_the_answer_could_not);
    expect(FX.asks.find((a) => a.id === "long-partial")!.box!.text).toContain("The paper is long, so the 20 passages closest to your question (of 34) were read.");
  });

  it("a chip puts its question in the box and gives the box the focus; the five chips are v1's", async () => {
    await mount("ask", "sample");
    const chips = $$('[data-testid="ap-chip"]');
    expect(chips.map((c) => c.textContent)).toEqual(["What was the research gap?", "Why did the authors choose this design?", "Who were the participants and how were they chosen?", "Which statistical test was used and why?", "What are the limitations?"]);
    await click(chips[3]!);
    expect(($("#apQ") as HTMLTextAreaElement).value).toBe("Which statistical test was used and why?");
    expect(document.activeElement).toBe($("#apQ"));
    expect(($("#apQ") as HTMLTextAreaElement).placeholder).toBe("Ask anything about the paper");
    expect($('label[for="apQ"]')!.textContent).toBe("Your question about this paper");
  });

  it("while the AI reads: v1's box, Ask disabled, a second press does nothing; the log shows the newest first", async () => {
    await mount("ask", "sample");
    let answer: (s: string) => void = () => {};
    h.callAI.mockImplementationOnce(() => new Promise<string>((r) => { answer = r; }));
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    expect(tid("ap-busy")!.textContent).toBe("Reading the paper and writing the answer…");
    expect((tid("ap-ask-btn") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { answer('{"in_paper":true,"answer":"First.","quotes":[]}'); });
    await settle();
    expect(tid("ap-busy")).toBeNull();
    h.callAI.mockResolvedValueOnce('{"in_paper":true,"answer":"Second.","quotes":[]}');
    typeIn($("#apQ") as HTMLTextAreaElement, "What are the limitations?");
    await click(tid("ap-ask-btn"));
    await settle();
    expect($$('[data-testid="ap-answer"]').map((b) => b.textContent)).toEqual(["You asked: What are the limitations?Second.", "You asked: What was the research gap?First."]);
    expect(h.callAI).toHaveBeenCalledTimes(2);
  });

  it("an Ask reply that arrives after another paper was loaded is dropped (W20)", async () => {
    await mount("ask", "sample");
    let answer: (s: string) => void = () => {};
    h.callAI.mockImplementationOnce(() => new Promise<string>((r) => { answer = r; }));
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    act(() => { expect(fromPaste(nextIntake(), "My pasted paper on reading\n" + "pasted words ".repeat(60), quiet)).toBe(true); });
    await act(async () => { answer('{"in_paper":true,"answer":"For the practice paper.","quotes":[]}'); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(getAp().log).toEqual([]);
    expect(tid("ap-answer")).toBeNull();
    expect(tid("ap-about")).toBeNull();
    expect(getAp().busy).toBe(false);
  });

  it("each answer names its paper", async () => {
    await mount("ask", "sample");
    h.callAI.mockResolvedValue('{"in_paper":true,"answer":"First.","quotes":[]}');
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    await settle();
    expect(tid("ap-about")).toHaveProperty("textContent", "About: " + SAMPLE_TITLE);
    // The line is above the answer, not part of its box.
    expect(tid("ap-about")!.compareDocumentPosition(tid("ap-answer")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tid("ap-answer")!.textContent).toBe("You asked: What was the research gap?First.");
  });

  it("a failed call toasts callAI's sentence and keeps the question", async () => {
    await mount("ask", "sample");
    h.callAI.mockRejectedValueOnce(new Error("Your AI key was not accepted. Check it in Settings."));
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    await settle();
    expect(toasts()).toEqual(["Your AI key was not accepted. Check it in Settings."]);
    expect(tid("ap-answer")).toBeNull();
    expect(($("#apQ") as HTMLTextAreaElement).value).toBe("What was the research gap?");
  });
});

describe("the Check numbers tab (apNumbersRun / apNumbersHTML 10106-10110)", () => {
  it("nothing before the button; the button is v1's", async () => {
    load("sample");
    await mount("numbers");
    expect(tid("ap-num-btn")!.textContent).toBe("🔢 Check the paper's numbers");
    expect(tid("ap-numbers")).toBeNull();
  });
  it.each(FX.numbers.map((n) => [n.id, n] as const))("%s: v1's box, line for line", async (id, c) => {
    if (id === "sample@apSample") await mount("numbers", "sample"); else { load(id); await mount("numbers"); }
    await click(tid("ap-num-btn"));
    expect(tid("ap-numbers")!.textContent).toBe(c.text);
    expect($$('[data-testid="ap-num-line"]').map((l) => ({ mark: l.firstChild!.textContent!.trim(), label: l.querySelector("code")!.textContent, note: l.querySelector("span")!.textContent }))).toEqual(c.lines);
  });
  it("the cases hold the two caveats and the none-found sentence", () => {
    const all = FX.numbers.map((n) => n.text).join("\n");
    expect(all).toContain("This tests arithmetic only. It says nothing about whether the test was the right one.");
    expect(all).toContain("A one-tailed test, a correction, or a typing slip can explain this; read the paper.");
    expect(all).toContain("Many papers print results in tables, which this check cannot read.");
  });
});

describe("the Check numbers tab, the reference check (apRefCheck / apRefHTML 11236-11270)", () => {
  it.each(FX.refs.map((r) => [r.id, r] as const))("%s: v1's box, button and links", async (_id, c) => {
    load("sample");
    await mount("numbers");
    // The 429 reaches the panel as core's "429" (register D-S2-6); v1's state holds oaHttpError's sentence, which the panel shows for it.
    const refs = c.id === "stopped-429" ? { ...(c.refs as object), error: "429" } : c.refs;
    act(() => { setAp({ refs: refs as never, refBusy: c.busy }); });
    expect(tid("ap-ref-btn")!.textContent).toBe(c.button);
    expect((tid("ap-ref-btn") as HTMLButtonElement).disabled).toBe(c.disabled);
    expect(tid("ap-refs")!.textContent).toBe(c.text);
    expect([...tid("ap-refs")!.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent, target: a.getAttribute("target"), rel: a.getAttribute("rel") }))).toEqual(c.links);
  });

  it("a paper with no reference list, and one whose list prints no DOIs: v1's boxes, no request", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    load("pdf-three-pages");
    await mount("numbers");
    await click(tid("ap-ref-btn"));
    expect(tid("ap-refs")!.textContent).toBe(FX.refs.find((r) => r.id === "no-list")!.text);
    load("sample");
    await settle();
    await click(tid("ap-ref-btn"));
    expect(tid("ap-refs")!.textContent).toBe(FX.refs.find((r) => r.id === "no-dois")!.text);
    expect(f).not.toHaveBeenCalled();
  });

  it("the list's DOIs go to OpenAlex (the recorded answer): 'Checking…' while it runs, then v1's report; the OpenAlex key rides along when there is one", async () => {
    const rec = REC("oa-refcheck-355dede8.json");
    const seen: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      await gate;
      return new Response(rec.body, { status: rec.status, headers: { "content-type": "application/json" } });
    }));
    h.oaKey = "k-test";
    const body = paperOf("sample").pages.slice(0, 2).join("\n");
    const pages = [body + "\nReferences\nReferences. " + FETCH.refcheck.dois.join(" ; ")];
    act(() => { expect(loadPaper("Reference check", pages, "paste", false, quiet)).toBe(true); });
    expect(apRefDois(getAp().doc!)).toEqual(FETCH.refcheck.dois);
    await mount("numbers");
    await click(tid("ap-ref-btn"));
    expect(tid("ap-refs")!.textContent).toBe("Checking 12 DOIs with OpenAlex… 0 done.");
    expect((tid("ap-ref-btn") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(seen).toEqual([FETCH.refcheck.requested[0] + "&api_key=k-test"]);
    const finished = FX.refs.find((r) => r.id === "finished")!;
    expect(tid("ap-refs")!.textContent).toBe(finished.text);
    expect(getAp().refs).toMatchObject({ finished: true, dois: FETCH.refcheck.dois });
  });
});
