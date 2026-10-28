import { describe, it, expect } from "vitest";
import {
  DESIGN_ITEMS, EC_DOCS, CTRI_FIELDS, PI_ITEMS, BUDGET_DEFAULTS, REG_WARN, DESIGN_TOASTS, regPathway, regDone, protoDone, protocolMarkdown, ecMinorsNote, ecDoneAfterSave,
  ecDoneAfterToggle, ethicsStatement, consentMarkdown, ctriMarkdown, checklistDone, piDone, piCvText, budgetRows, budgetTotal, budgetTotalText, budgetMarkdown, budgetDone,
  designDashboard,
} from "../../src/design";
import type { DesignKey, EcState, ProtoFields, BudgetRow } from "../../src/design";
import { AIU_MONTHS } from "../../src/aiustatement";
import type { BudgetCase, DashCase, EcCase, EcFields, ExportCase, MinorsCase, OpsCase, ProtoCase, ProtoInput, RegCase } from "./design/capture";
import { readFixture } from "./harness/fixture";

/**
 * The Design & Ethics generators (design.ts) against v1's page (`golden:capture design`, design/capture.ts): every expected string is what v1 wrote into the dialog, inserted into the
 * editor, toasted or put into a downloaded Blob, and every done flag what v1 stored in `appu_design_<key>`. Strings by toBe, done flags and stored objects by toEqual. The field values
 * are trimmed here as v1's protoRead, ecSave and piSave trim them (the panel's job). budgetTotalText's Indian grouping is held to v1's string and to the Chrome fixture of Wave 0
 * (doctext/en-in-numbers.json) for the same number (register row D-W2-12).
 */

type Fx = {
  warn: string; reg: RegCase[]; proto: ProtoCase[]; minors: MinorsCase[]; ethics: EcCase[]; consent: EcCase[]; ops: OpsCase[]; ctri: ExportCase[]; pi: ExportCase[];
  budget: BudgetCase[]; dash: DashCase[];
};
const fx = readFixture<Fx>("design", "cases");
const tables = readFixture<{ tables: Record<string, unknown> }>("design", "tables").tables;
const enIn = readFixture<{ cases: Array<[number, string]> }>("doctext", "en-in-numbers").cases;

const trimProto = (f: ProtoInput): ProtoFields => ({
  bg: f.bg.trim(), obj: f.obj.trim(), design: f.design.trim(), part: f.part.trim(), sample: f.sample.trim(), proc: f.proc.trim(), risk: f.risk.trim(), dmp: f.dmp.trim(),
});
/** ecSave (6011-6028): every text field trimmed; status, apprDate, consentMode and minors as the select or date input gives them. */
const trimEc = (f: EcFields) => ({
  title: f.title.trim(), pi: f.pi.trim(), what: f.what.trim(), risks: f.risks.trim(), benefits: f.benefits.trim(), contact: f.contact.trim(), status: f.status,
  committee: f.committee.trim(), apprNo: f.apprNo.trim(), apprDate: f.apprDate, consentMode: f.consentMode, minors: f.minors,
});

describe("design: tables", () => {
  it("DESIGN_ITEMS (keys and labels), EC_DOCS, CTRI_FIELDS, PI_ITEMS, BUDGET_DEFAULTS and AIU_MONTHS are v1's, emitted", () => {
    expect(DESIGN_ITEMS as unknown).toEqual(tables.DESIGN_ITEMS);
    expect(EC_DOCS as unknown).toEqual(tables.EC_DOCS);
    expect(CTRI_FIELDS as unknown).toEqual(tables.CTRI_FIELDS);
    expect(PI_ITEMS as unknown).toEqual(tables.PI_ITEMS);
    expect(BUDGET_DEFAULTS as unknown).toEqual(tables.BUDGET_DEFAULTS);
    expect(AIU_MONTHS as unknown).toEqual(tables.AIU_MONTHS);
  });
  it("DESIGN_TOASTS holds every toast v1 showed in the capture", () => {
    const all = new Set<string>();
    for (const c of [...fx.reg, ...fx.proto, ...fx.ethics, ...fx.consent, ...fx.ctri, ...fx.pi]) for (const t of c.toasts) all.add(t);
    const errors = new Set(["Choose where things stand first", "Fill in at least the study title and PI/institution first", "Fill in the CV field first"]);
    expect(new Set([...all].filter((t) => !errors.has(t)))).toEqual(new Set(Object.values(DESIGN_TOASTS)));
  });
});

