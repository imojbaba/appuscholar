// Task C2: Guide search, counter and print document, against fixture sections (not the real content).
import { describe, expect, it } from "vitest";
import { buildGuidePrintDocument, guideCount, guideStrip, searchGuide } from "@/lib/help/guide/search";
import type { GuideSection } from "@/lib/help/guide/types";

const FIX: GuideSection[] = [
  { id: "consent", group: "Begin", title: "Consent forms", keywords: "consent participant information", html: "<p>Every participant signs a <b>consent</b> form &amp; keeps a copy.</p>" },
  { id: "alpha", group: "Tools", title: "Reading a test", keywords: "alpha significance p value", html: "<p>Alpha is the level you set before you look.</p>" },
  { id: "backup", group: "Help", title: "Backing up", keywords: "backup export zip", html: "<ul><li>Export your work.</li></ul>" },
  { id: "tags", group: "Practice", title: "Tag soup", keywords: "", html: "<p>The word hidden<span>inside</span> is split.</p>" }
];

describe("guideStrip (v1 guideStrip)", () => {
  it("drops tags to spaces, turns &amp; into &, collapses white space and lower-cases", () => {
    expect(guideStrip("<p>One&amp;Two</p>\n<p>  THREE </p>")).toBe(" one&two three ");
  });
});

describe("searchGuide (v1 guideFilter)", () => {
  it("an empty or blank query lists every section, none opened", () => {
    expect(searchGuide("", FIX)).toEqual(FIX.map((s) => ({ id: s.id, open: false })));
    expect(searchGuide("   ", FIX).length).toBe(4);
  });
  it("every query word must appear in the title, keywords or stripped body", () => {
    expect(searchGuide("consent", FIX).map((h) => h.id)).toEqual(["consent"]);
    expect(searchGuide("participant signs", FIX).map((h) => h.id)).toEqual(["consent"]);
    expect(searchGuide("participant alpha", FIX)).toEqual([]);
  });
  it("matches title, keywords and body separately and ignores case", () => {
    expect(searchGuide("TAG SOUP", FIX).map((h) => h.id)).toEqual(["tags"]);
    expect(searchGuide("zip", FIX).map((h) => h.id)).toEqual(["backup"]);
    expect(searchGuide("level", FIX).map((h) => h.id)).toEqual(["alpha"]);
  });
  it("reads the body without its tags and decodes &amp;", () => {
    expect(searchGuide("form & keeps", FIX).map((h) => h.id)).toEqual(["consent"]);
    expect(searchGuide("p>", FIX)).toEqual([]);
  });
  it("does not look inside tags: an address in a link is not searchable text", () => {
    const linked: GuideSection[] = [{ id: "l", group: "Help", title: "Links", keywords: "", html: '<p><a href="https://example.test/hidden-page">the manual</a></p>' }];
    expect(searchGuide("manual", linked).length).toBe(1);
    expect(searchGuide("hidden-page", linked)).toEqual([]);
  });
  it("one to three matches come back open, four or more do not, none is empty", () => {
    expect(searchGuide("a", FIX).length).toBe(4);
    expect(searchGuide("a", FIX).every((h) => !h.open)).toBe(true);
    const three = searchGuide("e", FIX.slice(0, 3)); // three sections, all with an e
    expect(three.length).toBe(3);
    expect(three.every((h) => h.open)).toBe(true);
    expect(searchGuide("consent", FIX)).toEqual([{ id: "consent", open: true }]);
    expect(searchGuide("zzzz", FIX)).toEqual([]);
  });
  it("does not stem: v1's guide filter is a plain substring match, so 'consents' does not find 'consent' (only Appu stems)", () => {
    expect(searchGuide("consents", FIX)).toEqual([]);
    // the other way round does work, as a substring
    expect(searchGuide("consen", FIX).map((h) => h.id)).toEqual(["consent"]);
  });
  it("keeps the sections' own order", () => {
    expect(searchGuide("e", FIX).map((h) => h.id)).toEqual(["consent", "alpha", "backup", "tags"]);
  });
});

describe("guideCount (v1 guideFilter's counter line)", () => {
  it("with no query words it names the total; with words it says how many match", () => {
    expect(guideCount(0, 26, 26)).toEqual({ key: "wc_guide_count_all", vars: { total: 26 } });
    expect(guideCount(2, 3, 26)).toEqual({ key: "wc_guide_count_match", vars: { h: 3, total: 26 } });
    expect(guideCount(1, 0, 26)).toEqual({ key: "wc_guide_count_match", vars: { h: 0, total: 26 } });
  });
});

describe("buildGuidePrintDocument (v1 guidePrint)", () => {
  const doc = buildGuidePrintDocument(FIX, "Appuscholar guide", "Printed from the app. Build abc1234.");
  it("holds every section's title and the build id", () => {
    for (const s of FIX) expect(doc).toContain(s.title);
    expect(doc).toContain("Appuscholar guide");
    expect(doc).toContain("Printed from the app. Build abc1234.");
  });
  it("is a whole document with a charset and a title", () => {
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain("<title>Appuscholar guide</title>");
  });
  it("opens every section whatever the search says, and carries no script", () => {
    expect(doc).not.toMatch(/<script/i);
  });
  it("escapes titles and sanitises bodies: no handler, no script", () => {
    const evil: GuideSection = { id: "x", group: "Help", title: "A <b> & <script>alert(1)</script>", keywords: "", html: '<p>hi</p><img src="x" onerror="alert(1)"><script>alert(2)</script>' };
    const d = buildGuidePrintDocument([evil], "Appuscholar guide", "Printed from the app. Build dev.");
    expect(d).not.toMatch(/onerror/i);
    expect(d).not.toMatch(/<script/i);
    expect(d).toContain("A &lt;b&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
