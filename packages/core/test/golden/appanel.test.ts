import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AP_SAMPLE, AP_STAGES, apBuild, apNumbers } from "../../src/analyse";
import { buildWalkPrompt } from "../../src/prompts-analyse";
import { AP_COLS, apWalkRes, apAcrossCell, apAcrossColToggle, apAcrossCols, apAcrossCsv, apAcrossData, apCardText } from "../../src/analyse-cards";
import { apDocxText, apFileKind, apFileStem, apLoadRefusal, apNumP, apPreview, apShelfLabel, apTitleOf } from "../../src/analyse-page";
import { shTitleGuess } from "../../src/shelf";
import { readFixture } from "./harness/fixture";

/**
 * analyse-page.ts against v1 running: every expected value is read from test/golden/appanel/cases.json (`golden:capture appanel`), captured by driving v1's apFromFile, apFromPaste, apLoad,
 * apRender, apNumbersHTML, apRefHTML and apAsk (the panel tests in apps/web read the same file for what the page draws). Typed here: only the guards that the cases reach each branch.
 */
type Doc = { title: string; src: string; pages: string[]; sample: boolean; abstractOnly: boolean } | null;
type Fx = {
  files: Array<{ id: string; name: string; input: { pages?: string[]; text?: string }; toasts: string[]; doc: Doc }>;
  pastes: Array<{ id: string; text: string; toasts: string[]; doc: Doc }>;
  loads: Array<{ id: string; title: string; pages: string[]; src: string; ok: boolean; toasts: string[]; doc: Doc }>;
  heads: Array<{ id: string; text: string; pre: string }>;
  numbers: Array<{ id: string; lines: Array<{ mark: string; label: string; note: string }> }>;
};
const fx = readFixture<Fx>("appanel", "cases");
type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };
const corpus = JSON.parse(readFileSync(new URL("./analyse/papers.json", import.meta.url), "utf8")) as Paper[];
const sampleTitle = AP_SAMPLE[0]!.split("\n")[0]!;
const paperOf = (id: string) => {
  if (id === "sample@apSample") return { title: sampleTitle, pages: [...AP_SAMPLE], src: "pdf" };
  if (id === "sample-x3") return { title: sampleTitle + " (three times)", pages: [...AP_SAMPLE, ...AP_SAMPLE, ...AP_SAMPLE], src: "pdf" };
  const p = corpus.find((x) => x.id === id)!;
  return p.from === "AP_SAMPLE" ? { title: sampleTitle, pages: [...AP_SAMPLE], src: p.src } : { title: p.title!, pages: p.pages!, src: p.src };
};
const TOO_LITTLE = "This file has too little readable text. A scanned PDF has no text layer; paste the text instead.";
const NO_ABSTRACT = "This search result has no abstract to read. Open the source and paste the paper text instead.";

