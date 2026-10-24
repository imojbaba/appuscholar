// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { dayAfter, firstWords, recapFacts, type RecapApi } from "@/lib/help/recap/facts";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime();
const SINCE = NOW - 8 * DAY;

function api(over: Partial<RecapApi> = {}): RecapApi {
  return {
    since: SINCE, now: NOW, loadedAt: NOW - 3000, aiCountable: true, vaultOpen: true,
    project: { name: "Sleep and exams" },
    openDoc: { title: "Draft one", words: 420 },
    documents: [{ createdAt: new Date(SINCE - DAY).toISOString(), updatedAt: new Date(SINCE - DAY).toISOString() }],
    aiRows: async () => [],
    testTimes: async () => [],
    lastDoc: async () => null,
    answer: null,
    ...over
  };
}

describe("recap facts: what v2 can state from the account", () => {
  it("days away, the project, and the open document with its words", async () => {
    const f = await recapFacts(api());
    expect(f.days).toBe(8);
    expect(f.project).toEqual({ name: "Sleep and exams" });
    expect(f.doc).toEqual({ title: "Draft one", words: 420 });
  });

  it("counts documents made since the last visit from their createdAt, and no others", async () => {
    const f = await recapFacts(api({
      documents: [
        { createdAt: new Date(SINCE - 1000).toISOString(), updatedAt: new Date(NOW).toISOString() },
        { createdAt: new Date(SINCE + 1000).toISOString(), updatedAt: new Date(SINCE + 1000).toISOString() },
        { createdAt: new Date(NOW - DAY).toISOString(), updatedAt: new Date(NOW - DAY).toISOString() }
      ]
    }));
    expect(f.counts.docs).toBe(2);
  });

  it("does not count a document made after this page loaded (the shell makes a first document on load)", async () => {
    const f = await recapFacts(api({
      loadedAt: NOW - 3000,
      documents: [
        { createdAt: new Date(NOW - 3000).toISOString(), updatedAt: new Date(NOW).toISOString() },
        { createdAt: new Date(NOW - 2900).toISOString(), updatedAt: new Date(NOW).toISOString() },
        { createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() }
      ]
    }));
    expect(f.counts.docs).toBe(1);
  });

  it("a document list that was not read leaves the count out, so 'nothing was found' is never said over a failed load", async () => {
    const f = await recapFacts(api({ documents: null }));
    expect("docs" in f.counts).toBe(false);
    expect(f.nothingCounted).toBe(false);
  });

  it("counts AI requests from the log, asking only from the day after the last visit's day, and test runs by their times", async () => {
    const aiRows = vi.fn(async () => [{ d: "2026-10-18" }, { d: "2026-10-20" }, { d: "2026-10-21" }]);
    const f = await recapFacts(api({ aiRows, testTimes: async () => [SINCE - 5, SINCE + 5, NOW - 1] }));
    expect(aiRows).toHaveBeenCalledWith(dayAfter(SINCE));
    expect(f.counts.ai).toBe(3);
    expect(f.counts.tests).toBe(2);
  });

  it("dayAfter is the local calendar day after the given time, as YYYY-MM-DD", () => {
    expect(dayAfter(new Date(2026, 9, 16, 23, 30).getTime())).toBe("2026-10-17");
    expect(dayAfter(new Date(2026, 11, 31, 8, 0).getTime())).toBe("2027-01-01");
  });

  it("omits what it cannot count, never a zero: a read that fails, a locked stats record, a log that is switched off or not about this project", async () => {
    const f = await recapFacts(api({ aiRows: async () => { throw new Error("down"); }, testTimes: async () => null, documents: [] }));
    expect(f.counts).toEqual({ docs: 0 });
    expect("ai" in f.counts).toBe(false);
    expect("tests" in f.counts).toBe(false);
    expect(f.nothingCounted).toBe(false);
    const off = await recapFacts(api({ aiCountable: false }));
    expect("ai" in off.counts).toBe(false);
    expect(off.nothingCounted).toBe(false);
  });

  it("nothingCounted is true only when every count was read and each is zero", async () => {
    expect((await recapFacts(api())).nothingCounted).toBe(true);
    expect((await recapFacts(api({ aiRows: async () => [{ d: "2026-10-20" }] }))).nothingCounted).toBe(false);
  });

  it("never lists sources added or passages coded (v2 keeps no times for them)", async () => {
    const f = await recapFacts(api());
    expect(Object.keys(f.counts).sort()).toEqual(["ai", "docs", "tests"]);
  });

  it("with the vault locked, no document text is read and none is returned; titles stay null", async () => {
    const lastDoc = vi.fn(async () => ({ at: NOW, text: "Private words about participants" }));
    const f = await recapFacts(api({ vaultOpen: false, lastDoc, project: { name: null }, openDoc: { title: null, words: 12 } }));
    expect(lastDoc).not.toHaveBeenCalled();
    expect(f.wrote).toBeNull();
    expect(f.project?.name).toBeNull();
    expect(f.doc?.title).toBeNull();
    expect(JSON.stringify(f)).not.toContain("Private words");
  });

  it("with the vault open, the first words of the last-edited document are returned", async () => {
    const f = await recapFacts(api({ lastDoc: async () => ({ at: NOW - DAY, text: "One two three" }) }));
    expect(f.wrote).toEqual({ at: NOW - DAY, text: "One two three" });
  });

  it("a document read that fails is left out and the rest still shows", async () => {
    const f = await recapFacts(api({ lastDoc: async () => { throw new Error("nope"); } }));
    expect(f.wrote).toBeNull();
    expect(f.days).toBe(8);
  });

  it("carries the previous answer from this device", async () => {
    const f = await recapFacts(api({ answer: { t: SINCE, text: "Does sleep help?" } }));
    expect(f.answer).toEqual({ t: SINCE, text: "Does sleep help?" });
  });

  it("no project and no open document give no such lines", async () => {
    const f = await recapFacts(api({ project: null, openDoc: null }));
    expect(f.project).toBeNull();
    expect(f.doc).toBeNull();
  });
});

describe("firstWords", () => {
  it("strips markup, keeps the first words and marks a cut", () => {
    expect(firstWords("<p>Hello <b>there</b> friend</p>", 2)).toBe("Hello there…");
    expect(firstWords("<p>Short</p>", 5)).toBe("Short");
    expect(firstWords("<p></p>", 5)).toBe("");
  });
  it("never lets a script or an event handler through as text", () => {
    expect(firstWords("<p onclick='x()'>Fine</p><script>alert(1)</script>", 5)).toBe("Fine");
  });
});
