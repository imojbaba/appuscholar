// @vitest-environment jsdom
import { act, createElement as h, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMatcher, type MatchPerson } from "@appuscholar/core";

/*
 * Task 9: names in documents (spec 2026-10-24-participants-design.md §7 and §8.2, calls C4, C9, C17 and C19; the mockup's panel B). Two halves:
 * - docNames.ts, pure: findInHtml walks the text of a document's HTML block by block (inline marks joined, a find never crosses a block) and replaceInHtml puts the replacement
 *   into the text node where a find starts, taking the rest of its characters out of the nodes after it, so every mark and attribute stays;
 * - FindNames.tsx, the results on the tab: grouped by document and person, Replace all for sure finds, Check each for ask finds, Add to list / Replace with [name] / Not a name for
 *   suggestions. The documents are a stand-in for useDocAccess() (allDocuments and rewriteDocument, whose own tests are docAccess.test.tsx). The mockup's Class 9 study is the list.
 * Names are in the page for the student and nowhere else: no toast, no console line, no browser dialog.
 */

const m = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; title: string; html: string; text: string }>,
  refuse: new Set<string>(),
  all: vi.fn(),
  rewrite: vi.fn(),
  toast: vi.fn(),
  saveRefused: false,
  latest: null as unknown,
  /** The open document's id (the shell's currentDoc), or null; `text` is what the editor holds now. */
  openId: null as string | null,
  text: vi.fn(),
  /** What the calls were, in order ("all", "text", "rewrite:<id>"). */
  order: [] as string[]
}));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ allDocuments: m.all, rewriteDocument: m.rewrite, text: m.text }) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ currentDoc: m.openId ? { id: m.openId } : null }) }));
vi.mock("@/components/ui/toast", () => ({ toast: m.toast }));

import { findInHtml, replaceInHtml, NAME_PLACEHOLDER } from "../lib/tools/participants/docNames";
import { FindNames, openFirst } from "../components/tools/participants/FindNames";
import { suggestionNotNames, toMatchPeople } from "../lib/tools/participants/list";
import { planOf, type ParticipantsPlan } from "../lib/tools/participants/plan";
import type { Participant, ParticipantList } from "../lib/blobs/kinds/participants";
import en from "../messages/tools/participants.en.json";
import hi from "../messages/tools/participants.hi.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- Fixtures -----------------------------------------------------------------------------------------------------------------------------------------

const person = (o: Partial<Participant> & { code: string; name: string }): Participant => ({ id: "id-" + o.code, spellings: [], everyday: [], joined: "2026-10-02", about: {}, ...o });
/** The mockup's study (participants-tab.html): P003's Asha is also an everyday word, P004 withdrew and asked for their data to be removed. */
const FIVE: Participant[] = [
  person({ code: "P001", name: "Priya Sharma", spellings: ["Priya", "प्रिया"] }),
  person({ code: "P002", name: "Rahul Verma", spellings: ["Rahul"] }),
  person({ code: "P003", name: "Asha Kumari", spellings: ["Asha"], everyday: ["Asha"] }),
  person({ code: "P004", name: "Mohd. Imran", spellings: ["Imran"], withdrawn: { on: "2026-10-15", data: "remove" } }),
  person({ code: "P005", name: "Kiran Rao", spellings: ["Kiran"] })
];
const list = (people: Participant[] = FIVE, extra: Partial<ParticipantList> = {}): ParticipantList => ({ v: 1, next: people.length + 1, people, notNames: [], ...extra });
const PLAN = planOf({ idMode: "codes", record: ["name", "spellings"], minors: "no" });
const PSEUDO = planOf({ idMode: "pseudonyms", record: ["name", "spellings", "pseudonym"], minors: "no" });

const matcherOf = (people: Participant[] = FIVE, pseudonyms = false) => buildMatcher(toMatchPeople(list(people), pseudonyms));
const NO_NOT: { notNames: string[] } = { notNames: [] };

/** The mockup's transcript ("Interview two"): Priya twice and प्रिया once, Rahul, an everyday-word Asha in capitals, Meena who is not on the list. */
const TRANSCRIPT = [
  "<p><strong>Interviewer:</strong> How did the routine feel in the first week?</p>",
  "<p><strong>Priya:</strong> Hard. My mother kept asking why I slept so early. Rahul said the same thing happened at his house.</p>",
  "<p><strong>Interviewer:</strong> Did anyone help?</p>",
  "<p><strong>Priya:</strong> Meena didi did. And the ASHA worker came on Thursday. प्रिया की माँ ने भी पूछा।</p>"
].join("");

// ---- findInHtml ---------------------------------------------------------------------------------------------------------------------------------------

