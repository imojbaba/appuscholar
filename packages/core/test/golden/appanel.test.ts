import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AP_SAMPLE, apBuild, apNumbers } from "../../src/analyse";
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
