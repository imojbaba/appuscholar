import { describe, it, expect } from "vitest";
import { pmTopicBlock, rsAuthorListToCit, rsAuthorsToCit, rsBuildQuery, rsBuildQueryV2, rsEntryFromResult, rsEntryFromResultV2 } from "../src/research";
import type { RsPaper } from "../src/research";
import { PUBMED_STOPWORDS } from "../src/data/pubmed-stopwords";
import { pmSearch, pmSearchV2 } from "../src/fetch/pubmed";
import { RECORDINGS, replay } from "./fetch/replay";

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

/**
 * The PubMed query, fixed (walk fault W12, register row D-S2-27): v1 sends the topic untagged, so PubMed's automatic term mapping widened "exam anxiety" into
 * ("test"[All Fields] AND "anxiety"[All Fields]) and the randomised-trial filter matched 4,406 trials (a stroke rehabilitation trial among them); exam[tiab] AND
 * anxiety[tiab] matches 76. rsBuildQueryV2 is rsBuildQuery with the topic's own words tagged [tiab] for PubMed; a typed query, a long topic and every OpenAlex query
 * are v1's. v1's rsBuildQuery, pmSearch and their golden tests are unchanged.
 */
describe("pmTopicBlock", () => {
  it("each content word tagged [tiab], joined with AND; stopwords dropped without regard to case; outer punctuation trimmed; a trailing * kept", () => {
    expect(pmTopicBlock("exam anxiety")).toBe("exam[tiab] AND anxiety[tiab]");
    expect(pmTopicBlock("sleep and exam anxiety in students")).toBe("sleep[tiab] AND exam[tiab] AND anxiety[tiab] AND students[tiab]");
    expect(pmTopicBlock("The Effect of Sleep, on Anxiety?")).toBe("Effect[tiab] AND Sleep[tiab] AND Anxiety[tiab]");
    expect(pmTopicBlock("  student anxi*  ")).toBe("student[tiab] AND anxi*[tiab]");
  });
  it("null for a query the student wrote: a quote, a bracket, a parenthesis, or AND, OR, NOT in capitals", () => {
    for (const q of ['"exam anxiety"', "anxiety[tiab]", "anxiety]", "(exam anxiety)", "exam anxiety)", "exam AND anxiety", "exam OR test", "exam NOT test", "NOT exam"]) expect(pmTopicBlock(q)).toBeNull();
    expect(pmTopicBlock("android notorious orbit")).not.toBeNull(); // AND, OR, NOT only as whole capitalised words
    expect(pmTopicBlock("exam and anxiety")).toBe("exam[tiab] AND anxiety[tiab]"); // lower case is a stopword, not an operator
  });
  it("null with no content word or with more than five", () => {
    expect(pmTopicBlock("the of and")).toBeNull();
    expect(pmTopicBlock("   ")).toBeNull();
    expect(pmTopicBlock("... ???")).toBeNull();
    expect(pmTopicBlock("one two three four five")).not.toBeNull();
    expect(pmTopicBlock("one two three four five six")).toBeNull();
    expect(pmTopicBlock("does a fixed bedtime routine lower exam anxiety")).toBeNull();
  });
  it("the stopword list is PubMed's published list (130 words, lower case, no duplicates)", () => {
    expect(PUBMED_STOPWORDS).toHaveLength(130);
    expect(new Set(PUBMED_STOPWORDS).size).toBe(130);
    for (const w of ["and", "in", "of", "the", "with", "pmid"]) expect(PUBMED_STOPWORDS).toContain(w);
    for (const w of PUBMED_STOPWORDS) expect(w).toBe(w.toLowerCase());
  });
});

