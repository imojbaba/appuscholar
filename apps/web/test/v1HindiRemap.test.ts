import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { applyLaterSteps, dictionariesAtRemap } from "../scripts/extract-v1-i18n.mjs";
import { applyPanelFixes } from "../scripts/i18n-overrides.mjs";
import {
  KEEP_ENGLISH, KIND, SOURCES, applyV1HindiRemap, buildV1HindiRemap, normaliseEnglish, readV1Build, readV1Hindi, readV1I18N, readV1Literal, readV1Tables,
  serializeRemap, sourceOf, stripEmoji, v1Stamp,
} from "../scripts/v1-hindi-remap.mjs";

// Task 39 (the Hindi re-map): v2's panel Hindi was the English text until Dr. Sharma gave Hindi; her newest v1 (build 2026.10.24a) has it.
// The matching and the apply step are pure and tested here on small dictionaries; the committed remap file is tested against the
// committed messages/ (no v1 file is needed).
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const REMAP_FILE = here("../scripts/fixtures/v1-hindi-remap.json");

type Entry = { en: string; hi: string; v1Key: string; kind: string };
type Remap = {
  v1: { commit: string; build: string; sha256: string };
  keys: Record<string, Entry>;
  ambiguous: Record<string, { en: string; v1: [string, string][] }>;
  rejected: Record<string, { en: string; v1Key: string; reason: string }>;
  keepEnglish: string[];
  noV1Hindi: string[];
};
const remap = JSON.parse(readFileSync(REMAP_FILE, "utf8")) as Remap;
const E = en as Record<string, string>;
const H = hi as Record<string, string>;

/** A v2 dictionary pair where every key's Hindi is its English (the state before the remap). */
const copies = (d: Record<string, string>) => ({ en: d, hi: { ...d } });
type V1 = { en: Record<string, string>; hi: Record<string, string> };
const build = (args: { en: Record<string, string>; hi: Record<string, string>; v1: V1; keepEnglish: string[] }) => buildV1HindiRemap(args) as unknown as Omit<Remap, "v1">;
const run = (v2: Record<string, string>, v1: V1) => build({ ...copies(v2), v1, keepEnglish: [] });

describe("normaliseEnglish", () => {
  it("drops emoji, tidies white space and spells Appuscholar", () => {
    expect(normaliseEnglish("📚  Reading\n shelf ")).toBe("Reading shelf");
    expect(normaliseEnglish("⬇ Download (.txt)")).toBe("Download (.txt)");
    expect(normaliseEnglish("Check what Appuscholer read")).toBe("Check what Appuscholar read");
    expect(normaliseEnglish("Next stage →")).toBe("Next stage →");
  });
});

