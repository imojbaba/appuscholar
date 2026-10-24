import { readFileSync } from "node:fs";
import path from "node:path";
import type { Formatted } from "@appuscholar/core";
import { describe, expect, it, vi } from "vitest";
import * as aiActions from "../../lib/ai/actions";
import * as citeActions from "../../lib/cite/actions";
import * as citeCapture from "../../lib/cite/capture";
import * as citeQuote from "../../lib/cite/quote";
import * as citeShare from "../../lib/cite/share";
import * as analyseAsk from "../../lib/analyse/ask";
import * as shelfUse from "../../lib/shelf/useShelf";
import { dictionary } from "../../qa/support/dict";
import {
  HINDI_EXCEPTIONS,
  HINDI_NAMES,
  LAYOUT_LABEL,
  LAYOUT_RULES,
  exceptionMatcher,
  isExcused,
  movedUnderTheScan,
  planChecks,
  type LayoutFinding,
  type LayoutMeasure,
  type LayoutRule
} from "../../qa/support/layout";
import type { KnownEntry } from "../../qa/support/known";

const zero = (): Record<LayoutRule, number> => ({ "sideways-scroll": 0, "off-edge": 0, "cut-off": 0, overlap: 0, "small-target": 0, "english-in-hindi": 0, axe: 0 });
const measure = (m: Partial<Record<LayoutRule, number>>, findings: LayoutFinding[] = [], unable: LayoutMeasure["unable"] = {}, errors: LayoutMeasure["errors"] = {}): LayoutMeasure => ({
  findings,
  measured: { ...zero(), ...m },
  unable,
  errors
});

describe("HINDI_EXCEPTIONS", () => {
  it("holds the sentences of the three keyed groups (D-S2-1, -2, -3) and the constants of D-S2-18", () => {
    const en = dictionary("en");
    for (const prefix of ["rs2_", "ap2_", "sh2_"]) {
      const keys = Object.keys(en).filter((k) => k.startsWith(prefix));
      expect(keys.length, prefix).toBeGreaterThan(50);
      for (const k of keys) expect(HINDI_EXCEPTIONS, k).toContain(en[k]);
    }
    expect(HINDI_EXCEPTIONS).toContain("Citation inserted ✓");
    expect(HINDI_EXCEPTIONS).toContain("{n} sources merged into your library ✓");
    expect(HINDI_EXCEPTIONS).toContain("Something went wrong. Try again.");
  });

  it("does not hold a sentence the register has no row for", () => {
    const en = dictionary("en");
    const keyed = new Set(Object.keys(en).filter((k) => /^(rs2_|ap2_|sh2_)/.test(k)).map((k) => en[k]));
    // Everything else in the list is a constant of D-S2-18 (the list has no sentence from another dictionary key).
    const constants = HINDI_EXCEPTIONS.filter((s) => !keyed.has(s));
    expect(constants.length).toBeGreaterThan(20);
    expect(constants.length).toBeLessThan(40);
    for (const k of Object.keys(en).filter((k) => !/^(rs2_|ap2_|sh2_)/.test(k))) expect(constants, k).not.toContain(en[k]);
  });

  it("drops a key as soon as it has its own Hindi", async () => {
    vi.resetModules();
    vi.doMock("../../qa/support/dict", () => {
      const en = { rs2_kept: "This one stays in English", rs2_translated: "This one has Hindi now", ap2_missing: "No Hindi key at all", other_key: "Not in the register" };
      const hi = { rs2_kept: "This one stays in English", rs2_translated: "अब इसका हिंदी है" };
      return { dictionary: (lang: "en" | "hi") => (lang === "en" ? en : hi) };
    });
    try {
      const layout = await import("../../qa/support/layout");
      expect(layout.HINDI_EXCEPTIONS).toContain("This one stays in English");
      expect(layout.HINDI_EXCEPTIONS).toContain("No Hindi key at all");
      expect(layout.HINDI_EXCEPTIONS).not.toContain("This one has Hindi now");
      expect(layout.HINDI_EXCEPTIONS).not.toContain("Not in the register");
    } finally {
      vi.doUnmock("../../qa/support/dict");
      vi.resetModules();
    }
  });

  it("names the allow-list the brief gives, and LaTeX (ruling R20)", () => {
    expect(HINDI_NAMES).toEqual(
      expect.arrayContaining(["Appuscholar", "OpenAlex", "PubMed", "Crossref", "CTRI", "ICMR", "APA", "DOI", "PDF", "CSV", "PPT", "AI", "Groq", "OpenAI", "ChatGPT", "Gemini", "Claude", "DeepSeek", "OpenRouter", "Google Scholar", "Wiktionary", "LaTeX"])
    );
    expect(HINDI_NAMES).toHaveLength(22);
  });
});

