// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@appuscholar/core";
import { GUIDE } from "@/lib/help/guide/content";
import { DICTS, plainText } from "@/lib/i18n";

/*
 * Task C1: the Guide's 26 sections. v1's GUIDE (index.html build 2026.10.24a, lines 10591-10785) in v1's order, ids, groups and titles. Each section's
 * text is v1's, except where it said work, keys, backups, the AI-use log, offline use or installation were on "this browser" or "this computer" (untrue
 * in v2, where work is saved in the student's account) or named a button or place v2 does not have. Every such change is a row in
 * docs/superpowers/specs/wave-c-rows/c1.md.
 */

const V1: ReadonlyArray<readonly [string, "Begin" | "Tools" | "Practice" | "Help", string]> = [
  ["start", "Begin", "Your first ten minutes"],
  ["stages", "Begin", "The six stages"],
  ["editor", "Tools", "The writing area and its buttons"],
  ["idea", "Tools", "Idea & Feasibility"],
  ["research", "Tools", "Research (finding papers)"],
  ["shelf", "Tools", "Reading shelf"],
  ["offline", "Help", "Using Appuscholar offline and installing it"],
  ["psych", "Tools", "Research helpers"],
  ["design", "Tools", "Design & Ethics"],
  ["aiuse", "Tools", "AI-use statement"],
  ["stats", "Tools", "Statistics Lab"],
  ["scales", "Tools", "Scale library"],
  ["numcheck", "Tools", "Check the numbers in my document"],
  ["charts", "Tools", "Charts"],
  ["pictures", "Tools", "Pictures and captions"],
  ["qual", "Tools", "Qualitative Coding"],
  ["style", "Tools", "My Writing Style"],
  ["cite", "Tools", "Citation Manager"],
  ["appu", "Help", "Ask Appu (the guide helper)"],
  ["chat", "Tools", "Ask Appuscholar"],
  ["slides", "Tools", "Make PPT"],
  ["data", "Practice", "Handling participant data"],
  ["habits", "Practice", "Habits that keep your own thinking in the work"],
  ["never", "Practice", "What Appuscholar will not do"],
  ["faq", "Help", "Questions people ask"],
  ["gloss", "Help", "Glossary"]
];

/** The exact v1 phrases that are untrue in v2, as found while porting (compared without regard to case). */
const UNTRUE_IN_V2 = [
  // Where the key, the work and the log are kept (v2: this browser or locked under the passphrase in the account; work and the log in the account).
  "The key stays in this browser",
  "Your work lives only in this browser",
  "Everything lives in this browser",
  "only in this browser",
  "private log of this in your browser",
  "knows only about Appuscholar in this browser",
  "removes it from this computer",
  "keeps only the extracted text, on this computer",
  "nothing is uploaded",
  "stays in the browser it was made in",
  "never leaves your computer",
  "stored on your computer",
  // Backups (v2: Export all my work, a locked backup, and the shelf's own backup; the shelf is saved in the account).
  "clearing your browser data erases it",
  "the normal Backup does not include it",
  "Clearing site data, switching browsers or moving to another computer removes it",
  "Use Backup every week",
  "Use Backup to move work between them",
  "Download a backup of your projects every week",
  // Offline and installation (v2 does not work offline beyond showing the last page).
  "keeps a copy of itself and its libraries on your device",
  "Next time it opens with no connection",
  "While offline, writing, citations, statistics",
  // Saving and sending (v2 saves the text in the account as you write).
  "It does not send your text anywhere until you press an AI button",
  "because the browser gives Appuscholar only about 5 MB in all",
  "When storage passes about 80%",
  // Names v2 does not have.
  "AI Provider / Key",
  "New Research Project",
  "left menu",
  "Open Statistics Lab",
  "Assess feasibility",
  "Statistics & Charts",
  "Statistics panel",
  "Research panel",
  // Statements v2 cannot make true.
  "Drafts the cover note",
  "such as a two-way ANOVA or multiple regression, needs another program"
];