describe("matching v2's English copies to v1's Hindi", () => {
  it("maps a key by the exact English and records the English, the Hindi, the v1 key and the kind", () => {
    const r = run({ ap2_ask: "Ask" }, { en: { ap_ask: "Ask" }, hi: { ap_ask: "पूछें" } });
    expect(r.keys).toEqual({ ap2_ask: { en: "Ask", hi: "पूछें", v1Key: "ap_ask", kind: KIND.EXACT } });
    expect(r.noV1Hindi).toEqual([]);
  });

  it("takes the first v1 key in v1's order when several carry the same English and the same Hindi", () => {
    const r = run({ sh2_close: "Close" }, { en: { a_close: "Close", b_close: "Close" }, hi: { a_close: "बंद करें", b_close: "बंद करें" } });
    expect(r.keys.sh2_close).toMatchObject({ hi: "बंद करें", v1Key: "a_close" });
    expect(r.ambiguous).toEqual({});
  });

  it("uses only v1 Hindi that is Hindi: a v1 key whose Hindi is the English, empty or missing is no source", () => {
    const v1 = { en: { a: "Stage", b: "Title", c: "Notes", d: "Close" }, hi: { a: "Stage", b: "", c: undefined as unknown as string } };
    const r = run({ k1: "Stage", k2: "Title", k3: "Notes", k4: "Close" }, v1);
    expect(r.keys).toEqual({});
    expect(r.noV1Hindi).toEqual(["k1", "k2", "k3", "k4"]);
  });

  it("looks only at keys whose Hindi is still the English copy", () => {
    const r = build({ en: { a: "Ask", b: "Ask" }, hi: { a: "Ask", b: "पूछो" }, v1: { en: { v: "Ask" }, hi: { v: "पूछें" } }, keepEnglish: [] });
    expect(Object.keys(r.keys)).toEqual(["a"]);
    expect(r.noV1Hindi).toEqual([]);
  });

  it("matches the same words when emoji, white space or the Appuscholer spelling differ, and says so", () => {
    const r = run(
      { a: "Check what Appuscholar read", b: "Sections found:", c: "Open the  paper", d: "Reading shelf" },
      {
        en: { va: "Check what Appuscholer read", vb: "Sections found: ", vc: "Open the paper", vd: "📚 Reading shelf" },
        hi: { va: "देखें कि Appuscholer ने क्या पढ़ा", vb: "मिले हुए खंड: ", vc: "शोधपत्र खोलें", vd: "📚 पढ़ने की शेल्फ़" },
      },
    );
    expect(r.keys.a).toEqual({ en: "Check what Appuscholar read", hi: "देखें कि Appuscholar ने क्या पढ़ा", v1Key: "va", kind: KIND.NORMALISED });
    expect(r.keys.b).toMatchObject({ hi: "मिले हुए खंड:", kind: KIND.NORMALISED });   // the English has no trailing space, so the Hindi has none
    expect(r.keys.c).toMatchObject({ hi: "शोधपत्र खोलें", kind: KIND.NORMALISED });
    expect(r.keys.d).toMatchObject({ en: "Reading shelf", hi: "पढ़ने की शेल्फ़", kind: KIND.NORMALISED });   // v2's English has no emoji, so the Hindi has none
  });

  it("writes the Appuscholar spelling into every remapped Hindi, whatever the match kind", () => {
    const r = run({ a: "Made with Appuscholar" }, { en: { v: "Made with Appuscholar" }, hi: { v: "Appuscholer के साथ बनाया" } });
    expect(r.keys.a!.hi).toBe("Appuscholar के साथ बनाया");
  });

  it("prefers the exact English over the same words with other spacing", () => {
    const r = run({ a: "Ask" }, { en: { v1: "Ask", v2: "Ask " }, hi: { v1: "पूछें", v2: "सवाल" } });
    expect(r.keys.a).toMatchObject({ hi: "पूछें", kind: KIND.EXACT });
    expect(r.ambiguous).toEqual({});
  });

  it("gives the Hindi the English's leading emoji when v1's Hindi has none, and drops one the English lacks", () => {
    const r = run(
      { a: "🧭 Walk me through it", b: "Download", c: "🔎 Search" },
      { en: { va: "Walk me through it", vb: "⬇ Download", vc: "🔎 Search" }, hi: { va: "चरण-दर-चरण समझाएँ", vb: "⬇ डाउनलोड", vc: "🔍 खोजें" } },
    );
    expect(r.keys.a).toMatchObject({ hi: "🧭 चरण-दर-चरण समझाएँ", kind: KIND.NORMALISED });
    expect(r.keys.b).toMatchObject({ hi: "डाउनलोड", kind: KIND.NORMALISED });
    expect(r.keys.c).toMatchObject({ hi: "🔎 खोजें", kind: KIND.EXACT });   // same text, other emoji: v2's English wins in both languages
  });

  it("does not map when the Hindi has an emoji the English lacks inside the text", () => {
    const r = run({ a: "Check it" }, { en: { v: "Check it" }, hi: { v: "जाँचें ✓ इसे" } });
    expect(r.keys).toEqual({});
    expect(r.rejected.a).toMatchObject({ v1Key: "v", reason: "emoji differ" });
  });

  it("renames v1's placeholders to v2's by the order they appear in the English", () => {
    const r = run(
      { a: "Checking {doisCount} DOIs with OpenAlex… {done} done.", b: "Reading {name}…" },
      { en: { va: "Checking {n} DOIs with OpenAlex… {d} done.", vb: "Reading {f}…" }, hi: { va: "OpenAlex से {n} DOI जाँचे जा रहे हैं… {d} हो गए।", vb: "{f} पढ़ा जा रहा है…" } },
    );
    expect(r.keys.a).toEqual({
      en: "Checking {doisCount} DOIs with OpenAlex… {done} done.", hi: "OpenAlex से {doisCount} DOI जाँचे जा रहे हैं… {done} हो गए।", v1Key: "va", kind: KIND.PLACEHOLDERS,
    });
    expect(r.keys.b).toMatchObject({ hi: "{name} पढ़ा जा रहा है…", kind: KIND.PLACEHOLDERS });
  });

  it("renames all placeholders at once, so two names that swap places do not run into each other", () => {
    const r = run({ a: "{b} of {a} papers" }, { en: { v: "{a} of {b} papers" }, hi: { v: "{b} में से {a} शोधपत्र" } });
    expect(r.keys.a!.hi).toBe("{a} में से {b} शोधपत्र");
  });

  it("does not rename when the placeholder counts differ or one name repeats where the other does not", () => {
    const none = (v2: string, v1en: string, v1hi: string) => run({ a: v2 }, { en: { v: v1en }, hi: { v: v1hi } });
    for (const r of [none("{x} and {y}", "{p} and {p}", "{p} और {p}"), none("{x} and {x}", "{p} and {q}", "{p} और {q}"), none("Only {x}", "Only {p} and {q}", "सिर्फ़ {p} और {q}")]) {
      expect(r.keys).toEqual({});
      expect(r.noV1Hindi).toEqual(["a"]);
    }
  });

  it("does not map when v1's Hindi uses a placeholder v1's English lacks, or drops one", () => {
    const r = run(
      { a: "{n} papers", b: "{n} of {m}" },
      { en: { va: "{n} papers", vb: "{n} of {m}" }, hi: { va: "{k} शोधपत्र", vb: "{n} में से" } },
    );
    expect(r.keys).toEqual({});
    expect(r.rejected.a).toMatchObject({ reason: "placeholders differ" });
    expect(r.rejected.b).toMatchObject({ reason: "placeholders differ" });
  });

  it("does not map an English that v1 gives two different Hindi values, and records both", () => {
    const r = run({ ap2_analyse: "Analyse a paper" }, { en: { tab: "Analyse a paper", h3: "Analyse a paper" }, hi: { tab: "शोध-पत्र का विश्लेषण", h3: "शोधपत्र का विश्लेषण" } });
    expect(r.keys).toEqual({});
    expect(r.ambiguous).toEqual({ ap2_analyse: { en: "Analyse a paper", v1: [["tab", "शोध-पत्र का विश्लेषण"], ["h3", "शोधपत्र का विश्लेषण"]] } });
    expect(r.noV1Hindi).toEqual([]);
  });

  it("finds the ambiguity among the same words too, not only among the exact texts", () => {
    const r = run({ a: "Analyse a paper" }, { en: { x: "📄 Analyse a paper", y: "Analyse a paper " }, hi: { x: "📄 विश्लेषण", y: "पत्र का विश्लेषण" } });
    expect(r.keys).toEqual({});
    expect(Object.keys(r.ambiguous)).toEqual(["a"]);
  });

  it("does not map when the tags differ, and maps when they match", () => {
    const r = run(
      { a: "<b>Paper card.</b> Your words first", b: "<b>Fit</b> now", c: "Plain" },
      { en: { va: "<b>Paper card.</b> Your words first", vb: "<b>Fit</b> now", vc: "Plain" }, hi: { va: "<b>पेपर कार्ड।</b> पहले आपके शब्द", vb: "फ़िट अभी", vc: "सादा <i>पाठ</i>" } },
    );
    expect(Object.keys(r.keys)).toEqual(["a"]);
    expect(r.rejected.b).toMatchObject({ v1Key: "vb", reason: "tags differ" });
    expect(r.rejected.c).toMatchObject({ reason: "tags differ" });
  });

  it("finds v1's Hindi for the same words without the tags, and says the tags differ rather than that v1 has no Hindi", () => {
    const r = run({ a: "<b>Check yourself.</b>", b: "Judge this yourself:" }, { en: { va: "Check yourself.", vb: "<b>Judge this yourself:</b>" }, hi: { va: "खुद जाँचें।", vb: "<b>खुद परखें:</b>" } });
    expect(r.keys).toEqual({});
    expect(r.rejected).toEqual({ a: { en: "<b>Check yourself.</b>", v1Key: "va", reason: "tags differ" }, b: { en: "Judge this yourself:", v1Key: "vb", reason: "tags differ" } });
    expect(r.noV1Hindi).toEqual([]);
  });

  it("never maps a key listed as a name or format, and throws when such a key is not an English copy", () => {
    const v1 = { en: { v: "DELETE" }, hi: { v: "हटाएँ" } };
    const r = build({ ...copies({ erase_confirm_word: "DELETE", other: "Ask" }), v1, keepEnglish: ["erase_confirm_word"] });
    expect(r.keys).toEqual({});
    expect(r.keepEnglish).toEqual(["erase_confirm_word"]);
    expect(r.noV1Hindi).toEqual(["other"]);
    expect(() => build({ ...copies({ a: "A" }), v1, keepEnglish: ["gone"] })).toThrow(/gone/);
  });

  it("puts every English copy in exactly one list, in key order", () => {
    const v2 = { c_amb: "Same", a_map: "Ask", d_none: "Nothing here", b_keep: "CSV", e_rej: "<b>X</b>" };
    const r = build({
      ...copies(v2), keepEnglish: ["b_keep"],
      v1: { en: { s1: "Same", s2: "Same", ask: "Ask", x: "<b>X</b>" }, hi: { s1: "एक", s2: "दो", ask: "पूछें", x: "एक्स" } },
    });
    const all = [...Object.keys(r.keys), ...Object.keys(r.ambiguous), ...Object.keys(r.rejected), ...r.keepEnglish, ...r.noV1Hindi];
    expect(all.sort()).toEqual(Object.keys(v2).sort());
    expect(new Set(all).size).toBe(all.length);
    expect(r.noV1Hindi).toEqual(["d_none"]);
  });
});