describe("exceptionMatcher", () => {
  const matcher = (...sentences: string[]) => exceptionMatcher(sentences);

  it("keeps a one-word sentence: the shelf's tabs and matrix header are kept English (ruling R20)", () => {
    const m = matcher(dictionary("en")["sh2_papers"]!, dictionary("en")["sh2_search"]!, dictionary("en")["sh2_paper"]!, dictionary("en")["sh2_sample"]!, dictionary("en")["sh2_method"]!);
    for (const word of ["Papers", "Search", "Paper", "Sample", "Method"]) expect(isExcused(word, m), word).toBe(true);
    expect(isExcused("Delete", m)).toBe(false);
    const all = exceptionMatcher(HINDI_EXCEPTIONS);
    for (const key of ["sh2_papers", "sh2_search", "sh2_paper", "sh2_sample", "sh2_method"]) expect(isExcused(dictionary("en")[key]!, all), key).toBe(true);
  });

  it("excuses a piece only when its whole text is the sentence", () => {
    const m = matcher("Something went wrong. Try again.");
    expect(isExcused("Something went wrong. Try again.", m)).toBe(true);
    expect(isExcused("Error: Something went wrong. Try again.", m)).toBe(false);
    expect(isExcused("Something went wrong. Try again. Later", m)).toBe(false);
    expect(isExcused("Something went wrong", m)).toBe(false);
  });

  it("turns a placeholder into whatever the code put there, at the start, the middle or the end", () => {
    const m = matcher("Checking {doisCount} DOIs with OpenAlex… {done} done.", "{n} sources merged into your library ✓", "Insert {intext}", "Captured \"{title}\" into your citation library ✓");
    expect(isExcused("Checking 12 DOIs with OpenAlex… 3 done.", m)).toBe(true);
    expect(isExcused("Checking 12 DOIs without OpenAlex… 3 done.", m)).toBe(false);
    expect(isExcused("5 sources merged into your library ✓", m)).toBe(true);
    expect(isExcused("Insert (Smith, 2020)", m)).toBe(true);
    expect(isExcused("Insert ¹ (3)", m)).toBe(true);
    expect(isExcused('Captured "Sleep and anxiety" into your citation library ✓', m)).toBe(true);
    expect(isExcused("Insert", m)).toBe(false);
    expect(isExcused("Delete (Smith, 2020)", m)).toBe(false);
  });

  it("reads a sentence as the page shows it, and takes it apart at its tags (the page shows the parts as pieces)", () => {
    const m = matcher("<b>Check the numbers.</b>  Each p-value below &amp; its   degrees.");
    expect(isExcused("Check the numbers. Each p-value below & its degrees.", m)).toBe(true);
    expect(isExcused("Check the numbers.", m)).toBe(true);
    expect(isExcused("Each p-value below & its degrees.", m)).toBe(true);
    expect(isExcused("Each p-value", m)).toBe(false);
  });

  it("leaves out a text with no English in it, and escapes what a regular expression would take for syntax", () => {
    const m = matcher("✓", "×", "{n}", "Wait (about 2 s) [or more]. Really? Yes.");
    expect(m.exact).toEqual(["Wait (about 2 s) [or more]. Really? Yes."]);
    expect(m.patterns).toEqual([]);
    expect(isExcused("Wait (about 2 s) [or more]. Really? Yes.", m)).toBe(true);
    expect(isExcused("Wait about 2 s or more. Really? Yes.", m)).toBe(false);
  });

  it("finds every sentence of the register in the form the page shows it", () => {
    const all = exceptionMatcher(HINDI_EXCEPTIONS);
    for (const sentence of HINDI_EXCEPTIONS) {
      const shown = sentence.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\{[A-Za-z0-9_]+\}/g, "12").replace(/\s+/g, " ").trim();
      if (!/\p{Script=Latin}/u.test(shown.replace(/\d+/g, ""))) continue;
      expect(isExcused(shown, all), sentence).toBe(true);
    }
  });
});

