import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 12's Analyse a paper page, driven in v1 (index.html build 2026.10.13a) on this folder's inputs.json and the papers of analyse/papers.json (read, never copied; the sample's pages are
 * v1's AP_SAMPLE, read from v1 here). Every output below is v1's own: what its page code did and drew.
 *
 * - `files`: apFromFile (9900-9916) on a fake input holding one file `{ name, text(), arrayBuffer() }`. A PDF's text comes from shExtractPdf (11564), which the capture replaces with one that
 *   returns the case's pages (or throws the case's message), as pdf.js would after reading; a Word file's from mammoth.extractRawText, which the capture installs returning the case's text (and
 *   removes for `docx: null`, v1's "Word reader needs the internet" branch). AP.doc is set to null first; the record keeps the input (the pages or the text the file gave), the toasts and
 *   AP.doc's title, src, pages, sample and abstractOnly, or null.
 * - `pastes`: apFromPaste (9894-9899) with #apPaste holding the case's text; the same record.
 * - `loads`: apLoad(title, pages, src, false) (9882-9891) directly: its return, toasts and record (the two refusals at 150 and 500 characters that are not white space).
 * - `heads`: apRender's head box (11278-11283), the mode tabs (11284) and whether the reference check's button is drawn (11285), for every paper of analyse/papers.json loaded by apLoad, the sample
 *   loaded by apSample (9932: `sample` true) and `sample-x3` (the sample's pages three times, a paper longer than apPick's 13,500 characters). The box's textContent, the <pre>'s text, the tabs' text,
 *   disabled and title.
 * - `numbers`: apNumbersRun then apNumbersHTML (10106-10110) for the same papers: the box's textContent and, per statistic, its mark, its <code> and its note.
 * - `refs`: apRefHTML (11253-11270) with AP.refs and AP.refBusy set to each state apRefCheck (11236-11252) leaves: the two `none` boxes, busy, finished (the fetch fixture's AP.refs, the recorded
 *   OpenAlex body), finished with nothing flagged, one flagged with no title, stopped by the 429 (v1's oaHttpError sentence, 8032) after a batch, stopped at once. The textContent, the button's
 *   disabled, and each link's href, text, target and rel.
 * - `asks`: apAsk (10032-10047) with the case's paper loaded, the box #apOK ticked or not, AP.qDraft = q and callAI stubbed with the case's reply: the calls' options, the toasts, AP.qDraft after,
 *   and the newest box of the log as apRender draws it (11298-11304): its textContent, its banner, and each quotation's text and whether it is marked as not matched.
 * Guards (each throws): no jsdom error; apLoad of each paper succeeds; a case that should reach a branch does.
 */
type Src = { paper?: string; text?: string; pages?: string[]; prefix?: string; spread?: number };
type Inputs = {
  files: Array<{ id: string; name: string; pdf?: Src; pdfError?: string; docx?: Src | null; text?: Src }>;
  pastes: Array<{ id: string; text: string | Src }>;
  loads: Array<{ id: string; paper?: string; title?: string; pages?: string[]; src?: string }>;
  asks: Array<{ id: string; paper: string; consent?: boolean; q: string; reply: string }>;
};
type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };

export const appanel: Engine = {
  name: "appanel",
  async capture(v1: V1, { check }) {
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const corpus = JSON.parse(readFileSync(new URL("../analyse/papers.json", import.meta.url), "utf8")) as Paper[];
    const fetchFx = JSON.parse(readFileSync(new URL("../fetch/cases.json", import.meta.url), "utf8")) as { refcheck: { refs: Record<string, unknown> } };
    const w = v1.window as unknown as Record<string, unknown>;
    const doc = v1.document;
    const sample = [...v1.eval<string[]>("AP_SAMPLE")];
    const paperOf = (id: string): { title: string; pages: string[]; src: string } => {
      if (id === "sample-x3") return { title: sample[0]!.split("\n")[0]! + " (three times)", pages: [...sample, ...sample, ...sample], src: "pdf" };
      const p = corpus.find((x) => x.id === id);
      if (!p) throw new Error(`appanel: no paper ${id}`);
      return p.from === "AP_SAMPLE" ? { title: sample[0]!.split("\n")[0]!, pages: sample.slice(), src: p.src } : { title: p.title!, pages: p.pages!, src: p.src };
    };
    const textOf = (s: Src): string => {
      let t = s.text ?? (s.paper ? paperOf(s.paper).pages.join("\n") : (s.pages ?? []).join("\n"));
      if (s.spread) t = t.split("\n").join("\n".repeat(s.spread));
      return (s.prefix ?? "") + t;
    };
    const pagesOf = (s: Src): string[] => s.pages ?? paperOf(s.paper!).pages;
    const errorsAt = () => v1.errors.length;
    const noErrors = (from: number, what: string) => { if (v1.errors.length !== from) throw new Error(`appanel: jsdom errors in ${what}: ${v1.errors.slice(from).join(" | ")}`); };
    const record = () => {
      const d = v1.eval<Record<string, unknown> | null>("AP.doc");
      return d ? { title: d.title as string, src: d.src as string, pages: [...(d.pages as string[])], sample: d.sample as boolean, abstractOnly: d.abstractOnly as boolean } : null;
    };
    const ok = doc.getElementById("apOK") as HTMLInputElement;
    const main = doc.getElementById("apMain")!;

    // ---- intake
    const realPdf = w.shExtractPdf;
    const files = [];
    for (const c of inputs.files) {
      v1.eval("AP.doc=null");
      let input: { pages?: string[]; text?: string } = {};
      if (c.pdf) { const pages = pagesOf(c.pdf); input = { pages }; w.shExtractPdf = async () => ({ pages: pages.slice(), total: pages.length }); }
      else if (c.pdfError !== undefined) { const m = c.pdfError; w.shExtractPdf = async () => { throw new Error(m); }; }
      if (c.docx === null) delete w.mammoth;
      else if (c.docx) { const value = textOf(c.docx); input = { text: value }; w.mammoth = { extractRawText: async () => ({ value }) }; }
      const body = c.text ? textOf(c.text) : "";
      if (c.text) input = { text: body };
      const f = { name: c.name, text: async () => body, arrayBuffer: async () => new ArrayBuffer(8) };
      const inp = { files: [f], value: c.name };
      const t0 = v1.toasts.length, e0 = errorsAt();
      await v1.call<Promise<void>>("apFromFile", inp);
      noErrors(e0, c.id);
      if (inp.value !== "") throw new Error(`appanel: ${c.id}: apFromFile did not clear the input`);
      files.push({ id: c.id, name: c.name, input, toasts: v1.toasts.slice(t0), doc: record() });
      delete w.mammoth;
    }
    w.shExtractPdf = realPdf;
    const pastes = inputs.pastes.map((c) => {
      v1.eval("AP.doc=null");
      v1.setValue("apPaste", typeof c.text === "string" ? c.text : textOf(c.text));
      const t0 = v1.toasts.length, e0 = errorsAt();
      v1.call("apFromPaste");
      noErrors(e0, c.id);
      return { id: c.id, text: (doc.getElementById("apPaste") as HTMLTextAreaElement).value, toasts: v1.toasts.slice(t0), doc: record() };
    });
    v1.setValue("apPaste", "");
    const loads = inputs.loads.map((c) => {
      v1.eval("AP.doc=null");
      const p = c.paper ? paperOf(c.paper) : { title: c.title!, pages: c.pages!, src: c.src! };
      const t0 = v1.toasts.length;
      const out = v1.call<boolean>("apLoad", p.title, p.pages.slice(), p.src, false);
      return { id: c.id, title: p.title, pages: p.pages, src: p.src, ok: out, toasts: v1.toasts.slice(t0), doc: record() };
    });

    // ---- the head, the numbers
    const loadPaper = (id: string) => {
      const t0 = v1.toasts.length;
      if (id === "sample@apSample") v1.call("apSample");
      else { const p = paperOf(id); if (v1.call("apLoad", p.title, p.pages.slice(), p.src, false) !== true) throw new Error(`appanel: apLoad refused ${id}: ${v1.toasts.slice(t0).join(" | ")}`); }
    };
    const ids = [...corpus.map((p) => p.id), "sample@apSample", "sample-x3"];
    const heads = ids.map((id) => {
      loadPaper(id);
      const box = main.querySelector(".ap-box")!;
      const row = box.nextElementSibling!;
      const tabs = [...row.querySelectorAll("button")].map((b) => ({ text: b.textContent, disabled: b.disabled, title: b.getAttribute("title") }));
      return { id, text: box.textContent, pre: box.querySelector("pre")!.textContent, tabs, refBtn: !!doc.getElementById("apRefBtn") };
    });
    const holder = doc.createElement("div");
    const numbers = ids.map((id) => {
      loadPaper(id);
      const e0 = errorsAt();
      v1.call("apNumbersRun");
      holder.innerHTML = v1.call<string>("apNumbersHTML");
      noErrors(e0, "numbers " + id);
      const box = holder.querySelector(".ap-box")!;
      const lines = [...box.querySelectorAll("code")].map((code) => {
        const line = code.parentElement!;
        return { mark: (line.firstChild!.textContent ?? "").trim(), label: code.textContent, note: line.querySelector("span")!.textContent };
      });
      return { id, text: box.textContent, lines };
    });

    // ---- the reference check's states
    const sentence429 = v1.call<Error>("oaHttpError", { status: 429 }).message;
    const dois12 = (fetchFx.refcheck.refs.dois as string[]).slice();
    const many = Array.from({ length: 50 }, (_, i) => `10.1000/x${i}`);
    const STATES: Array<{ id: string; refs: unknown; busy: boolean }> = [
      { id: "no-list", refs: { none: "no reference list" }, busy: false },
      { id: "no-dois", refs: { none: "no DOIs" }, busy: false },
      { id: "busy", refs: { dois: dois12, flag: {}, seen: {}, done: 0 }, busy: true },
      { id: "finished", refs: fetchFx.refcheck.refs, busy: false },
      { id: "finished-none-one-doi", refs: { dois: ["10.1000/one"], flag: {}, seen: {}, done: 1, finished: true }, busy: false },
      { id: "one-flag-no-title", refs: { dois: ["10.1000/a", "10.1000/b"], flag: { "10.1000/a": "" }, seen: { "10.1000/a": true, "10.1000/b": true }, done: 2, finished: true }, busy: false },
      { id: "stopped-429", refs: { dois: many, flag: { "10.1000/x3": "A retracted study of homework" }, seen: { "10.1000/x3": true, "10.1000/x7": true }, done: 40, error: sentence429 }, busy: false },
      { id: "stopped-at-once", refs: { dois: ["10.1000/only"], flag: {}, seen: {}, done: 0, error: "Failed to fetch" }, busy: false },
    ];
    const refs = STATES.map((s) => {
      v1.eval("AP.refs=" + JSON.stringify(s.refs) + ";AP.refBusy=" + String(s.busy));
      holder.innerHTML = v1.call<string>("apRefHTML");
      const btn = holder.querySelector("#apRefBtn") as HTMLButtonElement;
      const links = [...holder.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent, target: a.getAttribute("target"), rel: a.getAttribute("rel") }));
      return { id: s.id, refs: s.refs, busy: s.busy, button: btn.textContent, disabled: btn.disabled, text: holder.textContent!.slice(btn.textContent!.length), links };
    });
    v1.eval("AP.refs=null;AP.refBusy=false");

    // ---- Ask
    const asks = [];
    for (const c of inputs.asks) {
      loadPaper(c.paper);
      ok.checked = !!c.consent;
      v1.eval("AP.qDraft=" + JSON.stringify(c.q));
      const calls = v1.stubCallAI(c.reply);
      const t0 = v1.toasts.length, e0 = errorsAt();
      await v1.call<Promise<void>>("apAsk");
      noErrors(e0, "ask " + c.id);
      const box = [...main.querySelectorAll(".ap-box")].find((b) => b.firstElementChild?.tagName === "B" && b.firstElementChild.textContent === "You asked:") ?? null;
      asks.push({
        id: c.id, paper: c.paper, consent: !!c.consent, q: c.q, reply: c.reply,
        opts: calls.map((k) => k.opts), toasts: v1.toasts.slice(t0), qDraftAfter: v1.eval<string>("AP.qDraft"),
        box: box ? {
          text: box.textContent,
          banner: box.querySelector(".ap-banner")?.textContent ?? null,
          quotes: [...box.querySelectorAll("blockquote")].map((b) => ({ text: b.textContent, bad: b.classList.contains("ap-bad") })),
        } : null,
      });
    }
    ok.checked = false;
    v1.eval("AP.doc=null;AP.log=[]");
    main.innerHTML = "";

    if (!files.some((f) => f.doc === null && f.toasts.length > 1)) throw new Error("appanel: no file case is refused after reading");
    if (!asks.some((a) => a.box?.banner) || !asks.some((a) => a.toasts.length && a.opts.length === 0)) throw new Error("appanel: the ask cases miss the banner or a refusal");
    return [writeFixture("appanel", "cases", { files, pastes, loads, heads, numbers, refs, asks }, v1, check)];
  },
};
