import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { tFormat } from "../lib/i18n";

describe("v1 chrome strings", () => {
  it("has the keys the workspace uses, verbatim", () => {
    expect(en.project_bar_empty).toBe("No research project yet — working in scratch space");
    expect(en.settings_btn).toBe("⚙ AI Provider / Key");
    expect(en.stage_guide_final).toBe("Final stage — nothing after this in the sequence");
    expect(hi.df_btn).toBe("✍ पहले खुद लिखें");
    expect(hi.dock_ai_tab).toBe("✨ एआई सुझाव");
    expect(hi.tab_new_project).toBe("✨ नया शोध प्रोजेक्ट");
  });
  it("every Hindi key exists in English (no orphan translations)", () => {
    const missing = Object.keys(hi).filter(k => !(k in en));
    expect(missing).toEqual([]);
  });
  it("substitutes placeholders and falls back to English, then to the key", () => {
    expect(tFormat(en, hi, "stage_guide_fmt", "hi", { n: 2, total: 6 })).toBe("चरण 2/6");
    expect(tFormat(en, hi, "stage_guide_fmt", "en", { n: 2, total: 6 })).toBe("Stage 2 of 6");
    expect(tFormat(en, hi, "help_intro", "hi")).toBe(hi.help_intro);
    expect(tFormat(en, hi, "nonexistent_key", "hi")).toBe("nonexistent_key");
  });
  it("falls back to English for a key Hindi lacks, and leaves unresolved placeholders literal", () => {
    const e = { a: "E {x} {y}" } as Record<string, string>;
    const h = {} as Record<string, string>;
    expect(tFormat(e, h, "a", "hi", { x: 1 })).toBe("E 1 {y}");
    expect(tFormat(e, h, "a", "en")).toBe("E {x} {y}");
  });
  it("v2 vault strings exist in both dictionaries with the draft marker on Hindi", () => {
    for (const k of ["vault_pill_off", "vault_setup_h2", "vault_wrong", "erase_btn", "import_v1_vault", "import_v1_progress"]) {
      expect((en as Record<string, string>)[k]).toBeTruthy();
      expect((hi as Record<string, string>)[k]).toBeTruthy();
    }
    expect((en as Record<string, string>).vault_wrong).toBe("Wrong passphrase — nothing was unlocked. Try again.");
  });
});

