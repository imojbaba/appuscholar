import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 15's qualitative-coding model (v1 index.html: QUAL_PALETTE 6186, qualNextColor 6189, qualDescendantIds 6205-6209, qualDeleteCode 6235-6244, qualFindPassages 6289-6300,
 * qualBuildMarkdown 6311-6325), page-bound: v1 keeps the codes in localStorage `appu_qual_codes` and the tagged passages as `<span class="qual-tag" data-qcode="…">` inside each
 * document's stored HTML (`appu_docs`, an array of {id, title, body, updated}; the open one is `appu_doc_current` and lives in the editor until docSaveBody writes it back).
 *
 * Per case (localStorage cleared first): the codes, the stored documents and the current id are set in localStorage and the editor is given the current document's live HTML (which
 * differs from its stored body, so docSaveBody's write-back is seen); then
 * - `markdown`: qualBuildMarkdown()'s string;
 * - `passages`: qualFindPassages(id) for every code (and for an id no code has);
 * - `raws`: per code, every matching span's textContent in every stored document after the calls (docsGet(), parsed in v1's document), with the document's stored title: the input
 *   qualFindPassages trims (`qualPassageText`'s cases);
 * - `descendants`: qualDescendantIds(id, codes) for every code;
 * - `deletes`: qualDeleteCode(id) for every code and for an id no code has, first with `confirm` replaced by a recorder that returns false (the text, or null when v1 never asked;
 *   `appu_qual_codes` is checked to be unchanged), then, on a fresh copy of the case's storage, with a `confirm` that returns true: `appu_qual_codes` after the delete (`after`).
 * `nextColor`: qualNextColor() with 0..12 codes stored. `tables.json` (and, under --emit, src/data/qual-tables.ts): QUAL_PALETTE, read through eval.
 */

export type QualCodeFx = { id: string; name: string; parentId: string | null; color: string };
export type QualDoc = { id: string; title: string; body?: string; updated: number };
export type QualCaseSpec = { id: string; codes: QualCodeFx[]; docs: QualDoc[]; current: string; editor: string };
export type QualCase = QualCaseSpec & {
  markdown: string;
  passages: Record<string, Array<{ doc: string; text: string }>>;
  raws: Record<string, Array<{ title: string; raw: string }>>;
  descendants: Record<string, string[]>;
  deletes: Array<{ id: string; confirm: string | null; after: QualCodeFx[] }>;
};
export type QualFx = { cases: QualCase[]; nextColor: Array<{ count: number; color: string }> };

const tag = (code: string, inner: string) => `<span class="qual-tag" data-qcode="${code}" title="t" style="background:#f59e0b55">${inner}</span>`;

const TREE: QualCodeFx[] = [
  { id: "qa", name: "Coping", parentId: null, color: "#f59e0b" },
  { id: "qb", name: "Barriers", parentId: null, color: "#10b981" },
  { id: "qc", name: "Social support", parentId: "qa", color: "#3b82f6" },
  { id: "qd", name: "Family", parentId: "qc", color: "#ef4444" },
  { id: "qe", name: "परिवार का दबाव", parentId: "qd", color: "#8b5cf6" },
  { id: "qf", name: 'The "good student" ideal', parentId: "qe", color: "#ec4899" },
  { id: "qg", name: "Deepest", parentId: "qf", color: "#14b8a6" },
  { id: "qh", name: "Avoidance", parentId: "qa", color: "#f97316" },
  { id: "qi", name: "Cost", parentId: "qb", color: "#6366f1" },
];

const D1_STORED = `<p>She said ${tag("qc", "an old passage")} once.</p>`;
const D1_LIVE = [
  `<p>She said ${tag("qc", "my <b>mother</b> and <i>aunt</i> help me")} every day.</p>`,
  `<p>${tag("qc", "   ")}</p>`,
  `<p>${tag("qh", "I   just\n\n  keep\tgoing&nbsp;")}</p>`,
  `<p>${tag("qe", `घर में ${tag("qf", '"topper" बनो')} कहते हैं`)}</p>`,
  `<p>${tag("qi", "Fees are **too** high")}</p>`,
  `<p>${tag("qg", "<br>")}</p>`,
].join("");
const D2 = `<p>${tag("qc", "friends listen")} and ${tag("qa", "I pray")}</p><ul><li>${tag("qi", " bus fare ")}</li></ul><p>${tag("qd", "  ")}</p>`;
const D3 = `<p>${tag("qc", "from a document with no title")} ${tag("zz", "a code that is gone")}</p>`;

const DOCS: QualDoc[] = [
  { id: "d1", title: "Interview 1 — Riya", body: D1_STORED, updated: 1 },
  { id: "d2", title: "साक्षात्कार 2", body: D2, updated: 2 },
  { id: "d3", title: "", body: D3, updated: 3 },
  { id: "d4", title: "No body", updated: 4 },
];

const SPECS: QualCaseSpec[] = [
  { id: "tree", codes: TREE, docs: DOCS, current: "d1", editor: D1_LIVE },
  { id: "tree-current-d2", codes: TREE, docs: DOCS, current: "d2", editor: `<p>${tag("qb", "Rewritten in the editor")} ${tag("qa", "and kept")}</p>` },
  { id: "no-codes", codes: [], docs: DOCS, current: "d1", editor: D1_LIVE },
  { id: "no-passages", codes: [{ id: "qx", name: "Hope", parentId: null, color: "#84cc16" }, { id: "qy", name: "Future plans", parentId: "qx", color: "#f59e0b" }], docs: DOCS, current: "d1", editor: D1_LIVE },
  {
    id: "orphan-and-order", codes: [
      { id: "qo", name: "Lost child", parentId: "gone", color: "#10b981" },
      { id: "qh", name: "Avoidance", parentId: "qa", color: "#f97316" },
      { id: "qa", name: "Coping", parentId: null, color: "#f59e0b" },
      { id: "qc", name: "Social support", parentId: "qa", color: "#3b82f6" },
      { id: "qp", name: "Child of the lost", parentId: "qo", color: "#3b82f6" },
    ], docs: DOCS, current: "d1", editor: D1_LIVE,
  },
];

export const qual: Engine = {
  name: "qual",
  async capture(v1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const d = v1.document;
    const ls = v1.window.localStorage;
    const plain = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;
    const load = (s: QualCaseSpec) => {
      ls.clear();
      ls.setItem("appu_qual_codes", JSON.stringify(s.codes));
      ls.setItem("appu_docs", JSON.stringify(s.docs));
      ls.setItem("appu_doc_current", s.current);
      v1.setEditorHtml(s.editor);
      if (v1.editor().innerHTML !== s.editor) throw new Error(`qual ${s.id}: the editor did not keep the HTML as given`);
    };
    const codesNow = () => plain<QualCodeFx[]>(JSON.parse(ls.getItem("appu_qual_codes") ?? "null"));
    const asked: string[] = [];
    let answer = false;
    w.confirm = (m: unknown) => { asked.push(String(m)); return answer; };

    const cases: QualCase[] = [];
    for (const s of SPECS) {
      load(s);
      const markdown = v1.call<string>("qualBuildMarkdown");
      const ids = [...s.codes.map((c) => c.id), "nope"];
      const passages: QualCase["passages"] = {};
      for (const id of ids) passages[id] = plain(v1.call("qualFindPassages", id));
      const raws: QualCase["raws"] = {};
      const docs = plain<QualDoc[]>(v1.call("docsGet"));
      for (const id of ids) {
        raws[id] = [];
        for (const doc of docs) {
          const div = d.createElement("div");
          div.innerHTML = doc.body || "";
          div.querySelectorAll('.qual-tag[data-qcode="' + id + '"]').forEach((span) => raws[id]!.push({ title: doc.title, raw: span.textContent ?? "" }));
        }
      }
      const descendants: QualCase["descendants"] = {};
      for (const c of s.codes) descendants[c.id] = plain(v1.call("qualDescendantIds", c.id, v1.call("qualCodesGet")));
      const deletes: QualCase["deletes"] = [];
      for (const id of ids) {
        load(s);
        asked.length = 0;
        answer = false;
        v1.call("qualDeleteCode", id);
        if (asked.length > 1) throw new Error(`qual ${s.id}: qualDeleteCode(${id}) asked ${asked.length} times`);
        if (JSON.stringify(codesNow()) !== JSON.stringify(s.codes)) throw new Error(`qual ${s.id}: qualDeleteCode(${id}) changed the codes after confirm returned false`);
        const confirm = asked[0] ?? null;
        load(s);
        asked.length = 0;
        answer = true;
        v1.call("qualDeleteCode", id);
        deletes.push({ id, confirm, after: codesNow() });
      }
      cases.push({ ...s, markdown, passages, raws, descendants, deletes });
    }

    const nextColor: QualFx["nextColor"] = [];
    for (let count = 0; count <= 12; count++) {
      ls.clear();
      ls.setItem("appu_qual_codes", JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: "c" + i, name: "C" + i, parentId: null, color: "#000000" }))));
      nextColor.push({ count, color: v1.call<string>("qualNextColor") });
    }
    ls.clear();

    const tables = { QUAL_PALETTE: plain<string[]>(v1.eval("QUAL_PALETTE")) };
    console.log(`qual: ${cases.length} cases (${cases.map((c) => `${c.id}: ${Object.values(c.passages).reduce((a, p) => a + p.length, 0)} passages`).join(", ")}), nextColor ${nextColor.length}`);
    return [emitTables(v1, "qual", "qual-tables", tables, opts), writeFixture("qual", "cases", { cases, nextColor }, v1, opts.check)];
  },
};
