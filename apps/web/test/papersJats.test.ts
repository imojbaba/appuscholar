// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apBuild, SH_MAX_PAGES } from "@appuscholar/core";
import { jatsToPages, PAGE_CHARS } from "../lib/papers/jats";

/*
 * jatsToPages (wave B Task 21b, register row D-S2-127): Europe PMC's JATS XML as the Reading list's pages of text. The recorded file is core's response of 2026-10-24 for the paper
 * 10.1038/s41598-019-49466-6, read as it is on disk (packages/core/test/fetch/recorded, never edited); the other cases are small articles written here. The pages are read by the
 * engines that read PDF pages, so the last tests run core's apBuild over them.
 */

const RECORDED = join(__dirname, "../../../packages/core/test/fetch/recorded/epmc-fulltext-oa-8da0c20f.json");
const recorded = (JSON.parse(readFileSync(RECORDED, "utf8")) as { body: string }).body;

const FILLER = "The students took part in the study and gave their consent in writing before the first session began. ";
/** A body text long enough to count as a paper's (at least 200 characters). */
const BODY = "<p>" + FILLER.repeat(3) + "</p>";
const article = (o: { front?: string; body?: string; back?: string } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?><article article-type="research-article"><front><article-meta><title-group><article-title>${"Sleep and study"}</article-title></title-group>${o.front ?? ""}</article-meta></front>` +
  `<body>${o.body ?? BODY}</body>${o.back ?? ""}</article>`;
const sec = (title: string, ...content: string[]) => `<sec><title>${title}</title>${content.join("")}</sec>`;
const p = (text: string) => `<p>${text}</p>`;
const text = (xml: string): string => jatsToPages(xml)!.pages.join("\n\n");

describe("the recorded paper", () => {
  const out = jatsToPages(recorded)!;
  const all = out.pages.join("\n\n");

  it("comes out as the title, the abstract under its heading, then the body's sections each under a heading of its own", () => {
    expect(out.title).toBe("Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial");
    expect(out.pages[0]!.startsWith(out.title + "\n\nAbstract\n\nTest anxiety is a condition")).toBe(true);
    const lines = all.split("\n");
    for (const h of ["Introduction", "Materials and Methods", "Participants", "Study design", "Procedure", "Statistical analysis", "Results", "Discussion"]) expect(lines).toContain(h);
  });

  it("keeps each page under the size of a page and splits at the end of a section", () => {
    expect(out.pages.length).toBeGreaterThan(3);
    expect(out.total).toBe(out.pages.length);
    for (const pg of out.pages) expect(pg.length).toBeLessThanOrEqual(PAGE_CHARS);
    // Every page after the first begins with a heading or, where one section ran over a page, with its next paragraph; "Results" and "Discussion" begin a page.
    const starts = out.pages.map((pg) => pg.split("\n")[0]);
    expect(starts).toContain("Results");
    expect(starts).toContain("Discussion");
    expect(starts).toContain("Materials and Methods");
  });

  it("leaves out the reference list, the footnotes' boilerplate, the figures' picture links and every marker that points at a reference", () => {
    expect(all).not.toContain("References");
    expect(all).not.toContain("Anxiety in schools");
    expect(all).not.toContain("Cassady, J. C.");
    expect(all).not.toContain("Springer Nature remains neutral");
    expect(all).not.toMatch(/\.jpg|xlink|cloudpmc|Fig1_HTML/);
    // "…of all students<sup><xref>1</xref>,<xref>2</xref></sup>." reads as a sentence, with no 1,2 stuck to the word.
    expect(all).toContain("According to Cassady, test anxiety affects up to 40 percent of all students. For example, in Germany 13% of all first-year undergraduate students seek counseling services for test anxiety. ");
    expect(all).not.toMatch(/students\d/);
  });

  it("keeps the text: a figure's caption, a table's rows (one line each, no grid), a statistic with its p value", () => {
    expect(all).toContain("Figure 1. Flow diagram of patient’s enrollment.");
    expect(all).toContain("Table 1. Demographic and baseline characteristics of participants.\n\nCharacteristic | Open label placebo | Control\nN | 31 | 27\nAge (mean ± SD in years) | 22.3 ± 2.3 | 23.5 ± 3.4\n");
    expect(all).not.toMatch(/colspan|rowspan|<\/?[a-z]/);
    expect(all).toContain("F (1,56) = 4.23, p < 0.05");
    expect(all).toContain("t(30) = 2.61, p ≤ 0.01");
    expect(all).toContain("Acknowledgements");
  });

  it("is read by the engines that read a PDF's pages: apBuild finds the paper's sections and no reference list", () => {
    const doc = apBuild(out.title, out.pages, "pdf");
    const names = doc.sections.map((s) => s.name);
    for (const n of ["Abstract", "Introduction", "Results", "Discussion", "Acknowledgements"]) expect(names).toContain(n);
    expect(doc.refsCut).toBe(false);
    expect(doc.paged).toBe(true);
    expect(doc.chars).toBeGreaterThan(15000);
    expect(doc.chunks.every((c) => c.page >= 1 && c.page <= out.pages.length)).toBe(true);
    // The Results section's statistics are on the page the section starts on.
    const results = doc.sections.find((s) => s.name === "Results")!;
    expect(out.pages[results.page - 1]).toContain("Results revealed significant interactions between group and time for test anxiety");
  });
});

describe("what is dropped and what stays", () => {
  it("drops a numbered reference and keeps a citation by author and year", () => {
    const xml = article({
      body: sec("Introduction", p(`Test anxiety is common among students<sup><xref ref-type="bibr" rid="a">1</xref>,<xref ref-type="bibr" rid="b">2</xref></sup>. ` +
        `Smith <xref ref-type="bibr" rid="c">[3]</xref> found that p = .03<sup><xref ref-type="bibr" rid="d">4</xref>–<xref ref-type="bibr" rid="e">6</xref></sup>. ` +
        `Earlier work (<xref ref-type="bibr" rid="f">Jones, 2019</xref>) agrees (<xref ref-type="bibr" rid="g">7</xref>, <xref ref-type="bibr" rid="h">8</xref>). ` +
        `A note<xref ref-type="fn" rid="n1">a</xref> and a table note<xref ref-type="table-fn" rid="n2">*</xref> end here. `) + p(FILLER.repeat(3)))
    });
    const t = text(xml);
    expect(t).toContain("Test anxiety is common among students. Smith found that p = .03. Earlier work (Jones, 2019) agrees. A note and a table note end here.");
    expect(t).not.toMatch(/\[\s*\]|\(\s*\)|students1|\.034/);
  });

  it("keeps superscripts and subscripts that are part of a number or a symbol", () => {
    expect(text(article({ body: sec("Results", p("The effect was R<sup>2</sup> = .21 and the dose 10<sup>−3</sup> mg, with H<sub>2</sub>O. " + FILLER.repeat(3))) }))).toContain("R2 = .21 and the dose 10−3 mg, with H2O.");
  });

  it("leaves out a formula's TeX and keeps its MathML text; a display formula is a line of its own", () => {
    const body = sec("Methods", p(`We used <inline-formula><alternatives><tex-math>\\documentclass{article}\\begin{document}$x$\\end{document}</tex-math><mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mi>x</mml:mi><mml:mo>=</mml:mo><mml:mn>5</mml:mn></mml:math></alternatives></inline-formula> as the cut. ` +
      `<disp-formula><mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mi>d</mml:mi><mml:mo>=</mml:mo><mml:mn>0.5</mml:mn></mml:math></disp-formula> ${FILLER.repeat(3)}`));
    const t = text(article({ body }));
    expect(t).toContain("We used x=5 as the cut.");
    expect(t).toContain("\n\nd=0.5\n\n");
    expect(t).not.toContain("documentclass");
  });

  it("makes a table's rows lines joined with | and keeps its caption and the note under it; a figure keeps its caption, not its picture", () => {
    const body = sec("Results",
      `<table-wrap id="T1"><label>Table 2</label><caption><title>Means</title></caption><graphic xlink:href="t2.png" xmlns:xlink="http://www.w3.org/1999/xlink"/><table><thead><tr><th>Group</th><th>M</th></tr></thead><tbody><tr><td>OLP</td><td><p>4.39</p><p>(9.35)</p></td></tr><tr><td/><td/></tr></tbody></table><table-wrap-foot><p>Note. M is the mean.</p></table-wrap-foot></table-wrap>` +
      `<fig id="F1"><label>Figure 5</label><caption><p>The result.</p></caption><graphic xlink:href="f5.png" xmlns:xlink="http://www.w3.org/1999/xlink"/></fig>` + p(FILLER.repeat(3)));
    const t = text(article({ body }));
    expect(t).toContain("Table 2. Means\n\nGroup | M\nOLP | 4.39 (9.35)\n\nNote. M is the mean.");
    expect(t).toContain("Figure 5. The result.");
    expect(t).not.toMatch(/\.png|xlink/);
  });

  it("makes a list's items lines, and cuts a paragraph at a table or a list inside it", () => {
    const body = sec("Methods", p(`Three measures were used: <list list-type="order"><list-item><p>the PAF</p></list-item><list-item><p>the FERUS</p></list-item></list> and nothing else. ${FILLER.repeat(3)}`));
    expect(text(article({ body }))).toContain("Three measures were used:\n\nthe PAF\n\nthe FERUS\n\nand nothing else.");
  });

  it("puts a structured abstract's part titles in front of its paragraphs and ignores a graphical abstract and the abstract's own title", () => {
    const front = `<abstract abstract-type="graphical"><p>PICTURE ONLY</p></abstract><abstract><title>Abstract</title><sec><title>Background</title><p>Sleep matters.</p></sec><sec><title>Methods</title><p>We asked 40 students.</p></sec></abstract>`;
    const t = text(article({ front }));
    expect(t).toContain("Sleep and study\n\nAbstract\n\nBackground: Sleep matters.\n\nMethods: We asked 40 students.\n\n");
    expect(t).not.toContain("PICTURE ONLY");
    expect(t.split("\n")).not.toContain("Methods");
  });

  it("takes the appendices, the acknowledgements and the notes after the body, and not the references or the footnotes", () => {
    const back = `<back><ack><title>Acknowledgements</title><p>Thanks to the students.</p></ack><app-group><app><title>Appendix A</title><p>The questionnaire items.</p></app></app-group>` +
      `<ref-list><title>References</title><ref><mixed-citation>Smith J (2020) A book.</mixed-citation></ref></ref-list><fn-group><fn><p>Boilerplate.</p></fn></fn-group></back>`;
    const t = text(article({ back }));
    expect(t).toContain("Acknowledgements\n\nThanks to the students.");
    expect(t).toContain("Appendix A\n\nThe questionnaire items.");
    expect(t).not.toMatch(/Smith J|References|Boilerplate/);
  });

  it("leaves out a section that holds nothing but references, heading and all", () => {
    const body = sec("Introduction", p(FILLER.repeat(3))) + `<sec sec-type="ref-list"><title>References</title><sec><ref-list><ref><mixed-citation>Lee K (2018) A paper.</mixed-citation></ref></ref-list></sec></sec>`;
    const t = text(article({ body }));
    expect(t.split("\n")).not.toContain("References");
    expect(t).not.toContain("Lee K");
  });

  it("reads the article inside an article set, and text in CDATA or with processing instructions and comments in it", () => {
    const set = `<pmc-articleset>${article({ body: sec("Introduction", `<p><?pi ignore me?><!-- not text -->${FILLER.repeat(3)}</p>`) }).replace(/^<\?xml[^>]*\?>/, "")}</pmc-articleset>`;
    const t = text(set);
    expect(t).toContain("The students took part");
    expect(t).not.toMatch(/ignore me|not text/);
  });
});

describe("pages", () => {
  it("cuts a paragraph longer than a page at the end of a sentence, and loses no word", () => {
    const sentences = Array.from({ length: 140 }, (_, i) => `Sentence number ${i} says that the group improved by a margin we did not expect.`);
    const long = sentences.join(" ");
    expect(long.length).toBeGreaterThan(PAGE_CHARS * 1.5);
    const out = jatsToPages(article({ body: sec("Results", p(long)) }))!;
    for (const pg of out.pages) expect(pg.length).toBeLessThanOrEqual(PAGE_CHARS);
    const body = out.pages.join("\n\n").split("Results\n\n").pop()!;
    // Page 1 holds the title and the heading with the start of the section, the next pages the rest: all the sentences, in order, each whole.
    expect(body.replace(/\s+/g, " ")).toBe(long);
    for (const pg of out.pages.slice(1)) expect(pg.startsWith("Sentence number")).toBe(true);
  });

  it("cuts a sentence longer than a page at a space", () => {
    const run = Array.from({ length: 1500 }, (_, i) => "word" + i).join(" ");
    expect(run.length).toBeGreaterThan(PAGE_CHARS);
    const out = jatsToPages(article({ body: p(run) }))!;
    for (const pg of out.pages) expect(pg.length).toBeLessThanOrEqual(PAGE_CHARS);
    // The title is a page of its own here (the first piece is a whole page); every piece ends on a whole word and together they are the sentence.
    const pieces = out.pages.slice(1);
    for (const pg of pieces) expect(pg).toMatch(/^word\d+ .*word\d+$/);
    expect(pieces.join(" ")).toBe(run);
  });

  it("starts a page at a main section's heading when the page before is half full, and lets short sections share a page", () => {
    const para = (n: number) => p(("x".repeat(99) + " ").repeat(n));
    const short = jatsToPages(article({ body: sec("Introduction", para(10)) + sec("Methods", para(10)) + sec("Results", para(10)) }))!;
    expect(short.pages).toHaveLength(1);
    const half = jatsToPages(article({ body: sec("Introduction", para(30)) + sec("Methods", para(10)) }))!;
    expect(half.pages).toHaveLength(2);
    expect(half.pages[1]!.startsWith("Methods\n\n")).toBe(true);
  });

  it("never leaves a heading as the last line of a page", () => {
    const para = (n: number) => p(("y".repeat(99) + " ").repeat(n));
    // The first section fills 4,950 of 5,000 characters, so the next heading cannot be followed by its text on that page.
    const out = jatsToPages(article({ body: sec("Introduction", para(48)) + sec("Methods", sec("Participants", para(10))) }))!;
    for (const pg of out.pages) expect(pg.split("\n\n").at(-1)).not.toMatch(/^(Introduction|Methods|Participants)$/);
    expect(out.pages.some((pg) => pg.startsWith("Methods\n\nParticipants\n\n"))).toBe(true);
  });

  it("keeps the first SH_MAX_PAGES pages, as a PDF's, and says how many there were", () => {
    const big = Array.from({ length: SH_MAX_PAGES + 20 }, (_, i) => sec("Part " + i, p("z".repeat(3000)))).join("");
    const out = jatsToPages(article({ body: big }))!;
    expect(out.pages).toHaveLength(SH_MAX_PAGES);
    expect(out.total).toBeGreaterThan(SH_MAX_PAGES);
  });
});

describe("not a paper's text", () => {
  it.each([
    ["not XML at all", "<html><body><p>Sign in to continue</p></body></html"],
    ["XML that is not well formed", "<article><front></front><body><p>one</p></article>"],
    ["XML that is not an article", "<?xml version=\"1.0\"?><note><to>Ann</to></note>"],
    ["an article with no body", article({ body: "" })],
    ["an article whose body is a line", article({ body: p("See the supplement.") })],
    ["an article of which only the abstract is held", article({ front: `<abstract><p>${FILLER.repeat(5)}</p></abstract>`, body: "" })]
  ])("%s gives null", (_n, xml) => {
    expect(jatsToPages(xml)).toBeNull();
  });
});