describe("apFileKind, apFileStem, apDocxText and apTitleOf are apFromFile's", () => {
  it("the cases reach each branch: pdf, docx, txt, .doc, other, a title from the name, a refusal after reading", () => {
    expect(new Set(fx.files.map((f) => apFileKind(f.name)))).toEqual(new Set(["pdf", "docx", "txt", "doc", "other"]));
    expect(fx.files.some((f) => f.doc && f.doc.title === apFileStem(f.name, "pdf"))).toBe(true);
    expect(fx.files.some((f) => f.doc && f.doc.title === f.name)).toBe(true);
    expect(fx.files.filter((f) => f.toasts[1] === TOO_LITTLE).length).toBeGreaterThanOrEqual(3);
  });
  it("each file loads as v1 loaded it, or is refused with v1's toast", () => {
    for (const f of fx.files) {
      const kind = apFileKind(f.name);
      expect(f.toasts[0], f.id).toBe("Reading " + f.name + "…");
      if (!f.doc) continue;
      expect(f.doc.src, f.id).toBe(kind);
      if (kind === "pdf") { expect(f.doc.pages, f.id).toEqual(f.input.pages); expect(f.doc.title, f.id).toBe(shTitleGuess(f.input.pages!, apFileStem(f.name, "pdf"))); }
      if (kind === "docx") { const t = apDocxText(f.input.text!); expect(f.doc.pages, f.id).toEqual([t]); expect(f.doc.title, f.id).toBe(apTitleOf(t, f.name)); }
      if (kind === "txt") { expect(f.doc.pages, f.id).toEqual([f.input.text]); expect(f.doc.title, f.id).toBe(apFileStem(f.name, "txt")); }
    }
    for (const f of fx.files.filter((x) => x.toasts[1] === TOO_LITTLE)) {
      const pages = f.input.pages ?? [apFileKind(f.name) === "docx" ? apDocxText(f.input.text!) : f.input.text!];
      expect(apLoadRefusal(pages, apFileKind(f.name)), f.id).toBe("text");
    }
  });
  it("a pasted paper's title is apTitleOf of the trimmed text, 'Pasted paper' when no line is long enough", () => {
    expect(fx.pastes.some((p) => p.doc?.title === "Pasted paper")).toBe(true);
    expect(fx.pastes.some((p) => p.doc && p.doc.title.length === 140)).toBe(true);
    for (const p of fx.pastes) {
      if (!p.doc) continue;
      expect(p.doc.pages, p.id).toEqual([p.text.trim()]);
      expect(p.doc.title, p.id).toBe(apTitleOf(p.text.trim(), "Pasted paper"));
    }
  });
});

describe("apLoadRefusal is apLoad's two refusals", () => {
  it("the cases sit on both sides of 150 and 500", () => {
    expect(fx.loads.map((l) => [l.id, l.ok])).toEqual([["abstract-ok", true], ["abstract-149", false], ["abstract-150", true], ["text-499", false], ["text-500", true]]);
  });
  it("null where v1 loads the paper, else the refusal v1 toasts", () => {
    for (const l of fx.loads) {
      const r = apLoadRefusal(l.pages, l.src);
      expect(r, l.id).toBe(l.ok ? null : l.src === "abstract" ? "abstract" : "text");
      if (!l.ok) expect(l.toasts, l.id).toEqual([r === "abstract" ? NO_ABSTRACT : TOO_LITTLE]);
    }
    for (const p of fx.pastes.filter((x) => x.toasts[0] === TOO_LITTLE)) expect(apLoadRefusal([p.text.trim()], "paste"), p.id).toBe("text");
  });
});

describe("apPreview and apNumP are what apRender and apNumbersHTML draw", () => {
  it("the preview is the <pre> of 'Check what Appuscholer read' for every paper (one cut at 2,500)", () => {
    expect(fx.heads.some((h) => h.pre.length === 2500)).toBe(true);
    for (const h of fx.heads) { const p = paperOf(h.id); expect(apPreview(apBuild(p.title, p.pages, p.src)), h.id).toBe(h.pre); }
  });
  it("each statistic's note starts with 'recomputed p about ' and apNumP, for every paper (a mismatch and < .001 among them)", () => {
    const all = fx.numbers.flatMap((n) => n.lines);
    expect(all.some((l) => l.mark === "⚠")).toBe(true);
    expect(all.some((l) => l.note.startsWith("recomputed p about < .001"))).toBe(true);
    for (const n of fx.numbers) {
      const p = paperOf(n.id);
      const items = apNumbers(apBuild(p.title, p.pages, p.src));
      expect(items.map((x) => x.label), n.id).toEqual(n.lines.map((l) => l.label));
      items.forEach((x, i) => {
        expect(n.lines[i]!.mark, n.id).toBe(x.ok ? "✓" : "⚠");
        expect(n.lines[i]!.note.startsWith("recomputed p about " + apNumP(x) + ","), `${n.id} ${x.label}`).toBe(true);
      });
    }
  });
});

