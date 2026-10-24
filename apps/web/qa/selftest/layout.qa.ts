import type { Page } from "@playwright/test";
import { T } from "../support/dict";
import { HINDI_EXCEPTIONS, LAYOUT_RULES, measureLayout, type LayoutRule } from "../support/layout";
import type { CaseMeta, CheckResult, Qa } from "../support/qa";
import { expect, test } from "../support/test";

/**
 * The layout, accessibility and Hindi rules (support/layout.ts) on throwaway pages (`page.setContent`): no app is needed. Each rule is shown to find what it is for, to leave alone
 * what it must (a table that scrolls sideways, an ellipsis, a name on the allow-list, the editor), and to say NOT CHECKED when it measured nothing. The last cases run through
 * `qa.checkpoint`, which turns each rule into one visual check.
 */
const TAGS = { tag: ["@selftest", "@slice"] };
const PHONE = { tag: ["@selftest", "@slice", "@phone"] };
const PHONE_SIZE = { width: 375, height: 812 };
const meta = (id: string, steps: string[], lang?: "en" | "hi"): CaseMeta => ({ story: "S0", id, goal: "Check the layout rules", situation: lang ? { lang } : {}, steps });

/** A whole document, as the app serves one: a language, a title and the viewport tag the app's pages carry. */
function doc(body: string, o: { lang?: string; css?: string } = {}): string {
  return `<!doctype html><html lang="${o.lang ?? "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Layout rules</title>` +
    `<style>body{margin:0;font:16px/1.4 sans-serif}${o.css ?? ""}</style></head><body><main>${body}</main></body></html>`;
}
/** The measuring cases need no step or check, but every test of this fixture begins its case. */
const measuring = (qa: Qa, id: string) => {
  qa.selfTest = true;
  qa.begin(meta(id, []));
};
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

async function measure(page: Page, body: string, o: { phone?: boolean; lang?: "en" | "hi"; exempt?: string[]; css?: string } = {}) {
  await page.setContent(doc(body, { lang: o.lang ?? "en", css: o.css }));
  return measureLayout(page, { phone: o.phone ?? false, lang: o.lang ?? "en", exempt: o.exempt });
}
const rulesOf = (r: Awaited<ReturnType<typeof measureLayout>>, rule: LayoutRule) => r.findings.filter((f) => f.rule === rule);
const labelled = (checks: CheckResult[], rule: string): CheckResult => {
  const c = checks.find((x) => x.kind === "visual" && x.label.endsWith(rule));
  if (!c) throw new Error(`no visual check ending "${rule}" in: ${checks.map((x) => x.label).join(" | ")}`);
  return c;
};

test("layout: a 600 px block at phone width is a sideways scroll and past the edge", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M01");
  await page.setViewportSize(PHONE_SIZE);
  const r = await measure(page, `<div style="width:600px;height:40px;background:#ddd">A wide block</div>`, { phone: true });
  expect(rulesOf(r, "sideways-scroll")).toHaveLength(1);
  expect(rulesOf(r, "sideways-scroll")[0]!.detail).toContain("600");
  const off = rulesOf(r, "off-edge");
  expect(off).toHaveLength(1);
  expect(off[0]!.target).toContain("A wide block");
  expect(r.measured["sideways-scroll"]).toBe(1);
  expect(r.measured["off-edge"]).toBeGreaterThan(0);
});

test("layout: a page that fits has no sideways scroll and nothing past the edge", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M02");
  await page.setViewportSize(PHONE_SIZE);
  const r = await measure(page, `<h1>Home</h1><p>A short paragraph that wraps inside the window and goes no further than the window allows, however long it runs.</p>`, { phone: true });
  expect(rulesOf(r, "sideways-scroll")).toHaveLength(0);
  expect(rulesOf(r, "off-edge")).toHaveLength(0);
  expect(r.measured["sideways-scroll"]).toBe(1);
  expect(r.measured["off-edge"]).toBeGreaterThan(0);
});