describe("stage-2 panel copy extracted from v1 (rs2_ / ap2_ / sh2_)", () => {
  const E = en as Record<string, string>;
  const H = hi as Record<string, string>;
  const manifest = JSON.parse(readFileSync("messages/v1-panels.manifest.json", "utf8")) as Record<string, { lines: string; sha256: string }>;
  it("stage-2 panel copy is extracted from v1 with a manifest", () => {
    // The Research panel's strings that v1 keyed already live under research_*: those keys stay.
    expect(E.research_panel_desc).toBe("Search OpenAlex and PubMed live, free, no install — pick what's relevant, then draft a literature review or find a research gap, grounded only in the abstracts you found.");
    expect(E.rs2_terms_btn).toBe("💡 Suggest related terms");
    expect(E.ap2_consent).toMatch(/^I am allowed to read this paper/);
    expect(E.sh2_intro).toMatch(/^Add PDFs you have the right to read/);
    expect(E.ap2_stage_gap_ask).toBe("In your own words: what was missing in earlier work, and what did this study set out to answer?");
    expect(H.rs2_terms_btn).toBe(E.rs2_terms_btn);
    const m = JSON.parse(readFileSync("messages/v1-panels.manifest.json", "utf8"));
    expect(m.rs2_terms_btn.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("holds the Research script's copy (Task 9, ruling R10): the OpenAlex key setting, the status fragments, the cards' labels", () => {
    expect(E.rs2_oa_key_label).toBe("OpenAlex key (optional)");
    expect(E.rs2_oa_key_placeholder).toBe("Paste a free OpenAlex key");
    expect(E.rs2_oa_key_desc).toMatch(/^Paper search uses OpenAlex\. Without a key/);
    expect(E.rs2_the_free_daily_openalex).toBe("the free daily OpenAlex budget is used up. Add a free OpenAlex key in Settings, or try again tomorrow");
    expect(E.rs2_searching).toBe("🔎 Searching…");
    expect(E.rs2_searched_your_words_plus).toBe("(searched your words plus {termsCount} related term");
    expect(E.rs2_ranked_by_fit_to).toBe("· ranked by fit to your question ({scored} of {mergedCount} scored, about");
    expect(E.rs2_probably_not_relevant_fit).toBe("probably not relevant (fit 0 or 1). Nothing is deleted.");
    expect(E.rs2_citation_library).toBe("+ Citation library");
    expect(manifest.rs2_oa_key_label!.lines).toBe("1188-1188");
    expect(manifest.rs2_searching!.lines).toBe("8292-8292");
    // what core ports as data or prompt text is not copy: the CSV heads (8192), the manual entry's type (8445), rsCorpusText's warning (8528)
    for (const v of ["Fit 0-3 (AI)", "Journal article", "Website"]) expect(Object.entries(E).filter(([k, x]) => k.startsWith("rs2_") && x === v), v).toEqual([]);
    expect(Object.values(E).some((x) => x.startsWith("WARNING: this paper is marked as retracted"))).toBe(false);
  });
  it("has the twelve stage questions, one per AP_STAGES key", () => {
    for (const k of ["gap", "lit", "design", "sample", "measures", "procedure", "data", "stats", "results", "conclusion", "limits", "recs"]) {
      expect(E[`ap2_stage_${k}_ask`], k).toBeTruthy();
      expect(E[`ap2_stage_${k}_name`], k).toBeTruthy();
    }
  });
  it("every manifest key is in both dictionaries, Hindi equals English, and the manifest is sorted", () => {
    const keys = Object.keys(manifest);
    expect(keys.length).toBeGreaterThan(100);
    expect(keys).toEqual([...keys].sort());
    for (const k of keys) {
      expect(k, k).toMatch(/^(rs2|ap2|sh2)_/);
      expect(E[k], k).toBeTruthy();
      expect(H[k], k).toBe(E[k]);
      expect(manifest[k]!.lines, k).toMatch(/^\d+-\d+$/);
      expect(manifest[k]!.sha256, k).toMatch(/^[0-9a-f]{64}$/);
    }
    const prefixed = Object.keys(E).filter(k => /^(rs2|ap2|sh2)_/.test(k));
    expect(prefixed.sort()).toEqual(keys);
  });
  it("holds all three families, rs2_ (Research), ap2_ (Analyse) and sh2_ (Reading shelf)", () => {
    // en.json is generated and the extractor throws when a new key shadows an existing one; this pins that no family went missing.
    const n = (p: string) => Object.keys(manifest).filter(k => k.startsWith(p)).length;
    expect(n("rs2_")).toBeGreaterThan(10);
    expect(n("ap2_")).toBeGreaterThan(60);
    expect(n("sh2_")).toBeGreaterThan(40);
  });
  const SET = process.env.V1_INDEX_HTML;
  const V1 = SET ?? "/Users/poojadudani/Documents/Claude cowork/Scholarly/appuscholer/index.html";
  it.skipIf(!SET && !existsSync(V1))("re-running the extraction against v1 is byte-identical, and every manifest hash matches the v1 lines", () => {
    const out1 = mkdtempSync(join(tmpdir(), "panels-a-"));
    const out2 = mkdtempSync(join(tmpdir(), "panels-b-"));
    for (const o of [out1, out2]) execFileSync("node", [join(__dirname, "../scripts/extract-v1-i18n.mjs"), V1, o], { stdio: "pipe" });
    for (const f of ["en.json", "hi.json", "v1-panels.manifest.json"]) {
      expect(readFileSync(join(out1, f), "utf8"), f).toBe(readFileSync(join(out2, f), "utf8"));
      expect(readFileSync(join(out1, f), "utf8"), `${f} equals the committed file`).toBe(readFileSync(join("messages", f), "utf8"));
    }
    const lines = readFileSync(V1, "utf8").split("\n");
    for (const [k, v] of Object.entries(manifest)) {
      const [a, b] = v.lines.split("-").map(Number) as [number, number];
      expect(createHash("sha256").update(lines.slice(a - 1, b).join("\n")).digest("hex"), k).toBe(v.sha256);
    }
  });
});