describe("apShelfLabel is apShelfFill's option text", () => {
  it("title, else file, else the fallback, cut to 90", () => {
    expect(apShelfLabel({ title: "A".repeat(100), file: "f.pdf" }, "Paper")).toBe("A".repeat(90));
    expect(apShelfLabel({ title: "", file: "f.pdf" }, "Paper")).toBe("f.pdf");
    expect(apShelfLabel({}, "Paper")).toBe("Paper");
  });
});

/* ---- Task 13: the paper card's text and the cards side by side (analyse-cards.ts) against v1's apCardText, apAcrossCols, apAcrossColToggle and apAcrossData (with pdCsv). */
type Note = { stages?: Record<string, { mine?: string; res?: Record<string, unknown> }>; card?: Record<string, string>; title?: string };
type Fx13 = {
  cards: Array<{ id: string; note: Note | null; refs: unknown; text: string }>;
  across: Array<{ id: string; notes: Record<string, Note>; cols: string | null; ai: string | null; colsRead: string[]; aiRead: boolean; data: { head: string[]; body: string[][]; ids: string[] }; csv: string }>;
  toggles: Array<{ cols: string | null; k: string; on: boolean; stored: string }>;
  walks: Array<{ id: string; paper: string; stage: number; mine: string | null; reply: string; opts: Array<Record<string, unknown>>; res: Record<string, unknown> | null; stored: { stages: Record<string, { mine?: string; res?: unknown }> } | null; k: string }>;
};
const fx13 = readFixture<Fx13>("appanel", "cases");
const sampleDoc = { title: sampleTitle };
/** v1's own words, as the panel gives them through t(): the card's (10126-10133) and the table's (9961). */
const CARD_L = {
  head: "PAPER CARD", myWords: "My words:", notWritten: "(not written)", reading: "Reading:", refHead: "REFERENCE LIST CHECK (OpenAlex)", doisRead: "DOIs read,", known: "known to OpenAlex,",
  flagged: "flagged as retracted:", none: "none flagged", warning: ". A warning signal only; no flag is not proof of soundness.", strengths: "STRENGTHS", weak: "WEAKNESSES",
  verdict: "MY VERDICT IN ONE LINE", notes: "MY NOTES", closing: "Made with Appuscholer. Parts were written with AI help from the text of the paper; check every point against the paper itself.",
};
const ACROSS_L = { paper: "Paper", myWords: "(my words)", aiReading: "(AI reading, check it)", names: Object.fromEntries(AP_COLS.map(([k, l]) => [k, l])) };
/** What v1's LS.get gives apAcrossCols: the stored text read as JSON, or null; core's apAcrossCols takes the parsed value (the panel's ap_cols blob). */
const stored = (raw: string | null): unknown => { try { return JSON.parse(raw ?? "null"); } catch { return null; } };

describe("apCardText is v1's apCardText", () => {
  it("the cases reach every branch: no note, no stage, mine only, reading only, a reply without a reading, the reference line flagged, none flagged, unfinished and a none box", () => {
    expect(fx13.cards.map((c) => c.id)).toEqual(["no-note", "empty-note", "mixed", "mixed-refs-flagged", "mixed-refs-none", "mixed-refs-one-flag", "mixed-refs-running", "mixed-refs-none-box", "card-only"]);
    expect(fx13.cards.filter((c) => c.text.includes("REFERENCE LIST CHECK")).length).toBe(3);
  });
  it("the same text for every case, byte for byte", () => {
    for (const c of fx13.cards) {
      expect(apCardText({ title: sampleDoc.title, note: c.note ?? undefined, refs: c.refs as Parameters<typeof apCardText>[0]["refs"], stages: AP_STAGES, L: CARD_L }), c.id).toBe(c.text);
    }
  });
  it("closes with v1's line", () => {
    for (const c of fx13.cards) expect(c.text.endsWith("\n\n" + CARD_L.closing + "\n"), c.id).toBe(true);
  });
});