test("layout: a box that starts before the left edge is past it, one hidden wholly off screen is not", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M13");
  await page.setViewportSize(PHONE_SIZE);
  const half = await measure(page, `<div style="margin-left:-20px;width:200px;height:30px;background:#ddd">Half in</div>`, { phone: true });
  expect(rulesOf(half, "off-edge").map((f) => f.target)).toEqual(['div "Half in"']);
  expect(rulesOf(half, "sideways-scroll")).toEqual([]);
  const hidden = await measure(page, `<a href="#main" style="position:absolute;left:-9999px">Skip to content</a><p>Content</p>`, { phone: true });
  expect(rulesOf(hidden, "off-edge")).toEqual([]);
});

test("layout: a table that scrolls sideways inside its box is no finding", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M03");
  await page.setViewportSize(PHONE_SIZE);
  const cells = Array.from({ length: 8 }, (_, i) => `<td style="width:120px">Cell ${i + 1}</td>`).join("");
  const r = await measure(page, `<div style="overflow-x:auto;width:340px"><table style="width:960px"><tr>${cells}</tr></table></div>`, { phone: true });
  expect(r.findings.filter((f) => f.rule === "sideways-scroll" || f.rule === "off-edge" || f.rule === "cut-off")).toEqual([]);
  expect(r.measured["off-edge"]).toBeGreaterThan(0);
});

test("layout: a control under 44 px on a phone is a small target, and only on a phone", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M04");
  await page.setViewportSize(PHONE_SIZE);
  const body =
    `<button style="width:30px;height:30px;display:block;margin:8px">x</button>` +
    `<button style="width:44px;height:44px;display:block;margin:8px">OK</button>` +
    `<p>Read <a href="#rules">the rules</a> first.</p>` +
    `<label style="display:block;height:48px;line-height:48px"><input type="checkbox"> Agree</label>`;
  const phone = await measure(page, body, { phone: true });
  const small = rulesOf(phone, "small-target");
  expect(small).toHaveLength(1);
  expect(small[0]!.detail).toContain("30");
  // The 44 px button and the checkbox (its label is the target) are measured, and are fine. The link inside a sentence is not measured at all (WCAG 2.5.8; ruling R19).
  expect(phone.measured["small-target"]).toBe(3);
  const desktop = await measure(page, body, { phone: false });
  expect(desktop.findings.filter((f) => f.rule === "small-target")).toEqual([]);
  expect(desktop.measured["small-target"]).toBe(0);
});

test("layout: text clipped in its box is cut off, an ellipsis, a box that fits and a box that scrolls are not", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M05");
  const clip = "width:80px;height:24px;overflow:hidden;white-space:nowrap;";
  const r = await measure(
    page,
    `<div style="${clip}">A very long label that does not fit</div>` +
      `<div style="${clip}text-overflow:ellipsis">Another long label shown with an ellipsis</div>` +
      `<div style="${clip}">Short</div>` +
      `<div style="width:80px;height:24px;overflow:hidden">one<br>two<br>three<br>four</div>` +
      `<div style="width:80px;height:24px;overflow:auto">five<br>six<br>seven<br>eight</div>`
  );
  const cut = rulesOf(r, "cut-off");
  expect(cut).toHaveLength(2);
  expect(cut.map((f) => f.target).join("\n")).toContain("A very long label");
  expect(cut.map((f) => f.target).join("\n")).toContain("four");
  expect(cut.map((f) => f.target).join("\n")).not.toContain("ellipsis");
  expect(r.measured["cut-off"]).toBeGreaterThanOrEqual(4);
});

