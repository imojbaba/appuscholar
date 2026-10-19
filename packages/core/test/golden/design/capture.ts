import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 14's Design & Ethics generators (v1 index.html: DESIGN_ITEMS 5875-5882, designRenderDash 5884-5897, regCompute 5906-5941, protoRead/protoSave/protoGenerate 5948-5977,
 * EC_DOCS 5978, ecMinorsNote 5999-6005, ecToggle 6006-6010, ecSave 6011-6028, ecStatement 6029-6046, ecGenerateConsent 6047-6070, CTRI_FIELDS 6071, ctriToggle 6079-6083,
 * ctriExport 6084-6096, PI_ITEMS 6097, piToggle 6106-6110, piSave 6111-6117, piExportCv 6118-6128, BUDGET_DEFAULTS and budgetRows 6129-6133, budgetEdit 6145-6151,
 * budgetAddRow and budgetRemove 6152-6161, budgetTotal 6162-6165, budgetExport 6166-6176), page-bound: every expected string is what v1's page wrote, inserted, toasted or downloaded.
 * Stand-ins on the page: `insertIntoEditor` records the text it is given; `URL.createObjectURL` keeps the Blob (read back through a FileReader) and `revokeObjectURL` does nothing;
 * HTMLAnchorElement's `click` does nothing. localStorage is cleared before each case, so no case sees another's `appu_design_*` blob.
 *
 * - `reg`: regCompute for the 4 x 4 x 2 x 2 = 64 states of #regType, #regPop, #regBio, #regMulti, then two states with an option added to the select (a type and a population the
 *   select does not offer: the `else` arm and the `[pop]||pop` fallback); each records the `li` texts of #regResult, the `p.warn` text (checked to be the same in every case),
 *   `appu_design_reg` without `savedAt`, and the toasts.
 * - `proto`: 6 field patterns: #protoBg…#protoDmp set raw, protoSave() called on a clear storage and `appu_design_proto` recorded (`saved`), then the storage cleared again and
 *   protoGenerate() called: the inserted text or the toasts.
 * - `minors`: ecMinorsNote for #ecMinors yes, unsure, no and '': #ecMinorsMsg's display and text.
 * - `ethics`: ecStatement for every #ecStatus (approved, applied, noreview, nohuman, none, '') x #ecMinors (yes, unsure, no, '') x #ecConsentMode (written, online, verbal, waived,
 *   '') x the committee, number and date filled or empty (240), then 6 with one or two of the three filled; `saved` is `appu_design_ec` after the call, `inserted` the text or null.
 * - `consent`: ecGenerateConsent for 5 patterns (title or PI missing: the toast).
 * - `ops`: the done rules, as sequences of v1 calls on one storage per key (ecToggle and ecSave; ctriToggle; piToggle and piSave; budgetEdit, budgetAddRow and budgetRemove;
 *   protoSave), `appu_design_<key>` recorded after each call.
 * - `ctri`: ctriExport for 3 tick patterns (set through ctriToggle): `appu_design_ctri.checklist` (`checks`), the Blob's text and type.
 * - `pi`: piExportCv for 2 patterns: the Blob's text or the toast.
 * - `budget`: 7 row sets stored as `appu_design_budget.rows` (or not stored): budgetRows() (through eval), #budgetTotal's text after budgetTotal(), the budgetExport Blob's text.
 * - `dash`: designRenderDash for 4 done patterns: the `b`'s text and each button's key (from its onclick), mark and label.
 * - `tables.json` (and, under --emit, src/data/design-tables.ts): DESIGN_ITEMS as `{key, label}` (v1's `open` functions are page code), EC_DOCS, CTRI_FIELDS, PI_ITEMS,
 *   BUDGET_DEFAULTS, AIU_MONTHS, read through eval.
 */

export type RegCase = { id: string; input: { type: string; pop: string; bio: boolean; multi: boolean }; offered: boolean; lines: string[]; saved: unknown; toasts: string[] };
export type ProtoInput = { bg: string; obj: string; design: string; part: string; sample: string; proc: string; risk: string; dmp: string };
export type ProtoCase = { id: string; input: ProtoInput; saved: Record<string, unknown>; inserted: string | null; toasts: string[] };
export type MinorsCase = { m: string; display: string; text: string };
export type EcFields = {
  title: string; pi: string; what: string; risks: string; benefits: string; contact: string; status: string; committee: string; apprNo: string; apprDate: string; consentMode: string; minors: string;
};
export type EcCase = { id: string; input: EcFields; saved: Record<string, unknown>; inserted: string | null; toasts: string[] };
export type Op =
  | { op: "ecToggle" | "ctriToggle" | "piToggle"; i: number; v: boolean }
  | { op: "ecSave"; fields: EcFields }
  | { op: "piSave"; cv: string }
  | { op: "budgetEdit"; i: number; field: "label" | "amount"; val: string }
  | { op: "budgetAddRow" }
  | { op: "budgetRemove"; i: number }
  | { op: "protoSave"; fields: ProtoInput };
export type OpsCase = { id: string; key: string; steps: Array<{ op: Op; after: Record<string, unknown> }> };
export type ExportCase = { id: string; checks?: Record<string, boolean>; cv?: string; text: string | null; type: string | null; toasts: string[] };
export type BudgetRow = { label: string; amount: string };
export type BudgetCase = { id: string; stored: BudgetRow[] | null; rows: BudgetRow[]; totalText: string; text: string; type: string };
export type DashCase = { id: string; done: Record<string, boolean>; head: string; items: Array<{ key: string; mark: string; label: string }> };

const TYPES = ["drug", "device", "interventional", "observational"];
const POPS = ["adults", "minors", "vulnerable", "pregnant"];
const PROTO_IDS: Record<keyof ProtoInput, string> = { bg: "protoBg", obj: "protoObj", design: "protoDesign", part: "protoPart", sample: "protoSample", proc: "protoProc", risk: "protoRisk", dmp: "protoDmp" };
const EC_IDS: Record<keyof EcFields, string> = {
  title: "ecTitle", pi: "ecPI", what: "ecWhat", risks: "ecRisks2", benefits: "ecBenefits", contact: "ecContact", status: "ecStatus", committee: "ecCommittee", apprNo: "ecApprNo",
  apprDate: "ecApprDate", consentMode: "ecConsentMode", minors: "ecMinors",
};
const NO_PROTO: ProtoInput = { bg: "", obj: "", design: "", part: "", sample: "", proc: "", risk: "", dmp: "" };
const NO_EC: EcFields = { title: "", pi: "", what: "", risks: "", benefits: "", contact: "", status: "", committee: "", apprNo: "", apprDate: "", consentMode: "", minors: "" };

const PROTO_CASES: Array<{ id: string; input: ProtoInput }> = [
  {
    id: "all-fields", input: {
      bg: "  Attention lapses are common in lectures.\nLittle is known about EEG markers in Indian students.  ", obj: "To test whether alpha power predicts lapses.", design: "Within-subjects, two sessions.",
      part: "Undergraduates aged 18-25; exclude neurological history.", sample: "N = 40 (power .80 for d = 0.5).", proc: "Consent, 20-minute task with EEG, debrief.",
      risk: "Minimal: mild fatigue. Benefit: feedback on attention.", dmp: "Coded data on the department server; deleted after five years.",
    },
  },
  { id: "none", input: NO_PROTO },
  { id: "whitespace-only", input: { bg: "   ", obj: "\n", design: " \t ", part: "", sample: "", proc: "", risk: "", dmp: "  " } },
  { id: "one-field", input: { ...NO_PROTO, obj: "To estimate the prevalence of exam anxiety." } },
  { id: "hindi", input: { ...NO_PROTO, bg: "परीक्षा की चिंता छात्रों में आम है।", design: "क्रॉस-सेक्शनल सर्वेक्षण", dmp: "डेटा गुमनाम रखा जाएगा।" } },
  { id: "partial", input: { ...NO_PROTO, bg: "Background only.", sample: "120", dmp: "Encrypted drive." } },
];

const FILLED = { committee: "Institutional Ethics Committee, Department of Psychology", apprNo: "IEC/2026/041", apprDate: "2026-03-05" };
const EMPTY3 = { committee: "", apprNo: "", apprDate: "" };

function ethicsCases(): Array<{ id: string; input: EcFields }> {
  const out: Array<{ id: string; input: EcFields }> = [];
  for (const status of ["approved", "applied", "noreview", "nohuman", "none", ""])
    for (const minors of ["yes", "unsure", "no", ""])
      for (const consentMode of ["written", "online", "verbal", "waived", ""])
        for (const [fl, f] of [["filled", FILLED], ["empty", EMPTY3]] as const)
          out.push({ id: `${status || "blank"}-${minors || "blank"}-${consentMode || "blank"}-${fl}`, input: { ...NO_EC, title: "Sleep and memory", status, minors, consentMode, ...f } });
  const one = (id: string, status: string, f: Partial<EcFields>) => out.push({ id, input: { ...NO_EC, status, consentMode: "written", minors: "no", ...f } });
  one("approved-committee-only", "approved", { committee: "IEC, XYZ University" });
  one("approved-number-only", "approved", { apprNo: "  42/2026  " });
  one("approved-date-only", "approved", { apprDate: "2026-12-31" });
  one("noreview-date-and-number", "noreview", { apprNo: "EX-7", apprDate: "2026-01-09" });
  one("noreview-committee-padded", "noreview", { committee: "  Research Board  " });
  one("applied-all-three", "applied", { ...FILLED });
  return out;
}

const CONSENT_CASES: Array<{ id: string; input: EcFields }> = [
  { id: "no-title", input: { ...NO_EC, pi: "Dr A. Rao, Psychology, XYZ University" } },
  { id: "no-pi", input: { ...NO_EC, title: "Sleep and memory" } },
  { id: "neither", input: { ...NO_EC } },
  { id: "title-and-pi-only", input: { ...NO_EC, title: "Sleep and memory", pi: "Dr A. Rao, Psychology, XYZ University" } },
  {
    id: "full", input: {
      ...NO_EC, title: "  EEG correlates of sustained attention  ", pi: "Dr A. Rao, Psychology, XYZ University", what: "Two 40-minute sessions in the lab.\nYou wear an EEG cap.",
      risks: "Mild tiredness.", benefits: "A summary of your attention profile.", contact: "a.rao@xyz.ac.in; IEC office 011-2345", status: "applied",
    },
  },
];

function ecOps(): Op[] {
  const save = (f: Partial<EcFields>): Op => ({ op: "ecSave", fields: { ...NO_EC, ...f } });
  return [
    save({}), { op: "ecToggle", i: 2, v: true }, { op: "ecToggle", i: 2, v: false }, save({ title: "  T  " }), { op: "ecToggle", i: 0, v: true }, { op: "ecToggle", i: 0, v: false },
    save({}), save({ status: "applied" }), save({}), save({ pi: "PI" }), { op: "ecToggle", i: 7, v: true },
  ];
}

const OPS: Array<{ id: string; key: string; ops: Op[] }> = [
  { id: "ec", key: "ec", ops: ecOps() },
  { id: "ctri", key: "ctri", ops: [{ op: "ctriToggle", i: 0, v: true }, { op: "ctriToggle", i: 12, v: true }, { op: "ctriToggle", i: 0, v: false }, { op: "ctriToggle", i: 12, v: false }] },
  {
    id: "pi", key: "pi", ops: [
      { op: "piToggle", i: 1, v: true }, { op: "piSave", cv: "" }, { op: "piToggle", i: 1, v: false }, { op: "piSave", cv: "  Dr A. Rao, PhD  " }, { op: "piToggle", i: 3, v: true },
      { op: "piToggle", i: 3, v: false }, { op: "piSave", cv: "" }, { op: "piSave", cv: "CV" },
    ],
  },
  {
    id: "budget", key: "budget", ops: [
      { op: "budgetEdit", i: 0, field: "amount", val: "500" }, { op: "budgetEdit", i: 0, field: "amount", val: "0" }, { op: "budgetEdit", i: 1, field: "amount", val: "abc" },
      { op: "budgetEdit", i: 2, field: "amount", val: "-5" }, { op: "budgetEdit", i: 3, field: "amount", val: "0.5" }, { op: "budgetEdit", i: 3, field: "label", val: "Renamed" },
      { op: "budgetRemove", i: 3 }, { op: "budgetAddRow" }, { op: "budgetEdit", i: 6, field: "amount", val: "1e3" }, { op: "budgetEdit", i: 6, field: "label", val: "" },
    ],
  },
  {
    id: "proto", key: "proto", ops: [
      { op: "protoSave", fields: NO_PROTO }, { op: "protoSave", fields: { ...NO_PROTO, risk: " r " } }, { op: "protoSave", fields: { ...NO_PROTO, dmp: "   " } },
    ],
  },
];

const CTRI_CASES: Array<{ id: string; ticks: Array<[number, boolean]> }> = [
  { id: "none", ticks: [] },
  { id: "some", ticks: [[0, true], [4, true], [12, true], [7, true], [7, false]] },
  { id: "all", ticks: Array.from({ length: 13 }, (_, i) => [i, true] as [number, boolean]) },
];

const BUDGET_CASES: Array<{ id: string; stored: BudgetRow[] | null }> = [
  { id: "defaults-unstored", stored: null },
  { id: "defaults-empty-rows", stored: [] },
  { id: "indian-total-1234567", stored: [{ label: "Site costs", amount: "1000000" }, { label: "Participant compensation", amount: "234567" }] },
  { id: "blank-label-and-abc", stored: [{ label: "", amount: "2500" }, { label: "Travel", amount: "abc" }, { label: "Equipment", amount: "12345678.9" }] },
  { id: "decimals", stored: [{ label: "A", amount: "1234.5678" }, { label: "B", amount: "0.1" }, { label: "C", amount: "0.2" }] },
  { id: "negative-and-exponent", stored: [{ label: "Refund", amount: "-1500" }, { label: "Kit", amount: "1e3" }, { label: "Blank", amount: "" }] },
  { id: "total-1234567-one-row", stored: [{ label: "x", amount: "1234567" }] },
];

const DASH_CASES: Array<{ id: string; done: Record<string, boolean> }> = [
  { id: "none", done: {} },
  { id: "reg-and-budget", done: { reg: true, budget: true } },
  { id: "all", done: { reg: true, proto: true, ec: true, ctri: true, pi: true, budget: true } },
  { id: "false-flags", done: { reg: false, proto: true, ec: false } },
];

export const design: Engine = {
  name: "design",
  async capture(v1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const d = v1.document;
    const ls = v1.window.localStorage;
    const el = <T extends HTMLElement>(id: string): T => {
      const e = d.getElementById(id);
      if (!e) throw new Error(`design: v1 has no #${id}`);
      return e as T;
    };
    const setVal = (id: string, value: string) => {
      v1.setValue(id, value);
      if (el<HTMLInputElement>(id).value !== value) throw new Error(`design: #${id} did not take ${JSON.stringify(value)}`);
    };
    const stored = (key: string): Record<string, unknown> | null => {
      const raw = ls.getItem("appu_design_" + key);
      if (raw === null) return null;
      const o = JSON.parse(raw) as Record<string, unknown>;
      delete o.savedAt;
      return o;
    };
    const take = () => v1.toasts.splice(0, v1.toasts.length);

    // stand-ins
    const inserted: string[] = [];
    w.insertIntoEditor = (text: unknown) => { inserted.push(String(text)); };
    const blobs: Blob[] = [];
    const urls = w.URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
    urls.createObjectURL = (b) => { blobs.push(b); return "blob:x"; };
    urls.revokeObjectURL = () => {};
    (w.HTMLAnchorElement.prototype as unknown as { click(): void }).click = () => {};
    const readText = (b: Blob) => new Promise<string>((done, fail) => {
      const r = new w.FileReader();
      r.onload = () => done(String(r.result));
      r.onerror = () => fail(new Error("design: could not read the Blob"));
      r.readAsText(b);
    });
    /** Calls fn and returns what it inserted (at most one text) and the toasts. */
    const run = (what: string, fn: () => void): { inserted: string | null; toasts: string[] } => {
      inserted.length = 0;
      take();
      fn();
      if (inserted.length > 1) throw new Error(`design ${what}: ${inserted.length} inserts`);
      return { inserted: inserted[0] ?? null, toasts: take() };
    };

    // reg
    const regCases: RegCase[] = [];
    let warn: string | null = null;
    const regOne = (input: RegCase["input"], offered: boolean) => {
      ls.clear();
      setVal("regType", input.type);
      setVal("regPop", input.pop);
      el<HTMLInputElement>("regBio").checked = input.bio;
      el<HTMLInputElement>("regMulti").checked = input.multi;
      const r = run("reg", () => v1.call("regCompute"));
      const box = el("regResult");
      const lines = Array.from(box.querySelectorAll("li")).map((li) => li.textContent ?? "");
      const ws = box.querySelectorAll("p.warn");
      if (ws.length !== 1) throw new Error("design reg: not one p.warn");
      const wt = ws[0]!.textContent ?? "";
      if (warn === null) warn = wt;
      else if (warn !== wt) throw new Error("design reg: the warning differs between cases");
      const id = `${input.type}-${input.pop}${input.bio ? "-bio" : ""}${input.multi ? "-multi" : ""}`;
      regCases.push({ id, input, offered, lines, saved: stored("reg"), toasts: r.toasts });
    };
    for (const type of TYPES) for (const pop of POPS) for (const bio of [false, true]) for (const multi of [false, true]) regOne({ type, pop, bio, multi }, true);
    const addOption = (id: string, value: string) => { const o = d.createElement("option"); o.value = value; o.textContent = value; el(id).appendChild(o); };
    addOption("regType", "registry");
    addOption("regPop", "elderly");
    regOne({ type: "registry", pop: "elderly", bio: true, multi: false }, false);
    regOne({ type: "drug", pop: "elderly", bio: false, multi: true }, false);

    // proto
    const setProto = (f: ProtoInput) => { for (const [k, id] of Object.entries(PROTO_IDS) as Array<[keyof ProtoInput, string]>) setVal(id, f[k]); };
    const protoCases: ProtoCase[] = [];
    for (const c of PROTO_CASES) {
      ls.clear();
      setProto(c.input);
      take();
      v1.call("protoSave");
      take();
      const saved = stored("proto");
      if (!saved) throw new Error(`design proto ${c.id}: protoSave stored nothing`);
      ls.clear();
      setProto(c.input);
      const r = run(`proto ${c.id}`, () => v1.call("protoGenerate"));
      protoCases.push({ id: c.id, input: c.input, saved, inserted: r.inserted, toasts: r.toasts });
    }

    // minors
    const minors: MinorsCase[] = [];
    for (const m of ["yes", "unsure", "no", ""]) {
      setVal("ecMinors", m);
      const msg = el("ecMinorsMsg");
      msg.textContent = "";
      v1.call("ecMinorsNote");
      minors.push({ m, display: msg.style.display, text: msg.textContent });
    }

    // ethics and consent
    const setEc = (f: EcFields) => { for (const [k, id] of Object.entries(EC_IDS) as Array<[keyof EcFields, string]>) setVal(id, f[k]); };
    const ecRun = (c: { id: string; input: EcFields }, fn: string): EcCase => {
      ls.clear();
      setEc(c.input);
      const r = run(`${fn} ${c.id}`, () => v1.call(fn));
      const saved = stored("ec");
      if (!saved) throw new Error(`design ${fn} ${c.id}: nothing stored`);
      return { id: c.id, input: c.input, saved, inserted: r.inserted, toasts: r.toasts };
    };
    const ethics = ethicsCases().map((c) => ecRun(c, "ecStatement"));
    const consent = CONSENT_CASES.map((c) => ecRun(c, "ecGenerateConsent"));

    // done rules
    const ops: OpsCase[] = [];
    for (const s of OPS) {
      ls.clear();
      const steps: OpsCase["steps"] = [];
      for (const op of s.ops) {
        take();
        switch (op.op) {
          case "ecToggle": case "ctriToggle": case "piToggle": v1.call(op.op, op.i, op.v); break;
          case "ecSave": setEc(op.fields); v1.call("ecSave"); break;
          case "piSave": setVal("piCv", op.cv); v1.call("piSave"); break;
          case "budgetEdit": v1.call("budgetEdit", op.i, op.field, op.val); break;
          case "budgetAddRow": v1.call("budgetAddRow"); break;
          case "budgetRemove": v1.call("budgetRemove", op.i); break;
          case "protoSave": setProto(op.fields); v1.call("protoSave"); break;
        }
        take();
        const after = stored(s.key);
        if (!after) throw new Error(`design ops ${s.id}: nothing stored after ${op.op}`);
        steps.push({ op, after });
      }
      ops.push({ id: s.id, key: s.key, steps });
    }

    // exports
    const exportOf = async (what: string, fn: string): Promise<{ text: string | null; type: string | null; toasts: string[] }> => {
      const before = blobs.length;
      const r = run(what, () => v1.call(fn));
      if (blobs.length > before + 1) throw new Error(`design ${what}: ${blobs.length - before} files`);
      const b = blobs.length === before + 1 ? blobs[blobs.length - 1]! : null;
      return { text: b ? await readText(b) : null, type: b ? b.type : null, toasts: r.toasts };
    };
    const ctri: ExportCase[] = [];
    for (const c of CTRI_CASES) {
      ls.clear();
      for (const [i, v] of c.ticks) v1.call("ctriToggle", i, v);
      const checks = (stored("ctri")?.checklist ?? {}) as Record<string, boolean>;
      ctri.push({ id: c.id, checks, ...(await exportOf(`ctri ${c.id}`, "ctriExport")) });
    }
    const pi: ExportCase[] = [];
    for (const c of [{ id: "empty", cv: "  " }, { id: "filled", cv: "  Dr A. Rao\nPhD, Psychology\nGCP certificate 2025  " }]) {
      ls.clear();
      setVal("piCv", c.cv);
      pi.push({ id: c.id, cv: c.cv, ...(await exportOf(`pi ${c.id}`, "piExportCv")) });
    }
    const budget: BudgetCase[] = [];
    for (const c of BUDGET_CASES) {
      ls.clear();
      if (c.stored !== null) ls.setItem("appu_design_budget", JSON.stringify({ rows: c.stored }));
      const rows = JSON.parse(JSON.stringify(v1.eval("budgetRows()"))) as BudgetRow[];
      v1.call("budgetTotal");
      const totalText = el("budgetTotal").textContent ?? "";
      const e = await exportOf(`budget ${c.id}`, "budgetExport");
      if (e.text === null || e.type === null) throw new Error(`design budget ${c.id}: no file`);
      budget.push({ id: c.id, stored: c.stored, rows, totalText, text: e.text, type: e.type });
    }

    // dashboard
    const dash: DashCase[] = [];
    for (const c of DASH_CASES) {
      ls.clear();
      for (const [k, v] of Object.entries(c.done)) ls.setItem("appu_design_" + k, JSON.stringify({ done: v }));
      v1.call("designRenderDash");
      const box = el("designDash");
      const head = box.querySelector("b")?.textContent ?? "";
      const items = Array.from(box.querySelectorAll("button")).map((b) => {
        const key = /^designOpen\('([a-z]+)'\)$/.exec(b.getAttribute("onclick") ?? "")?.[1];
        const spans = b.querySelectorAll("span");
        if (!key || spans.length !== 2) throw new Error(`design dash ${c.id}: unexpected button ${b.outerHTML}`);
        return { key, mark: spans[0]!.textContent ?? "", label: spans[1]!.textContent ?? "" };
      });
      dash.push({ id: c.id, done: c.done, head, items });
    }
    ls.clear();

    const tables = {
      DESIGN_ITEMS: JSON.parse(JSON.stringify(v1.eval("DESIGN_ITEMS.map(i=>({key:i.key,label:i.label}))"))) as unknown,
      EC_DOCS: v1.eval<string[]>("EC_DOCS"),
      CTRI_FIELDS: v1.eval<string[]>("CTRI_FIELDS"),
      PI_ITEMS: v1.eval<string[]>("PI_ITEMS"),
      BUDGET_DEFAULTS: v1.eval<string[]>("BUDGET_DEFAULTS"),
      AIU_MONTHS: v1.eval<string[]>("AIU_MONTHS"),
    };
    console.log(`design: reg ${regCases.length}, proto ${protoCases.length}, minors ${minors.length}, ethics ${ethics.length} (${ethics.filter((c) => c.inserted !== null).length} inserted), consent ${consent.length}, ops ${ops.map((o) => `${o.id} ${o.steps.length}`).join(", ")}, ctri ${ctri.length}, pi ${pi.length}, budget ${budget.length}, dash ${dash.length}`);
    return [
      emitTables(v1, "design", "design-tables", tables, opts),
      writeFixture("design", "cases", { warn, reg: regCases, proto: protoCases, minors, ethics, consent, ops, ctri, pi, budget, dash }, v1, opts.check),
    ];
  },
};
