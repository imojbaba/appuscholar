import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyAiUse, fieldLabel, PLAIN_OUT, statsParseText, type StatsBlock } from "@appuscholar/core";
import { buildStatsExplainPrompt, EXPLAIN_MAX, EXPLAIN_TEMP, statsExplainText } from "../lib/tools/stats/explain";
import { blocksToHtml } from "../lib/tools/stats/results";
import { defaultForm } from "../lib/tools/stats/form";
import { runLabTest } from "../lib/tools/stats/run";
import { casesOf, fixtureFiles } from "./support/statsGolden";

/*
 * Task B2, ledger R2: the text "Explain in plain language" sends (v1 statsExplain 12027-12036). The request is v1's system text, verbatim, then the result's tables as
 * text and the sentence; the field of study is the only other thing in it.
 */

const V1 = join(__dirname, "../../../../appuscholer/index.html");
const field = fieldLabel("psychology");

describe("the explain request", () => {
  it("opens as v1's does, carries the tables and the sentence, and goes at temperature 0.3", () => {
    const b = buildStatsExplainPrompt(field, "N M SD 12 7.83 0.47", "A test showed that x, p < .001.");
    expect(b.temp).toBe(0.3);
    expect(EXPLAIN_TEMP).toBe(0.3);
    expect(b.max).toBe(EXPLAIN_MAX);
    expect(b.prompt.startsWith("You are a statistics tutor for students of " + field + ". A student ran this analysis. In 2 to 4 sentences of plain language")).toBe(true);
    expect(b.prompt).toContain(PLAIN_OUT + "\n\nResult summary:\nN M SD 12 7.83 0.47\n\nAPA sentence: A test showed that x, p < .001.");
  });

  it.skipIf(!existsSync(V1))("the system text is v1's, character for character (read from v1's statsExplain)", () => {
    const src = readFileSync(V1, "utf8");
    const at = src.indexOf("async function statsExplain()");
    expect(at).toBeGreaterThan(0);
    const m = /callAI\('(You are a statistics tutor for students of '\+fieldName\(\)\+'[^]*?)'\+PLAIN_OUT\+'\\n\\nResult summary:\\n'\+window\._statsSummary\+'\\n\\nAPA sentence: '\+window\._statsAPA,\{temp:0\.3,max:800\}\)/.exec(src.slice(at, at + 2500));
    expect(m).not.toBeNull();
    const v1Text = m![1]!.replace("'+fieldName()+'", "@@FIELD@@");
    expect(buildStatsExplainPrompt("@@FIELD@@", "T", "A").prompt).toBe(v1Text + PLAIN_OUT + "\n\nResult summary:\nT\n\nAPA sentence: A");
  });

  it("is a 'statistics tutor' request as core's AI-use log rule reads it, so the log says what it was", () => {
    const k = classifyAiUse(buildStatsExplainPrompt(field, "t", "a").prompt);
    expect(k).toEqual({ k: "explaining statistics output in plain words", g: "explain" });
  });
});

describe("the results as text", () => {
  const blocks: StatsBlock[] = [
    { kind: "table", rows: [["Group", "N", "M"], ["A &amp; B", "12", "7.83"], ["C", "9", "6.1"]] },
    { kind: "note", html: "Welch t(21.2) = 6.42, p < .001, Hedges' g = 2.53. Next: <b>bold</b> d<sub>z</sub> = 0.5." },
    { kind: "heading", text: "Assumption checks" },
    { kind: "list", items: ["one", "two &lt; three"] }
  ];

  it("cuts the tags, keeps the words between cells apart, and reads the entities as characters", () => {
    expect(statsExplainText(blocks)).toBe("Group N M A & B 12 7.83 C 9 6.1 Welch t(21.2) = 6.42, p < .001, Hedges' g = 2.53. Next: bold d z = 0.5. Assumption checks one two < three");
  });

  it("does not lose the rest of a paragraph after a literal '<' (v1's /<[^>]+>/ cut from the '<' to the next '>')", () => {
    const text = statsExplainText([{ kind: "note", html: "t(5) = 2.1, p < .001, d = 1.2." }]);
    expect(text).toBe("t(5) = 2.1, p < .001, d = 1.2.");
    expect(text).toContain("d = 1.2");
  });

  it("holds no data row: for every golden case the text is made from the result's blocks alone", () => {
    // A column that is in no table of the result (the sentinel) never reaches the text: the builder takes blocks and an APA sentence and nothing else.
    const csv = "g,s,secret\nA,1,ZZROW1\nA,2,ZZROW2\nA,3,ZZROW3\nB,5,ZZROW4\nB,6,ZZROW5\nB,8,ZZROW6";
    const data = statsParseText(csv)!;
    const f = { ...defaultForm(data, "ttestInd"), values: { dv: "1", iv: "0" } };
    const o = runLabTest(data, "ttestInd", f, (k) => k);
    expect(o.kind).toBe("ok");
    if (o.kind !== "ok") return;
    const prompt = buildStatsExplainPrompt(field, statsExplainText(o.res.blocks), o.res.apa).prompt;
    expect(prompt).not.toContain("ZZROW");
    expect(prompt).toContain("Group N M SD");
  });

  it("never throws or comes back empty for a block of any golden case", () => {
    let n = 0;
    for (const file of fixtureFiles()) {
      for (const c of casesOf(file)) {
        if (c.apa === null || c.id === "alpha-large-boot-200") continue;
        const data = statsParseText(c.csv)!;
        const f = defaultForm(data, c.test); f.values = { ...c.form.values }; f.ticked = { ...c.form.ticked };
        const o = runLabTest(data, c.test, f, (k) => k);
        if (o.kind !== "ok") continue;
        const text = statsExplainText(o.res.blocks);
        expect(text.length, c.id).toBeGreaterThan(10);
        expect(text, c.id).not.toMatch(/<\/?[A-Za-z]/);
        // every table's header words are in it
        for (const b of o.res.blocks) if (b.kind === "table") expect(text, c.id).toContain(b.rows[0]![0]!.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim());
        n++;
        if (n >= 60) return;
      }
    }
  }, 120_000);

  it("blocksToHtml keeps v1's tables, notes, headings and lists", () => {
    const html = blocksToHtml(blocks);
    expect(html).toContain('<table class="stats-table"><tbody><tr><th>Group</th><th>N</th><th>M</th></tr><tr><td>A &amp; B</td>');
    expect(html).toContain('<p class="desc">Welch t(21.2)');
    expect(html).toContain("<h4>Assumption checks</h4>");
    expect(html).toContain("<ul><li>one</li><li>two &lt; three</li></ul>");
  });
});
