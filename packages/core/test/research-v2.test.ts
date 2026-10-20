import { describe, it, expect } from "vitest";
import { rsAuthorListToCit, rsAuthorsToCit, rsEntryFromResult, rsEntryFromResultV2 } from "../src/research";
import type { RsPaper } from "../src/research";
import { RECORDINGS } from "./fetch/replay";

/**
 * A search result into the library, fixed (walk fault W2, register row D-S2-24): v1's rsEntryFromResult reads the card's line, four names and "et al.", so a paper's
 * reference lost every later author, and it wrote the volume, issue and pages empty. rsEntryFromResultV2 is v1's entry with the author written from `authorList`
 * (every name: a PubMed paper's by capNameToCit, the capture's rule; any other's by rsAuthorsToCit's per-name rule, with initials read at any length, fix round 1)
 * and the paper's volume, issue and pages. v1's rsEntryFromResult and its golden test are unchanged.
 */

/** Every author name in the recorded OpenAlex and PubMed bodies. */
function recordedNames(): string[] {
  const out: string[] = [];
  for (const r of RECORDINGS.values()) {
    if (r.status !== 200) continue;
    if (r.url.includes("api.openalex.org/works?search=")) {
      for (const w of (JSON.parse(r.body) as { results?: Array<{ authorships?: Array<{ author?: { display_name?: string } | null }> }> }).results ?? [])
        for (const a of w.authorships ?? []) if (a.author?.display_name) out.push(a.author.display_name);
    } else if (r.url.includes("/esummary.fcgi?")) {
      const res = (JSON.parse(r.body) as { result?: Record<string, { authors?: Array<{ name?: string }> } | string[]> }).result ?? {};
      for (const [k, v] of Object.entries(res)) if (k !== "uids" && !Array.isArray(v)) for (const a of v.authors ?? []) if (a.name) out.push(a.name);
    }
  }
  return out;
}

describe("rsAuthorListToCit", () => {
  it("each name by rsAuthorsToCit's per-name rule, except that a last word of initials is read at any length (over every name in the recorded corpus)", () => {
    const names = recordedNames().filter((n) => !n.includes(","));
    expect(names.length).toBeGreaterThan(200);
    // Fix round 1: v1's rule reads "Surname Initials" only for two words, so "van der Berg JH" became "JH, van der Berg". Every other name converts as before.
    const initialsLast = (n: string) => { const w = n.trim().split(/\s+/); return w.length >= 3 && /^[A-Z]{1,4}$/.test(w[w.length - 1]!); };
    let changed = 0;
    for (const n of names) {
      if (initialsLast(n)) { changed++; const w = n.trim().split(/\s+/); expect(rsAuthorListToCit([n]), n).toBe(w.slice(0, -1).join(" ") + ", " + w[w.length - 1]); }
      else expect(rsAuthorListToCit([n]), n).toBe(rsAuthorsToCit(n));
    }
    expect(changed).toBeLessThan(names.length / 20);
    expect(rsAuthorListToCit(["Schaefer EM", "Jon Kabat-Zinn", "Plato"])).toBe("Schaefer, EM; Kabat-Zinn, Jon; Plato");
    expect(rsAuthorListToCit([" Lee  K ", ""])).toBe("Lee, K");
    expect(rsAuthorListToCit([])).toBe("");
  });
  it("an OpenAlex-style name list (given names first) still converts as v1's rule converts it", () => {
    const oa = ["Ellen M. Schaefer", "Jon Kabat-Zinn", "Mary Ann Smith", "Richard M. Ryan", "Casson DH", "Plato"];
    expect(rsAuthorListToCit(oa)).toBe(rsAuthorsToCit(oa.join(", ")));
    expect(rsAuthorListToCit(oa)).toBe("Schaefer, Ellen M.; Kabat-Zinn, Jon; Smith, Mary Ann; Ryan, Richard M.; Casson, DH; Plato");
  });
  it("PubMed's surname particles and two-word surnames: Surname, Initials at any length", () => {
    expect(rsAuthorListToCit(["Schaefer EM", "van der Berg JH", "Garcia Lopez M"])).toBe("Schaefer, EM; van der Berg, JH; Garcia Lopez, M");
  });
  it("a name with a comma stays one name (rsAuthorsToCit would split it)", () => {
    expect(rsAuthorListToCit(["Smith, John", "Lee K"])).toBe("Smith, John; Lee, K");
  });
});

describe("rsEntryFromResultV2", () => {
  const six = ["Schaefer EM", "Gonzalez CB", "Lee K", "Park J", "Wu T", "Okafor N"];
  const pm: RsPaper = { source: "PubMed", title: "Sleep timing", authors: six.slice(0, 4).join(", ") + ", et al.", year: "2024", venue: "Scientific reports", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/1/", authorList: six, volume: "9", issue: "1", pages: "13317" };
  it("v1's entry with the author from authorList and the volume, issue and pages from the paper", () => {
    expect(rsEntryFromResultV2(pm, "apa")).toEqual({ ...rsEntryFromResult(pm, "apa"), author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T; Okafor, N", volume: "9", issue: "1", pages: "13317" });
    // v1's entry stops at the fourth author.
    expect(rsEntryFromResult(pm, "apa").author).toBe("Schaefer, EM; Gonzalez, CB; Lee, K; Park, J");
  });
  it("a PubMed paper's names go through capNameToCit, the capture's rule: a collective name is kept whole", () => {
    const names = ["Schaefer EM", "van der Berg JH", "Garcia Lopez M", "COVID-19 Study Group"];
    const p: RsPaper = { ...pm, authors: names.join(", "), authorList: names };
    expect(rsEntryFromResultV2(p, "apa").author).toBe("Schaefer, EM; van der Berg, JH; Garcia Lopez, M; COVID-19 Study Group");
    // An OpenAlex paper keeps the search rule (given names first), where a last word that is not initials is the surname.
    expect(rsEntryFromResultV2({ ...p, source: "OpenAlex", authorList: ["Ellen M. Schaefer", "Jon Kabat-Zinn"] }, "apa").author).toBe("Schaefer, Ellen M.; Kabat-Zinn, Jon");
  });
  it("a paper without authorList (or an empty one) is v1's entry", () => {
    const v1Paper: RsPaper = { source: "OpenAlex", title: "T", authors: "Ann Lee, Bo Park", year: 2020, venue: "J", doi: "10.1/x" };
    expect(rsEntryFromResultV2(v1Paper, "")).toEqual(rsEntryFromResult(v1Paper, ""));
    expect(rsEntryFromResultV2({ ...v1Paper, authorList: [] }, "mla")).toEqual(rsEntryFromResult(v1Paper, "mla"));
    expect(rsEntryFromResultV2({ ...v1Paper, authors: "Unknown authors", authorList: [] }, "apa").author).toBe("");
  });
});
