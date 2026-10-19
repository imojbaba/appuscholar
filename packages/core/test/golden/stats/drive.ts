import type { V1 } from "../harness/v1";
import type { StatsBlock, StatsForm, StatsTestKey } from "../../../src/stats-core";
import { decodeText } from "./render";

/**
 * One case of a Statistics Lab corpus (`stats/corpus/<test>.json`, an array of these): the CSV a student pastes, the test picked in #statsTest, and what the form holds when Run is pressed.
 * `values` names a select field's column by its **name** (resolved here to the column index v1's option carries) and gives an extra field its text; `ticked` names the columns whose `.sfm_<id>`
 * boxes are checked (every other box of that id is unchecked). A field the case does not name keeps what statsFieldsRender gave it (the panel's defaults, register row D-W2-5).
 */
export type StatsCase = { id: string; csv: string; test: StatsTestKey; values?: Record<string, string>; ticked?: Record<string, string[]>; why?: string };

/**
 * What v1 showed for a case. `values` and `ticked` are the case's own (by column name), kept so the test can tell a fixture captured from an older corpus. `form` is what the port receives: every `#sf_<id>` of the rendered form with its value (a select's value is the column index as a string, an extra its text) and,
 * for every multi field, the indexes of its checked boxes in column order. `apa` is #statsSentence's text, null when v1 showed none (a toast, or the safety net). `blocks` is #statsResults
 * read back in order (see readBlocks); `resultsText` is `#statsResults.textContent` with white space collapsed, `resultsHtml` its innerHTML; `toasts` what showToast received during the run.
 */
export type CapturedRun = { id: string; test: StatsTestKey; csv: string; values?: Record<string, string>; ticked?: Record<string, string[]>; form: StatsForm; apa: string | null; blocks: StatsBlock[]; resultsText: string; resultsHtml: string; toasts: string[] };

/**
 * #statsResults's children, in order, as blocks: `table.stats-table` gives its rows, each the `th`/`td` cells; any `p` a note of its innerHTML; `h4` a heading of its text; `ul` a list of its
 * items; `div.stats-assump` its own children, read the same way. The `h3` "Results", #statsSentence and the button row (`div.row`) are skipped. Anything else throws, so a later test whose
 * results hold another element is noticed here rather than dropped.
 * A cell and a list item are recorded as their innerHTML, so that a captured block is HTML as the port's blocks are (a cell holds `escHTML(label)`, `pCell(p)`) and the test decodes both
 * sides the same way: a cell's textContent cannot be decoded a second time (a column named `Tom's <score> & more` would lose `<score>`). Each one is checked here to decode to its textContent.
 */
function cellHtml(el: Element, caseId: string): string {
  if (decodeText(el.innerHTML) !== el.textContent) throw new Error(`stats ${caseId}: the cell ${JSON.stringify(el.innerHTML)} does not decode to its text ${JSON.stringify(el.textContent)}`);
  return el.innerHTML;
}

function readBlocks(parent: Element, caseId: string): StatsBlock[] {
  const out: StatsBlock[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {
      if ((node.textContent ?? "").trim() !== "") throw new Error(`stats ${caseId}: text outside an element in the results: ${JSON.stringify(node.textContent)}`);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "h3" || el.id === "statsSentence" || (tag === "div" && el.classList.contains("row"))) continue;
    if (tag === "table" && el.classList.contains("stats-table"))
      out.push({ kind: "table", rows: Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.querySelectorAll("th, td")).map((c) => cellHtml(c, caseId))) });
    else if (tag === "p") out.push({ kind: "note", html: el.innerHTML });
    else if (tag === "h4") out.push({ kind: "heading", text: el.textContent ?? "" });
    else if (tag === "ul") out.push({ kind: "list", items: Array.from(el.querySelectorAll("li")).map((li) => cellHtml(li, caseId)) });
    else if (tag === "div" && el.classList.contains("stats-assump")) out.push(...readBlocks(el, caseId));
    else throw new Error(`stats ${caseId}: the results hold an element the driver does not read: <${tag} class="${el.className}">`);
  }
  return out;
}