test("layout: two controls on top of each other overlap, side by side they do not", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M06");
  const abs = (left: number, label: string, extra = "") => `<button style="position:absolute;top:10px;left:${left}px;width:100px;height:44px;${extra}">${label}</button>`;
  const crossed = await measure(page, abs(10, "One") + abs(90, "Two"));
  const found = rulesOf(crossed, "overlap");
  expect(found).toHaveLength(1);
  expect(found[0]!.target).toContain("One");
  expect(found[0]!.target).toContain("Two");
  const apart = await measure(page, abs(10, "One") + abs(120, "Two") + abs(96, "Three", "top:80px"));
  expect(rulesOf(apart, "overlap")).toEqual([]);
  expect(apart.measured["overlap"]).toBeGreaterThanOrEqual(3);
  // A sliver (4 px) is not on top; a disabled control and a hidden one are not controls to press.
  const sliver = await measure(page, abs(10, "One") + abs(106, "Two"));
  expect(rulesOf(sliver, "overlap")).toEqual([]);
  const unpressable = await measure(page, abs(10, "One") + abs(90, "Two", "display:none") + abs(60, "Three", "top:10px").replace("<button", "<button disabled"));
  expect(rulesOf(unpressable, "overlap")).toEqual([]);
  // A plain box over a control's centre (a group's padding) does not take the control out of the page: the two buttons still collide.
  const padded = await measure(page, `${abs(10, "One")}${abs(90, "Two")}<div style="position:absolute;left:0;top:0;width:70px;height:60px"></div>`);
  expect(rulesOf(padded, "overlap")).toHaveLength(1);
  // A header fixed across the window does cover what is scrolled under it.
  const header = `<div style="position:fixed;left:0;right:0;top:0;height:80px;background:#fff">${abs(90, "Menu", "top:20px")}</div>`;
  const underHeader = await measure(page, `${abs(10, "Under", "top:30px")}${header}`);
  expect(rulesOf(underHeader, "overlap")).toEqual([]);
  // A control inside another is nesting, not a collision.
  const nested = await measure(page, `<a href="#x" style="display:block;width:200px;height:60px"><button style="width:80px;height:40px">Inner</button></a>`);
  expect(rulesOf(nested, "overlap")).toEqual([]);
});

test("layout: controls behind a modal dialog are not collided with", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M14");
  const button = (left: number, text: string) => `<button style="position:absolute;top:10px;left:${left}px;width:100px;height:44px">${text}</button>`;
  // The page behind a dialog that hides it from assistive technology (what the app's dialogs do) ...
  const hiddenBehind = await measure(page, `<div aria-hidden="true">${button(10, "Behind")}</div><div role="dialog" aria-modal="true">${button(90, "In front")}</div>`);
  expect(rulesOf(hiddenBehind, "overlap")).toEqual([]);
  // ... and one that only covers it with a backdrop.
  const covered = await measure(page, `${button(10, "Behind")}<div style="position:fixed;inset:0;background:rgba(0,0,0,.4)"></div>${button(90, "In front")}`);
  expect(rulesOf(covered, "overlap")).toEqual([]);
  // Two controls both in front do cross.
  const both = await measure(page, `${button(10, "One")}${button(90, "Two")}`);
  expect(rulesOf(both, "overlap")).toHaveLength(1);
});

test("layout: a control still growing into place is measured where it stops", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M15");
  await page.setViewportSize(PHONE_SIZE);
  const css = "@keyframes grow{from{transform:scale(.5)}to{transform:scale(1)}}";
  const r = await measure(page, `<button style="display:block;width:44px;height:44px;animation:grow 400ms ease-out forwards">OK</button>`, { phone: true, css });
  expect(rulesOf(r, "small-target")).toEqual([]);
  expect(r.measured["small-target"]).toBe(1);
});

test("layout: a single control has no neighbour to overlap, so the rule measured nothing", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M07");
  const r = await measure(page, `<button>Alone</button>`);
  expect(r.measured["overlap"]).toBe(0);
  expect(r.measured["small-target"]).toBe(0);
});

test("layout: English in Hindi is found in a button, a placeholder, a select and across a toolbar", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M08");
  const english = await measure(page, `<button>Save your work</button>`, { lang: "hi" });
  const found = rulesOf(english, "english-in-hindi");
  expect(found).toHaveLength(1);
  expect(found[0]!.detail).toContain("Save your work");
  expect(found[0]!.target).toContain("button");

  // English words written into a Hindi sentence, and an English placeholder.
  const mixed = await measure(page, `<p>यह Save your work है</p><input placeholder="Type your topic first"><p>सहेजें</p><select><option>Paragraph style</option></select>`, { lang: "hi" });
  expect(rulesOf(mixed, "english-in-hindi").map((f) => f.detail)).toEqual(["Save your work", "Type your topic first", "Paragraph style"]);

  // O9's shape: a toolbar whose buttons each hold one English word.
  const toolbar = await measure(page, `<div role="toolbar"><button>🖼 Image</button><button>⊞ Table</button><button>🔍 Find</button></div>`, { lang: "hi" });
  expect(rulesOf(toolbar, "english-in-hindi")).toHaveLength(1);
  expect(rulesOf(toolbar, "english-in-hindi")[0]!.detail).toContain("Image");
  expect(rulesOf(toolbar, "english-in-hindi")[0]!.detail).toContain("Find");
});

