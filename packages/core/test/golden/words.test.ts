import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../../src/aiuse";
import { apJson } from "../../src/analyse";
import { fieldLabel } from "../../src/prompts";
import {
  GR_NOUNS, GR_UK_US, GR_IZE, GR_RULES, GRAM_LOCAL_MIN_CHARS, GRAM_AI_MIN_CHARS, GRAM_AI_MAX_CHARS, GRAM_CHUNK_CHARS, GRAM_LOCAL_MAX_CHARS, BANK_MAX, BANK_CSV_NAME, DICT_CACHE_MAX,
  gramLocal, gramSpellStd, gramSpellSet, gramSpellRules, gramVerifyAI, gramStatAdd, gramTop, gramChunks, gramAiMerge, buildGrammarPrompt, buildDictPrompt,
  dictNorm, dictUrl, dictParse, dictAiClean, dictCachePut, bankAdd, bankRemove, bankCsv,
} from "../../src/words";
import type { BankEntry, GramHit, GramItem, SpellStd } from "../../src/words";
import type { RuleHit, StoredHit, WordsFx } from "./words/capture";
import { readFixture } from "./harness/fixture";

/**
 * Words and grammar (words.ts) against v1's page (`golden:capture words`, words/capture.ts): the tables and the rules against tables.json and rules.json; gramLocal for the golden corpus under each spelling
 * standard; gramSpellStd; the counts; the parts gramRunAI cuts the text into; gramVerifyAI over good and bad edits; what gramRunAI makes of replies (gramAiMerge); the prompts v1 hands to callAI, whose
 * aiuClassify labels are held to classifyAiUse; the dictionary's reading of the service and of the AI; the word bank and its CSV. The expected values are all v1's (cases.json); what is typed here is only
 * which function answers which field, and the sizes the brief names.
 */

type Meta = { id: string; kind: string; rule: string; why: string; ex: [string, string]; source: string; flags: string };
const fx = readFixture<WordsFx>("words", "cases");
const tables = readFixture<{ tables: { GR_NOUNS: Record<string, string>; GR_UK_US: string[][]; GR_IZE: string[] } }>("words", "tables").tables;
const rulesFx = readFixture<{ rules: Meta[]; spell: Record<string, Meta[]> }>("words", "rules");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** A hit as stored (id, place, words, fix) with the rule's own kind, rule, why and ex, which rules.json holds (the spelling rules under the standard in force). */
const metaOf = (std: SpellStd) => new Map<string, Meta>([...rulesFx.rules, ...(rulesFx.spell[std] ?? [])].map((r) => [r.id, r]));
function expand(h: StoredHit, std: SpellStd): GramItem {
  if ("src" in h) return h as unknown as GramItem;
  const r = h as RuleHit;
  const m = metaOf(std).get(r.id)!;
  return { src: "rule", id: r.id, kind: m.kind, rule: m.rule, why: m.why, ex: m.ex, start: r.start, end: r.end, original: r.original, fix: r.fix } as GramHit;
}
const textOf = (c: WordsFx["local"][number]): string | null => (c.pad ? c.pad.char.repeat(c.pad.count) + (c.tail ?? "") : (c.text ?? null));

describe("words: tables and rules (6671-6690)", () => {
  it("GR_NOUNS, GR_UK_US and GR_IZE are v1's", () => {
    expect(GR_NOUNS as unknown).toEqual(tables.GR_NOUNS);
    expect(GR_UK_US as unknown).toEqual(tables.GR_UK_US);
    expect(GR_IZE as unknown).toEqual(tables.GR_IZE);
  });
  it("GR_RULES are v1's: id, kind, rule, why, example, pattern and flags, in v1's order", () => {
    expect(GR_RULES.map((R) => ({ id: R.id, kind: R.kind, rule: R.rule, why: R.why, ex: R.ex, source: R.re.source, flags: R.re.flags }))).toEqual(rulesFx.rules);
    expect(GR_RULES).toHaveLength(24);
  });
  it("gramSpellRules makes v1's two rules under uk and us, and none when the standard is off", () => {
    for (const std of ["uk", "us"] as const) {
      expect(gramSpellRules(std).map((R) => ({ id: R.id, kind: R.kind, rule: R.rule, why: R.why, ex: R.ex, source: R.re.source, flags: R.re.flags })), std).toEqual(rulesFx.spell[std]);
    }
    expect(gramSpellRules("off")).toEqual([]);
  });
});