/**
 * Runs one case through v1's Statistics Lab as a student does, generalising stats-demos/capture.ts (the recipe of v1's tgDemo): the CSV into #statsPaste, `statsParse()` with `_rtSkip` set
 * (so no dataset is registered in localStorage), the test into #statsTest, `statsFieldsRender()`, the case's fields and ticks, then `statsRunNow()` on an emptied #statsResults with the toast
 * list cleared, so a refused run leaves nothing of the case before it.
 */
export function driveV1Stats(v1: V1, c: StatsCase): CapturedRun {
  const w = v1.window, d = v1.document;
  v1.setValue("statsPaste", c.csv);
  w._statsData = undefined; // a refused statsParse ("Paste some data first") leaves the previous case's data, which the guard below must not take for this one
  w._rtSkip = true;
  try { v1.call("statsParse"); } finally { w._rtSkip = false; }
  const data = w._statsData as { cols: Array<{ name: string; index: number }> } | undefined;
  if (!data) throw new Error(`stats ${c.id}: statsParse() parsed nothing`);
  v1.setValue("statsTest", c.test);
  if ((d.getElementById("statsTest") as HTMLSelectElement).value !== c.test) throw new Error(`stats ${c.id}: #statsTest has no option ${c.test}`);
  v1.call("statsFieldsRender");
  const box = d.getElementById("statsFields");
  if (!box) throw new Error("v1 has no #statsFields");

  for (const [id, given] of Object.entries(c.values ?? {})) {
    const el = d.getElementById("sf_" + id);
    if (!el) throw new Error(`stats ${c.id}: the ${c.test} form has no field sf_${id}`);
    if (el.tagName === "SELECT") {
      const opt = Array.from((el as HTMLSelectElement).options).find((o) => o.textContent === given);
      if (!opt) throw new Error(`stats ${c.id}: sf_${id} does not offer the column ${JSON.stringify(given)}, so the case is unreachable through v1's form`);
      (el as HTMLSelectElement).value = opt.value;
    } else (el as HTMLInputElement).value = given;
  }
  for (const [id, names] of Object.entries(c.ticked ?? {})) {
    const boxes = Array.from(box.querySelectorAll<HTMLInputElement>("input.sfm_" + id));
    if (boxes.length === 0) throw new Error(`stats ${c.id}: the ${c.test} form has no boxes .sfm_${id}`);
    const want = names.map((n) => {
      const col = data.cols.find((x) => x.name === n);
      if (!col || !boxes.some((b) => b.value === String(col.index))) throw new Error(`stats ${c.id}: .sfm_${id} has no box for the column ${JSON.stringify(n)}, so the case is unreachable through v1's form`);
      return String(col.index);
    });
    for (const b of boxes) b.checked = want.includes(b.value);
  }

  // What the port receives: every field as the form now holds it.
  const form: StatsForm = { values: {}, ticked: {} };
  for (const el of Array.from(box.querySelectorAll<HTMLInputElement | HTMLSelectElement>("select[id^='sf_'], input[id^='sf_']"))) form.values[el.id.slice(3)] = el.value;
  for (const b of Array.from(box.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))) {
    const cls = Array.from(b.classList).find((k) => k.startsWith("sfm_"));
    if (!cls) continue;
    const list = (form.ticked[cls.slice(4)] ??= []);
    if (b.checked) list.push(parseInt(b.value, 10));
  }

  const results = d.getElementById("statsResults");
  if (!results) throw new Error("v1 has no #statsResults");
  results.innerHTML = "";
  v1.toasts.length = 0;
  v1.call("statsRunNow");
  const sentence = d.getElementById("statsSentence");
  return {
    id: c.id, test: c.test, csv: c.csv, values: c.values, ticked: c.ticked, form,
    apa: sentence ? sentence.textContent : null,
    blocks: readBlocks(results, c.id),
    resultsText: (results.textContent ?? "").replace(/\s+/g, " "),
    resultsHtml: results.innerHTML,
    toasts: [...v1.toasts],
  };
}