describe("rsBuildQueryV2", () => {
  const T = ["test anxiety", "evaluation anxiety"];
  it("the PubMed topic is tagged [tiab] so PubMed does not expand it (W12)", () => {
    expect(rsBuildQueryV2("exam anxiety", "pm", [], "any")).toBe("exam[tiab] AND anxiety[tiab]");
    expect(rsBuildQueryV2("exam anxiety", "pm", T, "any")).toBe('(exam[tiab] AND anxiety[tiab]) OR "test anxiety"[tiab] OR "evaluation anxiety"[tiab]');
    expect(rsBuildQueryV2("exam anxiety", "pm", [], "rct")).toBe('(exam[tiab] AND anxiety[tiab]) AND "Randomized Controlled Trial"[pt]');
    expect(rsBuildQueryV2("exam anxiety", "pm", T, "rct")).toBe('((exam[tiab] AND anxiety[tiab]) OR "test anxiety"[tiab] OR "evaluation anxiety"[tiab]) AND "Randomized Controlled Trial"[pt]');
    expect(rsBuildQueryV2("sleep and exam anxiety in students", "pm", [], "any")).toBe("sleep[tiab] AND exam[tiab] AND anxiety[tiab] AND students[tiab]");
  });
  it("a typed query, a long topic and every OpenAlex query are v1's", () => {
    const long = "does a fixed bedtime routine lower exam anxiety";
    for (const d of ["any", "rct", "sr"]) {
      expect(rsBuildQueryV2('"exam anxiety"[tiab] AND students', "pm", [], d)).toBe(rsBuildQuery('"exam anxiety"[tiab] AND students', "pm", [], d));
      expect(rsBuildQueryV2(long, "pm", T, d)).toBe(rsBuildQuery(long, "pm", T, d));
      expect(rsBuildQueryV2("exam anxiety", "oa", T, d)).toBe(rsBuildQuery("exam anxiety", "oa", T, d));
      expect(rsBuildQueryV2("exam anxiety", "oa", [], d)).toBe(rsBuildQuery("exam anxiety", "oa", [], d));
    }
  });
  it("builds exactly the term of each v2 recording (so the replay below is the live search)", () => {
    const urls = [...RECORDINGS.keys()].filter((u) => u.includes("esearch.fcgi") && u.includes("exam%5Btiab%5D"));
    expect(urls).toHaveLength(2);
    const want = urls.map((u) => decodeURIComponent(u.split("term=")[1]!));
    expect(want).toContain(rsBuildQueryV2("exam anxiety", "pm", [], "rct"));
    expect(want).toContain(rsBuildQueryV2("exam anxiety", "pm", T, "any"));
  });
});

describe("pmSearchV2", () => {
  it("the walk's search (exam anxiety, randomised trial) returns only papers about exam or test anxiety", async () => {
    const r = replay();
    const out = await pmSearchV2(r.f, { q: "exam anxiety", design: "rct" });
    expect(r.unknown).toEqual([]);
    expect(out.error).toBeUndefined();
    expect(out.papers.length).toBeGreaterThan(0);
    for (const p of out.papers) expect(p.title + " " + p.abstract).toMatch(/anxi/i);
    expect(r.requested.filter((u) => u.includes("esearch")).map((u) => decodeURIComponent(u.split("term=")[1]!))).toEqual(['(exam[tiab] AND anxiety[tiab]) AND "Randomized Controlled Trial"[pt]']);
  });
  it("with the ticked terms it asks the recorded tagged search", async () => {
    const r = replay();
    const out = await pmSearchV2(r.f, { q: "exam anxiety", terms: ["test anxiety", "evaluation anxiety"], design: "any" });
    expect(r.unknown).toEqual([]);
    expect(out.papers).toHaveLength(6);
  });
  it("a tagged search that finds nothing falls back to v1's query once", async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => {
      const url = String(u);
      urls.push(url);
      const term = decodeURIComponent(url.split("term=")[1] ?? "");
      if (url.includes("esearch")) return new Response(JSON.stringify({ esearchresult: { idlist: term.includes("[tiab]") ? [] : ["11", "22"] } }));
      if (url.includes("esummary")) return new Response(JSON.stringify({ result: { uids: ["11", "22"], "11": { title: "A" }, "22": { title: "B" } } }));
      return new Response("<PubmedArticleSet/>");
    }) as typeof fetch;
    const out = await pmSearchV2(f, { q: "exam anxiety", design: "any" });
    expect(out.papers.map((p) => p.title)).toEqual(["A", "B"]);
    const searches = urls.filter((u) => u.includes("esearch")).map((u) => decodeURIComponent(u.split("term=")[1]!));
    expect(searches).toEqual(["exam[tiab] AND anxiety[tiab]", "exam anxiety"]);
  });
  it("no fallback after an error, or for a typed query (it was already v1's); a fallback that finds nothing ends the search", async () => {
    const seen: string[] = [];
    const down = (async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response("", { status: 500 }); }) as typeof fetch;
    expect(await pmSearchV2(down, { q: "exam anxiety" })).toEqual({ papers: [], error: "HTTP 500" });
    expect(seen).toHaveLength(1);
    const empty = (async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response('{"esearchresult":{"idlist":[]}}'); }) as typeof fetch;
    seen.length = 0;
    expect(await pmSearchV2(empty, { q: '"exam anxiety"' })).toEqual({ papers: [] });
    expect(seen).toHaveLength(1);
    seen.length = 0;
    expect(await pmSearchV2(empty, { q: "exam anxiety" })).toEqual({ papers: [] });
    expect(seen).toHaveLength(2);
  });
  it("a typed query is searched exactly as pmSearch searches it", async () => {
    const a = replay(), b = replay();
    const o = { q: "exam anxiety students AND teens" };
    await pmSearchV2(a.f, o).catch(() => null);
    await pmSearch(b.f, o).catch(() => null);
    expect(a.requested).toEqual(b.requested);
  });
});