test("layout: a name on the allow-list, Hindi, numbers, the editor, form fields and exempt boxes are not English left on screen", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M09");
  const quiet = await measure(
    page,
    `<button>OpenAlex</button><p>OpenAlex, Crossref and PubMed</p><p>अपना काम सहेजें</p><p>Step 2 of 5</p><p>Google Scholar</p><p>2 DOIs, 3 PDF</p>` +
      `<div class="ProseMirror" contenteditable="true">The student wrote this sentence in English</div>` +
      `<input value="Some typed words here"><textarea>More typed words here</textarea>` +
      `<div data-testid="library-list">Attention is all you need</div>`,
    { lang: "hi", exempt: ["library-list"] }
  );
  expect(rulesOf(quiet, "english-in-hindi")).toEqual([]);
  expect(quiet.measured["english-in-hindi"]).toBeGreaterThan(0);

  // A name is ignored, not a licence for the words around it: "Powered" and "and" are English (ruling R20).
  const around = await measure(page, `<p>Powered by OpenAlex and Crossref</p>`, { lang: "hi" });
  expect(rulesOf(around, "english-in-hindi").map((f) => f.detail)).toEqual(["Powered by OpenAlex and"]);

  // The download buttons name their formats in brackets: Word and LaTeX are not a run of English (LaTeX is on the list; "Word" is one word).
  const formats = await measure(page, `<button>⬇ डाउनलोड (Word)</button><button>⬇ LaTeX फ़ाइल</button>`, { lang: "hi" });
  expect(rulesOf(formats, "english-in-hindi")).toEqual([]);

  // The same box without the exemption is English on the screen.
  const loud = await measure(page, `<div data-testid="library-list">Attention is all you need</div>`, { lang: "hi" });
  expect(rulesOf(loud, "english-in-hindi")).toHaveLength(1);

  // The project's name and question are the student's, in the header of every screen: never read, without being exempted.
  const mine = await measure(page, `<header><span data-testid="project-switcher">Sleep and exam anxiety</span></header><p data-testid="home-q-text">Does a fixed bedtime routine lower anxiety?</p><p>अपना काम सहेजें</p>`, { lang: "hi" });
  expect(rulesOf(mine, "english-in-hindi")).toEqual([]);
  expect(mine.measured["english-in-hindi"]).toBe(1);
});

test("layout: a short word joins a run of English without counting, so a label of small words is English", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M16");
  const labels = await measure(page, `<button>Add to library</button><p>नमस्ते</p><button>Back to project</button><p>नमस्ते</p><p>Sign in to continue</p>`, { lang: "hi" });
  expect(rulesOf(labels, "english-in-hindi").map((f) => f.detail)).toEqual(["Add to library", "Back to project", "Sign in to continue"]);
  // Two words of three letters are the least a run needs; "Sign in", "Go to" and "OK" hold one, or none.
  const small = await measure(page, `<button>Sign in</button><p>नमस्ते</p><button>Go to</button><p>नमस्ते</p><button>OK</button><p>नमस्ते</p><p>Step 2 of 5</p><p>n = 12, p &lt; 0.05</p>`, { lang: "hi" });
  expect(rulesOf(small, "english-in-hindi")).toEqual([]);
});

