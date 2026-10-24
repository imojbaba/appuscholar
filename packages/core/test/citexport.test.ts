import { describe, it, expect } from "vitest";
import type { CitationEntry } from "../src/citation";
import { citToBibtex, citToRis } from "../src/citexport";

/* RIS and BibTeX for reference managers (Task 38; register D-S2-120). v1 exported its own JSON only, so there is no v1 golden: every expected string below is written by hand from the plan. */

const SCHAEFER: CitationEntry = {
  author: "Schaefer, M; Denke, C; Harke, R; Olk, N; Erkovan, M; Enge, S", year: "2019", type: "Journal article",
  title: "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial",
  source: "Scientific Reports", volume: "9", pages: "13317", doi: "10.1038/s41598-019-49466-6"
};
const BOOK: CitationEntry = { author: "Walker, Matthew", year: "2017", title: "Why we sleep", source: "Scribner", type: "Book" };
const CHAPTER: CitationEntry = {
  author: "Lee, Kim", year: "2015", title: "Sleep in the first year", container: "A handbook of child sleep", source: "Example Press", pages: "45 - 67", type: "Book chapter"
};
const THESIS: CitationEntry = { author: "Rao, Anita", year: "2020", title: "Exam anxiety in first-year students", source: "University of Example", degree: "PhD thesis", type: "Thesis" };
const ANON: CitationEntry = { year: "2011", title: "Omega-3 and mood", source: "Example Journal", volume: "12", issue: "3", pages: "100-110", type: "Journal article" };

const SCHAEFER_RIS =
  "TY  - JOUR\r\nAU  - Schaefer, M\r\nAU  - Denke, C\r\nAU  - Harke, R\r\nAU  - Olk, N\r\nAU  - Erkovan, M\r\nAU  - Enge, S\r\nPY  - 2019\r\n" +
  "TI  - Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial\r\n" +
  "T2  - Scientific Reports\r\nVL  - 9\r\nSP  - 13317\r\nDO  - 10.1038/s41598-019-49466-6\r\nER  - \r\n";
const SCHAEFER_BIB =
  "@article{schaefer2019openlabel,\n" +
  "  author = {Schaefer, M and Denke, C and Harke, R and Olk, N and Erkovan, M and Enge, S},\n" +
  "  title = {Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial},\n" +
  "  journal = {Scientific Reports},\n  year = {2019},\n  volume = {9},\n  pages = {13317},\n  doi = {10.1038/s41598-019-49466-6}\n}\n";

