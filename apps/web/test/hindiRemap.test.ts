import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASE_COMMIT, KIND_LABEL, REASON, STATUS, buildSheet, readBaseFromGit, renderSheet } from "../scripts/hindi-remap-sheet.mjs";
import { KIND } from "../scripts/v1-hindi-remap.mjs";

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
// The v1 Hindi remap (apps/web/scripts/fixtures/v1-hindi-remap.json) is the third pinned input of the sheet.
type RemapFile = {
  v1: { commit: string; build: string; sha256: string };
  keys: Record<string, { en: string; hi: string; v1Key: string; kind: string }>;
  ambiguous: Record<string, { en: string; v1: [string, string][] }>;
  rejected: Record<string, { en: string; v1Key: string; reason: string }>;
  keepEnglish: string[];
  noV1Hindi: string[];
};
const remap = JSON.parse(readFileSync(here("../scripts/fixtures/v1-hindi-remap.json"), "utf8")) as RemapFile;
const section = (title: string) => sheet().split("\n## ").find(x => x.startsWith(title))!;
const rowsOf = (text: string) => text.split("\n").filter(l => l.startsWith("| `"));

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

  it("the header counts the English copies before the v1 remap, the keys remapped and the keys still English", () => {
    const text = sheet();
    const remapped = Object.keys(remap.keys).length;
    const still = Object.keys(head.keys).filter(k => head.keys[k]![1] === head.keys[k]![0]).length;
    expect(text).toContain("- English copies before the v1 remap, main dictionary: 369");
    expect(text).toContain(`- Remapped from v1 build ${remap.v1.build} (commit \`${remap.v1.commit}\`): ${remapped}`);
    expect(text).toContain(`- Still English after the remap, main dictionary: ${still}`);
    expect(remapped + still).toBe(369);   // the head snapshot is the dictionaries with the remap applied
  });

  it("lists every remapped key once, with its English, the Hindi from v1, the v1 key and the match kind", () => {
    const rows = rowsOf(section("Hindi remapped from v1"));
    expect(rows.length).toBe(Object.keys(remap.keys).length);
    for (const [k, e] of Object.entries(remap.keys)) {
      const row = rows.filter(r => r.startsWith(`| \`${k}\` |`));
      expect(row.length, k).toBe(1);
      expect(row[0], k).toContain(e.hi.replace(/\|/g, "\\|"));
      expect(row[0], k).toContain(`\`${e.v1Key}\``);
      expect(row[0], k).toContain(KIND_LABEL[e.kind as keyof typeof KIND_LABEL]);
    }
  });

  it("lists every main-dictionary Hindi that is still English after the remap, each with a reason", () => {
    const rows = rowsOf(section("Hindi still English after the remap"));
    const still = Object.keys(head.keys).filter(k => head.keys[k]![1] === head.keys[k]![0]);
    expect(rows.map(r => r.split("`")[1]).sort()).toEqual([...still].sort());
    for (const k of still) {
      const reason = rows.find(r => r.startsWith(`| \`${k}\` |`))!.split("|").slice(-2)[0]!.trim();
      expect(reason, k).not.toBe("");
      expect(Object.values(REASON).some(x => reason.startsWith(x)), `${k}: ${reason}`).toBe(true);
    }
    // the eleven names and formats say so, and the ambiguous one names both v1 Hindi values
    expect(rows.find(r => r.startsWith("| `erase_confirm_word` |"))).toContain(REASON.KEEP);
    for (const a of Object.values(remap.ambiguous)) for (const [, h] of a.v1) expect(sheet()).toContain(h);
  });

  it("has a label for every match kind", () => {
    for (const kind of Object.values(KIND)) expect(KIND_LABEL[kind as keyof typeof KIND_LABEL], kind).toBeTruthy();
  });

  it("gives each English copy a remap section row: remapped, or still English with one reason", () => {
    const text = renderSheet({
      base: "x", head: "y", baseKeys: {},
      en: { m: "Ask", amb: "Same", rej: "<b>X</b>", name: "CSV", none: "Nothing", late: "Added later", done: "Done" },
      hi: { m: "पूछें", amb: "Same", rej: "<b>X</b>", name: "CSV", none: "Nothing", late: "Added later", done: "पूरा" },
      tools: {},
      remap: {
        v1: { commit: "abc1234", build: "2026.10.24a", sha256: "0".repeat(64) },
        keys: { m: { en: "Ask", hi: "पूछें", v1Key: "ap_ask", kind: KIND.EXACT } },
        ambiguous: { amb: { en: "Same", v1: [["s1", "एक"], ["s2", "दो"]] } },
        rejected: { rej: { en: "<b>X</b>", v1Key: "x", reason: "tags differ" } },
        keepEnglish: ["name"],
        noV1Hindi: ["none"],
      },
    });
    const still = text.split("\n## ").find(x => x.startsWith("Hindi still English"))!;
    const reason = (key: string) => still.split("\n").find(l => l.startsWith(`| \`${key}\` |`))!.split("|").slice(-2)[0]!.trim();
    expect(reason("amb")).toBe(`${REASON.AMBIGUOUS}: \`s1\` says एक, \`s2\` says दो`);
    expect(reason("rej")).toBe(`${REASON.REJECTED}: tags differ (v1 key \`x\`)`);
    expect(reason("name")).toBe(REASON.KEEP);
    expect(reason("none")).toBe(REASON.NONE);
    expect(reason("late")).toBe(REASON.LATE);
    expect(rowsOf(still).map(r => r.split("`")[1]).sort()).toEqual(["amb", "late", "name", "none", "rej"]);   // not the remapped key, not the translated one
    expect(text).toContain("- English copies before the v1 remap, main dictionary: 5");
    expect(text).toContain("- Remapped from v1 build 2026.10.24a (commit `abc1234`): 1 (exact English 1, same words 0, placeholders renamed 0)");
    expect(text).toContain("- Still English after the remap, main dictionary: 5 (no Hindi in v1 1, ambiguous in v1 1, v1 Hindi not used 1, a name or format 1, added after the remap 1)");
    const remapped = text.split("\n## ").find(x => x.startsWith("Hindi remapped from v1"))!;
    expect(remapped).toContain("| `m` | `Ask` | `पूछें` | `ap_ask` | " + KIND_LABEL.exact + " |");
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