describe("reading v1", () => {
  const SRC = "<script>\nconst x=1;\nconst I18N={\n  en:{\n    a:'Ask', b:\"It's\"\n  },\n  hi:{\n    a:'पूछें', b:'यह है'\n  }\n};\nconst APP_BUILD='2026.10.24a';\n</script>";
  it("reads the I18N block and the build stamp, and throws when either is missing", () => {
    expect(readV1I18N(SRC)).toEqual({ en: { a: "Ask", b: "It's" }, hi: { a: "पूछें", b: "यह है" } });
    expect(readV1Build(SRC)).toBe("2026.10.24a");
    expect(() => readV1I18N("no block here")).toThrow(/I18N block not found/);
    expect(() => readV1Build("no stamp")).toThrow(/APP_BUILD/);
  });
  it("stamps the v1 file with its commit, build and sha256", () => {
    expect(v1Stamp(SRC, "f5336be")).toEqual({ commit: "f5336be", build: "2026.10.24a", sha256: createHash("sha256").update(SRC).digest("hex") });
    expect(() => v1Stamp(SRC, "not a commit")).toThrow(/commit/);
  });
});

describe("reading a literal from v1 (nothing else of v1 runs)", () => {
  it("reads an object or an array of strings, quotes and escapes included, and nothing when v1 has no such declaration", () => {
    const src = "a;\nconst T={x:'it\\'s', \"y\": [\"1\", '2'], z:{k:'v'}};\nconst U=[\n 'one',\n 'two'\n];\nb";
    expect(readV1Literal(src, "T")).toEqual({ x: "it's", y: ["1", "2"], z: { k: "v" } });
    expect(readV1Literal(src, "U")).toEqual(["one", "two"]);
    expect(readV1Literal(src, "V")).toBeUndefined();
    expect(readV1Literal("const TT={a:'b'};", "T")).toBeUndefined();   // another name that ends the same way is not this table
  });

  it("refuses anything that is more than a literal of strings: a call, a join, a template, a spread, a method on it", () => {
    for (const src of ["const T={a:f()};", "const T={a:'x'+'y'};", "const T={a:`x`};", "const T=[...U];", "const T={a:'x'}.a;", "const T=[1].map(f);", "const T={a:'x'}", "const T={a:'x"]) {
      expect(() => readV1Literal(src, "T"), src).toThrow(/T is not a literal of strings/);
    }
  });

  it("does not run anything: code in the declaration is refused before it can run", () => {
    expect(() => readV1Literal("const T={a:(globalThis.__v1Ran=1)};", "T")).toThrow(/not a literal/);
    expect((globalThis as Record<string, unknown>).__v1Ran).toBeUndefined();
  });

  it("throws when the table is declared twice, since it is then not clear which one v1 uses", () => {
    expect(() => readV1Literal("const T={a:'x'};\nconst T={a:'y'};", "T")).toThrow(/declared more than once/);
  });
});