describe("citToRis", () => {
  it("writes Schaefer et al. (2019) exactly: six AU lines, VL, SP, no EP or IS (empty fields left out), CRLF", () => {
    expect(citToRis([SCHAEFER])).toBe(SCHAEFER_RIS);
  });
  it("uses CRLF for every line break and never a bare LF", () => {
    const s = citToRis([SCHAEFER, BOOK]);
    expect(s.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(s.split("\r\n").length).toBeGreaterThan(10);
  });
  it("writes a book as BOOK with the publisher in PB", () => {
    expect(citToRis([BOOK])).toBe("TY  - BOOK\r\nAU  - Walker, Matthew\r\nPY  - 2017\r\nTI  - Why we sleep\r\nPB  - Scribner\r\nER  - \r\n");
  });
  it("writes a chapter as CHAP with the container in T2 and the pages split into SP and EP", () => {
    expect(citToRis([CHAPTER])).toBe(
      "TY  - CHAP\r\nAU  - Lee, Kim\r\nPY  - 2015\r\nTI  - Sleep in the first year\r\nT2  - A handbook of child sleep\r\nPB  - Example Press\r\nSP  - 45\r\nEP  - 67\r\nER  - \r\n"
    );
  });
  it("writes a thesis as THES", () => {
    expect(citToRis([THESIS])).toBe("TY  - THES\r\nAU  - Rao, Anita\r\nPY  - 2020\r\nTI  - Exam anxiety in first-year students\r\nPB  - University of Example\r\nER  - \r\n");
  });
  it("gives a report RPRT, a conference paper CPAPER and anything else (a website) GEN", () => {
    const ty = (type: string) => citToRis([{ title: "T", type }]).split("\r\n")[0];
    expect(ty("Report")).toBe("TY  - RPRT");
    expect(ty("Conference paper")).toBe("TY  - CPAPER");
    expect(ty("Website")).toBe("TY  - GEN");
    expect(ty("")).toBe("TY  - JOUR");
  });
  it("leaves out the AU line for an authorless entry and keeps IS and EP", () => {
    expect(citToRis([ANON])).toBe(
      "TY  - JOUR\r\nPY  - 2011\r\nTI  - Omega-3 and mood\r\nT2  - Example Journal\r\nVL  - 12\r\nIS  - 3\r\nSP  - 100\r\nEP  - 110\r\nER  - \r\n"
    );
  });
  it("splits pages on a hyphen, en dash or em dash and keeps a single page as SP only", () => {
    const sp = (pages: string) => citToRis([{ title: "T", pages }]).split("\r\n").filter((l) => /^(SP|EP)/.test(l));
    expect(sp("10-20")).toEqual(["SP  - 10", "EP  - 20"]);
    expect(sp("10–20")).toEqual(["SP  - 10", "EP  - 20"]);
    expect(sp("e123")).toEqual(["SP  - e123"]);
  });
  it("omits every empty or blank field, writes an organisation as it is, and separates entries with a blank line", () => {
    const s = citToRis([{ author: " ; World Health Organization", title: "  ", year: "", doi: " ", url: "https://example.org/x", type: "Report" }, BOOK]);
    expect(s.startsWith("TY  - RPRT\r\nAU  - World Health Organization\r\nUR  - https://example.org/x\r\nER  - \r\n\r\nTY  - BOOK\r\n")).toBe(true);
  });
  it("is empty for an empty library", () => {
    expect(citToRis([])).toBe("");
  });
});

describe("citToBibtex", () => {
  it("writes Schaefer et al. (2019) exactly, with the key schaefer2019openlabel", () => {
    expect(citToBibtex([SCHAEFER])).toBe(SCHAEFER_BIB);
  });
  it("writes a book as @book with the publisher", () => {
    expect(citToBibtex([BOOK])).toBe("@book{walker2017why,\n  author = {Walker, Matthew},\n  title = {Why we sleep},\n  publisher = {Scribner},\n  year = {2017}\n}\n");
  });
  it("writes a chapter as @incollection with booktitle, publisher and pages joined by --", () => {
    expect(citToBibtex([CHAPTER])).toBe(
      "@incollection{lee2015sleep,\n  author = {Lee, Kim},\n  title = {Sleep in the first year},\n  booktitle = {A handbook of child sleep},\n  publisher = {Example Press},\n  year = {2015},\n  pages = {45--67}\n}\n"
    );
  });
  it("writes a thesis as @phdthesis, a report as @techreport, a conference paper as @inproceedings, a website as @misc", () => {
    expect(citToBibtex([THESIS])).toBe("@phdthesis{rao2020exam,\n  author = {Rao, Anita},\n  title = {Exam anxiety in first-year students},\n  school = {University of Example},\n  year = {2020}\n}\n");
    const head = (type: string) => citToBibtex([{ author: "Lee, K", year: "2001", title: "Alpha", type }]).split("{")[0];
    expect(head("Report")).toBe("@techreport");
    expect(head("Conference paper")).toBe("@inproceedings");
    expect(head("Website")).toBe("@misc");
    expect(head("Journal article")).toBe("@article");
  });
  it("writes a report's institution and number", () => {
    expect(citToBibtex([{ author: "Lee, K", year: "2001", title: "Alpha", type: "Report", source: "Example Institute", number: "7" }])).toBe(
      "@techreport{lee2001alpha,\n  author = {Lee, K},\n  title = {Alpha},\n  institution = {Example Institute},\n  year = {2001},\n  number = {7}\n}\n"
    );
  });
  it("gives an authorless entry the key anon2011omega3 and no author field", () => {
    const s = citToBibtex([ANON]);
    expect(s).toBe(
      "@article{anon2011omega3,\n  title = {Omega-3 and mood},\n  journal = {Example Journal},\n  year = {2011},\n  volume = {12},\n  number = {3},\n  pages = {100--110}\n}\n"
    );
  });
  it("adds a, b, c on a key clash and leaves the first key as it is", () => {
    const e = (title: string): CitationEntry => ({ author: "Lee, K", year: "2001", title });
    const keys = citToBibtex([e("Alpha one"), e("Alpha two"), e("Alpha three"), { ...e("Beta") }]).match(/^@\w+\{[^,\n]+/gm)!.map((x) => x.replace(/^@\w+\{/, ""));
    expect(keys).toEqual(["lee2001alpha", "lee2001alphaa", "lee2001alphab", "lee2001beta"]);
  });
  it("escapes { } % & $ # _ in every value (and a backslash)", () => {
    const s = citToBibtex([{ author: "Lee, K", year: "2001", title: "A_b {c} 50% R&D $5 #1 \\x", source: "J_1", type: "Journal article" }]);
    expect(s).toContain("title = {A\\_b \\{c\\} 50\\% R\\&D \\$5 \\#1 \\textbackslash{}x}");
    expect(s).toContain("journal = {J\\_1}");
    expect(s).toContain("@article{lee2001ab,");
  });
  it("braces an organisation author so it is not split into a first and last name", () => {
    expect(citToBibtex([{ author: "World Health Organization; Lee, K", year: "2020", title: "Report" }])).toContain("author = {{World Health Organization} and Lee, K},");
  });
  it("makes the key lower-case ASCII from a non-ASCII author name and title", () => {
    const s = citToBibtex([{ author: "Müller, Jürgen; Søren, X", year: "2018", title: "Überblick über Schlaf", type: "Journal article" }]);
    expect(s).toContain("@article{muller2018uberblick,");
    expect(s).toContain("author = {Müller, Jürgen and Søren, X},");
    expect(citToBibtex([{ author: "Łukasz, A", year: "2018", title: "Śpiew" }])).toContain("{lukasz2018spiew,");
    const ris = citToRis([{ author: "Müller, Jürgen", title: "x" }]);
    expect(ris).toContain("AU  - Müller, Jürgen\r\n");
  });
  it("falls back to anon when a name has no Latin letters, and to anon alone with no author, year or title", () => {
    expect(citToBibtex([{ author: "शर्मा, राधा", year: "2020", title: "Sleep" }])).toContain("{anon2020sleep,");
    expect(citToBibtex([{ type: "Website" }])).toBe("@misc{anon\n}\n");
  });
  it("writes the pages a-b as a--b, with spaces and any dash", () => {
    expect(citToBibtex([{ title: "T", pages: "10 – 20" }])).toContain("pages = {10--20}");
    expect(citToBibtex([{ title: "T", pages: "7" }])).toContain("pages = {7}");
  });
  it("omits every empty field and separates entries with a blank line", () => {
    const s = citToBibtex([{ author: " ", title: "T", year: "", volume: "  ", doi: "" }, BOOK]);
    expect(s).toBe("@article{anont,\n  title = {T}\n}\n\n@book{walker2017why,\n  author = {Walker, Matthew},\n  title = {Why we sleep},\n  publisher = {Scribner},\n  year = {2017}\n}\n");
  });
  it("is empty for an empty library", () => {
    expect(citToBibtex([])).toBe("");
  });
});