test("layout: an icon beside a word does not split a row of buttons, and a drawing's own text is not read", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M19");
  // O9's shape with icons: <svg> + one English word a button, side by side. The svg is not read and is no break, so the words are one run (as with an emoji for the icon).
  const icon = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2z"/></svg>`;
  const toolbar = await measure(page, `<div role="toolbar"><button>${icon}Edit</button><button>${icon}Share</button></div>`, { lang: "hi" });
  expect(rulesOf(toolbar, "english-in-hindi").map((f) => f.detail)).toEqual(["Edit Share"]);
  // The text inside a drawing (a chart's axis) is the chart's, not read, and it does not join or split what stands around it.
  const chart = await measure(page, `<p>नमस्ते</p><svg width="200" height="60"><text x="4" y="30">Revenue by month</text></svg><p>नमस्ते</p>`, { lang: "hi" });
  expect(rulesOf(chart, "english-in-hindi")).toEqual([]);
  expect(chart.measured["english-in-hindi"]).toBe(2);
  const around = await measure(page, `<button>Edit</button><svg width="200" height="60"><text x="4" y="30">Revenue by month</text></svg><button>Share</button>`, { lang: "hi" });
  expect(rulesOf(around, "english-in-hindi").map((f) => f.detail)).toEqual(["Edit Share"]);
  // A box that is not read (the student's own words) still ends the run: that is a break, an svg is not.
  const boxed = await measure(page, `<button>Edit</button><div data-testid="library-list">Attention is all you need</div><button>Share</button>`, { lang: "hi", exempt: ["library-list"] });
  expect(rulesOf(boxed, "english-in-hindi")).toEqual([]);
});

test("layout: the register excuses a piece that is, whole, one of its sentences, and nothing else", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M17");
  // The shelf's tabs and the matrix header: kept English, one word a piece, side by side (Papers + Search form a run unless each piece is excused).
  expect(T("sh2_papers")).toBe("Papers");
  expect(HINDI_EXCEPTIONS).toEqual(expect.arrayContaining(["Papers", "Search", "Paper", "Sample", "Method", "Key finding"]));
  const shelf = await measure(
    page,
    `<div role="tablist"><button role="tab">${T("sh2_papers")}</button><button role="tab">${T("sh2_search")}</button><button role="tab">${T("sh2_find_passages_for_a")}</button><button role="tab">${T("sh2_matrix")}</button></div>` +
      `<table><thead><tr><th>${T("sh2_paper")}</th><th>${T("sh2_sample")}</th><th>${T("sh2_method")}</th><th>${T("sh2_key_finding")}</th></tr></thead></table>` +
      `<button>Insert (Smith, 2020)</button><button>Insert ¹ (3)</button><div role="status">Something went wrong. Try again.</div>`,
    { lang: "hi" }
  );
  expect(rulesOf(shelf, "english-in-hindi")).toEqual([]);
  // The same words inside a longer text, or beside a word that is not the register's, are English on the screen.
  const elsewhere = await measure(page, `<div role="status">Error: Something went wrong. Try again.</div><p>नमस्ते</p><button>Papers</button><button>Remove</button><button>Archive</button>`, { lang: "hi" });
  expect(rulesOf(elsewhere, "english-in-hindi").map((f) => f.detail)).toEqual(["Error: Something went wrong. Try again.", "Remove Archive"]);
});

test("layout: an exempt box is read when the app is speaking in it, and a part of the page in another language is not read", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M18");
  // The sentences the app shows where the student's text is missing (QuestionCard, the switcher, the vault's titles), in either language.
  const english = await measure(page, `<header><span data-testid="project-switcher">All projects</span></header><p>नमस्ते</p><p data-testid="home-q-text">No question yet.</p><p>नमस्ते</p>`, { lang: "hi" });
  expect(rulesOf(english, "english-in-hindi").map((f) => f.detail)).toEqual(["All projects", "No question yet."]);
  const hindi = await measure(page, `<header><span data-testid="project-switcher">${T("switcher_all", {}, "hi")}</span></header><p data-testid="home-q-text">${T("place_question_none", {}, "hi")}</p>`, { lang: "hi" });
  expect(rulesOf(hindi, "english-in-hindi")).toEqual([]);
  expect(hindi.measured["english-in-hindi"]).toBe(2);
  // Whatever else is in the box is the student's, as before.
  const theirs = await measure(page, `<header><span data-testid="project-switcher">All projects of mine, and a long one</span></header><p>नमस्ते</p>`, { lang: "hi" });
  expect(rulesOf(theirs, "english-in-hindi")).toEqual([]);
  // The language switch names the other language in itself (lang="en" on the item); a part in Hindi is still read.
  const switchItem = await measure(page, `<button lang="en">Switch to English</button><p>नमस्ते</p><button lang="hi-IN">Save your work</button>`, { lang: "hi" });
  expect(rulesOf(switchItem, "english-in-hindi").map((f) => f.detail)).toEqual(["Save your work"]);
});