describe("findInHtml", () => {
  it("findsANameSplitByInlineMarks: a name cut by a mark inside one paragraph is one find, spanning the nodes", () => {
    const finds = findInHtml("<p>Hello <b>Pri</b>ya said hi</p>", matcherOf(), NO_NOT);
    expect(finds).toHaveLength(1);
    expect(finds[0]).toMatchObject({ text: "Priya", kind: "sure", personIds: ["id-P001"], block: 0, start: 6, end: 11 });
    // Two marks in a row, and a mark around part of the second word of a name.
    const two = findInHtml("<p><i>Pri</i><b>ya</b> <u>Sha</u>rma left</p>", matcherOf(), NO_NOT);
    expect(two.map((f) => f.text)).toEqual(["Priya Sharma"]);
  });

  it("a name across two paragraphs is not found, and neither is one cut by a line break", () => {
    // A name that is no first name on the built-in list, so nothing is suggested either.
    const zed = matcherOf([person({ code: "P001", name: "Zanzibar Quill" })]);
    expect(findInHtml("<p>Zanzibar</p><p>Quill</p>", zed, NO_NOT)).toEqual([]);
    expect(findInHtml("<p>Zanzibar<br>Quill</p>", zed, NO_NOT)).toEqual([]);
    // Cells of a table and items of a list are blocks of their own.
    expect(findInHtml("<table><tr><td>Zanzibar</td><td>Quill</td></tr></table><ul><li>Zanzibar</li><li>Quill</li></ul>", zed, NO_NOT)).toEqual([]);
    // Within one block it is found.
    expect(findInHtml("<p>Zanzibar Quill</p>", zed, NO_NOT).map((f) => f.kind)).toEqual(["sure"]);
  });

  it("numbers the blocks in text order and gives each find the sentence it is in, with the find's place in it", () => {
    const finds = findInHtml(TRANSCRIPT, matcherOf(), NO_NOT);
    const asha = finds.find((f) => f.text === "ASHA")!;
    expect(asha.block).toBe(3);
    expect(asha.sentence).toBe("And the ASHA worker came on Thursday.");
    expect(asha.sentence.slice(asha.at, asha.at + asha.text.length)).toBe("ASHA");
    const rahul = finds.find((f) => f.text === "Rahul")!;
    expect(rahul.block).toBe(1);
    expect(rahul.sentence).toBe("Rahul said the same thing happened at his house.");
    // A find in a block without a full stop has the block.
    const bare = findInHtml("<p>just Priya here</p>", matcherOf(), NO_NOT)[0]!;
    expect(bare.sentence).toBe("just Priya here");
  });

  it("ends a sentence at a danda or a line break; a find with full stops inside it (R.K.) is not cut by them", () => {
    const hindi = findInHtml("<p>पहले की बात। यह प्रिया है। दूसरा वाक्य।</p>", matcherOf(), NO_NOT).find((f) => f.text === "प्रिया")!;
    expect(hindi.sentence).toBe("यह प्रिया है।");
    const rk = buildMatcher(toMatchPeople(list([person({ code: "P009", name: "R. K. Zanzibar" })]), false));
    const hit = findInHtml("<p>It rained. Then R.K. Zanzibar said so. Done.</p>", rk, NO_NOT)[0]!;
    expect(hit.text).toBe("R.K. Zanzibar");
    expect(hit.sentence).toBe("Then R.K. Zanzibar said so.");
    const lines = findInHtml("<pre>first line\nPriya in the second\nthird line</pre>", matcherOf(), NO_NOT).find((f) => f.text === "Priya")!;
    expect(lines.sentence).toBe("Priya in the second");
  });

  it("clips a very long sentence to a stretch around the find, marked with …, keeping the find's place in it", () => {
    const long = "word ".repeat(100) + "Priya " + "word ".repeat(100) + ".";
    const f = findInHtml(`<p>${long}</p>`, matcherOf(), NO_NOT).find((x) => x.kind === "sure")!;
    expect(f.sentence.startsWith("…")).toBe(true);
    expect(f.sentence.endsWith("…")).toBe(true);
    expect(f.sentence.length).toBeLessThan(260);
    expect(f.sentence.slice(f.at, f.at + 5)).toBe("Priya");
  });

  it("finds the mockup's transcript: Priya (and प्रिया) and Rahul sure, ASHA asked, Meena a suggestion; the role labels are no names", () => {
    const finds = findInHtml(TRANSCRIPT, matcherOf(), NO_NOT);
    const by = (kind: string) => finds.filter((f) => f.kind === kind).map((f) => f.text);
    expect(by("sure")).toEqual(["Priya", "Rahul", "Priya", "प्रिया"]);
    expect(by("ask")).toEqual(["ASHA"]);
    expect(finds.find((f) => f.text === "ASHA")).toMatchObject({ why: "everyday", personIds: ["id-P003"] });
    expect(by("suggest")).toEqual(["Meena"]);
    expect(finds.find((f) => f.text === "Meena")).toMatchObject({ personIds: [], why: "first-name" });
    // In text order, block by block.
    expect(finds.map((f) => f.block)).toEqual([...finds.map((f) => f.block)].sort((a, b) => a - b));
  });

  it("suggests a speaker label that is not on the list and leaves out a word the student said is not a name", () => {
    const html = "<p>Sunita: I went home.</p><p>Meena: Me too.</p>";
    expect(findInHtml(html, matcherOf(), NO_NOT).filter((f) => f.kind === "suggest").map((f) => f.text)).toEqual(["Sunita", "Meena"]);
    expect(findInHtml(html, matcherOf(), { notNames: ["meena"] }).filter((f) => f.kind === "suggest").map((f) => f.text)).toEqual(["Sunita"]);
  });

  it("reads the line breaks of one paragraph as lines: a speaker label after a break is a label", () => {
    const html = "<p>Interviewer: Hello.<br>Sunita: Hi there.</p>";
    expect(findInHtml(html, matcherOf(), NO_NOT).filter((f) => f.kind === "suggest").map((f) => f.text)).toEqual(["Sunita"]);
  });

  it("reads a list item, a quote and the text of nested lists on their own, and a document with no wrapper", () => {
    const html = "Priya here<ul><li>Rahul<ul><li>Asha</li></ul>and Priya</li></ul><blockquote><p>Rahul</p></blockquote>";
    const finds = findInHtml(html, matcherOf(), NO_NOT);
    expect(finds.map((f) => [f.text, f.block])).toEqual([["Priya", 0], ["Rahul", 1], ["Asha", 2], ["Priya", 3], ["Rahul", 4]]);
  });

  it("gives nothing for a document with no names or no text", () => {
    expect(findInHtml("", matcherOf(), NO_NOT)).toEqual([]);
    expect(findInHtml("<p></p><p>   </p><p>The weather.</p>", matcherOf([]), { notNames: [] }).filter((f) => f.kind !== "suggest")).toEqual([]);
  });
});

