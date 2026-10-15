import { describe, it, expect } from "vitest";
import { buildRecordText, type WritingRecord } from "../lib/writingRecord";

const stats = (typed: number, ai: number, passages = 0, kept = 0, edited = 0, unknown = 0) => ({ typed, ai, passages, kept, edited, unknown });
const rec: WritingRecord = {
  docs: [{ id: "a", title: "Essay", kind: "draft", stats: stats(30, 10, 2, 1, 1) }],
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