test("layout: the register's kept English is not a finding, and the same page's other English is", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M10");
  const research = T("rs2_already_in_your_library");
  const analyse = T("ap2_checking_dois_with_openalex", { doisCount: 12, done: 3 });
  const toast = "Citation inserted ✓";
  expect(research.split(/\s+/).length).toBeGreaterThan(2);
  expect(HINDI_EXCEPTIONS).toContain(research);
  const body = `<p>${research}</p><p><b>${analyse}</b></p><div role="status">${toast}</div>`;
  const kept = await measure(page, body, { lang: "hi" });
  expect(rulesOf(kept, "english-in-hindi")).toEqual([]);
  expect(kept.measured["english-in-hindi"]).toBeGreaterThan(0);
  const more = await measure(page, body + `<button>Save your work</button>`, { lang: "hi" });
  expect(rulesOf(more, "english-in-hindi").map((f) => f.detail)).toEqual(["Save your work"]);
  // In English the rule does not apply: it measured nothing.
  const en = await measure(page, `<button>Save your work</button>`, { lang: "en" });
  expect(en.findings.filter((f) => f.rule === "english-in-hindi")).toEqual([]);
  expect(en.measured["english-in-hindi"]).toBe(0);
});

test("layout: an empty page measures nothing in any rule", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M11");
  await page.setContent(`<!doctype html><html lang="hi"><head><title>Empty</title></head><body></body></html>`);
  const r = await measureLayout(page, { phone: true, lang: "hi" });
  expect(r.findings).toEqual([]);
  for (const rule of LAYOUT_RULES) expect(r.measured[rule], rule).toBe(0);
});

test("layout: an image without alt text is an axe finding, with alt text it is not", TAGS, async ({ page, qa }) => {
  measuring(qa, "SELF-LAYOUT-M12");
  const bad = await measure(page, `<h1>Photos</h1><img src="${GIF}" width="40" height="40">`);
  const found = rulesOf(bad, "axe");
  expect(found.length).toBeGreaterThan(0);
  expect(found.map((f) => f.detail).join("\n")).toContain("image-alt");
  expect(found[0]!.detail).toMatch(/critical|serious/);
  expect(bad.measured["axe"]).toBeGreaterThan(0);
  const good = await measure(page, `<h1>Photos</h1><img src="${GIF}" width="40" height="40" alt="A single grey pixel">`);
  expect(rulesOf(good, "axe")).toEqual([]);
  expect(good.measured["axe"]).toBeGreaterThan(0);
});

test("layout: a checkpoint records one visual check per rule, and a passing page passes them all", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-1", ["look"], "hi"));
  await page.setContent(doc(`<h1>मुख्य पृष्ठ</h1><p>अपना काम सहेजें</p><button style="margin:8px;width:120px;height:44px">सहेजें</button><button style="margin:8px;width:120px;height:44px">रद्द करें</button>`, { lang: "hi" }));
  await qa.step("look", async () => {
    await qa.checkpoint("home");
  });
  const r = qa.result();
  const visual = r.checks.filter((c) => c.kind === "visual");
  // Desktop: the touch-target rule is not asked for, so it is not listed.
  expect(visual.map((c) => c.label)).toEqual([
    "home: no sideways page scroll",
    "home: nothing past the window's edge",
    "home: no text cut off inside its box",
    "home: no two controls on top of each other",
    "home: no English on a Hindi screen",
    "home: no serious or critical accessibility finding (axe)"
  ]);
  for (const c of visual) expect(c, c.label).toMatchObject({ ok: true, step: "look" });
  expect(r.screenshots).toHaveLength(1);
});