// A small v1: the I18N block, then the three tables that hold Hindi beside it (AP_STAGES_HI is paired with AP_STAGES by the stage key; TOAST_HI and
// STATIC_HI are keyed by the English text) and TOAST_HI_RE, whose patterns are not texts. The Hindi is copied from v1 build 2026.10.24a.
const GAP_ASK = "In your own words: what was missing in earlier work, and what did this study set out to answer?";
const STATS_ASK = "Which test did the authors use? Does it fit the design and the data?";
const TABLES_SRC = [
  "<script>",
  "const I18N={",
  "  en:{",
  "    hl_off:'Highlight off', ap_close:'Close'",
  "  },",
  "  hi:{",
  "    hl_off:'चिह्न बंद', ap_close:'बंद करें'",
  "  }",
  "};",
  "const AP_STAGES=[",
  `  {k:'gap',name:'Research gap and aim',ask:'${GAP_ASK}',brief:'the gap, the aim',terms:'gap aim'},`,
  `  {k:'stats',name:'Statistics',ask:'${STATS_ASK}',brief:'the test',terms:'test'},`,
  "  {k:'lit',name:'Literature review',ask:'Does it lead to the question? It\\'s a fair ask.',brief:'the review',terms:'review'}",
  "];",
  `const AP_STAGES_HI={"stats": ["Statistics", "लेखकों ने कौन-सा test इस्तेमाल किया? क्या वह design और डेटा पर ठीक बैठता है?"], "gap": ["Research gap और उद्देश्य", "अपने शब्दों में: पहले के काम में क्या कमी थी, और यह अध्ययन किस सवाल का जवाब ढूँढने निकला?"]};`,
  `const TOAST_HI_RE=[["^Code added: (.+)$", "Code जोड़ा गया: $1"]];`,
  `const TOAST_HI={"Tick some papers first": "पहले कुछ शोधपत्रों पर निशान लगाएँ", "Highlight off": "चिह्न बंद"};`,
  `const STATIC_HI={"Start →": "शुरू करें →", "⬇ Download my writing-process record (.txt)": "⬇ मेरा लेखन-प्रक्रिया रिकॉर्ड डाउनलोड करें (.txt)", "📚 Reading shelf": "📚 पढ़ने की शेल्फ़"};`,
  "</script>",
].join("\n");

describe("reading the Hindi tables that sit beside I18N in v1", () => {
  it("reads AP_STAGES_HI, TOAST_HI and STATIC_HI as { en, hi } whose keys say where the Hindi is", () => {
    const t = readV1Tables(TABLES_SRC);
    expect(t.en).toEqual({
      "AP_STAGES_HI.gap.name": "Research gap and aim", "AP_STAGES_HI.gap.ask": GAP_ASK,
      "AP_STAGES_HI.stats.name": "Statistics", "AP_STAGES_HI.stats.ask": STATS_ASK,
      'TOAST_HI["Tick some papers first"]': "Tick some papers first", 'TOAST_HI["Highlight off"]': "Highlight off",
      'STATIC_HI["Start →"]': "Start →", 'STATIC_HI["⬇ Download my writing-process record (.txt)"]': "⬇ Download my writing-process record (.txt)", 'STATIC_HI["📚 Reading shelf"]': "📚 Reading shelf",
    });
    expect(t.hi["AP_STAGES_HI.gap.name"]).toBe("Research gap और उद्देश्य");
    expect(t.hi['TOAST_HI["Highlight off"]']).toBe("चिह्न बंद");
    expect(t.hi['STATIC_HI["Start →"]']).toBe("शुरू करें →");
    expect(Object.keys(t.en).some(k => k.includes("TOAST_HI_RE"))).toBe(false);   // a pattern is not a text
    expect(Object.values(t.hi).some(h => h.includes("$1"))).toBe(false);
  });

  it("pairs a stage with its Hindi by the stage key, not by position, and skips a stage the Hindi table lacks", () => {
    const t = readV1Tables(TABLES_SRC);   // the Hindi table lists stats before gap; AP_STAGES lists gap first and has a third stage, lit
    expect(Object.keys(t.en).filter(k => k.startsWith("AP_STAGES_HI."))).toEqual(["AP_STAGES_HI.gap.name", "AP_STAGES_HI.gap.ask", "AP_STAGES_HI.stats.name", "AP_STAGES_HI.stats.ask"]);
    expect(t.en["AP_STAGES_HI.gap.ask"]).toBe(GAP_ASK);
    expect(t.hi["AP_STAGES_HI.gap.ask"]).toMatch(/^अपने शब्दों में/);
  });

  it("reads no tables from a v1 that has none (the pinned build 2026.10.13a), and throws on a table that does not fit the others", () => {
    expect(readV1Tables("<script>\nconst I18N={\n en:{},\n hi:{}\n};\n</script>")).toEqual({ en: {}, hi: {} });
    expect(() => readV1Tables("const AP_STAGES_HI={\"gap\": [\"a\", \"b\"]};")).toThrow(/AP_STAGES/);
    expect(() => readV1Tables("const AP_STAGES=[{k:'gap',name:'A',ask:'B'}];\nconst AP_STAGES_HI={\"gone\": [\"a\", \"b\"]};")).toThrow(/gone/);
    expect(() => readV1Tables("const TOAST_HI={\"a\": 5};")).toThrow(/TOAST_HI/);
  });

  it("gives the matcher I18N first and the tables after it, in the order AP_STAGES_HI, TOAST_HI, STATIC_HI", () => {
    const all = readV1Hindi(TABLES_SRC);
    expect(Object.keys(all.en).map(sourceOf).filter((s, i, a) => a.indexOf(s) === i)).toEqual([...SOURCES]);
    expect(all.en.hl_off).toBe("Highlight off");
    expect(() => readV1Hindi("no block here")).toThrow(/I18N block not found/);
  });

  it("names the place of every kind of key", () => {
    expect([...SOURCES]).toEqual(["I18N", "AP_STAGES_HI", "TOAST_HI", "STATIC_HI"]);
    expect(sourceOf("ap_ask")).toBe("I18N");
    expect(sourceOf("AP_STAGES_HI.gap.name")).toBe("AP_STAGES_HI");
    expect(sourceOf('TOAST_HI["Highlight off"]')).toBe("TOAST_HI");
    expect(sourceOf('STATIC_HI["Start →"]')).toBe("STATIC_HI");
  });
});

