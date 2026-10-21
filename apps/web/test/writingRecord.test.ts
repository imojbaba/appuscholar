import { describe, it, expect } from "vitest";
import { buildAllRecordText, buildRecordText, openRecordTitles, type WritingRecord } from "../lib/writingRecord";
import type { OpenedTitle, Titled } from "../lib/vault/titles";

const stats = (typed: number, ai: number, passages = 0, kept = 0, edited = 0, unknown = 0) => ({ typed, ai, passages, kept, edited, unknown });
const rec: WritingRecord = {
  docs: [{ id: "a", title: "Essay", titleKeyVersion: 0, deks: [], kind: "draft", stats: stats(30, 10, 2, 1, 1) }],
  sources: [{ title: "Paper", words: 120 }],
  weekly: [{ weekStart: "2026-10-05", typed: 20, ai: 0 }, { weekStart: "2026-10-12", typed: 30, ai: 10 }],
  aiLog: { byKind: { "grammar and polish": 3, "continuing my draft": 1 }, byService: { "Groq (llama-3.3)": 3, "Google Gemini": 1 }, total: 4, firstAt: "2026-10-05", lastAt: "2026-10-16", loggingOff: false }
};

describe("buildRecordText", () => {
  const text = buildRecordText(rec, "abc1234", "2026-10-16");
  it("has the header with the build, the date and the not-a-detector sentence", () => {
    expect(text).toContain("WRITING-PROCESS RECORD (made with Appuscholar, abc1234)\nDate: 2026-10-16");
    expect(text).toContain("It is not an AI detector.");
  });
  it("lists words by origin, the per-document line, sources, the weekly picture and the AI-use log", () => {
    expect(text).toContain("WORDS BY ORIGIN");
    expect(text).toContain("Typed in the editor: 30 (75%)\nInserted from an AI suggestion or chat: 10 (25%)");
    expect(text).toContain("- Essay: 40 words, 75% typed; 2 AI passages (1 left as inserted, 1 edited later)");
    expect(text).toContain("(not counted above): 1, 120 words.");
    expect(text).toContain("- week of 2026-10-12: 75% typed of 40 words");
    expect(text).toContain("- grammar and polish: 3");
    expect(text).toContain("4 requests from 5 October 2026 to 16 October 2026.");
    expect(text).toContain("Services used: Groq (llama-3.3) 3; Google Gemini 1.");
  });
  it("says it in the v1 wording when the AI-use log is switched off", () => {
    const off = buildRecordText({ ...rec, aiLog: { ...rec.aiLog, loggingOff: true } }, "dev", "2026-10-16");
    expect(off).toContain("Logging is switched off for this account, so this part is empty by choice.");
    expect(off).not.toContain("Services used");
  });
  it("uses the account wording, not the browser one", () => {
    expect(text).toContain("A count, kept under the student's account, of words typed");
    expect(text).toContain("It can be edited by the student, so it supports an honest account");
    expect(text).not.toContain("browser");
  });
  it("ends with the declared-samples header and the LIMITS line", () => {
    expect(text).toContain("DECLARED WRITING SAMPLES\n(none declared yet)");
    expect(text).toContain("A student who retypes AI text by hand is counted as the author of those words");
  });
  it("says so when nothing was written and drops the weekly picture under two weeks", () => {
    const empty = buildRecordText({ docs: [], sources: [], weekly: [{ weekStart: "2026-10-12", typed: 1, ai: 0 }], aiLog: { byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false } }, "dev", "2026-10-16");
    expect(empty).toContain("No writing recorded yet.");
    expect(empty).not.toContain("WEEKLY PICTURE");
    expect(empty).toContain("No AI requests logged.");
  });
});

describe("buildAllRecordText", () => {
  it("writes the header, the AI-use log and the closing sections once, and each project's words under its title", () => {
    const other: WritingRecord = { ...rec, docs: [{ id: "b", title: "Notes", titleKeyVersion: 0, deks: [], kind: "draft", stats: stats(5, 0) }], sources: [], weekly: [] };
    const text = buildAllRecordText([{ title: "Thesis", rec }, { title: "Scratch", rec: other }], "abc1234", "2026-10-16");
    for (const once of ["WRITING-PROCESS RECORD", "WHAT THIS IS", "AI-USE LOG", "4 requests from", "DECLARED WRITING SAMPLES", "LIMITS"]) expect(text.split(once)).toHaveLength(2);
    expect(text.split("WORDS BY ORIGIN")).toHaveLength(3);
    expect(text).toContain("Thesis\n======\n\nWORDS BY ORIGIN");
    expect(text).toContain("- Essay: 40 words");
    expect(text).toContain("Scratch\n=======\n\nWORDS BY ORIGIN");
    expect(text).toContain("- Notes: 5 words, 100% typed");
    expect(text.indexOf("- Notes")).toBeLessThan(text.indexOf("AI-USE LOG"));
  });
  it("is the single record's text, with the project heading, for one project", () => {
    const one = buildAllRecordText([{ title: "Essay", rec }], "abc1234", "2026-10-16");
    expect(one.replace("Essay\n=====\n\n", "")).toBe(buildRecordText(rec, "abc1234", "2026-10-16"));
  });
});

describe("openRecordTitles", () => {
  it("the writing record shows opened document titles", async () => {
    const dek = { v: 1, wrapped: "w" };
    const sealed: WritingRecord = { ...rec, docs: [
      { id: "a", title: "ct:Essay", titleKeyVersion: 1, deks: [dek], kind: "draft", stats: stats(30, 10, 2, 1, 1) },
      { id: "b", title: "ct:broken", titleKeyVersion: 1, deks: [dek], kind: "draft", stats: stats(5, 0) },
      { id: "c", title: "Plain", titleKeyVersion: 0, deks: [], kind: "draft", stats: stats(1, 0) }
    ] };
    // Opens the way the vault does: a document's title under its own id; "broken" does not open.
    const seen: string[] = [];
    const open = async (t: Titled, keyId: string): Promise<OpenedTitle> => {
      seen.push(keyId);
      if (t.titleKeyVersion === 0) return { state: "open", text: t.title };
      return t.title === "ct:broken" ? { state: "unreadable" } : { state: "open", text: t.title.slice(3) };
    };
    const text = buildRecordText(await openRecordTitles(sealed, open, "untitled"), "abc1234", "2026-10-16");
    expect(seen).toEqual(["a", "b", "c"]);
    expect(text).toContain("- Essay: 40 words");
    expect(text).toContain("- untitled: 5 words");
    expect(text).toContain("- Plain: 1 words");
    expect(text).not.toContain("ct:");
  });
});
