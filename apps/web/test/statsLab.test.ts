import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdScan, pdScanV2, statsParseText } from "@appuscholar/core";
import { nameFromFile, parseSliced, scanSliced, semicolonsToTabs, skippedLines, looksSemicolon } from "../lib/tools/stats/intake";
import { applyPd, clearLab, getData, getLab, parse, resetLabs, setChoice, setName, setPdContext, setText, splitOnSemicolons, subscribeLab } from "../lib/tools/stats/lab";

/*
 * Task B1: the Statistics lab's store (ledger ruling R1: rows live in memory, in a module-level store keyed by project, never in a blob) and the
 * intake helpers that report what core's statsParseText drops without a word (register row D-W2-2).
 */

/** A semicolon table: `rows` data rows of an id, a score and a free-text answer, under a header row of names. */
function semicolonTable(rows: number, ragged: number[] = []): string {
  const out = ["id;score;answer"];
  for (let i = 1; i <= rows; i++) out.push(ragged.includes(i) ? `${i};${i % 50};too;many;fields` : `${i};${i % 50};answer ${i} about sleep`);
  return out.join("\n");
}

beforeEach(() => resetLabs());

describe("skippedLines: the rows core drops without telling the student", () => {
  it("lists the line of the pasted text of each row whose field count is not the header's, counting blank lines", () => {
    const text = "a,b\n1,2\n\n3\n4,5\n6,7,8\n9,10";
    const data = statsParseText(text)!;
    expect(data.rows).toHaveLength(3);
    expect(skippedLines(text, data)).toEqual({ count: 2, lines: [4, 6] });
  });
  it("is empty, without a second pass, when every row was kept", () => {
    const text = "a,b\n1,2\n3,4";
    expect(skippedLines(text, statsParseText(text)!)).toEqual({ count: 0, lines: [] });
  });
  it("follows the delimiter core chose: a tab when the first line has one", () => {
    const text = "a\tb\n1\t2\n3,4\n5\t6";
    expect(skippedLines(text, statsParseText(text)!)).toEqual({ count: 1, lines: [3] });
  });
  it("keeps the count when the list is long (the lines are capped, the count is not)", () => {
    const text = "a,b\n" + Array.from({ length: 3000 }, () => "1").join("\n");
    const s = skippedLines(text, statsParseText(text)!);
    expect(s.count).toBe(3000);
    expect(s.lines.length).toBeLessThanOrEqual(1000);
    expect(s.lines[0]).toBe(2);
  });
});

describe("semicolon files (v1 reads them as one column, register row F17)", () => {
  it("is offered only when the table came out as one column and its first line holds a semicolon", () => {
    expect(looksSemicolon("a;b\n1;2", statsParseText("a;b\n1;2"))).toBe(true);
    expect(looksSemicolon("a,b\n1,2", statsParseText("a,b\n1,2"))).toBe(false);
    expect(looksSemicolon("a;b,c\n1;2,3", statsParseText("a;b,c\n1;2,3"))).toBe(false); // two columns already: v1's reading stands
    expect(looksSemicolon("a\n1", statsParseText("a\n1"))).toBe(false);
    expect(looksSemicolon("", null)).toBe(false);
  });
  it("rewrites a semicolon table as a tab table, keeping a quoted semicolon inside its cell and dropping blank lines", () => {
    const out = semicolonsToTabs('name;note\n\nAsha;"likes; commas, too"\nRavi;"say ""hi"""\n');
    const data = statsParseText(out)!;
    expect(data.headers).toEqual(["name", "note"]);
    expect(data.rows).toEqual([["Asha", "likes; commas, too"], ["Ravi", 'say "hi"']]);
  });
  it("turns a tab inside a cell into a space, so it cannot split the cell", () => {
    const data = statsParseText(semicolonsToTabs("a;b\nx\ty;z"))!;
    expect(data.rows).toEqual([["x y", "z"]]);
  });
});

describe("nameFromFile (v1 statsUpload 9407)", () => {
  it("drops the extension and keeps 60 characters", () => {
    expect(nameFromFile("study1.survey.csv")).toBe("study1.survey");
    expect(nameFromFile("noext")).toBe("noext");
    expect(nameFromFile("x".repeat(80) + ".tsv")).toBe("x".repeat(60));
  });
});

