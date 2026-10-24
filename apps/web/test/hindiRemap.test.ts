import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE_COMMIT, STATUS, buildSheet, readBaseFromGit, renderSheet } from "../scripts/hindi-remap-sheet.mjs";

// Task 39: docs/i18n/wave-b-hindi-remap.md lists what Dr. Sharma must re-map into Hindi after wave B.
// The sheet is a snapshot: these tests run against two pinned files (scripts/fixtures/wave-b-base.json and wave-b-head.json), never the live
// messages/, so other sessions editing the dictionaries cannot turn them red. Refresh with `pnpm --filter @appuscholar/web i18n:remap`;
// `node scripts/hindi-remap-sheet.mjs --check` (live dictionaries against the pinned head and the sheet) is the CI command, not a test.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const SHEET = here("../../../docs/i18n/wave-b-hindi-remap.md");
const HEAD = here("../scripts/fixtures/wave-b-head.json");
const SNAPSHOT = here("../scripts/fixtures/wave-b-base.json");
const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { base: string; keys: Record<string, [string, string]> };
const head = JSON.parse(readFileSync(HEAD, "utf8")) as { head: string; keys: Record<string, [string, string | null]>; tools: Record<string, Record<string, [string, string | null]>> };
const sheet = () => readFileSync(SHEET, "utf8");

function baseReachable(): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${BASE_COMMIT}^{commit}`], { cwd: here("./"), stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("the Hindi re-map sheet (wave B)", () => {
  it("the sheet regenerates byte for byte", () => {
    expect(sheet()).toBe(buildSheet());
  });

  it("every key whose English changed in wave B is in the sheet", () => {
    // Computed here from the two pinned snapshots alone, not through the generator's own filter.
    const changedOrAdded = Object.keys(head.keys).filter(k => !(k in snapshot.keys) || snapshot.keys[k]![0] !== head.keys[k]![0]);
    const text = sheet();
    const missing = changedOrAdded.filter(k => !text.includes(`\n| \`${k}\` |`));
    expect(missing).toEqual([]);
    // and the sheet lists no other dictionary key
    const mainRows = text.split("\n## ").find(s => s.startsWith("Main dictionary"))!.split("\n").filter(l => l.startsWith("| `")).length;
    expect(mainRows).toBe(changedOrAdded.length);
  });

  it("lists every tool-file string of the head snapshot", () => {
    const text = sheet().split("\n## ").find(s => s.startsWith("Tool message files"))!;
    const rows = text.split("\n").filter(l => /^\| \w+ \| `/.test(l)).length;
    expect(rows).toBe(Object.values(head.tools).reduce((n, f) => n + Object.keys(f).length, 0));
  });

  it("the header carries the counts the work is costed from", () => {
    const text = sheet();
    expect(Object.keys(snapshot.keys).length).toBe(1141);
    expect(Object.values(snapshot.keys).filter(([e, h]) => e === h).length).toBe(366);
    expect(text).toContain("Keys at the base: 1,141");
    expect(text).toContain(`commit \`${head.head}\``);
    expect(text).toContain("Hindi values that were English copies at the base: 366");
  });

  it("gives each changed or added key one status", () => {
    const text = renderSheet({
      base: "x", head: "y",
      baseKeys: { a: ["✨ Go", "✨ Go"], b: ["Old b", "Old b"], c: ["Old c", "हिंदी सी"], d: ["Old d", "हिंदी डी"], gone: ["Gone", "गया"], same: ["Same", "Same"] },
      en: { a: "Go", b: "New b", c: "New c", d: "New d", same: "Same", n1: "N1", n2: "N2", n3: "N3" },
      hi: { a: "Go", b: "B", c: "नया सी", d: "हिंदी डी", same: "Same", n1: "एन१", n2: "N2" },
      tools: { t: { en: { k1: "K1", k2: "K2", k3: "K3" }, hi: { k1: "के१", k2: "K2" } } },
    });
    const status = (key: string) => text.split("\n").find(l => l.startsWith(`| \`${key}\` |`))!.split("|").slice(-2)[0]!.trim();
    expect(status("a")).toBe(STATUS.EMOJI);
    expect(status("b")).toBe(STATUS.COPY);
    expect(status("c")).toBe(STATUS.REDRAFTED);
    expect(status("d")).toBe(STATUS.STALE);
    expect(status("n1")).toBe(STATUS.NEW);
    expect(status("n2")).toBe(STATUS.NEW_ENGLISH);
    expect(status("n3")).toBe(STATUS.NEW_MISSING);
    expect(text).not.toContain("`same`");
    expect(text).toContain("- Keys removed since the base (not listed as rows): 1");
    expect(text).toContain("- Keys whose only change is the emoji: 1");
    expect(text).toContain("- Tool-file strings (all new since the base): 3");
    expect(text).toContain("- Tool-file strings whose Hindi is an English copy: 1");
  });

  it("the committed base snapshot equals the dictionaries at the base commit", ctx => {
    if (!baseReachable()) {
      ctx.skip(`commit ${BASE_COMMIT} is not reachable (shallow clone), so the snapshot cannot be compared with git`);
      return;
    }
    expect(snapshot.base).toBe(BASE_COMMIT);
    expect(snapshot.keys).toEqual(readBaseFromGit(BASE_COMMIT).keys);
  });
});