test("layout: a checkpoint fails a rule as UI, and an empty rule as NOT CHECKED", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-2", ["look"], "hi"));
  await page.setViewportSize(PHONE_SIZE);
  await page.setContent(doc(`<div style="width:600px;height:40px;background:#ddd"><button>Save your work</button></div>`, { lang: "hi" }));
  await qa.step("look", async () => {
    await qa.checkpoint("form");
  });
  const checks = qa.result().checks;
  expect(labelled(checks, "no sideways page scroll")).toMatchObject({ ok: false, fail: "ui" });
  expect(labelled(checks, "nothing past the window's edge")).toMatchObject({ ok: false, fail: "ui" });
  expect(labelled(checks, "no English on a Hindi screen")).toMatchObject({ ok: false, fail: "ui" });
  expect(labelled(checks, "no English on a Hindi screen").message).toContain("Save your work");
  expect(labelled(checks, "no English on a Hindi screen").screenshot).toBeTruthy();
  // One button: nothing to overlap with.
  expect(labelled(checks, "no two controls on top of each other")).toMatchObject({ ok: null });
  expect(labelled(checks, "no two controls on top of each other").fail).toBeUndefined();
  expect(labelled(checks, "no two controls on top of each other").message).toMatch(/two/);
});

test("layout: a checkpoint on an empty page is NOT CHECKED in every rule it asked for", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-3", ["look"], "hi"));
  await page.setContent(`<!doctype html><html lang="hi"><head><title>Empty</title></head><body></body></html>`);
  await qa.step("look", async () => {
    await qa.checkpoint("blank");
  });
  const visual = qa.result().checks.filter((c) => c.kind === "visual");
  expect(visual).toHaveLength(6);
  for (const c of visual) {
    expect(c, c.label).toMatchObject({ ok: null });
    expect(c.fail).toBeUndefined();
    expect(c.message, c.label).toBeTruthy();
  }
});

test("layout: layout false and axe false leave their rules out", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-4", ["look"]));
  await page.setContent(doc(`<h1>Home</h1><p>Some words</p>`));
  await qa.step("look", async () => {
    await qa.checkpoint("only axe", { layout: false });
    await qa.checkpoint("only layout", { axe: false });
    await qa.checkpoint("only the picture", { layout: false, axe: false });
  });
  const labels = qa.result().checks.filter((c) => c.kind === "visual").map((c) => c.label);
  expect(labels.filter((l) => l.startsWith("only axe:"))).toEqual(["only axe: no serious or critical accessibility finding (axe)"]);
  expect(labels.filter((l) => l.startsWith("only layout:")).some((l) => l.includes("axe"))).toBe(false);
  expect(labels.filter((l) => l.startsWith("only layout:"))).toHaveLength(4);
  expect(labels.filter((l) => l.startsWith("only the picture:"))).toEqual([]);
  expect(qa.result().screenshots).toHaveLength(3);
});

test("layout: a Hindi case on a page that says English is NOT CHECKED in the Hindi rule, not a pass", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-5", ["look"], "hi"));
  await page.setContent(doc(`<h1>Home</h1><p>Some words to read</p><button>Save your work</button><button>Cancel it</button>`, { lang: "en" }));
  await qa.step("look", async () => {
    await qa.checkpoint("not switched");
  });
  const c = labelled(qa.result().checks, "no English on a Hindi screen");
  expect(c).toMatchObject({ ok: null });
  expect(c.message).toContain('lang="en"');
});