describe("the lab store (R1)", () => {
  it("parses the pasted text into data kept in memory, with the columns, the scan and the default choices", async () => {
    setText("p1", "name,phone,score\nAsha Rao,9876543210,12\nRavi Kumar,9123456780,15\nMeena Iyer,9988776655,9\nJohn Paul,9012345678,11");
    const d = await parse("p1");
    expect(d!.rows).toHaveLength(4);
    expect(getData("p1")).toBe(d);
    const lab = getLab("p1");
    expect(lab.status).toEqual({ kind: "parsed" });
    expect(lab.scan!.found.map((f) => f.name)).toEqual(["name", "phone"]);
    expect(lab.choices).toEqual({ 0: "code", 1: "remove" }); // PD_DEFAULT: names are coded, phone numbers removed
    expect(lab.skipped).toEqual({ count: 0, lines: [] });
  });

  it("says so, and keeps what it had, when there is nothing to parse (v1 left the old data in place)", async () => {
    setText("p1", "a,b\n1,2");
    await parse("p1");
    setText("p1", "   \n  ");
    expect(await parse("p1")).toBeNull();
    expect(getLab("p1").status).toEqual({ kind: "empty" });
    expect(getData("p1")!.rows).toEqual([["1", "2"]]);
  });

  it("keeps each project's data apart, and a second read of the same project is the same object", async () => {
    setText("p1", "a\n1");
    setText("p2", "b\n2\n3");
    await parse("p1");
    await parse("p2");
    expect(getData("p1")!.rows).toHaveLength(1);
    expect(getData("p2")!.rows).toHaveLength(2);
    expect(getLab("p1")).toBe(getLab("p1"));
    expect(getData("nobody")).toBeNull();
  });

  it("tells the subscribers of that project and no other", () => {
    const a = vi.fn(), b = vi.fn();
    const offA = subscribeLab("p1", a);
    subscribeLab("p2", b);
    setName("p1", "Study 1");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    setName("p1", "Study 2");
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("lists the skipped rows after a parse", async () => {
    setText("p1", "a,b\n1,2\n3\n4,5");
    await parse("p1");
    expect(getLab("p1").skipped).toEqual({ count: 1, lines: [3] });
  });

  it("splits on semicolons only when asked, then parses the split table", async () => {
    setText("p1", "id;score\n1;10\n2;20\n3");
    expect((await parse("p1"))!.cols).toHaveLength(1);
    expect(getLab("p1").semicolons).toBe(true);
    const d = (await splitOnSemicolons("p1"))!;
    expect(d.headers).toEqual(["id", "score"]);
    expect(d.rows).toHaveLength(2);
    expect(getLab("p1").semicolons).toBe(false);
    expect(getLab("p1").skipped).toEqual({ count: 1, lines: [4] });
    expect(getLab("p1").status).toEqual({ kind: "split" });
  });

  it("clear() empties the text, the data and the notes but keeps the dataset name", async () => {
    setName("p1", "Study 1");
    setText("p1", "a\n1");
    await parse("p1");
    clearLab("p1");
    const lab = getLab("p1");
    expect([lab.text, lab.data, lab.scan, lab.status, lab.busy]).toEqual(["", null, null, { kind: "none" }, false]);
    expect(lab.name).toBe("Study 1");
  });

  describe("applyPd (v1 pdApply 9488)", () => {
    const text = "name,phone,score\nAsha Rao,9876543210,12\nRavi Kumar,9123456780,15\nMeena Iyer,9988776655,9\nJohn Paul,9012345678,11";
    it("rewrites the paste text, re-parses, and hands back the key file only when a column was coded", async () => {
      // No vault, so no list to wait for or to clash with: v1's fresh codes (with the list being read, or locked with a list in the project, they are not made: R51).
      setPdContext("p1", { list: null, state: "off", mode: null, saveFailed: false });
      setText("p1", text);
      await parse("p1");
      const r = (await applyPd("p1"))!;
      expect(r.keyCsv.split("\n")[0]).toBe("ParticipantCode,name");
      expect(r.keyCsv).toContain("P001,Asha Rao");
      expect(getLab("p1").text.split("\n")[0]).toBe("ParticipantCode,score");
      expect(getData("p1")!.headers).toEqual(["ParticipantCode", "score"]);
      expect(getLab("p1").pdResult).toEqual({ removed: 1, coded: 1, keyed: true });
    });
    it("makes no fresh codes for names while the list is being read, even for a code chosen before: the column is removed, as the box shows it (R51)", async () => {
      setText("p1", text); // no context set: the list has not been read
      await parse("p1");
      setChoice("p1", 0, "code");
      const r = (await applyPd("p1"))!;
      expect(r.keyCsv).toBe("");
      expect(getData("p1")!.headers).toEqual(["score"]);
      expect(getLab("p1").pdResult).toEqual({ removed: 2, coded: 0, keyed: false });
    });
    it("gives no key file when every flagged column is removed", async () => {
      setText("p1", text);
      await parse("p1");
      setChoice("p1", 0, "remove");
      const r = (await applyPd("p1"))!;
      expect(r.keyCsv).toBe("");
      expect(getLab("p1").pdResult).toEqual({ removed: 2, coded: 0, keyed: false });
      expect(getData("p1")!.headers).toEqual(["score"]);
    });
    it("changes nothing when every flagged column is kept", async () => {
      setText("p1", text);
      await parse("p1");
      setChoice("p1", 0, "keep");
      setChoice("p1", 1, "keep");
      expect(await applyPd("p1")).toBeNull();
      expect(getLab("p1").pdResult).toEqual({ unchanged: true });
      expect(getLab("p1").text).toBe(text);
    });
  });

  it("reads a 20,000-row semicolon table in slices: the event loop runs in between, the rows are all there, the skipped ones are listed", async () => {
    const text = semicolonTable(20000, [7, 9000, 19999]);
    setText("p1", text);
    expect((await parse("p1"))!.cols).toHaveLength(1); // v1's reading: one column
    // Deterministic: a budget of 0 ms makes every slice hand control back, whatever the machine's speed. A timer set before the read must run while the read is
    // still going (a macrotask is a turn the page gets), and the read must have handed control back more than once.
    let yields = 0;
    let timerRan = false;
    let ranBeforeFirstYield: boolean | null = null;
    setTimeout(() => { timerRan = true; }, 0);
    const t0 = performance.now();
    const p = splitOnSemicolons("p1", {
      budgetMs: 0,
      yieldNow: () => { yields++; if (ranBeforeFirstYield === null) ranBeforeFirstYield = timerRan; return new Promise<void>((r) => setTimeout(r, 0)); }
    });
    const d = (await p)!;
    const took = performance.now() - t0;
    expect(d.rows).toHaveLength(19997);
    expect(d).toEqual(statsParseText(semicolonsToTabs(text))); // the same as core's whole-table call
    expect(d.cols.map((c) => [c.name, c.type])).toEqual([["id", "numeric"], ["score", "numeric"], ["answer", "categorical"]]);
    expect(getLab("p1").skipped).toEqual({ count: 3, lines: [8, 9001, 20000] });
    expect(getLab("p1").busy).toBe(false);
    expect(took).toBeLessThan(2000);
    expect(yields).toBeGreaterThan(1); // the page got control back while the table was being read
    expect(ranBeforeFirstYield).toBe(false); // the timer had not run when the first slice finished, and has run since: the loop turned in between
    expect(timerRan).toBe(true);
  }, 30000);

  it("a newer parse wins: a slow one that is overtaken says nothing", async () => {
    setText("p1", semicolonTable(5000).replace(/;/g, ","));
    const slow = parse("p1", { budgetMs: 0, yieldNow: () => new Promise((r) => setTimeout(r, 5)) });
    setText("p1", "a\n1");
    const fast = await parse("p1");
    expect(fast!.rows).toEqual([["1"]]);
    expect(await slow).toBeNull();
    expect(getData("p1")!.rows).toEqual([["1"]]);
    expect(getLab("p1").busy).toBe(false);
  });
});

// core's own goldens: every table of the intake and pdscan corpora (the corpus.json of each folder in packages/core/test/golden).
const GOLDEN = join(__dirname, "../../../packages/core/test/golden");
const corpus = (dir: string): Array<{ id: string; text: string }> => JSON.parse(readFileSync(join(GOLDEN, dir, "corpus.json"), "utf8"));
const NOW = () => Promise.resolve();

describe("parseSliced and scanSliced equal core's whole-table calls", () => {
  const intake = corpus("intake");
  const pd = corpus("pdscan");
  it("reads core's intake corpus the same way at one line a slice", async () => {
    expect(intake.length).toBeGreaterThanOrEqual(40);
    for (const c of intake) expect(await parseSliced(c.text, { slice: 1, budgetMs: 0, yieldNow: NOW }), c.id).toEqual(statsParseText(c.text));
  });
  it("reads core's intake corpus the same way at the default slice", async () => {
    for (const c of intake) expect(await parseSliced(c.text), c.id).toEqual(statsParseText(c.text));
  });
  it("scans core's pdscan corpus the same way, a column at a time", async () => {
    expect(pd.length).toBeGreaterThanOrEqual(40);
    for (const c of pd) {
      const data = statsParseText(c.text);
      if (!data) continue;
      // pdScanV2 (F1: a column the values alone call names is not flagged when an answer has more than four words), which is v1's pdScan everywhere else.
      expect(await scanSliced(data, { budgetMs: 0, yieldNow: NOW }), c.id).toEqual(pdScanV2(data));
    }
  });
  it("is v1's scan on every table of the corpus where no name column is dropped (F1 changes nothing else)", async () => {
    let same = 0;
    for (const c of pd) {
      const data = statsParseText(c.text);
      if (!data) continue;
      const sliced = await scanSliced(data);
      if (JSON.stringify(sliced) === JSON.stringify(pdScan(data))) same++;
      else expect(sliced!.found.length, c.id).toBeLessThan(pdScan(data).found.length);
    }
    expect(same).toBeGreaterThan(pd.length / 2);
  });
  it("puts Col<n> back for a blank heading", async () => {
    const data = statsParseText("a,,c\nx,y@mail.org,1\nz,w@mail.org,2\nq,r@mail.org,3")!;
    expect(await scanSliced(data)).toEqual(pdScanV2(data));
    expect(pdScan(data).found[0]!.name).toBe("Col2");
  });
});