// ---- replaceInHtml ------------------------------------------------------------------------------------------------------------------------------------

/** Every sure find of the matcher in the html, replaced with `to`. */
function replaceAll(html: string, to: string, people: Participant[] = FIVE): string {
  const finds = findInHtml(html, matcherOf(people), NO_NOT).filter((f) => f.kind === "sure");
  return replaceInHtml(html, finds.map((find) => ({ find, to })));
}

describe("replaceInHtml", () => {
  it("replacing keeps the marks and the other text: the replacement goes into the node where the find starts, and its other characters leave the nodes after", () => {
    expect(replaceAll("<p>Hello <b>Pri</b>ya, and <i>Priya</i> again</p>", "P001")).toBe("<p>Hello <b>P001</b>, and <i>P001</i> again</p>");
    // A name cut over three marks: the first node takes the replacement, the others are left empty (their marks stay), and the rest of the last node is kept.
    expect(replaceAll("<p><i>Pri</i><b>ya</b> <u>Sha</u>rma left</p>", "P001")).toBe("<p><i>P001</i><b></b><u></u> left</p>");
  });

  it("keeps attributes and the coded passages' marks (a text inside data-qcode is replaced like any text)", () => {
    const html = '<p>See <span class="qual-tag" data-qcode="c1" title="Sleep">Priya said</span> that <a href="https://x.org/Priya">Rahul</a> too</p>';
    expect(replaceAll(html, "P001")).toBe('<p>See <span class="qual-tag" data-qcode="c1" title="Sleep">P001 said</span> that <a href="https://x.org/Priya">P001</a> too</p>');
  });

  it("keeps the text around a find (Priya's becomes P001's) and replaces several finds of one block, from either end", () => {
    expect(replaceAll("<p>Priya's mother and Rahul, Priya</p>", "X")).toBe("<p>X's mother and X, X</p>");
    // Two finds inside one text node, and a find split across nodes after one that is not.
    expect(replaceAll("<p>Rahul <b>and Pri</b>ya and Rahul</p>", "R")).toBe("<p>R <b>and R</b> and R</p>");
  });

  it("replaces different finds with different texts (their own person's code)", () => {
    const html = "<p>Priya and Rahul</p>";
    const finds = findInHtml(html, matcherOf(), NO_NOT).filter((f) => f.kind === "sure");
    const out = replaceInHtml(html, finds.map((find) => ({ find, to: find.text === "Priya" ? "P001" : "P002" })));
    expect(out).toBe("<p>P001 and P002</p>");
  });

  it("works on the Devanagari spelling and does not change a find's neighbours", () => {
    expect(replaceAll("<p>प्रिया की माँ</p>", "P001")).toBe("<p>P001 की माँ</p>");
  });

  it("puts the placeholder for a suggestion, and the text is escaped by the serialiser (a '<' in a find's neighbour stays text)", () => {
    const html = "<p>Meena &lt; Priya &amp; co</p>";
    const finds = findInHtml(html, matcherOf(), NO_NOT);
    const out = replaceInHtml(html, finds.map((find) => ({ find, to: find.kind === "suggest" ? NAME_PLACEHOLDER : "P001" })));
    expect(out).toBe("<p>[name] &lt; P001 &amp; co</p>");
    expect(NAME_PLACEHOLDER).toBe("[name]");
  });

  it("changes nothing for no picks, and leaves a pick whose text is no longer there (the document moved on)", () => {
    const html = "<p>Priya here</p>";
    expect(replaceInHtml(html, [])).toBe(html);
    const [f] = findInHtml(html, matcherOf(), NO_NOT);
    expect(replaceInHtml("<p>Rahul here</p>", [{ find: f!, to: "P001" }])).toBe("<p>Rahul here</p>");
  });

  it("a find that has the block of another paragraph's text leaves that paragraph alone", () => {
    const html = "<p>one Priya</p><p>two Rahul</p>";
    const finds = findInHtml(html, matcherOf(), NO_NOT).filter((f) => f.text === "Rahul");
    expect(replaceInHtml(html, finds.map((find) => ({ find, to: "P002" })))).toBe("<p>one Priya</p><p>two P002</p>");
  });
});