describe("matching with the Hindi tables as extra sources, under the same rules", () => {
  const withTables = (v2: Record<string, string>, src = TABLES_SRC) => run(v2, readV1Hindi(src));

  it("maps the stage names and questions by the exact English, and records the stage and the field in the v1 key; Statistics stays English", () => {
    const r = withTables({
      ap2_stage_gap_name: "Research gap and aim", ap2_stage_gap_ask: GAP_ASK, ap2_stage_stats_name: "Statistics", ap2_stage_stats_ask: STATS_ASK, ap2_stage_lit_name: "Literature review",
    });
    expect(r.keys.ap2_stage_gap_name).toEqual({ en: "Research gap and aim", hi: "Research gap और उद्देश्य", v1Key: "AP_STAGES_HI.gap.name", kind: KIND.EXACT });
    expect(r.keys.ap2_stage_gap_ask).toMatchObject({ v1Key: "AP_STAGES_HI.gap.ask", kind: KIND.EXACT });
    expect(r.keys.ap2_stage_stats_ask).toMatchObject({ v1Key: "AP_STAGES_HI.stats.ask", kind: KIND.EXACT });
    expect(r.noV1Hindi).toEqual(["ap2_stage_lit_name", "ap2_stage_stats_name"]);   // v1 keeps the name in English; the third stage has no Hindi at all
  });

  it("maps a toast by the exact English, with the English as the key in the v1 key", () => {
    const r = withTables({ rs2_tick_some_papers_first: "Tick some papers first" });
    expect(r.keys.rs2_tick_some_papers_first).toEqual({ en: "Tick some papers first", hi: "पहले कुछ शोधपत्रों पर निशान लगाएँ", v1Key: 'TOAST_HI["Tick some papers first"]', kind: KIND.EXACT });
  });

  it("maps dialog text by the same words and gives the Hindi the English's leading emoji or none, as for I18N", () => {
    const r = withTables({ sh2_dl: "Download my writing-process record (.txt)", sh2_reading_shelf: "Reading shelf", sh2_start: "Start →", sh2_pic: "📚 Reading shelf" });
    expect(r.keys.sh2_dl).toMatchObject({ hi: "मेरा लेखन-प्रक्रिया रिकॉर्ड डाउनलोड करें (.txt)", v1Key: 'STATIC_HI["⬇ Download my writing-process record (.txt)"]', kind: KIND.NORMALISED });
    expect(r.keys.sh2_reading_shelf).toMatchObject({ hi: "पढ़ने की शेल्फ़", kind: KIND.NORMALISED });
    expect(r.keys.sh2_pic).toMatchObject({ hi: "📚 पढ़ने की शेल्फ़", kind: KIND.EXACT });
    expect(r.keys.sh2_start).toMatchObject({ hi: "शुरू करें →", v1Key: 'STATIC_HI["Start →"]' });
  });

  it("never reads TOAST_HI_RE: an English that only a pattern covers has no v1 Hindi", () => {
    const r = withTables({ a: "Code added: {name}", b: "^Code added: (.+)$" });
    expect(r.keys).toEqual({});
    expect(r.noV1Hindi).toEqual(["a", "b"]);
  });

  it("takes the first place when two give the same Hindi: I18N, then AP_STAGES_HI, TOAST_HI and STATIC_HI", () => {
    const r = withTables({ k: "Highlight off" });   // I18N hl_off and TOAST_HI both say चिह्न बंद
    expect(r.keys.k).toMatchObject({ hi: "चिह्न बंद", v1Key: "hl_off" });
    expect(r.ambiguous).toEqual({});
  });

  it("is ambiguous when the same English has two different Hindi values in two places, and the v1 keys name both places", () => {
    const src = [
      "const I18N={", "  en:{", "    ap_close:'Close', ap_start:'Start'", "  },", "  hi:{", "    ap_close:'बंद करें', ap_start:'शुरू करें'", "  }", "};",
      `const TOAST_HI={"Close": "बंद", "Done": "पूरा"};`,
      `const STATIC_HI={"Done": "समाप्त", "Start": "शुरू करें"};`,
    ].join("\n");
    const r = withTables({ a: "Close", b: "Done", c: "Start" }, src);
    expect(r.ambiguous).toEqual({
      a: { en: "Close", v1: [["ap_close", "बंद करें"], ['TOAST_HI["Close"]', "बंद"]] },
      b: { en: "Done", v1: [['TOAST_HI["Done"]', "पूरा"], ['STATIC_HI["Done"]', "समाप्त"]] },
    });
    expect(r.keys.c).toMatchObject({ hi: "शुरू करें", v1Key: "ap_start" });   // the same Hindi in two places is one value
    expect(r.rejected).toEqual({});
    expect(Object.keys(r.keys)).toEqual(["c"]);
  });

  it("refuses table Hindi whose tags or placeholders differ, as for I18N", () => {
    const src = `const TOAST_HI={"Read {n} files": "{k} फ़ाइलें पढ़ें", "<b>Fit</b> now": "फ़िट अभी"};`;
    const r = withTables({ a: "Read {n} files", b: "<b>Fit</b> now" }, `const I18N={\n  en:{},\n  hi:{}\n};\n${src}`);
    expect(r.rejected).toEqual({
      a: { en: "Read {n} files", v1Key: 'TOAST_HI["Read {n} files"]', reason: "placeholders differ" },
      b: { en: "<b>Fit</b> now", v1Key: 'TOAST_HI["<b>Fit</b> now"]', reason: "tags differ" },
    });
  });
});