describe("words: the spelling standard (6692-6693)", () => {
  it("gramSpellStd and gramSpellSet for every stored value v1 was given", () => {
    for (const c of fx.std) {
      expect(gramSpellStd(c.stored), String(c.stored)).toBe(c.std);
      expect(gramSpellSet(c.stored), String(c.stored)).toBe(c.set);
    }
    expect(fx.std.map((c) => c.std)).toEqual(expect.arrayContaining(["uk", "us", "off"]));
  });
});

describe("words: gramLocal, the rule check (6710-6727)", () => {
  it("rule check of the golden corpus gives v1's suggestions", () => {
    expect(fx.local.length).toBeGreaterThan(50);
    for (const c of fx.local) {
      const text = textOf(c);
      for (const std of ["uk", "us", "off"] as const) {
        expect(gramLocal(text, std), `${c.id} (${c.note}) under ${std}`).toEqual(c.out[std].map((h) => expand(h, std)));
      }
      // nothing stored reads as British spelling
      expect(gramLocal(text, gramSpellStd(null)), c.id).toEqual(c.out.uk.map((h) => expand(h, "uk")));
    }
  });
  it("the corpus triggers every rule under both standards, none of the spelling rules when it is off, and the clean text finds nothing", () => {
    const ids = (std: "uk" | "us" | "off") => new Set(fx.local.flatMap((c) => c.out[std].map((h) => h.id)));
    for (const R of GR_RULES) {
      expect(ids("uk").has(R.id), R.id).toBe(true);
      expect(ids("us").has(R.id), R.id).toBe(true);
    }
    for (const id of ["spell-variant", "spell-ize"]) {
      expect(ids("uk").has(id)).toBe(true);
      expect(ids("us").has(id)).toBe(true);
    }
    expect([...ids("off")].filter((id) => id.startsWith("spell-"))).toEqual([]);
    expect(fx.local.find((c) => c.id === "clean")!.out.uk).toEqual([]);
  });
  it("v1's own example of each rule is found by that rule", () => {
    for (const R of GR_RULES) {
      const c = fx.local.find((x) => x.id === `ex-${R.id}`)!;
      expect(c.text).toBe(R.ex[0]);
      const hits = gramLocal(R.ex[0], "uk").filter((h) => h.id === R.id);
      expect(hits.length, R.id).toBeGreaterThan(0);
    }
  });
  it("a rule inside quotation marks is left alone, a hit that v1 gives no fix keeps fix null, and the text is read to 60,000 characters", () => {
    expect(gramLocal('He wrote "we discussed about it" here.', "uk")).toEqual([]);
    expect(gramLocal("I am knowing it.", "uk")[0]!.fix).toBeNull();
    expect(GRAM_LOCAL_MAX_CHARS).toBe(60000);
  });
});

describe("words: the counts (6747-6749, 6798-6800)", () => {
  it("gramStatAdd adds one for each finding of a rule and none for the AI's, and gramTop lists the three most frequent", () => {
    for (const c of fx.stats) {
      expect(gramStatAdd(c.stored ?? {}, c.items), JSON.stringify(c)).toEqual(c.after);
      expect(gramTop(c.after), JSON.stringify(c)).toEqual(c.top);
    }
  });
  it("gramStatAdd does not change the counts it was given", () => {
    const s = { "cope-up": 1 };
    gramStatAdd(s, [{ src: "rule", id: "cope-up" }]);
    expect(s).toEqual({ "cope-up": 1 });
  });
});

describe("words: the guards (6743, 6752)", () => {
  it("the rules need GRAM_LOCAL_MIN_CHARS characters and the AI GRAM_AI_MIN_CHARS, trimmed", () => {
    expect(GRAM_LOCAL_MIN_CHARS).toBe(fx.guards.local.accepted);
    expect(GRAM_AI_MIN_CHARS).toBe(fx.guards.ai.accepted);
    expect(fx.guards.local.refused).toBe(GRAM_LOCAL_MIN_CHARS - 1);
    expect(fx.guards.ai.refused).toBe(GRAM_AI_MIN_CHARS - 1);
    expect(fx.guards.local.paddedRefused).toBe(true);
    expect(fx.guards.ai.paddedRefused).toBe(true);
  });
});

