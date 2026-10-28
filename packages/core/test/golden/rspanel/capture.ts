import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * Task 9's two pieces of v1's Research page code that core had not ported, run on hand-written inputs (this folder's inputs.json, and the ten papers of research/inputs.json, read, never copied):
 *
 * - `terms`: what rsSuggestTerms (v1 index.html 8251-8263) keeps of the AI's reply, lines 8257-8258 (apJson, rsCleanTerm against the topic, one of each term ignoring case, at most 8). v1 runs it
 *   inside rsSuggestTerms, so the capture drives rsSuggestTerms itself: #rsTopic holds the case's topic (the function trims it, 8252), callAI is stubbed with the case's reply, RS_TERMS is emptied
 *   first (8261 only writes it when terms came back), and after `await rsSuggestTerms()` the record keeps RS_TERMS.terms (`out`), whether every term is ticked (8261), and whether #rsTerms shows
 *   v1's "No useful related terms" note (8259, `none`). Guards (each throws): one AI call per case, with v1's options; no toast; no jsdom error.
 * - `sorts`: the four orders of rsApplySort (8347-8375; 8356-8362) and the fold of rsRenderResults (8402-8403). For each list of papers (`ids`, indices into research/inputs.json's papers) and
 *   each mode, rsResultsOriginal is set to those papers (a top-level let, through eval), #rsSort to the mode, the filters are left empty (rsFilterVals then passes every paper) and rsApplySort()
 *   runs; the record keeps the order of rsResults (`order`, indices into `ids`) and the fold as rendered: the number of cards before the "probably not relevant" <details>, or -1 when there is none
 *   (v1 renders the fold only when its index is above 0). Guards: #rsSort takes the mode; the cards rendered are as many as the papers; no jsdom error.
 */
type TermCase = { id: string; topic: string; reply: string };
type Inputs = { terms: TermCase[]; sortLists: number[][]; sortModes: string[] };

export const rspanel: Engine = {
  name: "rspanel",
  async capture(v1, { check }) {
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const { papers } = JSON.parse(readFileSync(new URL("../research/inputs.json", import.meta.url), "utf8")) as { papers: Array<{ title: string }> };

    const terms = [];
    for (const c of inputs.terms) {
      v1.setValue("rsTopic", c.topic);
      v1.eval("RS_TERMS.base='';RS_TERMS.terms=[];RS_TERMS.picked={}");
      const ai = v1.stubCallAI(c.reply);
      const toastsBefore = v1.toasts.length, errorsBefore = v1.errors.length;
      await v1.call<Promise<void>>("rsSuggestTerms");
      if (ai.length !== 1) throw new Error(`rspanel: ${c.id}: rsSuggestTerms called the AI ${ai.length} times`);
      const o = ai[0]!.opts;
      if (o.temp !== 0.3 || o.max !== 500 || o.noLang !== true) throw new Error(`rspanel: ${c.id}: options ${JSON.stringify(o)}`);
      if (v1.toasts.length !== toastsBefore) throw new Error(`rspanel: ${c.id}: a toast: ${v1.toasts.slice(toastsBefore).join(" | ")}`);
      if (v1.errors.length !== errorsBefore) throw new Error(`rspanel: ${c.id}: jsdom errors: ${v1.errors.slice(errorsBefore).join(" | ")}`);
      const out = JSON.parse(JSON.stringify(v1.eval<string[]>("RS_TERMS.terms"))) as string[];
      const allTicked = v1.eval<boolean>("RS_TERMS.terms.every((t,i)=>RS_TERMS.picked[i]===true)");
      const none = (v1.document.getElementById("rsTerms")?.textContent ?? "").startsWith("No useful related terms");
      terms.push({ id: c.id, topic: c.topic, reply: c.reply, out, allTicked, none });
    }

    const sorts = [];
    const sel = v1.document.getElementById("rsSort") as HTMLSelectElement | null;
    const box = v1.document.getElementById("rsResults");
    if (!sel || !box) throw new Error("rspanel: v1 has no #rsSort or #rsResults");
    for (const ids of inputs.sortLists) {
      for (const mode of inputs.sortModes) {
        v1.eval("rsResultsOriginal=" + JSON.stringify(ids.map((i) => papers[i]!)));
        sel.value = mode;
        if (sel.value !== mode) throw new Error(`rspanel: #rsSort did not take ${mode}`);
        box.innerHTML = "";
        const errorsBefore = v1.errors.length;
        v1.call("rsApplySort");
        if (v1.errors.length !== errorsBefore) throw new Error(`rspanel: jsdom errors in rsApplySort: ${v1.errors.slice(errorsBefore).join(" | ")}`);
        const titles = v1.eval<string[]>("rsResults.map(p=>p.title)");
        const order = Array.from(titles, (t) => ids.findIndex((i) => papers[i]!.title === t));
        if (order.length !== ids.length || order.some((k) => k < 0)) throw new Error(`rspanel: rsResults is not the list for ${mode}`);
        if (box.querySelectorAll(".paper-card").length !== ids.length) throw new Error(`rspanel: ${box.querySelectorAll(".paper-card").length} cards rendered for ${ids.length} papers`);
        const details = box.querySelector("details");
        const fold = details ? Array.from(box.children).filter((el) => el.classList.contains("paper-card")).length : -1;
        sorts.push({ ids, mode, order, fold });
      }
    }
    v1.eval("rsResultsOriginal=[];rsResults=[]");
    box.innerHTML = "";
    sel.value = "relevance";
    return [writeFixture("rspanel", "cases", { terms, sorts }, v1, check)];
  },
};
