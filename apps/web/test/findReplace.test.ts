import { describe, expect, it } from "vitest";
import { findAll, replaceAllText } from "../lib/editor/findReplace";
import { parseTableSize } from "../lib/editor/tableSize";

describe("findAll", () => {
  it("finds every match, case-insensitive by default", () => {
    expect(findAll("Sleep, sleep and SLEEP", "sleep")).toEqual([{ start: 0, end: 5 }, { start: 7, end: 12 }, { start: 17, end: 22 }]);
  });
  it("can be case-sensitive", () => {
    expect(findAll("Sleep, sleep", "sleep", { caseSensitive: true })).toEqual([{ start: 7, end: 12 }]);
  });
  it("does not report overlapping matches: aaa holds one aa", () => {
    expect(findAll("aaa", "aa")).toEqual([{ start: 0, end: 2 }]);
  });
  it("treats the query as plain text, not a pattern", () => {
    expect(findAll("p < .05 (n = 12)", "(n = 12)")).toEqual([{ start: 8, end: 16 }]);
    expect(findAll("abc", ".")).toEqual([]);
  });
  it("finds nothing for an empty query", () => {
    expect(findAll("abc", "")).toEqual([]);
  });
});

describe("replaceAllText", () => {
  it("replaces every match and counts them", () => {
    expect(replaceAllText("a b a", "a", "x")).toEqual({ text: "x b x", count: 2 });
  });
  it("does not rescan its own replacement or an overlap", () => {
    expect(replaceAllText("aaa", "aa", "a")).toEqual({ text: "aa", count: 1 });
  });
  it("inserts $ literally", () => {
    expect(replaceAllText("cost", "cost", "$&$1")).toEqual({ text: "$&$1", count: 1 });
  });
  it("returns the text unchanged when nothing matches", () => {
    expect(replaceAllText("abc", "z", "y")).toEqual({ text: "abc", count: 0 });
  });
});

describe("parseTableSize", () => {
  it("reads rows x columns", () => {
    expect(parseTableSize("3x4")).toEqual({ rows: 3, cols: 4 });
    expect(parseTableSize(" 5 × 2 ")).toEqual({ rows: 5, cols: 2 });
    expect(parseTableSize("6X3")).toEqual({ rows: 6, cols: 3 });
  });
  it("clamps to 30 rows and 12 columns, and at least 1", () => {
    expect(parseTableSize("99x99")).toEqual({ rows: 30, cols: 12 });
    expect(parseTableSize("0x0")).toEqual({ rows: 1, cols: 1 });
  });
  it("rejects anything else", () => {
    expect(parseTableSize("three by four")).toBeNull();
    expect(parseTableSize("")).toBeNull();
  });
});