/**
 * D-S2-18 (parity-deviations.md) names the files whose English constants the register keeps. Their exported constants, and what their functions build, must each be covered by
 * the list in layout.ts, and so must any other sentence in their source: a new constant that nobody copied over fails here, not as a flood of findings in a Hindi run.
 */
describe("D-S2-18: the constants of the files the register names", () => {
  const all = exceptionMatcher(HINDI_EXCEPTIONS);
  const piece = (t: string) => t.replace(/\s+/g, " ").trim();
  /** Exported strings that are not visible text: sent to the AI, shown in a browser dialog, a part of an address, a storage key, or a tooltip and an aria-label (REMOVE_TITLE on the library's ✕). */
  const NOT_ON_SCREEN = new Set(["QUOTE_PROMPT", "HELPER_CASE_CONFIRM", "HELPER_CASE_ACK_KEY", "CAPTURE_PREFIX", "REMOVE_TITLE"]);
  const modules: Record<string, Record<string, unknown>> = {
    "lib/cite/actions.ts": citeActions,
    "lib/cite/share.ts": citeShare,
    "lib/cite/quote.ts": citeQuote,
    "lib/cite/capture.ts": citeCapture,
    "lib/shelf/useShelf.ts": shelfUse,
    "lib/analyse/ask.ts": analyseAsk,
    "lib/ai/actions.ts": aiActions
  };

  it("covers every exported string, and every string of an exported record", () => {
    let seen = 0;
    for (const [file, mod] of Object.entries(modules)) {
      for (const [key, value] of Object.entries(mod)) {
        const texts: Array<[string, string]> = [];
        if (typeof value === "string") texts.push([key, value]);
        else if (value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "string")) {
          for (const [k, v] of Object.entries(value)) texts.push([`${key}.${k}`, v as string]);
        }
        for (const [name, text] of texts) {
          if (NOT_ON_SCREEN.has(key) || !/\p{Script=Latin}{3,}/u.test(text)) continue;
          seen++;
          expect(isExcused(piece(text), all), `${file} ${name}: ${JSON.stringify(text).slice(0, 80)}`).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(15);
  });

  it("covers what the exported functions build", () => {
    const cite = (o: Partial<Formatted>) => ({ sup: false, num: 1, intext: "(Smith, 2020)", ...o }) as Formatted;
    const built: Array<[string, string]> = [
      ["importedToast(7)", citeShare.importedToast(7)],
      ["startersToast(12)", citeShare.startersToast(12)],
      ["capturedToast", citeCapture.capturedToast("Attention and memory")],
      ["insertLabel", citeActions.insertLabel(cite({}))],
      ["insertLabel (AMA)", citeActions.insertLabel(cite({ sup: true, num: 3 }))],
      ["aiFailMessage", analyseAsk.aiFailMessage(undefined)]
    ];
    for (const [name, text] of built) expect(isExcused(piece(text), all), `${name}: ${text}`).toBe(true);
  });

  it("covers every sentence in the source of those files (toasts that are not exported, inline)", () => {
    const root = path.join(__dirname, "../..");
    const NOT_SHOWN = [/^use (client|server)$/, /^Translate the following English academic quotation/, /^This text will be sent to your AI provider/, /^<span class="translated-quote"/];
    const kept = HINDI_EXCEPTIONS.map(piece);
    const files = [...Object.keys(modules), "lib/research/oaKey.ts"];
    let seen = 0;
    for (const file of files) {
      const src = readFileSync(path.join(root, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/(^|[^:\w"'`])\/\/.*$/gm, "$1");
      for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
        const literal = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ").replace(/\\n/g, " ");
        if (!/\s/.test(literal.trim()) || (literal.match(/\p{Script=Latin}{3,}/gu) ?? []).length < 2) continue;
        if (NOT_SHOWN.some((re) => re.test(literal))) continue;
        seen++;
        const text = piece(literal);
        expect(kept.some((k) => k.includes(text)), `${file}: ${JSON.stringify(text).slice(0, 90)}`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe("planChecks", () => {
  const label = (rule: LayoutRule) => `home: ${LAYOUT_LABEL[rule]}`;
  const known: KnownEntry[] = [
    { id: "O17", title: "24 px code-row controls", status: "known", match: { rule: "small-target", text: "[code-dot]" } },
    { id: "O9", title: "the toolbar stays English", status: "known", match: { rule: "english-in-hindi", text: "Dictate" } },
    { id: "Q9", title: "back after a fix", status: "fixed", match: { rule: "overlap" } }
  ];

  it("records one check per rule asked for, in the order of the rules", () => {
    const plans = planChecks(measure({ "sideways-scroll": 1, "off-edge": 4, "cut-off": 3, overlap: 2, axe: 9 }), { name: "home", rules: ["axe", "overlap", "sideways-scroll"], known });
    expect(plans.map((p) => p.rule)).toEqual(["sideways-scroll", "overlap", "axe"]);
    expect(plans.map((p) => p.label)).toEqual([label("sideways-scroll"), label("overlap"), label("axe")]);
    for (const p of plans) expect(p.outcome).toEqual({ pass: true });
  });

  it("makes a rule that measured nothing NOT CHECKED, with a reason, never a pass", () => {
    const plans = planChecks(measure({}), { name: "home", rules: [...LAYOUT_RULES], known });
    expect(plans).toHaveLength(7);
    for (const p of plans) {
      expect(p.outcome, p.rule).toHaveProperty("notChecked");
      expect((p.outcome as { notChecked: string }).notChecked.length).toBeGreaterThan(10);
    }
  });

  it("does not call a rule that measured nothing a pass even when it has a finding", () => {
    // A finding with nothing measured cannot happen; the count is what decides.
    const plans = planChecks(measure({}, [{ rule: "off-edge", target: "div", detail: "x" }]), { name: "home", rules: ["off-edge"], known });
    expect(plans[0]!.outcome).toHaveProperty("notChecked");
  });

  it("fails a rule that found something, naming each finding", () => {
    const f: LayoutFinding[] = [
      { rule: "cut-off", target: 'div "A long label"', detail: "holds 250 × 18 px in a 80 × 18 px box" },
      { rule: "cut-off", target: 'p "Another"', detail: "holds 90 × 40 px in a 80 × 20 px box" }
    ];
    const [plan] = planChecks(measure({ "cut-off": 5 }, f), { name: "home", rules: ["cut-off"], known });
    expect(plan!.known).toBeUndefined();
    expect(plan!.outcome).toEqual({ fail: '2 found:\n- div "A long label": holds 250 × 18 px in a 80 × 18 px box\n- p "Another": holds 90 × 40 px in a 80 × 20 px box' });
  });

  it("lists the first eight findings and counts the rest", () => {
    const f: LayoutFinding[] = Array.from({ length: 11 }, (_, i) => ({ rule: "off-edge" as const, target: `div ${i}`, detail: "past" }));
    const [plan] = planChecks(measure({ "off-edge": 20 }, f), { name: "home", rules: ["off-edge"], known });
    const message = (plan!.outcome as { fail: string }).fail;
    expect(message.startsWith("11 found:")).toBe(true);
    expect(message.split("\n")).toHaveLength(1 + 8 + 1);
    expect(message.endsWith("- and 3 more")).toBe(true);
  });

  it("splits the findings of a rule by the known fault each fits, and leaves the rest unexplained", () => {
    const f: LayoutFinding[] = [
      { rule: "small-target", target: 'button [code-dot]', detail: "24 × 44 px" },
      { rule: "small-target", target: 'button "Close" [dialog-close]', detail: "30 × 30 px" },
      { rule: "small-target", target: 'button [code-dot]', detail: "24 × 44 px" }
    ];
    const plans = planChecks(measure({ "small-target": 6 }, f), { name: "codes", rules: ["small-target"], known });
    // The unexplained finding comes first (it is the one that turns CI red), then each known fault.
    expect(plans.map((p) => p.known)).toEqual([undefined, "O17"]);
    expect((plans[0]!.outcome as { fail: string }).fail).toContain("dialog-close");
    expect((plans[0]!.outcome as { fail: string }).fail).not.toContain("code-dot");
    expect((plans[1]!.outcome as { fail: string }).fail).toMatch(/^2 found:/);
    expect(plans.every((p) => p.label === "codes: " + LAYOUT_LABEL["small-target"])).toBe(true);
  });

  it("matches a known fault by the rule and a word of the finding", () => {
    const f: LayoutFinding[] = [{ rule: "english-in-hindi", target: 'button "🖼 Image" [fmt-image]', detail: "Image ⊞ Table 🔍 Find 🎤 Dictate" }];
    const [plan] = planChecks(measure({ "english-in-hindi": 4 }, f), { name: "doc", rules: ["english-in-hindi"], known });
    expect(plan!.known).toBe("O9");
    // The same words under another rule are not O9.
    const other = planChecks(measure({ "cut-off": 4 }, [{ rule: "cut-off", target: "div", detail: "Dictate" }]), { name: "doc", rules: ["cut-off"], known });
    expect(other[0]!.known).toBeUndefined();
  });

  it("names a fixed fault that has come back (its entry is fixed: the case fails it)", () => {
    const [plan] = planChecks(measure({ overlap: 2 }, [{ rule: "overlap", target: "button A over button B", detail: "they cross by 20 × 44 px" }]), { name: "bar", rules: ["overlap"], known });
    expect(plan!.known).toBe("Q9");
  });

  it("makes a rule that could not run because the page moved NOT CHECKED with the reason, whatever it measured", () => {
    const [plan] = planChecks(measure({ axe: 12 }, [], { axe: "axe could not run: Execution context was destroyed (the page navigated during the scan)" }), { name: "home", rules: ["axe"], known });
    expect(plan!.outcome).toEqual({ notChecked: "axe could not run: Execution context was destroyed (the page navigated during the scan)" });
  });

  it("makes a rule that broke an Error finding, not a quiet gap", () => {
    const [plan] = planChecks(measure({}, [], {}, { axe: "axe could not run: boom" }), { name: "home", rules: ["axe"], known });
    expect(plan!.outcome).toEqual({ error: "axe could not run: boom" });
  });

  it("tells a page that moved under the scan from any other failure", () => {
    expect(movedUnderTheScan(new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation"))).toBe(true);
    expect(movedUnderTheScan(new Error("Frame was detached"))).toBe(true);
    expect(movedUnderTheScan(new Error("browserContext.newPage: boom"))).toBe(false);
    expect(movedUnderTheScan("anything else")).toBe(false);
  });
});
