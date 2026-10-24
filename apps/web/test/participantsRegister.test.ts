import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The deviation register's rows for the participant list (spec 2026-10-24-participants-design.md §9: every departure from v1 gets a row from D-S2-113). The register is a table of eight
 * cells a row, with no `|` inside a cell (docs/superpowers/specs/parity-deviations.md, "Adding a row"); this reads it as a file and checks the nine rows are all there, one after the other,
 * each with all eight cells filled and a status the register knows, and that an approver cell that names OJ gives the day and where the ruling is written, not words put in his mouth (no quotation marks).
 */

const FILE = join(__dirname, "../../../docs/superpowers/specs/parity-deviations.md");
const lines = readFileSync(FILE, "utf8").split("\n");
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const header = cells(lines.find((l) => l.startsWith("| id |"))!);
const rowOf = (id: string) => lines.filter((l) => l.startsWith(`| ${id} |`));
const FIRST = 113;
const LAST = 121;
const STATUSES = ["proposed", "approved", "rejected", "noted"];

describe("the deviation register: D-S2-113 to D-S2-121", () => {
  it("has eight columns", () => {
    expect(header).toEqual(["id", "where (v1 line → core module)", "v1 behaviour", "v2 behaviour or proposal", "why", "status", "approver and date", "pinned by"]);
  });

  it("holds every id from 113 to 121 once, in order, one row after the other", () => {
    const ids = lines.map((l) => /^\| (D-S2-\d+) \|/.exec(l)?.[1]).filter((x): x is string => !!x);
    expect(new Set(ids).size, "ids are unique").toBe(ids.length);
    // Only these nine are pinned: a later feature's rows (D-S2-122 and on) follow them and do not break this.
    const mine = ids.filter((id) => { const n = Number(id.slice("D-S2-".length)); return n >= FIRST && n <= LAST; });
    expect(mine).toEqual(Array.from({ length: LAST - FIRST + 1 }, (_, i) => `D-S2-${FIRST + i}`));
    const at = mine.map((id) => lines.findIndex((l) => l.startsWith(`| ${id} |`)));
    at.forEach((n, i) => { if (i > 0) expect(n, mine[i]).toBe(at[i - 1]! + 1); });
  });

  it("has all eight cells filled in each row, and a known status", () => {
    for (let n = FIRST; n <= LAST; n++) {
      const id = `D-S2-${n}`;
      const rows = rowOf(id);
      expect(rows, id).toHaveLength(1);
      const c = cells(rows[0]!);
      expect(c, id).toHaveLength(header.length);
      c.forEach((cell, i) => expect(cell, `${id}, ${header[i]}`).not.toBe(""));
      expect(STATUSES, id).toContain(c[5]);
    }
  });

  it("D-S2-116 names OJ, the day, that it was approved in chat and the ruling, and does not quote him", () => {
    const c = cells(rowOf("D-S2-116")[0]!);
    expect(c[5]).toBe("approved");
    expect(c[6]).toBe("OJ, 2026-10-24: approved in chat (spec 2026-10-24-participants-design.md §3, ruling 3)");
  });

  it("no approver cell puts quotation marks round words: OJ's approval is cited by its day and the spec's ruling, not quoted", () => {
    for (let n = 116; n <= LAST; n++) expect(cells(rowOf(`D-S2-${n}`)[0]!)[6], `D-S2-${n}`).not.toMatch(/["“”]/);
  });

  it("an approved row names who approved it and when", () => {
    for (let n = FIRST; n <= LAST; n++) {
      const c = cells(rowOf(`D-S2-${n}`)[0]!);
      if (c[5] === "approved") expect(c[6], `D-S2-${n}`).toMatch(/2026-10-24/);
    }
  });
});