describe("design: regPathway (5906-5941)", () => {
  it("the 64 offered states and two the select does not offer", () => {
    expect(fx.reg.filter((c) => c.offered)).toHaveLength(64);
    expect(new Set(fx.reg.map((c) => c.id)).size).toBe(fx.reg.length);
  });
  it("REG_WARN is the p.warn v1 writes under every list", () => {
    expect(REG_WARN).toBe(fx.warn);
  });
  for (const c of fx.reg) {
    it(c.id, () => {
      expect(regPathway(c.input)).toEqual({ lines: c.lines });
      expect(c.lines.join("\n")).toBe(regPathway(c.input).lines.join("\n"));
      expect(c.saved).toEqual({ ...c.input, done: regDone() });
      expect(c.toasts).toEqual([DESIGN_TOASTS.regChecked]);
    });
  }
});

describe("design: protocolMarkdown and protoDone (5948-5977)", () => {
  for (const c of fx.proto) {
    it(c.id, () => {
      const o = trimProto(c.input);
      expect({ ...o, done: protoDone(o) }).toEqual(c.saved);
      const md = protocolMarkdown(o);
      if (c.inserted === null) {
        expect(md).toBeNull();
        expect(c.toasts).toEqual([DESIGN_TOASTS.protoEmpty]);
      } else {
        expect(md).toBe(c.inserted);
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, DESIGN_TOASTS.protoInserted]);
      }
    });
  }
});

describe("design: ecMinorsNote (5999-6005)", () => {
  for (const c of fx.minors) {
    it(`#ecMinors ${JSON.stringify(c.m)}`, () => {
      expect(ecMinorsNote(c.m)).toBe(c.display === "block" ? c.text : "");
      expect(["block", "none"]).toContain(c.display);
    });
  }
});

describe("design: ethicsStatement (6029-6046)", () => {
  it("covers 6 statuses x 4 minors answers x 5 consent modes x filled or empty, and 6 partial fills", () => {
    expect(fx.ethics).toHaveLength(246);
    expect(new Set(fx.ethics.map((c) => c.input.status))).toEqual(new Set(["approved", "applied", "noreview", "nohuman", "none", ""]));
  });
  for (const c of fx.ethics) {
    it(c.id, () => {
      const s: EcState = { ...trimEc(c.input) };
      s.done = ecDoneAfterSave(s);
      expect(s).toEqual(c.saved);
      const r = ethicsStatement(s);
      if (c.inserted === null) {
        expect(r).toEqual({ error: "Choose where things stand first" });
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, "Choose where things stand first"]);
      } else {
        if (!("text" in r)) throw new Error(`refused: ${r.error}`);
        expect(r.heading).toBe("Ethical considerations");
        expect(r.heading + "\n" + r.text).toBe(c.inserted);
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, DESIGN_TOASTS.ethicsInserted]);
      }
    });
  }
});

describe("design: consentMarkdown (6047-6070)", () => {
  for (const c of fx.consent) {
    it(c.id, () => {
      const s: EcState = { ...trimEc(c.input) };
      s.done = ecDoneAfterSave(s);
      expect(s).toEqual(c.saved);
      const r = consentMarkdown(s);
      if (c.inserted === null) {
        expect(r).toEqual({ error: "Fill in at least the study title and PI/institution first" });
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, "Fill in at least the study title and PI/institution first"]);
      } else {
        expect(r).toBe(c.inserted);
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, DESIGN_TOASTS.consentInserted]);
      }
    });
  }
});