test("layout: a checkpoint takes the language and the phone from the page it measures", TAGS, async ({ browser, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-6", ["there"]));
  // A second browser that is a phone, in Hindi: the case's own page is a desktop one, in English.
  const context = await browser.newContext({ viewport: PHONE_SIZE, isMobile: true, hasTouch: true });
  try {
    await qa.watch(context);
    const phone = await context.newPage();
    await phone.setContent(doc(`<button style="display:block;width:30px;height:30px;margin:8px">x</button><button style="display:block;width:120px;height:44px;margin:8px">Save your work</button>`, { lang: "hi" }));
    await qa.step("there", async () => {
      await qa.checkpoint("second browser", { page: phone });
    }, { page: phone });
    const checks = qa.result().checks;
    expect(labelled(checks, "every control at least 44 px each way")).toMatchObject({ ok: false, fail: "ui" });
    expect(labelled(checks, "no English on a Hindi screen")).toMatchObject({ ok: false, fail: "ui" });
  } finally {
    await context.close();
  }
});

test("layout: on a real phone a 600 px block is a sideways scroll, and a 30 px button a small target", PHONE, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-PHONE", ["look"], "hi"));
  // The phone project is mobile: with the page wider than the window, innerWidth grows to the page's width, so a rule measured against it would never fire.
  await page.setContent(doc(`<div style="width:600px;height:40px;background:#ddd">काम</div><button style="display:block;width:30px;height:30px;margin:8px">x</button><button style="display:block;width:120px;height:44px;margin:8px">ठीक है</button>`, { lang: "hi" }));
  await qa.step("look", async () => {
    await qa.checkpoint("wide");
  });
  const checks = qa.result().checks;
  expect(labelled(checks, "no sideways page scroll")).toMatchObject({ ok: false, fail: "ui" });
  expect(labelled(checks, "nothing past the window's edge")).toMatchObject({ ok: false, fail: "ui" });
  expect(labelled(checks, "every control at least 44 px each way")).toMatchObject({ ok: false, fail: "ui" });
  expect(labelled(checks, "no English on a Hindi screen")).toMatchObject({ ok: true });
});

test("layout: on a real phone an empty page is NOT CHECKED in all seven rules", PHONE, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-PHONE-EMPTY", ["look"], "hi"));
  await page.setContent(`<!doctype html><html lang="hi"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Empty</title></head><body></body></html>`);
  await qa.step("look", async () => {
    await qa.checkpoint("blank phone");
  });
  const visual = qa.result().checks.filter((c) => c.kind === "visual");
  expect(visual).toHaveLength(7);
  for (const c of visual) expect(c, c.label).toMatchObject({ ok: null });
});

test("layout: a case on a phone, at a page that does not read as one, has its touch targets NOT CHECKED, not skipped", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin({ story: "S0", id: "SELF-LAYOUT-7", goal: "Check the layout rules", situation: { screen: "phone" }, steps: ["look"] });
  await page.setContent(doc(`<button style="display:block;width:30px;height:30px;margin:8px">x</button><button style="display:block;width:44px;height:44px;margin:8px">OK</button>`));
  await qa.step("look", async () => {
    await qa.checkpoint("wide window");
  });
  const c = labelled(qa.result().checks, "every control at least 44 px each way");
  expect(c).toMatchObject({ ok: null });
  expect(c.fail).toBeUndefined();
  expect(c.message).toContain("does not read as one");
  expect(c.message).toContain("coarse pointer: false");
});

test("layout: axe failing is an Error finding, unless the page moved under the scan", TAGS, async ({ page, qa }) => {
  qa.selfTest = true;
  qa.begin(meta("SELF-LAYOUT-8", ["broken", "moved"]));
  await page.setContent(doc(`<h1>Home</h1><p>Some words</p>`));
  const context = page.context();
  const original = context.newPage.bind(context);
  try {
    // axe opens a blank page of its own to put its results together; take that away.
    context.newPage = async () => {
      throw new Error("browserContext.newPage: boom");
    };
    await qa.step("broken", async () => {
      await qa.checkpoint("scan", { layout: false });
    });
    context.newPage = async () => {
      throw new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation");
    };
    await qa.step("moved", async () => {
      await qa.checkpoint("scan again", { layout: false });
    });
  } finally {
    context.newPage = original;
  }
  const checks = qa.result().checks.filter((x) => x.kind === "visual");
  expect(checks).toHaveLength(2);
  expect(checks[0]).toMatchObject({ ok: false, fail: "error", step: "broken" });
  expect(checks[0]!.message).toContain("axe could not run");
  expect(checks[0]!.message).toContain("boom");
  expect(checks[0]!.screenshot).toBeTruthy();
  expect(checks[1]).toMatchObject({ ok: null, step: "moved" });
  expect(checks[1]!.fail).toBeUndefined();
  expect(checks[1]!.message).toContain("navigated during the scan");
});
