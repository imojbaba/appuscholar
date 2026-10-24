import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { applyPanelFixes } from "../scripts/i18n-overrides.mjs";
import {
  KEEP_ENGLISH, KIND, applyV1HindiRemap, buildV1HindiRemap, normaliseEnglish, readV1Build, readV1I18N, serializeRemap, v1Stamp,
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
    expect(remap.v1.commit).toBe("f5336be");
    expect(remap.v1.build).toBe("2026.10.24a");
    expect(remap.v1.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is what serializeRemap writes, so it was not edited by hand", () => {
    expect(readFileSync(REMAP_FILE, "utf8")).toBe(serializeRemap(remap));
  });

  it("hi.json carries every remap entry, and en.json holds the English each entry was matched against", () => {
    const keys = Object.keys(remap.keys);
    expect(keys.length).toBeGreaterThan(100);
    for (const k of keys) {
      expect(E[k], `${k} English`).toBe(remap.keys[k]!.en);
      expect(H[k], `${k} Hindi`).toBe(remap.keys[k]!.hi);
      expect(H[k], `${k} is Hindi now`).not.toBe(E[k]);
    }
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
    for (const [k, a] of Object.entries(remap.ambiguous)) {
      expect(a.en, k).toBe(E[k]);
      expect(new Set(a.v1.map(([, h]) => h)).size, k).toBeGreaterThan(1);
    }
  });
});