// ---- FindNames ----------------------------------------------------------------------------------------------------------------------------------------

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (prefix: string) => Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`));
const text = (id: string) => $(id)?.textContent ?? null;
const click = (id: string | HTMLElement) => act(async () => { (typeof id === "string" ? $(id)! : id).click(); await new Promise((r) => setTimeout(r, 0)); });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const NOTE = "Earlier saved versions of a document still hold the old text, sealed in your vault.";

/** The list the tab holds, for the tests to read and to save over (functions, so the component does not touch a variable of the module itself). */
const setLatest = (l: ParticipantList) => { m.latest = l; };
const getLatest = () => m.latest as ParticipantList;

function Harness({ initial, plan }: { initial: ParticipantList; plan: ParticipantsPlan }) {
  const [l, setL] = useState(initial);
  useEffect(() => { setLatest(l); });
  return h(FindNames, {
    list: l,
    plan,
    save: (update: (prev: ParticipantList) => ParticipantList) => {
      if (m.saveRefused) return false;
      const next = update(getLatest());
      setLatest(next);
      setL(next);
      return true;
    },
    refused: () => "Could not save this change. Try again."
  });
}

async function mount(initial: ParticipantList = list(), plan: ParticipantsPlan = PLAN): Promise<void> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(h(Harness, { initial, plan })); });
}
/** Opens the results: presses the button and lets the documents be read. */
async function find(initial?: ParticipantList, plan?: ParticipantsPlan): Promise<void> {
  await mount(initial, plan);
  await click("pp-find");
  await flush();
}
const doc = (id: string, title: string, html: string) => ({ id, title, html, text: html.replace(/<[^>]+>/g, "") });
const latest = () => m.latest as ParticipantList;
const htmlOf = (id: string) => m.docs.find((d) => d.id === id)!.html;

let confirmSpy: ReturnType<typeof vi.spyOn>;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>>;
beforeEach(() => {
  m.docs = [doc("d1", "Interview two", TRANSCRIPT)];
  m.refuse = new Set();
  m.saveRefused = false;
  m.latest = null;
  m.openId = null;
  m.order = [];
  m.toast.mockClear();
  m.all.mockReset();
  m.all.mockImplementation(async () => { m.order.push("all"); return m.docs.map((d) => ({ ...d })); });
  m.text.mockReset();
  m.text.mockImplementation(() => { m.order.push("text"); return m.docs.find((d) => d.id === m.openId)?.text ?? ""; });
  m.rewrite.mockReset();
  m.rewrite.mockImplementation(async (id: string, html: string) => {
    m.order.push("rewrite:" + id);
    if (m.refuse.has(id)) return false;
    m.docs = m.docs.map((d) => (d.id === id ? { ...d, html, text: html.replace(/<[^>]+>/g, "") } : d));
    return true;
  });
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
});
afterEach(async () => {
  // No name goes to a toast or a console line, and no browser dialog is used; the console is muted for a clean run but an error is a defect.
  expect(m.toast).not.toHaveBeenCalled();
  for (const s of consoleSpies) expect(JSON.stringify(s.mock.calls)).not.toMatch(/Priya|Rahul|Asha|Imran|Kiran|Sunita|Meena|Tara/);
  expect(consoleSpies[3]!.mock.calls, "console.error").toEqual([]);
  expect(confirmSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
});

describe("Find names in my documents", () => {
  it("is a button; the documents are read only when it is pressed", async () => {
    await mount();
    expect(text("pp-find")).toBe("Find names in my documents");
    expect(m.all).not.toHaveBeenCalled();
    expect($("pp-find-results")).toBeNull();
    await click("pp-find");
    await flush();
    expect(m.all).toHaveBeenCalledTimes(1);
    expect($("pp-find-results")).not.toBeNull();
  });

  it("lists the mockup's transcript by document and person: 'P001 Priya Sharma · 3 places (incl. प्रिया)' with Replace all, Rahul with Replace, Asha under Check each, Meena as a suggestion", async () => {
    await find();
    const d1 = $("pp-find-doc-d1")!;
    expect(d1.textContent).toContain("Interview two");
    expect(text("pp-find-person-P001")).toContain("P001 Priya Sharma · 3 places (incl. प्रिया)");
    expect(text("pp-find-replace-all-P001")).toBe("Replace all");
    expect(text("pp-find-person-P002")).toContain("P002 Rahul Verma · 1 place");
    expect(text("pp-find-person-P002")).not.toContain("incl.");
    expect(text("pp-find-replace-all-P002")).toBe("Replace");
    // The ask find: its own row, amber, with Check each; it is not among the sure ones.
    expect($("pp-find-person-P003")).toBeNull();
    expect(text("pp-find-ask-P003")).toContain("P003?");
    expect(text("pp-find-ask-P003")).toContain("“ASHA” · 1 place, also an everyday word");
    expect(text("pp-find-check-P003")).toBe("Check each");
    // The suggestion.
    const sug = $$("pp-find-suggest-");
    expect(sug).toHaveLength(1);
    expect(sug[0]!.textContent).toContain("Meena · not on your list");
    expect(text("pp-find-add")).toBe("Add to list");
    expect(text("pp-find-mask")).toBe("Replace with [name]");
    expect(text("pp-find-notname")).toBe("Not a name");
    // The people with nothing in this document have no row.
    for (const c of ["P004", "P005"]) expect($("pp-find-person-" + c), c).toBeNull();
  });

  it("says so when no names are found, and when there are no documents", async () => {
    m.docs = [doc("d1", "Notes", "<p>The weather was fine.</p>")];
    await find();
    expect(text("pp-find-results")).toContain("No names found in your documents.");
    expect($$("pp-find-doc-")).toHaveLength(0);
  });

  it("says when there is nothing to look through (no documents, or none that can be opened)", async () => {
    m.docs = [];
    await find();
    expect(text("pp-find-results")).toContain("There are no documents to look through.");
  });

  it("lists each document that has names, in the order they are read, and leaves out one that has none", async () => {
    m.docs = [doc("d1", "Interview one", "<p>Rahul came.</p>"), doc("d2", "Plan", "<p>No names here.</p>"), doc("d3", "Interview two", "<p>Priya came.</p>")];
    await find();
    expect($$("pp-find-doc-").map((e) => e.getAttribute("data-testid"))).toEqual(["pp-find-doc-d1", "pp-find-doc-d3"]);
  });

  it("Check each opens the ask finds, each with its sentence and Replace / Skip; Replace changes that find and no other", async () => {
    m.docs = [doc("d1", "Interview two", "<p>The ASHA worker came. Then Asha left. Asha waved.</p>")];
    await find();
    expect(text("pp-find-ask-P003")).toContain("P003?");
    // "Asha" written with a capital is an ask find each time (it is marked everyday); both capitals count.
    expect(text("pp-find-ask-P003")).toContain("3 places");
    expect($("pp-find-item")).toBeNull();
    await click("pp-find-check-P003");
    const items = $$("pp-find-item");
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain("The ASHA worker came.");
    expect(items[1]!.textContent).toContain("Then Asha left.");
    // The find is marked in its sentence.
    expect(items[1]!.querySelector("mark")!.textContent).toBe("Asha");
    // Replace the second one only.
    await click(items[1]!.querySelector<HTMLElement>('[data-testid="pp-find-replace"]')!);
    expect(m.rewrite).toHaveBeenCalledTimes(1);
    expect(htmlOf("d1")).toBe("<p>The ASHA worker came. Then P003 left. Asha waved.</p>");
    await flush();
    expect($$("pp-find-item")).toHaveLength(2);
  });

  it("Skip leaves a find as it is and takes it off the list; nothing is written", async () => {
    m.docs = [doc("d1", "Interview two", "<p>The ASHA worker came. Then Asha left.</p>")];
    await find();
    await click("pp-find-check-P003");
    await click($$("pp-find-skip")[0]!);
    expect(m.rewrite).not.toHaveBeenCalled();
    expect($$("pp-find-item")).toHaveLength(1);
    expect(htmlOf("d1")).toBe("<p>The ASHA worker came. Then Asha left.</p>");
  });

  it("a spelling two people share asks which person: Replace waits until one is chosen, and uses that person's code", async () => {
    const people = [...FIVE, person({ code: "P006", name: "Kiran Das", spellings: ["Kiran"] })];
    m.docs = [doc("d1", "Interview two", "<p>Then Kiran left.</p>")];
    await find(list(people));
    expect(text("pp-find-ask-P005+P006")).toContain("P005? P006?");
    expect(text("pp-find-ask-P005+P006")).toContain("shared by P005 and P006");
    await click("pp-find-check-P005+P006");
    const replace = $("pp-find-replace") as HTMLButtonElement;
    expect(replace.disabled).toBe(true);
    const pick = $("pp-find-pick") as HTMLSelectElement;
    expect(Array.from(pick.options).map((o) => o.textContent)).toEqual(["Choose…", "P005 Kiran Rao", "P006 Kiran Das"]);
    await act(async () => { pick.value = pick.options[2]!.value; pick.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(($("pp-find-replace") as HTMLButtonElement).disabled).toBe(false);
    await click("pp-find-replace");
    expect(htmlOf("d1")).toBe("<p>Then P006 left.</p>");
  });

  it("Replace all calls rewriteDocument once for the document, with every sure find of that person replaced and nothing else touched", async () => {
    await find();
    await click("pp-find-replace-all-P001");
    expect(m.rewrite).toHaveBeenCalledTimes(1);
    expect(m.rewrite.mock.calls[0]![0]).toBe("d1");
    const html = htmlOf("d1");
    expect(html).toContain("<strong>P001:</strong> Hard.");
    expect(html).toContain("P001 की माँ");
    expect(count(html, "P001")).toBe(3);
    // The others are left: Rahul (sure, not pressed), ASHA (asked), Meena (a suggestion).
    expect(html).toContain("Rahul said");
    expect(html).toContain("the ASHA worker");
    expect(html).toContain("Meena didi");
    // The results are read again: Priya has no row now, the rest stay.
    expect(m.all.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect($("pp-find-person-P001")).toBeNull();
    expect($("pp-find-person-P002")).not.toBeNull();
    expect(text("pp-find-done")).toBe("Replaced 3 places.");
  });

  it("one rewrite for each document you press Replace all in; another document is not touched", async () => {
    m.docs = [doc("d1", "Interview one", "<p>Priya came. Priya left.</p>"), doc("d2", "Interview two", "<p>Priya stayed.</p>")];
    await find();
    await click(($("pp-find-doc-d1")!).querySelector<HTMLElement>('[data-testid="pp-find-replace-all-P001"]')!);
    expect(m.rewrite).toHaveBeenCalledTimes(1);
    expect(htmlOf("d1")).toBe("<p>P001 came. P001 left.</p>");
    expect(htmlOf("d2")).toBe("<p>Priya stayed.</p>");
    expect(($("pp-find-doc-d2")!).querySelector('[data-testid="pp-find-person-P001"]')).not.toBeNull();
  });

  it("reads the document again before it writes: a change made since the results were drawn is not lost", async () => {
    await find();
    // The student typed in the document meanwhile.
    m.docs = m.docs.map((d) => ({ ...d, html: d.html + "<p>A new paragraph.</p>" }));
    await click("pp-find-replace-all-P002");
    expect(htmlOf("d1")).toContain("<p>A new paragraph.</p>");
    expect(htmlOf("d1")).toContain("P002 said");
  });

  it("made-up names mode replaces with the made-up name; a person with none yet is offered the code, and the row says so", async () => {
    const people = FIVE.map((p) => (p.code === "P001" ? { ...p, pseudonym: "Tara" } : p));
    await find(list(people), PSEUDO);
    expect(text("pp-find-person-P002")).toContain("No made-up name yet, so the code is used.");
    expect(text("pp-find-person-P001")).not.toContain("No made-up name yet");
    await click("pp-find-replace-all-P001");
    expect(htmlOf("d1")).toContain("<strong>Tara:</strong> Hard.");
    expect(htmlOf("d1")).toContain("Tara की माँ");
    expect(htmlOf("d1")).not.toContain("P001");
    await click("pp-find-replace-all-P002");
    expect(htmlOf("d1")).toContain("P002 said");
  });

  it("in codes mode a made-up name on the list is not used", async () => {
    const people = FIVE.map((p) => (p.code === "P001" ? { ...p, pseudonym: "Tara" } : p));
    await find(list(people), PLAN);
    expect($("pp-find-person-P002")!.textContent).not.toContain("made-up");
    await click("pp-find-replace-all-P001");
    expect(htmlOf("d1")).toContain("P001:");
    expect(htmlOf("d1")).not.toContain("Tara");
  });

  it("a refused rewrite is reported by the document's title, in the page and not in a toast; nothing changes in that document", async () => {
    m.refuse.add("d1");
    await find();
    await click("pp-find-replace-all-P001");
    expect(m.rewrite).toHaveBeenCalledTimes(1);
    const refused = text("pp-find-refused")!;
    expect(refused).toContain("Interview two");
    expect(refused).toContain("Nothing was changed in it.");
    expect(htmlOf("d1")).toBe(TRANSCRIPT);
    expect(text("pp-find-done")).toBeNull();
    // The names are still there to try again.
    expect($("pp-find-person-P001")).not.toBeNull();
  });

  it("a refused document does not stop another from being written", async () => {
    m.docs = [doc("d1", "Interview one", "<p>Priya came.</p>"), doc("d2", "Interview two", "<p>Priya stayed.</p>")];
    m.refuse.add("d1");
    await find();
    await click(($("pp-find-doc-d1")!).querySelector<HTMLElement>('[data-testid="pp-find-replace-all-P001"]')!);
    await click(($("pp-find-doc-d2")!).querySelector<HTMLElement>('[data-testid="pp-find-replace-all-P001"]')!);
    expect(text("pp-find-refused")).toContain("Interview one");
    expect(text("pp-find-refused")).not.toContain("Interview two");
    expect(htmlOf("d2")).toBe("<p>P001 stayed.</p>");
  });

  it("a person who withdrew and asked for their data to be removed has their finds tagged 'withdrew: remove their data'; they can still be replaced", async () => {
    m.docs = [doc("d1", "Interview two", "<p>Imran said yes. Rahul agreed. Mohd. Imran left.</p>")];
    await find();
    expect(text("pp-find-person-P004")).toContain("withdrew: remove their data");
    expect(text("pp-find-person-P002")).not.toContain("withdrew");
    // The data is the student's to remove from a transcript (C17); the name can still go.
    await click("pp-find-replace-all-P004");
    expect(htmlOf("d1")).toBe("<p>P004 said yes. Rahul agreed. P004 left.</p>");
  });

  it("a person who withdrew and kept their data has no tag", async () => {
    const keep = FIVE.map((p) => (p.code === "P004" ? { ...p, withdrawn: { on: "2026-10-15", data: "keep" as const } } : p));
    m.docs = [doc("d1", "Interview two", "<p>Imran said yes.</p>")];
    await find(list(keep));
    expect(text("pp-find-person-P004")).toContain("P004 Mohd. Imran · 1 place");
    expect(text("pp-find-person-P004")).not.toContain("withdrew");
  });

  it("the result says once that earlier saved versions still hold the old text, sealed in your vault (C19)", async () => {
    m.docs = [doc("d1", "Interview one", "<p>Priya came.</p>"), doc("d2", "Interview two", "<p>Priya stayed. Rahul too.</p>")];
    await find();
    expect(count(document.body.textContent!, NOTE)).toBe(1);
    await click(($("pp-find-doc-d1")!).querySelector<HTMLElement>('[data-testid="pp-find-replace-all-P001"]')!);
    await click(($("pp-find-doc-d2")!).querySelector<HTMLElement>('[data-testid="pp-find-replace-all-P001"]')!);
    expect(count(document.body.textContent!, NOTE)).toBe(1);
  });

  it("no line about earlier versions when nothing was found", async () => {
    m.docs = [doc("d1", "Notes", "<p>The weather was fine.</p>")];
    await find();
    expect(document.body.textContent).not.toContain(NOTE);
  });

  it("'Not a name' adds the word to notNames, saves, and the suggestion goes (also from every other document)", async () => {
    m.docs = [doc("d1", "Interview one", "<p>Meena came.</p>"), doc("d2", "Interview two", "<p>Meena stayed. Sunita: hello.</p>")];
    await find();
    expect($$("pp-find-notname")).toHaveLength(3);
    await click(($("pp-find-doc-d1")!).querySelector<HTMLElement>('[data-testid="pp-find-notname"]')!);
    expect(latest().notNames).toEqual(["meena"]);
    expect(m.rewrite).not.toHaveBeenCalled();
    expect($$("pp-find-suggest-").map((e) => e.textContent)).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Meena");
    expect(document.body.textContent).toContain("Sunita");
  });

  it("'Add to list' adds the person with the next code through save, says the code, and the name becomes a find on the list", async () => {
    await find();
    await click("pp-find-add");
    expect(latest().people).toHaveLength(6);
    const added = latest().people[5]!;
    expect(added).toMatchObject({ name: "Meena", code: "P006", spellings: [] });
    expect(latest().next).toBe(7);
    expect(text("pp-find-status")).toBe("Meena is on your list as P006.");
    expect($("pp-find-add")).toBeNull();
    expect(text("pp-find-person-P006")).toContain("P006 Meena · 1 place");
    expect(m.rewrite).not.toHaveBeenCalled();
    expect(htmlOf("d1")).toBe(TRANSCRIPT);
  });

  it("'Add to list' for a name of several words also adds its first word as the short name (C2); a title before it is skipped", async () => {
    m.docs = [doc("d1", "Interview two", "<p>Sunita Devi: hello. Then more.</p><p>Mohd Zaid: hi.</p>")];
    await find();
    await click($$("pp-find-add")[0]!);
    expect(latest().people.at(-1)).toMatchObject({ name: "Sunita Devi", spellings: ["Sunita"], code: "P006" });
    await click($$("pp-find-add")[0]!);
    expect(latest().people.at(-1)).toMatchObject({ name: "Mohd Zaid", spellings: ["Zaid"], code: "P007" });
  });

  it("'Replace with [name]' puts [name] for that word in the document and leaves the people on the list as they were", async () => {
    await find();
    await click("pp-find-mask");
    expect(m.rewrite).toHaveBeenCalledTimes(1);
    expect(htmlOf("d1")).toBe(TRANSCRIPT.replace("Meena didi", "[name] didi"));
    expect(latest().people).toHaveLength(5);
    expect($$("pp-find-suggest-")).toHaveLength(0);
  });

  it("a save that is refused says so in the page and changes nothing (a window that may not write the list)", async () => {
    m.saveRefused = true;
    await find();
    await click("pp-find-notname");
    expect(text("pp-find-error")).toBe("Could not save this change. Try again.");
    expect($("pp-find-notname")).not.toBeNull();
    await click("pp-find-add");
    expect(text("pp-find-error")).toBe("Could not save this change. Try again.");
    expect(latest().people).toHaveLength(5);
  });

  it("pressing the button again reads the documents again (a newly written name shows up)", async () => {
    m.docs = [doc("d1", "Interview two", "<p>Rahul came.</p>")];
    await find();
    expect($("pp-find-person-P001")).toBeNull();
    m.docs = [doc("d1", "Interview two", "<p>Rahul came. Priya came.</p>")];
    await click("pp-find");
    await flush();
    expect(m.all).toHaveBeenCalledTimes(2);
    expect($("pp-find-person-P001")).not.toBeNull();
  });

  it("Close takes the results away", async () => {
    await find();
    await click("pp-find-close");
    expect($("pp-find-results")).toBeNull();
    expect(text("pp-find")).toBe("Find names in my documents");
  });
});

// ---- Fix round 1 (ruling R34) -------------------------------------------------------------------------------------------------------------------------

describe("made-up names are never suggested (R34)", () => {
  /** "Neha" is on the built-in first names; here it is the made-up name P001 is given. */
  const withNeha = FIVE.map((p) => (p.code === "P001" ? { ...p, pseudonym: "Neha" } : p));

  it("suggestionNotNames: the words the student said are not names, and the made-up names with each of their words, in normal form, once", () => {
    const l = list(FIVE.map((p) => (p.code === "P001" ? { ...p, pseudonym: "Neha  Singh" } : p.code === "P002" ? { ...p, pseudonym: "  " } : p.code === "P003" ? { ...p, pseudonym: "NEHA" } : p)), { notNames: ["meena"] });
    expect([...suggestionNotNames(l)].sort()).toEqual(["meena", "neha", "neha singh", "singh"]);
    expect(suggestionNotNames(list())).toEqual([]);
  });

  it("after Replace all in made-up names mode the made-up name is not flagged 'not on your list' (the results read again)", async () => {
    m.docs = [doc("d1", "Interview two", "<p>Priya agreed.</p>")];
    await find(list(withNeha), PSEUDO);
    await click("pp-find-replace-all-P001");
    expect(htmlOf("d1")).toBe("<p>Neha agreed.</p>");
    expect($$("pp-find-suggest-")).toHaveLength(0);
    expect(text("pp-find-none")).toBe("No names found in your documents.");
    expect(text("pp-find-done")).toBe("Replaced 1 place.");
  });

  it("a made-up name already in a document, or as a speaker label of several words, is not suggested either", async () => {
    const two = FIVE.map((p) => (p.code === "P001" ? { ...p, pseudonym: "Neha Singh" } : p));
    m.docs = [doc("d1", "Interview two", "<p>Neha Singh: Hello there. Then Neha left.</p>")];
    await find(list(two), PSEUDO);
    expect($$("pp-find-suggest-")).toHaveLength(0);
    expect(text("pp-find-none")).toBe("No names found in your documents.");
  });

  it("a word that is on the first-names list and is nobody's made-up name is still suggested", async () => {
    m.docs = [doc("d1", "Interview two", "<p>Then Neha left.</p>")];
    await find(list(FIVE), PSEUDO);
    expect($$("pp-find-suggest-")).toHaveLength(1);
  });
});

describe("Find names under an anonymous plan (R34)", () => {
  it("offers no Add to list (the list does not grow); Replace with [name] and Not a name stay", async () => {
    const ANON = planOf({ idMode: "anonymous", record: ["age"], minors: "no" });
    await find(list(), ANON);
    expect($$("pp-find-suggest-")).toHaveLength(1);
    expect($("pp-find-add")).toBeNull();
    expect($("pp-find-mask")).not.toBeNull();
    expect($("pp-find-notname")).not.toBeNull();
    // The list's people are still found and replaced (matching runs while a list exists, C15).
    expect($("pp-find-replace-all-P001")).not.toBeNull();
  });
});

describe("writing (R34)", () => {
  const press = (docId: string, code: string) => click($("pp-find-doc-" + docId)!.querySelector<HTMLElement>(`[data-testid="pp-find-replace-all-${code}"]`)!);
  const two = () => [doc("d1", "Interview one", "<p>Priya came.</p>"), doc("d2", "Interview two", "<p>Priya stayed.</p>")];

  it("the open document is checked against the editor and written right after the documents are read, and nothing else is written", async () => {
    m.docs = two();
    m.openId = "d1";
    await find();
    m.order = [];
    await press("d1", "P001");
    expect(m.order).toEqual(["all", "text", "rewrite:d1", "all"]);
    expect(htmlOf("d1")).toBe("<p>P001 came.</p>");
    expect(htmlOf("d2")).toBe("<p>Priya stayed.</p>");
  });

  it("a document that is not open is written without the editor check", async () => {
    m.docs = two();
    m.openId = "d1";
    await find();
    m.order = [];
    await press("d2", "P001");
    expect(m.order).toEqual(["all", "rewrite:d2", "all"]);
  });

  it("text typed in the open document since it was read is not overwritten: nothing is written for it, and the page says the text has changed", async () => {
    m.docs = two();
    m.openId = "d1";
    await find();
    // The editor holds more than the read did.
    m.text.mockImplementation(() => { m.order.push("text"); return "Priya came. And something just typed."; });
    m.order = [];
    await press("d1", "P001");
    expect(m.order).toEqual(["all", "text", "all"]);
    expect(htmlOf("d1")).toBe("<p>Priya came.</p>");
    expect(text("pp-find-stale")).toBe("Nothing to replace there now: the text has changed. The results are fresh again.");
    expect(text("pp-find-done")).toBeNull();
  });

  it("openFirst puts the open document's target first and keeps the order of the others; with none open it changes nothing", () => {
    const t = (id: string) => ({ doc: { id }, pick: () => null });
    const a = [t("d2"), t("d3"), t("d1")];
    expect(openFirst(a, "d1").map((x) => x.doc.id)).toEqual(["d1", "d2", "d3"]);
    expect(openFirst(a, null).map((x) => x.doc.id)).toEqual(["d2", "d3", "d1"]);
    expect(openFirst(a, "d9").map((x) => x.doc.id)).toEqual(["d2", "d3", "d1"]);
    // The list given is not changed.
    expect(a.map((x) => x.doc.id)).toEqual(["d2", "d3", "d1"]);
  });

  it("a replace whose re-find matches nothing says so in the page, writes nothing, and the results are fresh again", async () => {
    m.docs = [doc("d1", "Interview two", "<p>Priya came. Rahul too.</p>")];
    await find();
    expect($("pp-find-person-P001")).not.toBeNull();
    // Priya was taken out of the document since the results were drawn.
    m.docs = [doc("d1", "Interview two", "<p>Rahul too.</p>")];
    await click("pp-find-replace-all-P001");
    expect(m.rewrite).not.toHaveBeenCalled();
    expect(text("pp-find-stale")).toBe("Nothing to replace there now: the text has changed. The results are fresh again.");
    expect($("pp-find-person-P001")).toBeNull();
    expect($("pp-find-person-P002")).not.toBeNull();
    expect(text("pp-find-done")).toBeNull();
    // The next press that works clears the line.
    await click("pp-find-replace-all-P002");
    expect($("pp-find-stale")).toBeNull();
  });
});

describe("the people the matcher gets", () => {
  it("is the list's people, so a destroyed list finds no sure name (only suggestions)", () => {
    const people: MatchPerson[] = toMatchPeople(list(FIVE, { destroyedAt: "2026-10-20" }), false);
    expect(people).toEqual([]);
    const kinds = findInHtml("<p>Priya and Meena</p>", buildMatcher(people), NO_NOT).map((f) => f.kind);
    expect(kinds).not.toContain("sure");
    expect(kinds).toContain("suggest");
  });
});

describe("the Hindi drafts", () => {
  it("every Find names key has a Hindi draft with the same placeholders, and the draft marker is kept", () => {
    const E = en as Record<string, string>;
    const H = hi as Record<string, string>;
    expect(H.$draft).toMatch(/^DRAFT/);
    const holes = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join(",");
    const keys = Object.keys(E).filter((k) => /^pp_find/.test(k));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      expect(H[k], k).toBeTruthy();
      expect(holes(H[k]!), k).toBe(holes(E[k]!));
    }
    expect(Object.keys(H).filter((k) => !k.startsWith("$") && !(k in E))).toEqual([]);
  });
});
