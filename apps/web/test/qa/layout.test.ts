import { describe, expect, it, vi } from "vitest";
import { dictionary } from "../../qa/support/dict";
import {
  HINDI_EXCEPTIONS,
  HINDI_NAMES,
  LAYOUT_LABEL,
  LAYOUT_RULES,
  exceptionPatterns,
  planChecks,
  type LayoutFinding,
  type LayoutMeasure,
  type LayoutRule
} from "../../qa/support/layout";
import type { KnownEntry } from "../../qa/support/known";

const zero = (): Record<LayoutRule, number> => ({ "sideways-scroll": 0, "off-edge": 0, "cut-off": 0, overlap: 0, "small-target": 0, "english-in-hindi": 0, axe: 0 });
const measure = (m: Partial<Record<LayoutRule, number>>, findings: LayoutFinding[] = [], unable: LayoutMeasure["unable"] = {}): LayoutMeasure => ({ findings, measured: { ...zero(), ...m }, unable });

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

  it("names the allow-list the brief gives", () => {
    expect(HINDI_NAMES).toEqual(
      expect.arrayContaining(["Appuscholar", "OpenAlex", "PubMed", "Crossref", "CTRI", "ICMR", "APA", "DOI", "PDF", "CSV", "PPT", "AI", "Groq", "OpenAI", "ChatGPT", "Gemini", "Claude", "DeepSeek", "OpenRouter", "Google Scholar", "Wiktionary"])
    );
    expect(HINDI_NAMES).toHaveLength(21);
  });
});

describe("exceptionPatterns", () => {
  it("turns a placeholder into a short stretch and drops one at either end", () => {
    const [p] = exceptionPatterns(["Checking {doisCount} DOIs with OpenAlex… {done} done."]);
    expect(p!.head).toBe("Checking");
    const re = new RegExp(p!.src);
    expect(re.test("Checking 12 DOIs with OpenAlex… 3 done.")).toBe(true);
    expect(re.test("Checking DOIs with OpenAlex… done.")).toBe(true);
    expect(re.test("Checking 12 DOIs without OpenAlex… 3 done.")).toBe(false);
    const [edge] = exceptionPatterns(["{n} sources merged into your library ✓"]);
    expect(edge!.head).toBe("sources merged into your");
    expect(new RegExp(edge!.src).test("5 sources merged into your library ✓")).toBe(true);
  });

  it("reads a sentence as the page shows it: no tags, decoded entities, one space", () => {
    const [p] = exceptionPatterns(["<b>Check the numbers.</b>  Each p-value below &amp; its   degrees."]);
    expect(new RegExp(p!.src).test("Check the numbers. Each p-value below & its degrees.")).toBe(true);
  });

  it("leaves out a sentence with fewer than two English words, and a repeated one", () => {
    expect(exceptionPatterns(["Ask", "Go on", "{n} pages,", "✓"])).toEqual([]);
    expect(exceptionPatterns(["Library exported ✓", "Library exported ✓"])).toHaveLength(1);
  });

  it("escapes what a regular expression would take for syntax", () => {
    const [p] = exceptionPatterns(["Wait (about 2 s) [or more]. Really? Yes."]);
    expect(new RegExp(p!.src).test("Wait (about 2 s) [or more]. Really? Yes.")).toBe(true);
    expect(new RegExp(p!.src).test("Wait about 2 s or more. Really? Yes.")).toBe(false);
  });

  it("finds every sentence of the register in the form the page shows it", () => {
    for (const sentence of HINDI_EXCEPTIONS) {
      const patterns = exceptionPatterns([sentence]);
      if (!patterns.length) continue;
      const shown = sentence
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/\{[A-Za-z0-9_]+\}/g, "12")
        .replace(/\s+/g, " ")
        .trim();
      const p = patterns[0]!;
      expect(shown.includes(p.head), sentence).toBe(true);
      expect(new RegExp(p.src, "g").test(shown), sentence).toBe(true);
    }
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

  it("makes a rule that could not run NOT CHECKED with the reason, whatever it measured", () => {
    const [plan] = planChecks(measure({ axe: 12 }, [], { axe: "axe could not run: boom" }), { name: "home", rules: ["axe"], known });
    expect(plan!.outcome).toEqual({ notChecked: "axe could not run: boom" });
  });
});