describe("words: the parts gramRunAI sends (6755-6758)", () => {
  it("the text is capped at 9,000 characters and cut into parts of up to 1,800, as v1 sends them", () => {
    expect(GRAM_AI_MAX_CHARS).toBe(9000);
    expect(GRAM_CHUNK_CHARS).toBe(1800);
    expect(fx.chunks.length).toBeGreaterThan(15);
    for (const c of fx.chunks) {
      const parts = gramChunks(c.text);
      expect(parts.map((p) => p.length), `${c.id} (${c.note})`).toEqual(c.lens);
      expect(parts.length).toBe(c.calls);
      expect(parts.join("")).toBe(c.text.slice(0, 9000));
    }
  });
  it("text of 9,000 characters is one more part than 1,800 each would give where v1 cuts at a full stop, and a text over 9,000 loses the rest", () => {
    const by = (id: string) => fx.chunks.find((c) => c.id === id)!;
    expect(gramChunks(by("9001").text).join("")).toHaveLength(9000);
    expect(gramChunks(by("12000").text).join("")).toHaveLength(9000);
    expect(by("exactly-1800").lens).toEqual([1800]);
    expect(by("3000-no-stop").lens).toEqual([1800, 1200]);
    // a full stop and space at index 600 is not used, at 601 it is; at 1,800 v1's search still reaches it
    expect(by("stop-at-600").lens[0]).toBe(1800);
    expect(by("stop-at-601").lens[0]).toBe(602);
    expect(by("stop-at-1800").lens[0]).toBe(1801);
  });
  it("each part's prompt is the one v1 sent, with temperature 0.1 and 1,800 tokens", () => {
    for (const c of fx.chunks) {
      const parts = gramChunks(c.text);
      parts.forEach((p, i) => {
        const b = buildGrammarPrompt(fieldLabel(null), "uk", p);
        expect(sha(b.prompt), `${c.id} part ${i}`).toBe(c.sha[i]);
        expect({ temp: b.temp, max: b.max, noLang: b.noLang }).toEqual({ temp: 0.1, max: 1800, noLang: true });
        expect(c.opts[i]).toEqual({ temp: 0.1, max: 1800, noLang: true });
      });
    }
  });
});

describe("words: gramVerifyAI (6730-6741)", () => {
  it("gramVerifyAI keeps and drops the edits v1 keeps and drops", () => {
    for (const c of fx.verify) expect(gramVerifyAI(c.text, c.edits), c.id).toEqual(c.out);
  });
  it("AI edits whose original is not in the text are dropped", () => {
    const text = "We discussed about the findings. The sample was small.";
    const r = gramVerifyAI(text, [
      { original: "We discussed about the findings", fix: "We discussed the findings", rule: "Discuss", why: "No about.", kind: "error" },
      { original: "an invented phrase", fix: "a real phrase", rule: "x", why: "y", kind: "error" },
      { original: "The sample was big", fix: "The sample was large" },
    ]);
    expect(r.ok.map((e) => e.original)).toEqual(["We discussed about the findings"]);
    expect(r.dropped).toBe(2);
    // the match is on the text with its white space made single
    expect(gramVerifyAI("two   spaces\nhere in text", [{ original: "two spaces here", fix: "two spaces over here" }]).ok).toHaveLength(1);
  });
  it("an edit that changes a number, a citation or a quotation is dropped, and only the first 20 edits are read", () => {
    const text = "A sample of 120 students (Smith, 2019) said \"it was clear\" and the sample grew.";
    const r = gramVerifyAI(text, [
      { original: "A sample of 120 students", fix: "A sample of 210 students" },
      { original: "(Smith, 2019) said", fix: "(Smith, 2018) said" },
      { original: 'said "it was clear" and', fix: 'said "it was plain" and' },
    ]);
    expect(r.ok).toEqual([]);
    expect(r.dropped).toBe(3);
    const many = Array.from({ length: 25 }, () => ({ original: "the sample grew", fix: "the sample then grew" }));
    expect(gramVerifyAI(text, many).ok).toHaveLength(20);
    expect(gramVerifyAI(text, many).dropped).toBe(0);
    expect(gramVerifyAI(text, null)).toEqual({ ok: [], dropped: 0 });
  });
});