describe("a step after the re-map (the copy pass, the emoji switch) leaves the re-map working", () => {
  // A test-only later step: the emoji switch of Task 36 will do this to both languages, her Hindi included.
  const mapValues = (o: Record<string, string>, f: (s: string) => string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  const noEmoji = (e: Record<string, string>, h: Record<string, string>) => ({ en: mapValues(e, stripEmoji), hi: mapValues(h, stripEmoji) });
  const atRemap = copies({ a: "🔎 Search", b: "Ask", c: "Nothing here" });   // the dictionaries as they stand at the re-map step
  const v1 = { en: { va: "🔎 Search", vb: "Ask" }, hi: { va: "🔎 खोजें", vb: "पूछें" } };

  it("applies the re-map at its own point, then runs the later step on both languages, her Hindi included", () => {
    const built = build({ ...atRemap, v1, keepEnglish: [] });
    const remapped = applyV1HindiRemap(atRemap.en, atRemap.hi, built);
    const after = applyLaterSteps(remapped.en, remapped.hi, [noEmoji]);
    expect(remapped.hi.a).toBe("🔎 खोजें");
    expect(after).toEqual({ en: { a: "Search", b: "Ask", c: "Nothing here" }, hi: { a: "खोजें", b: "पूछें", c: "Nothing here" } });
  });

  it("records the English of the re-map step, so the later step does not touch what the generator reads", () => {
    const built = build({ ...atRemap, v1, keepEnglish: [] });
    expect(built.keys.a!.en).toBe("🔎 Search");   // not "Search": the generator reads the dictionaries before the later step
    // The failure this prevents: a generator that read the dictionaries after the later step would record "Search", and extraction (the re-map first) could not apply it.
    const late = applyLaterSteps(atRemap.en, atRemap.hi, [noEmoji]);
    const wrong = build({ ...late, v1, keepEnglish: [] });
    expect(wrong.keys.a!.en).toBe("Search");
    expect(() => applyV1HindiRemap(atRemap.en, atRemap.hi, wrong)).toThrow(/a:.*recorded/);
  });

  it("runs the steps in the order given, and none by default while none follows the re-map", () => {
    const upper = (e: Record<string, string>, h: Record<string, string>) => ({ en: mapValues(e, s => s.toUpperCase()), hi: h });
    const d = { en: { k: "Ab" }, hi: { k: "Cd" } };
    expect(applyLaterSteps(d.en, d.hi, [upper, (e, h) => ({ en: mapValues(e, s => s + "!"), hi: h })])).toEqual({ en: { k: "AB!" }, hi: { k: "Cd" } });
    expect(applyLaterSteps(d.en, d.hi, [])).toEqual(d);
  });
});

describe("applyV1HindiRemap", () => {
  const r: Remap = {
    v1: { commit: "f5336be", build: "2026.10.24a", sha256: "0".repeat(64) },
    keys: { a: { en: "Ask", hi: "पूछें", v1Key: "ap_ask", kind: KIND.EXACT }, b: { en: "Close", hi: "बंद करें", v1Key: "close_btn", kind: KIND.EXACT } },
    ambiguous: {}, rejected: {}, keepEnglish: [], noV1Hindi: [],
  };
  const dict = () => ({ en: { a: "Ask", b: "Close", c: "Other" } as Record<string, string>, hi: { a: "Ask", b: "Close", c: "Other" } as Record<string, string> });

  it("fills the Hindi of the listed keys where it is still the English copy, and changes nothing else", () => {
    const d = dict();
    const out = applyV1HindiRemap(d.en, d.hi, r);
    expect(out.hi).toEqual({ a: "पूछें", b: "बंद करें", c: "Other" });
    expect(out.en).toEqual(d.en);
    expect(d.hi.a).toBe("Ask");   // the input is not changed
  });

  it("throws when the English is not the one recorded (the pinned v1 changed, so the remap file is out of date)", () => {
    const d = dict();
    d.en.a = "Ask us";
    d.hi.a = "Ask us";
    expect(() => applyV1HindiRemap(d.en, d.hi, r)).toThrow(/a:.*recorded/);
  });

  it("throws when the Hindi is no longer the English copy, rather than write over it", () => {
    const d = dict();
    d.hi.b = "बंद";
    expect(() => applyV1HindiRemap(d.en, d.hi, r)).toThrow(/b:.*English copy/);
  });

  it("throws when a listed key is missing from either dictionary", () => {
    const d = dict();
    delete d.hi.a;
    expect(() => applyV1HindiRemap(d.en, d.hi, r)).toThrow(/a:.*missing/);
    const d2 = dict();
    delete d2.en.b;
    expect(() => applyV1HindiRemap(d2.en, d2.hi, r)).toThrow(/b:.*missing/);
  });

  it("works after applyPanelFixes, which needs the English copy still in Hindi; before it, the fix would throw", () => {
    // v1 spells the product "Appuscholer"; applyPanelFixes corrects both languages and throws when a key has nothing to fix.
    const keys = ["ap2_check_what_appuscholer_read", "ap2_give_appuscholer_a_research", "ap2_made_with_appuscholer_parts", "ap2_none_the_text_has"];
    const raw = Object.fromEntries(keys.map(k => [k, "Made with Appuscholer"]));
    const fixed = applyPanelFixes(raw, raw);
    const map: Remap = { ...r, keys: Object.fromEntries(keys.map(k => [k, { en: "Made with Appuscholar", hi: "यह ऐप शोध में मदद करता है", v1Key: "ap_x", kind: KIND.NORMALISED }])) };
    const out = applyV1HindiRemap(fixed.en, fixed.hi, map);
    expect(Object.values(out.hi)).toEqual(Array(4).fill("यह ऐप शोध में मदद करता है"));
    expect(() => applyPanelFixes(out.en, out.hi)).toThrow(/no match/);   // the other order breaks, which is why the remap runs last
  });
});

describe("the committed remap file", () => {
  it("records the v1 commit, build and sha256 it was made from", () => {
    expect(remap.v1.commit).toBe("6b70c3e");
    expect(remap.v1.build).toBe("2026.10.27d");
    expect(remap.v1.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is what serializeRemap writes, so it was not edited by hand", () => {
    expect(readFileSync(REMAP_FILE, "utf8")).toBe(serializeRemap(remap));
  });

  it("hi.json carries every remap entry, and en.json holds the English each entry was matched against", () => {
    const keys = Object.keys(remap.keys);
    expect(keys.length).toBeGreaterThan(100);
    // The file records each pair as it stands at the re-map step. The dictionaries hold that pair after the steps that follow the re-map (none yet:
    // the copy pass and the emoji switch will come after it), so a later step cannot turn this red; the exact comparison with the dictionaries at the
    // re-map step, rebuilt from the pinned v1, is the last test of this file.
    const after = applyLaterSteps(Object.fromEntries(keys.map(k => [k, remap.keys[k]!.en])), Object.fromEntries(keys.map(k => [k, remap.keys[k]!.hi])));
    for (const k of keys) {
      expect(E[k], `${k} English`).toBe(after.en[k]);
      expect(H[k], `${k} Hindi`).toBe(after.hi[k]);
      expect(H[k], `${k} is Hindi now`).not.toBe(E[k]);
    }
  });

  it("holds the keys that took their Hindi from v1's other tables: the stage names and questions, toasts and two dialog texts", () => {
    const from = (src: string) => Object.entries(remap.keys).filter(([, e]) => sourceOf(e.v1Key) === src);
    const stages = from("AP_STAGES_HI");
    expect(stages.map(([k]) => k).sort()).toEqual(
      ["gap", "lit", "design", "sample", "measures", "procedure", "data", "stats", "results", "conclusion", "limits", "recs"]
        .flatMap(s => (s === "stats" ? [`ap2_stage_${s}_ask`] : [`ap2_stage_${s}_name`, `ap2_stage_${s}_ask`])).sort(),
    );   // v1 keeps the name "Statistics" in English, so that one has no Hindi to map
    for (const [k, e] of stages) expect(e.v1Key, k).toBe(`AP_STAGES_HI.${/^ap2_stage_(\w+)_(name|ask)$/.exec(k)!.slice(1).join(".")}`);
    expect(H.ap2_stage_gap_name).toBe("Research gap और उद्देश्य");
    expect(remap.noV1Hindi).toContain("ap2_stage_stats_name");
    for (const k of ["rs2_tick_some_papers_first", "sh2_highlight_saved", "rs2_openalex_key_saved_on", "ap2_this_file_has_too"]) {
      expect(remap.keys[k]!.v1Key, k).toBe(`TOAST_HI[${JSON.stringify(remap.keys[k]!.en)}]`);
      expect(H[k], k).toBe(remap.keys[k]!.hi);
      expect(H[k], `${k} is Hindi now`).not.toBe(E[k]);
    }
    expect(remap.keys.sh2_intro!.v1Key).toMatch(/^STATIC_HI\["Add PDFs you have the right to read/);
    expect(H.sh2_intro).toBe(remap.keys.sh2_intro!.hi);
    // The Reading shelf heading was found in I18N by the same words before; v1's dialog table has it with the emoji too, so it is now an exact match
    // (the Hindi is the same either way).
    expect(remap.keys.sh2_reading_shelf).toMatchObject({ en: "📚 Reading shelf", v1Key: 'STATIC_HI["📚 Reading shelf"]', kind: KIND.EXACT });
    expect(from("TOAST_HI")).toHaveLength(20);
    expect(from("STATIC_HI").map(([k]) => k).sort()).toEqual(["sh2_intro", "sh2_reading_shelf"]);
  });

  it("counts the remap by kind and by where v1 keeps the Hindi", () => {
    const count = (by: (e: Entry) => string) => Object.values(remap.keys).reduce<Record<string, number>>((c, e) => ({ ...c, [by(e)]: (c[by(e)] ?? 0) + 1 }), {});
    expect(Object.keys(remap.keys)).toHaveLength(159);
    expect(count(e => e.kind)).toEqual({ [KIND.EXACT]: 147, [KIND.NORMALISED]: 7, [KIND.PLACEHOLDERS]: 5 });
    expect(count(e => sourceOf(e.v1Key))).toEqual({ I18N: 114, AP_STAGES_HI: 23, TOAST_HI: 20, STATIC_HI: 2 });
    expect(Object.keys(remap.ambiguous)).toEqual(["ap2_analyse_a_paper"]);
    expect(Object.keys(remap.rejected)).toHaveLength(8);
    expect(remap.noV1Hindi).toHaveLength(190);
    expect(remap.keepEnglish).toHaveLength(11);
  });

  it("puts every English copy of the main dictionary before the remap in exactly one list, and the 369 of the commit before it", () => {
    const lists = [...Object.keys(remap.keys), ...Object.keys(remap.ambiguous), ...Object.keys(remap.rejected), ...remap.keepEnglish, ...remap.noV1Hindi];
    expect(new Set(lists).size).toBe(lists.length);
    expect(lists.length).toBe(369);
    expect(remap.keepEnglish.sort()).toEqual([...KEEP_ENGLISH].sort());
  });

  it("leaves every English copy that is not remapped as it was: Hindi still the English", () => {
    // If this fails after a change to the Hindi of one of these keys, run the remap generator again (apps/web/scripts/v1-hindi-remap.mjs).
    const left = [...Object.keys(remap.ambiguous), ...Object.keys(remap.rejected), ...remap.keepEnglish, ...remap.noV1Hindi];
    expect(left.filter(k => H[k] !== E[k])).toEqual([]);
  });

  it("holds Hindi with the markup and the placeholders of its English, and no Appuscholer", () => {
    const markup = (s: string) => (s.match(/<\/?[a-z][^>]*>|&#?\w+;/gi) ?? []).join("");
    const names = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join();
    for (const [k, e] of Object.entries(remap.keys)) {
      expect(markup(e.hi), `${k} tags`).toBe(markup(e.en));
      expect(names(e.hi), `${k} placeholders`).toBe(names(e.en));
      expect(e.hi, k).not.toMatch(/Appuscholer/);
      expect(e.hi, `${k} edge white space`).toBe(e.hi.trim());
      expect(Object.values(KIND), k).toContain(e.kind);
    }
  });

  it("never remaps the names and formats, which stay as they are in both languages", () => {
    for (const k of KEEP_ENGLISH) {
      expect(k in remap.keys, k).toBe(false);
      expect(H[k], k).toBe(E[k]);
    }
  });

  it("lists as ambiguous only English texts that v1 gives two or more different Hindi values", () => {
    const recorded = Object.fromEntries(Object.entries(remap.ambiguous).map(([k, a]) => [k, a.en]));
    const after = applyLaterSteps(recorded, recorded);   // the English as the dictionaries hold it, after the steps that follow the re-map (none yet)
    for (const [k, a] of Object.entries(remap.ambiguous)) {
      expect(after.en[k], k).toBe(E[k]);
      expect(new Set(a.v1.map(([, h]) => h)).size, k).toBeGreaterThan(1);
    }
  });
});

// With the pinned v1 (V1_INDEX_HTML, as in i18n.test.ts) the dictionaries at the re-map step can be rebuilt, and the generator's input compared with them.
// V1_NEWEST_INDEX_HTML (the v1 of commit 6b70c3e) also makes the last test regenerate the whole remap file.
describe("the remap file against the pinned v1", () => {
  const SET = process.env.V1_INDEX_HTML;
  const V1 = SET ?? "/Users/poojadudani/Documents/Claude cowork/Scholarly/appuscholer/index.html";
  const NEWEST = process.env.V1_NEWEST_INDEX_HTML;
  const skip = !SET && !existsSync(V1);
  const noEmoji = (e: Record<string, string>, h: Record<string, string>) => ({
    en: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, stripEmoji(v)])), hi: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, stripEmoji(v)])),
  });

  it.skipIf(skip)("lists every English copy of the dictionaries at the re-map step, and records the English each remapped key has there", () => {
    const at = dictionariesAtRemap(readFileSync(V1, "utf8"));
    const lists = [...Object.keys(remap.keys), ...Object.keys(remap.ambiguous), ...Object.keys(remap.rejected), ...remap.keepEnglish, ...remap.noV1Hindi];
    expect(Object.keys(at.en).filter(k => at.hi[k] === at.en[k]).sort()).toEqual([...lists].sort());
    for (const [k, e] of Object.entries(remap.keys)) {
      expect(at.en[k], `${k} English`).toBe(e.en);
      expect(at.hi[k], `${k} Hindi before the re-map`).toBe(e.en);
    }
  });

  it.skipIf(skip)("--no-remap writes the dictionaries as they stand at the re-map step and nothing after it", () => {
    const out = mkdtempSync(join(tmpdir(), "remap-step-"));
    execFileSync("node", [join(__dirname, "../scripts/extract-v1-i18n.mjs"), V1, out, "--no-remap"], { stdio: "pipe" });
    const at = dictionariesAtRemap(readFileSync(V1, "utf8"));
    expect(JSON.parse(readFileSync(join(out, "en.json"), "utf8"))).toEqual(at.en);
    expect(JSON.parse(readFileSync(join(out, "hi.json"), "utf8"))).toEqual(at.hi);
  });

  it.skipIf(skip)("with a step after the re-map (an emoji strip in a test-only chain) the re-map still applies, her Hindi is acted on too, and the generator does not see the step", () => {
    const at = dictionariesAtRemap(readFileSync(V1, "utf8"));
    const remapped = applyV1HindiRemap(at.en, at.hi, remap);   // throws if a recorded English is not the one at the re-map step
    const after = applyLaterSteps(remapped.en, remapped.hi, [noEmoji]);
    const keys = Object.keys(remap.keys);
    expect(keys.filter(k => stripEmoji(remap.keys[k]!.en) !== remap.keys[k]!.en).length, "the simulation strips something").toBeGreaterThan(0);
    for (const k of keys) {
      expect(after.hi[k], `${k} Hindi`).toBe(stripEmoji(remap.keys[k]!.hi));
      expect(after.en[k], `${k} English`).toBe(stripEmoji(remap.keys[k]!.en));
    }
    // the generator reads the dictionaries at the re-map step, which the step does not reach: they still hold the English with its emoji
    for (const k of keys) expect(at.en[k], `${k} at the re-map step`).toBe(remap.keys[k]!.en);
  });

  it.skipIf(skip || !NEWEST)("regenerating from the newest v1 gives the committed file byte for byte", () => {
    const raw = readFileSync(NEWEST!);
    const built = buildV1HindiRemap({ ...dictionariesAtRemap(readFileSync(V1, "utf8")), v1: readV1Hindi(raw.toString("utf8")) });
    expect(serializeRemap({ v1: v1Stamp(raw, remap.v1.commit), ...built })).toBe(readFileSync(REMAP_FILE, "utf8"));
  });
});