describe("design: the done rules, replayed step by step against appu_design_<key>", () => {
  for (const seq of fx.ops) {
    it(seq.id, () => {
      let s: Record<string, unknown> = {};
      for (const { op, after } of seq.steps) {
        switch (op.op) {
          case "ecToggle": case "ctriToggle": case "piToggle": {
            const checklist = { ...((s.checklist as Record<number, boolean> | undefined) ?? {}), [op.i]: op.v };
            s = { ...s, checklist };
            s.done = op.op === "ecToggle" ? ecDoneAfterToggle({ checklist }) : checklistDone(checklist);
            break;
          }
          case "ecSave": { const n = { ...s, ...trimEc(op.fields) } as EcState; n.done = ecDoneAfterSave(n); s = n; break; }
          case "piSave": { const n = { ...s, cv: op.cv.trim() }; s = { ...n, done: piDone(n as { done?: boolean; cv: string }) }; break; }
          case "budgetEdit": {
            const rows = budgetRows(s.rows as BudgetRow[] | undefined).map((r) => ({ ...r }));
            rows[op.i]![op.field] = op.val;
            s = { ...s, rows, done: budgetDone(rows) };
            break;
          }
          // budgetAddRow and budgetRemove (6152-6161) store the rows and leave `done` as it was
          case "budgetAddRow": s = { ...s, rows: [...budgetRows(s.rows as BudgetRow[] | undefined), { label: "", amount: "" }] }; break;
          case "budgetRemove": { const rows = budgetRows(s.rows as BudgetRow[] | undefined).slice(); rows.splice(op.i, 1); s = { ...s, rows }; break; }
          case "protoSave": { const o = trimProto(op.fields); s = { ...o, done: protoDone(o) }; break; }
        }
        expect(s).toEqual(after);
      }
    });
  }
});

describe("design: ctriMarkdown (6084-6096)", () => {
  for (const c of fx.ctri) {
    it(c.id, () => {
      expect(c.type).toBe("text/markdown");
      expect(ctriMarkdown(c.checks ?? {})).toBe(c.text);
      expect(c.toasts).toEqual([DESIGN_TOASTS.exported]);
    });
  }
});

describe("design: piCvText (6118-6128)", () => {
  for (const c of fx.pi) {
    it(c.id, () => {
      const r = piCvText((c.cv ?? "").trim());
      if (c.text === null) {
        expect(r).toEqual({ error: "Fill in the CV field first" });
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, "Fill in the CV field first"]);
      } else {
        expect(c.type).toBe("text/plain");
        expect(r).toBe(c.text);
        expect(c.toasts).toEqual([DESIGN_TOASTS.saved, DESIGN_TOASTS.exported]);
      }
    });
  }
});

describe("design: budgetRows, budgetTotal, budgetTotalText and budgetMarkdown (6129-6133, 6162-6176)", () => {
  for (const c of fx.budget) {
    it(c.id, () => {
      const rows = budgetRows(c.stored ?? undefined);
      expect(rows).toEqual(c.rows);
      expect(budgetTotalText(rows)).toBe(c.totalText);
      expect(budgetTotalText(rows)).toBe("Total: ₹" + budgetTotal(rows).toLocaleString("en-IN"));
      expect(c.type).toBe("text/markdown");
      expect(budgetMarkdown(rows)).toBe(c.text);
    });
  }
  it("budgetTotalText on a total of 1234567 is v1's string and the Chrome fixture's grouping", () => {
    const c = fx.budget.find((b) => b.id === "total-1234567-one-row")!;
    const rows = budgetRows(c.stored ?? undefined);
    expect(budgetTotal(rows)).toBe(1234567);
    expect(budgetTotalText(rows)).toBe(c.totalText);
    const chrome = enIn.find(([n]) => n === 1234567)?.[1];
    expect(chrome).toBe("12,34,567");
    expect(budgetTotalText(rows)).toBe("Total: ₹" + chrome);
  });
});

describe("design: designDashboard (5884-5897)", () => {
  for (const c of fx.dash) {
    it(c.id, () => {
      const r = designDashboard(c.done as Partial<Record<DesignKey, boolean>>);
      expect(`${r.done} of ${r.total}`).toBe(c.head);
      expect(r.items.map((i) => ({ key: i.key, mark: i.done ? "✅" : "⬜", label: i.label }))).toEqual(c.items);
    });
  }
});