describe("AP_COLS, apAcrossCols, apAcrossColToggle and apAcrossData are v1's", () => {
  it("AP_COLS is v1's table (generated) and the defaults are design, sample, measures, stats, verdict", () => {
    expect(AP_COLS.map((c) => c[0])).toEqual(["design", "sample", "measures", "stats", "results", "limits", "strengths", "weak", "verdict"]);
    expect(apAcrossCols(null)).toEqual(["design", "sample", "measures", "stats", "verdict"]);
  });
  it("the columns read from what is stored: none, bad JSON, not an array, an empty one (the defaults), unknown keys dropped in the stored order", () => {
    for (const a of fx13.across) expect(apAcrossCols(stored(a.cols)), a.id).toEqual(a.colsRead);
    expect(new Set(fx13.across.map((a) => a.colsRead.join(",")))).toContain("");
  });
  it("a toggle gives the columns v1 stores, in AP_COLS order", () => {
    for (const c of fx13.toggles) expect(apAcrossColToggle(apAcrossCols(stored(c.cols)), c.k, c.on), JSON.stringify(c)).toEqual(JSON.parse(c.stored));
  });
  it("the table and the CSV: one row per paper with a title and any card or stage text, the head with (my words) and the AI columns", () => {
    expect(fx13.across.some((a) => a.data.body.length === 0)).toBe(true);
    expect(fx13.across.some((a) => a.data.head.some((h) => h.endsWith("(AI reading, check it)")))).toBe(true);
    for (const a of fx13.across) {
      const d = apAcrossData(a.notes, a.colsRead, a.aiRead, ACROSS_L);
      expect(d, a.id).toEqual(a.data);
      expect(apAcrossCsv(d), a.id).toBe(a.csv);
    }
  });
  it("apAcrossCell reads the card for strengths, weak and verdict, else the stage's own words or (ai) its reading", () => {
    const n = { stages: { design: { mine: "m", res: { reading: "r" } } }, card: { strengths: "s", weak: "w", verdict: "v" } };
    expect(["design", "strengths", "weak", "verdict", "sample"].map((k) => [apAcrossCell(n, k, false), apAcrossCell(n, k, true)])).toEqual([["m", "r"], ["s", "s"], ["w", "w"], ["v", "v"], ["", ""]]);
  });
});

describe("apWalkRes is what apWalkShow keeps of the reply", () => {
  it("the cases reach JSON with matched and unmatched quotations, a fence with five quotations, a raw reply, a bare reading, numbers in not_stated, a long paper read in part, and a refusal", () => {
    expect(fx13.walks.map((w) => w.id)).toEqual(["sample-gap-full", "sample-sample-nothing-tried", "sample-stats-raw", "sample-results-bare", "sample-limits-numbers", "x3-partial", "no-consent"]);
    expect(fx13.walks.filter((w) => w.res === null).map((w) => w.id)).toEqual(["no-consent"]);
  });
  it("the same object for every reply, with apPick's numbers from buildWalkPrompt and the call's options", () => {
    for (const w of fx13.walks) {
      if (!w.res) continue;
      const p = paperOf(w.paper);
      const doc = apBuild(p.title, p.pages, p.src);
      const built = buildWalkPrompt("psychology", doc, AP_STAGES[w.stage]!, w.mine ?? "");
      expect(apWalkRes(doc, built.pick, w.reply), w.id).toEqual(w.res);
      expect(JSON.stringify(apWalkRes(doc, built.pick, w.reply)), w.id).toBe(JSON.stringify(w.res));
      expect(w.opts, w.id).toEqual([{ max: built.max, temp: built.temp, noLang: built.noLang }]);
      expect(w.stored!.stages[w.k], w.id).toEqual({ mine: (w.mine ?? "").trim(), res: w.res });
    }
  });
});