describe("words: what gramRunAI makes of the replies (6759-6785)", () => {
  it("gramAiMerge gives GRAM's items, checked, parts and dropped for every flow, and the counts v1 stores", () => {
    expect(fx.flows.length).toBeGreaterThan(10);
    for (const c of fx.flows) {
      const text = fx.flowTexts[c.textId]!;
      const std = gramSpellStd(c.std);
      const parsed: Array<{ edits?: unknown } | null> = [];
      for (const r of c.replies.slice(0, c.calls)) {
        if (typeof r === "object") break;
        parsed.push(apJson(r) as { edits?: unknown } | null);
      }
      const got = gramAiMerge(text, parsed, std);
      expect(got.items, `${c.id} (${c.note})`).toEqual(c.items.map((h) => expand(h, std)));
      expect({ checked: got.checked, parts: got.parts, dropped: got.dropped }, c.id).toEqual({ checked: c.checked, parts: c.parts, dropped: c.dropped });
      expect(gramStatAdd({}, gramLocal(text, std)), c.id).toEqual(c.stats);
      expect(got.parts).toBe(gramChunks(text).length);
      // the prompts it sent, one for each call, up to the failure
      gramChunks(text).slice(0, c.calls).forEach((p, i) => expect(sha(buildGrammarPrompt(fieldLabel(null), std, p).prompt), `${c.id} part ${i}`).toBe(c.sha[i]));
    }
  });
  it("the flows reach an overlap, an edit found only in the single-spaced text (start 1e9), a failure part-way and an unreadable reply", () => {
    const f = (id: string) => fx.flows.find((c) => c.id === id)!;
    expect(f("f1-mixed").items.some((h) => "src" in h && h.src === "ai" && h.start === 1e9)).toBe(true);
    expect(f("f1-mixed").items.some((h) => "src" in h && h.src === "ai" && h.original === "discussed about the results")).toBe(false);
    expect(f("f3-good-garbage-throws")).toMatchObject({ checked: 2, calls: 3 });
    expect(f("f1-unreadable").dropped).toBe(1);
    expect(f("f1-throws").checked).toBe(0);
  });
});

describe("words: the prompts v1 hands to callAI (6630, 6764)", () => {
  const rows = (entry: string) => fx.prompts.filter((p) => p.entry === entry);
  it("buildGrammarPrompt, under each spelling setting and each field of study", () => {
    expect(rows("gramRunAI")).toHaveLength(12);
    for (const c of rows("gramRunAI")) {
      const i = c.inputs as { std: string; text: string };
      const parts = gramChunks(i.text);
      expect(parts).toHaveLength(1);
      const b = buildGrammarPrompt(fieldLabel(c.field), gramSpellStd(i.std === "unset" ? null : i.std), parts[0]!);
      expect(b.prompt).toBe(c.prompt);
      expect({ temp: b.temp, max: b.max, noLang: b.noLang }).toEqual(c.opts);
      expect(fieldLabel(c.field)).toBe(c.label);
    }
  });
  it("buildDictPrompt (temp 0.2, 600 tokens): the Hindi meaning and a simple example", () => {
    expect(rows("dictAI")).toHaveLength(6);
    for (const c of rows("dictAI")) {
      const b = buildDictPrompt(fieldLabel(c.field), (c.inputs as { word: string }).word);
      expect(b.prompt).toBe(c.prompt);
      expect({ temp: b.temp, max: b.max, noLang: b.noLang }).toEqual(c.opts);
    }
  });
  it("each prompt's opening is the one the AI-use log reads, and classifyAiUse gives the label v1 gives", () => {
    for (const c of fx.prompts) expect(classifyAiUse(c.prompt), c.entry).toEqual(c.aiu);
    const labels = new Set(fx.prompts.map((c) => `${c.entry}: ${c.aiu?.k} / ${c.aiu?.g}`));
    expect([...labels].sort()).toEqual(["dictAI: looking up a word / explain", "gramRunAI: checking grammar and wording / text"]);
  });
});

