import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 12's and Task 13's Analyse a paper page, driven in v1 (index.html build 2026.10.13a) on this folder's inputs.json and the papers of analyse/papers.json (read, never copied; the sample's pages are
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
 * Task 13 (the walk-through, the paper card, the cards side by side), each case with appu_ap_notes cleared first:
 * - `walks`: apWalkShow (10048-10064) on the stage AP.stage of the case's paper, AP.tryDraft holding the case's words, #apOK ticked or not, callAI stubbed with the reply: the options, the
 *   toasts, AP.res[k], the paper's stored note, and the walk tab as apRender draws it (11300-11320) before and after (the stage buttons' text, title and which is current; the h4; each
 *   .ap-box's textContent, banner, quotations, "does not report" items and suggested answer; the two boxes' placeholder and value; the show button; the previous/next buttons), and once more
 *   after an answer is typed in "Check yourself." and apReveal (10122) is pressed.
 * - `navs`/`clamp`/`typed`: with a stored reply on the first stage, the tab at stages 1, 6 and 12 (apSetStage 10114), apSetStage beyond both ends, and the note after apDraft('try') (10118).
 * - `cards`/`cardTyped`: the card tab (11325-11331) for each stored note and AP.refs state (the boxes' text and their muted spans, the four fields' labels, rows and values, the button) and
 *   apCardText() (10124-10135); the note after apCardField (10121).
 * - `across`/`toggles`/`dels`: apAcrossRender, apAcrossCols, apAcrossAi, apAcrossData and pdCsv for each stored notes, appu_ap_cols and appu_ap_ai (the column boxes, the AI box, the empty
 *   sentence or the table's head, cells and remove buttons, the CSV button and the note); appu_ap_cols after apAcrossColToggle (9941); apAcrossDel (9978-9984) with window.confirm stubbed (its
 *   question, the notes after, AP.res and AP.tryDraft for the paper loaded). AP_COLS (9938) is emitted as data/analyse-cards-tables.ts.
 * Guards (each throws): no jsdom error; apLoad of each paper succeeds; a case that should reach a branch does.
 */
type Src = { paper?: string; text?: string; pages?: string[]; prefix?: string; spread?: number };
type Inputs = {
  files: Array<{ id: string; name: string; pdf?: Src; pdfError?: string; docx?: Src | null; text?: Src }>;
  pastes: Array<{ id: string; text: string | Src }>;
  loads: Array<{ id: string; paper?: string; title?: string; pages?: string[]; src?: string }>;
  asks: Array<{ id: string; paper: string; consent?: boolean; q: string; reply: string }>;
  walks: Array<{ id: string; paper: string; consent?: boolean; stage: number; mine?: string; reply: string }>;
  cards: Array<{ id: string; note: Record<string, unknown> | null; refs: unknown }>;
  across: {
    notes: Record<string, unknown>;
    states: Array<{ id: string; notes?: Record<string, unknown>; cols: string | null; ai: string | null }>;
    toggles: Array<{ cols: string | null; k: string; on: boolean }>;
    dels: Array<{ id: string; row: number; answer: boolean; loaded: boolean }>;
  };
};
type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };

export const appanel: Engine = {
  name: "appanel",
  async capture(v1: V1, opts) {
    const { check } = opts;
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

    // ---- Task 13: the walk-through, the paper card, the cards side by side
    const LS = (k: string, v: string | null) => v1.eval(v === null ? `LS.rm(${JSON.stringify(k)})` : `LS.set(${JSON.stringify(k)},${JSON.stringify(v)})`);
    const notesNow = () => JSON.parse(v1.eval<string | null>("LS.get('appu_ap_notes')") ?? "{}") as Record<string, unknown>;
    /** The walk tab as apRender draws it (11300-11320). */
    const walkView = () => {
      const h4 = main.querySelector("h4")!;
      const stageRow = h4.previousElementSibling!;
      const after: Element[] = [];
      for (let e = h4.nextElementSibling; e; e = e.nextElementSibling) after.push(e);
      const boxes = after.filter((e) => e.classList.contains("ap-box"));
      const nav = after[after.length - 1]!;
      const tryBox = doc.getElementById("apTry") as HTMLTextAreaElement;
      const show = doc.getElementById("apShowBtn") as HTMLButtonElement;
      const chk = doc.getElementById("apChk") as HTMLTextAreaElement | null;
      const reveal = doc.getElementById("apRevealBtn");
      return {
        stages: [...stageRow.querySelectorAll("button")].map((b) => ({ text: b.textContent, title: b.getAttribute("title"), on: b.classList.contains("btn-purple") })),
        h4: h4.textContent,
        boxes: boxes.map((b) => ({
          text: b.textContent,
          banner: b.querySelector(".ap-banner")?.textContent ?? null,
          quotes: [...b.querySelectorAll("blockquote")].map((q) => ({ text: q.textContent, bad: q.classList.contains("ap-bad") })),
          notStated: [...b.querySelectorAll("li")].map((li) => li.textContent),
          ok: b.querySelector("div.ap-ok")?.textContent ?? null,
        })),
        tryPlaceholder: tryBox.getAttribute("placeholder"), tryValue: tryBox.value,
        show: { text: show.textContent, disabled: show.disabled },
        chk: chk ? { placeholder: chk.getAttribute("placeholder"), value: chk.value } : null,
        reveal: reveal ? reveal.textContent : null,
        nav: [...nav.querySelectorAll("button")].map((b) => ({ text: b.textContent, disabled: b.disabled })),
      };
    };
    const walks = [];
    for (const c of inputs.walks) {
      LS("appu_ap_notes", null);
      loadPaper(c.paper);
      ok.checked = !!c.consent;
      const k = v1.eval<string>(`AP_STAGES[${c.stage}].k`);
      v1.eval(`AP.mode='walk';AP.stage=${c.stage};` + (c.mine !== undefined ? `AP.tryDraft[${JSON.stringify(k)}]=${JSON.stringify(c.mine)};` : "") + "apRender()");
      const before = walkView();
      const calls = v1.stubCallAI(c.reply);
      const t0 = v1.toasts.length, e0 = errorsAt();
      await v1.call<Promise<void>>("apWalkShow");
      noErrors(e0, "walk " + c.id);
      const id = v1.eval<string>("AP.doc.id");
      const res = v1.eval<unknown>(`AP.res[${JSON.stringify(k)}]`) ?? null;
      const view = walkView();
      let revealed = null;
      if (doc.getElementById("apRevealBtn")) { v1.setValue("apChk", "My check answer"); v1.call("apDraft", "chk", "My check answer"); v1.call("apReveal"); revealed = walkView(); }
      walks.push({ id: c.id, paper: c.paper, consent: !!c.consent, stage: c.stage, k, mine: c.mine ?? null, reply: c.reply, docId: id, opts: calls.map((x) => x.opts), toasts: v1.toasts.slice(t0), res: res === null ? null : JSON.parse(JSON.stringify(res)), stored: notesNow()[id] ?? null, before, view, revealed });
    }
    // Moving between stages: the first, a middle one and the last, with the first stage's reply stored (✓ on its button).
    LS("appu_ap_notes", null);
    loadPaper("sample@apSample");
    const sampleId = v1.eval<string>("AP.doc.id");
    LS("appu_ap_notes", JSON.stringify({ [sampleId]: { stages: { gap: { mine: "Stored words", res: walks[0]!.res } }, card: {}, title: v1.eval<string>("AP.doc.title") } }));
    loadPaper("sample@apSample");
    v1.eval("AP.mode='walk';apRender()");
    const navs = [0, 5, 11].map((i) => { v1.call("apSetStage", i); return { stage: i, view: walkView() }; });
    v1.eval("apSetStage(12)"); const clampHigh = v1.eval<number>("AP.stage");
    v1.eval("apSetStage(-1)"); const clampLow = v1.eval<number>("AP.stage");
    // Typing in "Try first." stores the words at once (apDraft 10118), the stage's reply kept.
    v1.call("apSetStage", 0);
    v1.call("apDraft", "try", "Typed again");
    const typed = notesNow()[sampleId];
    LS("appu_ap_notes", null);

    // ---- the paper card (11325-11331, apCardText 10124-10135)
    const cards = [];
    for (const c of inputs.cards) {
      LS("appu_ap_notes", null);
      loadPaper("sample@apSample");
      const id = v1.eval<string>("AP.doc.id");
      if (c.note) LS("appu_ap_notes", JSON.stringify({ [id]: { ...c.note, title: v1.eval<string>("AP.doc.title") } }));
      const refs = c.refs === "fetch" ? fetchFx.refcheck.refs : c.refs;
      v1.eval("AP.refs=" + JSON.stringify(refs) + ";AP.mode='card';apRender()");
      const all = [...main.querySelectorAll(".ap-box")];
      const boxes = all.slice(all.findIndex((b) => b.firstElementChild?.tagName === "B" && b.firstElementChild.textContent === "Paper card."));
      const fields = ["strengths", "weak", "verdict", "notes"].map((f) => {
        const ta = doc.getElementById("apC_" + f) as HTMLTextAreaElement;
        return { label: doc.querySelector(`label[for="apC_${f}"]`)!.textContent, rows: ta.getAttribute("rows"), value: ta.value };
      });
      cards.push({ id: c.id, note: c.note, refs, docId: id, boxes: boxes.map((b) => ({ text: b.textContent, muted: [...b.querySelectorAll("span")].map((s) => s.textContent) })), fields, button: doc.getElementById("apCardBtn")!.textContent, text: v1.call<string>("apCardText") });
    }
    v1.eval("AP.refs=null");
    // Typing in a card field stores it at once (apCardField 10121).
    LS("appu_ap_notes", null);
    v1.call("apCardField", "weak", "Typed weakness");
    const cardTyped = notesNow()[v1.eval<string>("AP.doc.id")];
    LS("appu_ap_notes", null);

    // ---- the cards side by side (apAcross* 9936-9985)
    const box = doc.getElementById("apAcross")!;
    const acrossView = () => {
      const sel = [...box.querySelectorAll("input[data-apcol]")].map((i) => ({ k: i.getAttribute("data-apcol"), label: i.parentElement!.textContent, checked: (i as HTMLInputElement).checked }));
      const aiBox = box.querySelector("#apAcrossAi") as HTMLInputElement;
      const table = box.querySelector("table");
      return {
        sel, ai: { label: aiBox.parentElement!.textContent, checked: aiBox.checked },
        empty: table ? null : box.querySelector("p")!.textContent,
        head: table ? [...table.querySelectorAll("th")].map((t) => t.textContent) : null,
        rows: table ? [...table.querySelectorAll("tr")].slice(1).map((tr) => [...tr.querySelectorAll("td")].slice(0, -1).map((td) => td.textContent)) : null,
        remove: table ? [...table.querySelectorAll("tr")].slice(1).map((tr) => { const b = tr.querySelector("button")!; return { text: b.textContent, title: b.getAttribute("title") }; }) : null,
        csvButton: box.querySelector("#apAcrossCsv")?.textContent ?? null,
        note: table ? box.querySelector("p")!.textContent : null,
      };
    };
    const setAcross = (notes: unknown, cols: string | null, ai: string | null) => { LS("appu_ap_notes", JSON.stringify(notes)); LS("appu_ap_cols", cols); LS("appu_ap_ai", ai); };
    v1.eval("AP.doc=null");
    const across = inputs.across.states.map((c) => {
      setAcross(c.notes ?? inputs.across.notes, c.cols, c.ai);
      const e0 = errorsAt();
      v1.call("apAcrossRender");
      noErrors(e0, "across " + c.id);
      const data = v1.call<{ head: string[]; body: string[][]; ids: string[] }>("apAcrossData");
      return { id: c.id, notes: c.notes ?? inputs.across.notes, cols: c.cols, ai: c.ai, colsRead: v1.call<string[]>("apAcrossCols"), aiRead: v1.call<boolean>("apAcrossAi"), data: JSON.parse(JSON.stringify(data)), csv: v1.call<string>("pdCsv", data.head, data.body), view: acrossView() };
    });
    const toggles = inputs.across.toggles.map((c) => {
      setAcross(inputs.across.notes, c.cols, null);
      v1.call("apAcrossColToggle", c.k, c.on);
      return { ...c, stored: v1.eval<string | null>("LS.get('appu_ap_cols')") };
    });
    const dels = [];
    for (const c of inputs.across.dels) {
      let notes = inputs.across.notes as Record<string, unknown>;
      if (c.loaded) {
        loadPaper("sample@apSample");
        const id = v1.eval<string>("AP.doc.id");
        notes = { [id]: { stages: { design: { mine: "Loaded words" } }, card: {}, title: v1.eval<string>("AP.doc.title") }, ...notes };
        v1.eval("AP.res={design:{reading:'x',quotes:[]}};AP.tryDraft={design:'Loaded words'}");
      } else v1.eval("AP.doc=null");
      setAcross(notes, null, null);
      const asked: string[] = [];
      w.confirm = (m: unknown) => { asked.push(String(m)); return c.answer; };
      v1.call("apAcrossDel", c.row);
      dels.push({ ...c, notes, asked, after: notesNow(), res: c.loaded ? v1.eval<unknown>("AP.res") : null, tryDraft: c.loaded ? v1.eval<unknown>("AP.tryDraft") : null });
    }
    delete w.confirm;
    setAcross({}, null, null);
    LS("appu_ap_notes", null); LS("appu_ap_cols", null); LS("appu_ap_ai", null);
    v1.eval("AP.doc=null;AP.res={};AP.tryDraft={}");
    box.innerHTML = "";
    main.innerHTML = "";
    const apCols = v1.eval<Array<[string, string]>>("AP_COLS").map((x) => [x[0], x[1]]);

    if (!files.some((f) => f.doc === null && f.toasts.length > 1)) throw new Error("appanel: no file case is refused after reading");
    if (!asks.some((a) => a.box?.banner) || !asks.some((a) => a.toasts.length && a.opts.length === 0)) throw new Error("appanel: the ask cases miss the banner or a refusal");
    if (!walks.some((x) => x.revealed) || !walks.some((x) => x.res && (x.res as { raw?: string }).raw !== undefined) || !walks.some((x) => x.toasts.length && x.opts.length === 0)) throw new Error("appanel: the walk cases miss a reveal, a raw reply or a refusal");
    if (!across.some((a) => a.view.empty) || !dels.some((d) => d.asked.length && Object.keys(d.after).length < Object.keys(d.notes).length)) throw new Error("appanel: the across cases miss the empty state or a removal");
    return [
      emitTables(v1, "appanel", "analyse-cards-tables", { AP_COLS: apCols }, opts),
      writeFixture("appanel", "cases", { files, pastes, loads, heads, numbers, refs, asks, walks, navs, clamp: { high: clampHigh, low: clampLow }, typed, cards, cardTyped, across, toggles, dels }, v1, check),
    ];
  },
};
