import { describe, expect, it } from "vitest";
import { parseIdeaRead } from "@/lib/frame/ideaRead";
import { parseBlob } from "@/lib/blobs/kinds";

const FIVE = [
  "Topic clarity: High. The question names one group and one outcome.",
  "Access: Medium. Two clinics have agreed in principle.",
  "Time: Medium. A semester is enough.",
  "Resources: Low. No recorder or transcription budget yet.",
  "Ethics: Medium. Minors need parental consent.",
  "Verdict: Go ahead, with two changes."
].join("\n");

describe("parseIdeaRead", () => {
  it("a five-line read shows each area with its rating, then the verdict", () => {
    const r = parseIdeaRead(FIVE)!;
    expect(r.lines[0]).toEqual({ area: "Topic clarity", rating: "High", why: "The question names one group and one outcome." });
    expect(r.lines[2]).toEqual({ area: "Time", rating: "Medium", why: "A semester is enough." });
    expect(r.lines.map((l) => l.rating)).toEqual(["High", "Medium", "Medium", "Low", "Medium"]);
    expect(r.verdict).toBe("Go ahead, with two changes.");
  });

  it("lines that begin with the literal word Area parse, with no area name (R15, OJ's live screenshot)", () => {
    const text = [
      "Area: High. The research question is specific.",
      "Area: Medium. Access depends on one school's head.",
      "Area: Low. Six weeks is short for interviews.",
      "Verdict: Proceed with these modifications."
    ].join("\n");
    const r = parseIdeaRead(text)!;
    expect(r.lines[0]).toEqual({ area: null, rating: "High", why: "The research question is specific." });
    expect(r.lines).toHaveLength(3);
    expect(r.verdict).toBe("Proceed with these modifications.");
  });

  it("an unparsable read is null (the text is shown as it came)", () => {
    expect(parseIdeaRead("This looks doable overall. Talk to your supervisor about ethics.")).toBeNull();
    expect(parseIdeaRead("")).toBeNull();
  });

  it("fewer than 3 rated lines is null, even with a verdict", () => {
    expect(parseIdeaRead("Time: Medium. Enough.\nAccess: High. Fine.\nVerdict: Go ahead.")).toBeNull();
  });

  it("a read with no verdict line keeps its lines and a null verdict; Windows line ends and spaces are fine", () => {
    const r = parseIdeaRead("  Time: Medium. A.\r\nAccess: High. B.\r\n\r\nEthics: Low.\r\nSome closing remark.")!;
    expect(r.lines).toEqual([
      { area: "Time", rating: "Medium", why: "A." },
      { area: "Access", rating: "High", why: "B." },
      { area: "Ethics", rating: "Low", why: "" }
    ]);
    expect(r.verdict).toBeNull();
  });
});

describe("idea_intake's read", () => {
  const base = { topic: "t", resources: "r", timeframe: "f", constraints: "c" };

  it("an intake with a read round-trips, and unknown keys inside the read are kept", () => {
    const v = { ...base, read: { text: FIVE, at: "2026-10-21T10:00:00.000Z", model: "later" } };
    expect(parseBlob("idea_intake", JSON.stringify(v))).toEqual(v);
  });

  it("an intake without a read still parses; a read of the wrong shape does not", () => {
    expect(parseBlob("idea_intake", JSON.stringify(base))).toEqual(base);
    expect(parseBlob("idea_intake", JSON.stringify({ ...base, read: { text: 3, at: "x" } }))).toBeNull();
  });
});