describe("words: the dictionary (6575-6597, 6631-6638)", () => {
  it("dictNorm for every input v1 was given", () => {
    for (const c of fx.dict.norm) expect(dictNorm(c.typed), JSON.stringify(c.typed)).toBe(c.out);
  });
  it("dictUrl is the address v1 fetched, and dictParse reads each answer as dictFetch does", () => {
    for (const c of fx.dict.fetch) {
      expect(dictUrl(c.word), c.id).toBe(c.url);
      if (c.status === 404) {
        expect(c.out).toEqual({ notfound: true });
        continue;
      }
      expect(dictParse(c.word, c.payload), c.id).toEqual(c.out);
      // v1 caches what it found and nothing else
      expect(c.cached, c.id).toEqual((c.out as { notfound?: boolean }).notfound ? null : c.out);
    }
    const out = fx.dict.fetch.map((c) => c.out as { meanings?: unknown[]; notfound?: boolean });
    expect(out.some((o) => o.notfound)).toBe(true);
    expect(out.some((o) => o.meanings?.length === 4)).toBe(true);
  });
  it("dictAiClean reads the AI's reply as dictAI does: unsure, no Hindi, an example without the word, cuts", () => {
    for (const c of fx.dict.ai) expect(dictAiClean(c.word, apJson(c.reply) as Parameters<typeof dictAiClean>[1]), c.id).toEqual(c.out);
  });
  it("dictCachePut keeps 200 words, dropping the first before it adds, even to a word already there", () => {
    expect(DICT_CACHE_MAX).toBe(200);
    for (const c of fx.dict.cache) {
      const cache = Object.fromEntries(Array.from({ length: c.n }, (_, i) => [`w${i}`, { word: `w${i}` }]));
      const after = dictCachePut(cache, c.word, { word: c.word, marker: c.n });
      expect(Object.keys(after), `${c.n} ${c.word}`).toEqual(c.after);
      expect(after[c.word]).toEqual(c.value);
      expect(Object.keys(cache)).toHaveLength(c.n);
    }
  });
});

describe("words: the word bank (6647-6656)", () => {
  const genBank = (n: number): BankEntry[] => Array.from({ length: n }, (_, i) => ({ w: `word${i}`, pos: "noun", m: `meaning ${i}`, h: i % 3 ? "" : "शब्द", d: "2026-09-01" }));
  const summ = (a: BankEntry[]) => ({ len: a.length, entries: a.length <= 6 ? a : [...a.slice(0, 3), ...a.slice(-3)] });
  it("bankAdd puts the word first with the first meaning cut to 160, refuses a word already there, and keeps 500", () => {
    expect(BANK_MAX).toBe(500);
    for (const c of fx.bank.add) {
      const bank = Array.isArray(c.bank) ? c.bank : genBank(c.bank.gen);
      const date = c.after.entries[0]!.d;
      const out = bankAdd(bank, c.cur as Parameters<typeof bankAdd>[1], c.ai as Parameters<typeof bankAdd>[2], date);
      if (!c.added) {
        expect(out, c.id).toBeNull();
        continue;
      }
      expect(c.dateOk).toBe(true);
      expect(summ(out!), c.id).toEqual(c.after);
      // the rest is the old bank, newest first, cut at 500
      expect(out!.slice(1)).toEqual(bank.slice(0, out!.length - 1));
    }
    expect(fx.bank.add.some((c) => !c.added)).toBe(true);
  });
  it("bankAdd does not change the bank it was given", () => {
    const bank = [{ w: "old", pos: "", m: "", h: "", d: "2026-10-01" }];
    bankAdd(bank, { word: "new", phon: "", meanings: [] }, null, "2026-10-21");
    expect(bank).toHaveLength(1);
  });
  it("bankRemove", () => {
    for (const c of fx.bank.remove) expect(bankRemove(c.bank, c.w)).toEqual(c.after);
  });
  it("bankCsv writes word-bank.csv with v1's columns and escaping, and nothing for an empty bank", () => {
    expect(BANK_CSV_NAME).toBe("word-bank.csv");
    for (const c of fx.bank.csv) {
      expect(bankCsv(c.bank), JSON.stringify(c.bank).slice(0, 40)).toBe(c.text);
      if (c.text !== null) expect(c.name).toBe(BANK_CSV_NAME);
    }
    expect(fx.bank.csv.find((c) => c.text !== null)!.text!.split("\n")[0]).toBe("word,part of speech,meaning,hindi,date saved");
  });
});