/** Pictographs, symbols and the joiners that make an emoji, from the Unicode data (this catches the gear, book, sparkle and plus signs v1's copy used). */
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍⃣]/u;
const EM_DASH = /[\u2014\u2015]/;

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the Guide's content (Task C1)", () => {
  it("has v1's 26 ids in order with v1's groups and titles", () => {
    expect(GUIDE.map((s) => [s.id, s.group, s.title])).toEqual(V1.map((v) => [...v]));
    expect(GUIDE).toHaveLength(26);
  });

  it("gives every section a title, keywords and non-empty html, and no id twice", () => {
    for (const s of GUIDE) {
      expect(s.title.trim(), s.id).not.toBe("");
      expect(s.keywords.trim(), s.id).not.toBe("");
      expect(text(s.html).trim().length, s.id).toBeGreaterThan(40);
    }
    expect(new Set(GUIDE.map((s) => s.id)).size).toBe(GUIDE.length);
  });

  it("holds none of the v1 phrases that are untrue in v2", () => {
    for (const s of GUIDE) {
      const haystack = (text(s.html) + " " + s.html).toLowerCase();
      for (const phrase of UNTRUE_IN_V2) expect(haystack.includes(phrase.toLowerCase()), `${s.id}: "${phrase}"`).toBe(false);
    }
  });

  it("says where work and the key are kept, in the sections that describe them", () => {
    const html = (id: string) => GUIDE.find((s) => s.id === id)!.html;
    expect(html("start")).toMatch(/in your account/);
    expect(html("faq")).toMatch(/saved in your account/);
    expect(html("habits")).toMatch(/saved in your account/);
    expect(html("never")).toMatch(/saved in your account/);
    expect(html("shelf")).toMatch(/in your account/);
    expect(html("aiuse")).toMatch(/in your account/);
    // The app does not work offline in v2 beyond showing the last page, and the section says so.
    expect(html("offline")).toMatch(/needs a connection/);
    expect(html("offline")).toMatch(/You are offline\. Your last page is on screen, but saving, AI, paper search and new pages need a connection\./);
  });

  it("names the buttons and places v2 has, so a student can follow the steps", () => {
    const html = (id: string) => GUIDE.find((s) => s.id === id)!.html;
    expect(html("start")).toContain("<b>AI: add your key</b>");
    expect(html("start")).toContain("<b>Check if it is doable</b>");
    expect(html("start")).toContain("<b>Save as my project</b>");
    expect(html("faq")).toContain("<b>Export all my work</b>");
    expect(html("aiuse")).toContain("<b>Erase the log</b>");
    expect(html("stats")).toContain("<b>Sample size</b> tab");
    expect(html("slides")).toContain("<b>Generate slide preview</b>");
  });

  it("spells each button and tab it names exactly as v2's own copy does", () => {
    // [section, the label in bold, the key of v2's copy that holds it]. Buttons other wave C tasks add (Guide, Locked backup, Erase the log, Install) are not in this branch's copy.
    const LABELS: ReadonlyArray<readonly [string, string, string]> = [
      ["start", "AI: add your key", "ai_pill_nokey"], ["start", "Menu", "hdr_menu"], ["start", "Save Key", "settings_savekey_btn"],
      ["start", "Test my AI connection", "aitest_btn"], ["start", "How should this key be stored?", "settings_keymode_label"],
      ["start", "New project", "projects_new"], ["start", "Your projects", "list_title"], ["start", "Check if it is doable", "idea_check_btn"],
      ["start", "Save as my project", "idea_save_btn"], ["start", "Literature", "stage_name_lit"], ["start", "Find", "tab_name_find"],
      ["start", "Collection and analysis", "stage_name_collect"], ["start", "Statistics", "tab_name_data"], ["start", "Parse data", "stats_data_parse"],
      ["start", "Which test fits my data?", "stats_guide_title"], ["start", "Open the guide", "stats_guide_open"], ["start", "Help", "hdr_help"],
      ["stages", "Idea", "stage_name_idea"], ["stages", "Literature", "stage_name_lit"], ["stages", "Design and ethics", "stage_name_design"],
      ["stages", "Collection and analysis", "stage_name_collect"], ["stages", "Writing", "stage_name_writing"], ["stages", "Review", "stage_name_review"],
      ["editor", "Viva question", "viva_btn"],
      ["research", "Find", "tab_name_find"], ["research", "Find relevant papers", "research_find_btn"],
      ["shelf", "Reading list", "tab_name_reading"], ["shelf", "Add PDFs", "sh2_add_pdfs"], ["shelf", "Export all my work", "acct_export"],
      ["shelf", "Back up the shelf", "sh2_back_up_the_shelf"], ["shelf", "Restore a shelf backup", "sh2_restore_a_shelf_backup"],
      ["psych", "Research helpers", "writing_helpers"],
      ["design", "Design and ethics", "stage_name_design"], ["design", "Overview", "tab_name_overview"],
      ["aiuse", "AI-use statement", "tab_name_aiuse"], ["aiuse", "Build the statement", "design_aiu_build"], ["aiuse", "Keep the AI-use log", "design_aiu_keep"],
      ["stats", "Statistics", "tab_name_data"], ["stats", "Sample size", "tab_name_power"],
      ["scales", "Scales", "tab_name_scales"], ["numcheck", "Check numbers", "tab_name_check"], ["numcheck", "Check the numbers in my document", "stats_check_nc_run"],
      ["charts", "Charts", "tab_name_charts"], ["qual", "Coding", "tab_name_coding"], ["style", "My style", "tab_name_style"], ["cite", "Citations", "tab_name_citations"],
      ["chat", "Chat", "writing_chat"], ["chat", "Insert into document", "chat_panel_desc"],
      ["slides", "Make PPT", "tab_name_slides"], ["slides", "Generate slide preview", "slides_generate_btn"],
      ["habits", "Export all my work", "acct_export"], ["faq", "Export all my work", "acct_export"]
    ];
    for (const [id, label, key] of LABELS) {
      expect(GUIDE.find((s) => s.id === id)!.html, `${id}: <b>${label}`).toContain("<b>" + label);
      expect(plainText(DICTS.en[key] ?? ""), `${key} holds "${label}"`).toContain(label);
    }
  });

  it("leaves every section's html unchanged by sanitizeHtml, so the Guide never draws anything the app would strip", () => {
    for (const s of GUIDE) expect(sanitizeHtml(s.html), s.id).toBe(s.html);
  });

  it("never says a study is exempt", () => {
    for (const s of GUIDE) {
      expect(/exempt/i.test(s.html), s.id).toBe(false);
      expect(/exempt/i.test(s.keywords + " " + s.title), s.id).toBe(false);
    }
  });

  it("holds no em-dash and no emoji or pictograph in a title, keywords or html", () => {
    for (const s of GUIDE) {
      for (const [part, value] of [["title", s.title], ["keywords", s.keywords], ["html", s.html]] as const) {
        expect(EM_DASH.test(value), `${s.id} ${part} em-dash`).toBe(false);
        expect(EMOJI.test(value), `${s.id} ${part} emoji`).toBe(false);
      }
    }
  });

  it("uses no tag or attribute the sanitizer drops (no definition list, no script, no event handler)", () => {
    for (const s of GUIDE) {
      expect(/<(dl|dt|dd|script|style|iframe|form|input|svg)\b/i.test(s.html), s.id).toBe(false);
      expect(/\son[a-z]+\s*=/i.test(s.html), s.id).toBe(false);
    }
  });
});
