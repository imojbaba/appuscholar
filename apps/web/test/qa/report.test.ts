import { describe, expect, it } from "vitest";
import {
  buildReport,
  markOf,
  rerunCommand,
  situationWords,
  STORIES,
  type FirstTry,
  type Mark,
  type ReportCase
} from "../../qa/report/build";
import type { KnownEntry } from "../../qa/support/known";
import type { CaseMeta, CaseResult, CheckResult, FailKind } from "../../qa/support/qa";

const known: KnownEntry[] = [
  { id: "F1", title: "An open-answer column is called names", status: "known" },
  { id: "F2", title: "The vault shows locked after the network returns", status: "fixed" },
  { id: "O4", title: "The AI-use statement says the browser sends the requests", status: "awaiting", owner: "OJ" },
  { id: "O12", title: "1 tagged results: a plural with 1", status: "known" }
];

const meta = (over: Partial<CaseMeta> = {}): CaseMeta => ({
  story: "S5",
  id: "S5-01",
  goal: "Survey with open answers",
  situation: { screen: "desktop", lang: "en" },
  steps: ["open the data", "run the test", "insert the result"],
  ...over
});
const ok = (over: Partial<CheckResult> = {}): CheckResult => ({ kind: "data", label: "the sentence is in the document", ok: true, ...over });
const bad = (fail: FailKind, over: Partial<CheckResult> = {}): CheckResult => ({
  kind: fail === "ui" ? "visual" : fail === "slow" ? "time" : fail === "error" ? "watcher" : "data",
  label: `a ${fail} check`,
  ok: false,
  fail,
  message: `the ${fail} message`,
  ...over
});
const nothing = (over: Partial<CheckResult> = {}): CheckResult => ({ kind: "data", label: "the version", ok: null, message: "GITHUB_SHA is not set", ...over });
const result = (checks: CheckResult[], over: Partial<CaseResult> = {}): CaseResult => ({ meta: meta(), checks, reached: [], screenshots: [], keys: [], durationMs: 12_300, ...over });
const kase = (checks: CheckResult[], over: Partial<ReportCase> = {}): ReportCase => ({ ...result(checks), retries: 0, status: "passed", ...over });
const RUN = { sha: "abc1234def", date: "2026-10-24 09:30 UTC", kind: "slice" as const, durationMs: 754_000 };
const parse = (json: string) => JSON.parse(json) as { stories: Array<{ id: string; cases: number; run: boolean; counts: Record<string, number>; secondTry: number }>; cases: Array<{ id: string; mark: Mark; shown: string }> } & Record<string, any>;

describe("markOf, in the order of the spec", () => {
  it("1. a failed check no fault explains is a FAIL, of the most severe kind: Error, Unexpected, UI, Slow", () => {
    expect(markOf(result([ok(), bad("slow")]), known)).toBe("FAIL: Slow");
    expect(markOf(result([bad("slow"), bad("ui")]), known)).toBe("FAIL: UI");
    expect(markOf(result([bad("ui"), bad("unexpected"), bad("slow")]), known)).toBe("FAIL: Unexpected");
    expect(markOf(result([bad("slow"), bad("ui"), bad("unexpected"), bad("error")]), known)).toBe("FAIL: Error");
    expect(markOf(result([bad("error"), bad("unexpected")]), known)).toBe("FAIL: Error");
  });

  it("1. a failed check that names a fixed fault is a FAIL: it came back", () => {
    expect(markOf(result([bad("unexpected", { known: "F2" })]), known)).toBe("FAIL: Unexpected");
  });

  it("1. a failed check that names an id known.json lacks counts as naming none", () => {
    expect(markOf(result([bad("ui", { known: "ZZ99" })]), known)).toBe("FAIL: UI");
  });

  it("1. a FAIL wins over a block, a known fault and an awaiting decision", () => {
    expect(markOf(result([bad("unexpected", { known: "F1" }), bad("ui")], { blocked: "the service is down" }), known)).toBe("FAIL: UI");
    expect(markOf(result([bad("unexpected", { known: "O4" }), bad("slow")]), known)).toBe("FAIL: Slow");
  });

  it("1. a failed step (the case stopped) is an Error", () => {
    const stop = { kind: "step", label: 'step "run the test" did not complete', ok: false, fail: "error", message: "the Run button was not there" } as const;
    expect(markOf(result([stop]), known)).toBe("FAIL: Error");
  });

  it("2. a blocked case is BLOCKED", () => {
    expect(markOf(result([ok()], { blocked: "the sign-in wall" }), known)).toBe("BLOCKED");
  });

  it("2. a block comes before a known fault", () => {
    expect(markOf(result([bad("unexpected", { known: "F1" })], { blocked: "OpenAlex is down" }), known)).toBe("BLOCKED");
  });

  it("3. a failed check with a known fault is a KNOWN FAULT", () => {
    expect(markOf(result([ok(), bad("unexpected", { known: "F1" })]), known)).toBe("KNOWN FAULT");
    expect(markOf(result([bad("ui", { known: "F1" })]), known)).toBe("KNOWN FAULT");
  });

  it("3. a known fault comes before a fixed-looking pass and before an awaiting decision", () => {
    expect(markOf(result([bad("unexpected", { known: "F1" }), ok({ known: "O12" })]), known)).toBe("KNOWN FAULT");
    expect(markOf(result([bad("unexpected", { known: "F1" }), ok({ known: "O4" })]), known)).toBe("KNOWN FAULT");
  });

  it("4. a passed check with a known fault's id is FIXED?", () => {
    expect(markOf(result([ok({ known: "F1" })]), known)).toBe("FIXED?");
    expect(markOf(result([ok(), ok({ known: "O12" })]), known)).toBe("FIXED?");
  });

  it("4. FIXED? comes before an awaiting decision", () => {
    expect(markOf(result([ok({ known: "F1" }), bad("unexpected", { known: "O4" })]), known)).toBe("FIXED?");
  });

  it("5. any check on an awaiting decision is AWAITING DECISION, whether it passed or failed", () => {
    expect(markOf(result([bad("unexpected", { known: "O4" })]), known)).toBe("AWAITING DECISION");
    expect(markOf(result([ok({ known: "O4" })]), known)).toBe("AWAITING DECISION");
  });

  it("5. a check that measured nothing records nothing for anyone to decide", () => {
    expect(markOf(result([nothing({ known: "O4" })]), known)).toBe("PASS");
  });

  it("6. otherwise PASS: all met, nothing recorded, a fixed fault passing, an id known.json lacks", () => {
    expect(markOf(result([ok(), ok({ kind: "visual" })]), known)).toBe("PASS");
    expect(markOf(result([]), known)).toBe("PASS");
    expect(markOf(result([ok({ known: "F2" })]), known)).toBe("PASS");
    expect(markOf(result([ok({ known: "ZZ99" })]), known)).toBe("PASS");
    expect(markOf(result([nothing()]), known)).toBe("PASS");
  });

  it("never reads the story: a case of a story that is listed but not built is marked by its checks", () => {
    expect(markOf(result([ok()], { meta: meta({ story: "S4", id: "S4-01" }) }), known)).toBe("PASS");
  });
});

describe("the summary", () => {
  const cases = [
    kase([ok()], { meta: meta({ story: "S1", id: "S1-01", goal: "Start a project" }) }),
    kase([ok(), bad("ui")], { status: "failed", meta: meta({ story: "S1", id: "S1-02", goal: "Start on a phone" }) }),
    kase([bad("unexpected", { known: "F1" })], { meta: meta({ story: "S5", id: "S5-02", goal: "Open answers" }) })
  ];

  it("counts the cases of each story by mark", () => {
    const r = parse(buildReport(cases, known, RUN).json);
    const s1 = r.stories.find((s) => s.id === "S1")!;
    const s5 = r.stories.find((s) => s.id === "S5")!;
    expect(s1).toMatchObject({ cases: 2, run: true });
    expect(s1.counts["PASS"]).toBe(1);
    expect(s1.counts["FAIL: UI"]).toBe(1);
    expect(s1.counts["KNOWN FAULT"]).toBe(0);
    expect(s5).toMatchObject({ cases: 1, run: true });
    expect(s5.counts["KNOWN FAULT"]).toBe(1);
    expect(r.cases.map((c) => [c.id, c.mark])).toEqual([
      ["S1-01", "PASS"],
      ["S1-02", "FAIL: UI"],
      ["S5-02", "KNOWN FAULT"]
    ]);
  });

  it("shows one row per story in the markdown, with the counts, under the marks as columns", () => {
    const md = buildReport(cases, known, RUN).summaryMd;
    const header = md.split("\n").find((l) => l.startsWith("| Story"))!;
    for (const mark of ["PASS", "FAIL: UI", "FAIL: Error", "FAIL: Unexpected", "FAIL: Slow", "KNOWN FAULT", "FIXED?", "AWAITING DECISION", "BLOCKED", "NOT RUN"]) expect(header).toContain(mark);
    const row = (id: string) => md.split("\n").find((l) => l.startsWith(`| ${id} `))!;
    expect(row("S1")).toMatch(/\| 2 \|/);
    expect(row("S1")).toContain("| 1 |");
    expect(row("S5")).toMatch(/\| 1 \|/);
  });

  it("names the commit, the date, what ran and how long it took", () => {
    const md = buildReport(cases, known, RUN).summaryMd;
    expect(md).toContain("abc1234def");
    expect(md).toContain("2026-10-24 09:30 UTC");
    expect(md).toMatch(/slice/);
    expect(md).toContain("12 min 34 s");
  });

  it("lists every story, and a story with no cases is NOT RUN, never missing", () => {
    const out = buildReport(cases, known, RUN);
    const r = parse(out.json);
    expect(r.stories.map((s) => s.id)).toEqual(["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "L"]);
    expect(r.stories.map((s) => s.id)).toEqual(STORIES.map((s) => s.id));
    const s4 = r.stories.find((s) => s.id === "S4")!;
    expect(s4).toMatchObject({ cases: 0, run: false });
    expect(out.summaryMd.split("\n").find((l) => l.startsWith("| S4 "))).toContain("NOT RUN");
    expect(out.html).toContain("NOT RUN");
    // And it is under Not covered, with its goal.
    expect(out.summaryMd).toMatch(/Not covered[\s\S]*S4[\s\S]*participants/i);
  });

  it("keeps the report's html and markdown in step with the marks", () => {
    const out = buildReport(cases, known, RUN);
    for (const text of [out.summaryMd, out.html]) {
      expect(text).toContain("S1-02");
      expect(text).toContain("FAIL: UI");
      expect(text).toContain("KNOWN FAULT");
    }
  });
});

describe("a failing case in the report", () => {
  const failing = kase(
    [
      ok(),
      bad("unexpected", {
        kind: "data",
        label: "the t-test sentence matches core",
        message: "Expected: 42\nReceived: 41",
        source: "tools-b row 7",
        step: "insert the result",
        screenshot: "screens/S5-01/1-failed-check.png"
      })
    ],
    {
      status: "failed",
      reached: ["open the data", "run the test"],
      stoppedAt: { step: "run the test", url: "http://localhost:3010/tools/stats", screenshot: "screens/S5-01/2-stopped.png", reason: "the Run button was not there" },
      meta: meta({ code: ["apps/web/app/tools/stats"] })
    }
  );
  const withStop = kase(
    [
      { kind: "step", label: 'step "run the test" did not complete', ok: false, fail: "error", message: "the Run button was not there", step: "run the test" },
      { kind: "step", label: "NOT CHECKED (stopped at step 2): insert the result", ok: null, message: '"insert the result" was not reached: the Run button was not there', step: "insert the result" }
    ],
    {
      status: "failed",
      reached: ["open the data", "run the test"],
      stoppedAt: { step: "run the test", url: "http://localhost:3010/tools/stats", screenshot: "screens/S5-01/2-stopped.png", reason: "the Run button was not there" }
    }
  );

  it("shows what was expected, what happened, the kind, the source, the step and the screenshot", () => {
    const { summaryMd, html } = buildReport([failing], known, RUN);
    for (const text of [summaryMd, html]) {
      expect(text).toContain("the t-test sentence matches core");
      expect(text).toContain("Expected: 42");
      expect(text).toContain("Received: 41");
      expect(text).toContain("Unexpected");
      expect(text).toContain("tools-b row 7");
      expect(text).toContain("insert the result");
      expect(text).toContain("screens/S5-01/1-failed-check.png");
    }
  });

  it("names the page the case stopped on, the step, and what it could not reach", () => {
    const { summaryMd, html } = buildReport([withStop], known, RUN);
    for (const text of [summaryMd, html]) {
      expect(text).toContain("http://localhost:3010/tools/stats");
      expect(text).toContain("run the test");
      expect(text).toContain("the Run button was not there");
      expect(text).toContain("screens/S5-01/2-stopped.png");
      expect(text).toContain("insert the result");
    }
    expect(summaryMd).toMatch(/not reached/i);
  });

  it("holds the situation in words, not as field names", () => {
    const c = kase([ok()], { meta: meta({ situation: { vault: "locked", network: "drop", screen: "phone", lang: "hi", data: "messy", ai: "fails" } }) });
    const { summaryMd } = buildReport([c], known, RUN);
    expect(summaryMd).toContain("vault locked");
    expect(summaryMd).toContain("network drops and comes back");
    expect(summaryMd).toContain("phone");
    expect(summaryMd).toContain("Hindi");
    expect(summaryMd).toContain("messy data");
    expect(summaryMd).toContain("AI failing");
    expect(summaryMd).not.toContain("lang:");
  });

  it("shows both checks when two have the same label (one unexplained, one known)", () => {
    const label = "form: nothing past the window's edge";
    const both = kase([
      bad("ui", { kind: "visual", label, message: "a button 12 px past the edge" }),
      bad("ui", { kind: "visual", label, message: "a heading 30 px past the edge", known: "F1" })
    ]);
    const { summaryMd, html } = buildReport([both], known, RUN);
    for (const text of [summaryMd, html]) {
      expect(text).toContain("a button 12 px past the edge");
      expect(text).toContain("a heading 30 px past the edge");
      expect(text.split(label).length - 1).toBeGreaterThanOrEqual(2);
    }
    expect(summaryMd).toContain("F1");
  });
});

describe("the fix brief", () => {
  const fail = kase(
    [
      bad("unexpected", {
        label: "the t-test sentence matches core",
        message: "Expected: 42\nReceived: 41",
        source: "tools-b row 7",
        step: "insert the result",
        screenshot: "screens/S5-01/1-failed-check.png"
      })
    ],
    { status: "failed", meta: meta({ code: ["apps/web/app/tools/stats", "packages/core/src/stats"] }) }
  );
  const fixed = kase([ok({ label: "open answers are not called names", known: "F1", source: "tools-b row 4" })], { meta: meta({ id: "S5-02", goal: "Open answers" }) });
  const knownFault = kase([bad("unexpected", { known: "O12", label: "1 tagged result" })], { meta: meta({ id: "S5-08", goal: "Check numbers" }) });
  const plain = kase([ok()], { meta: meta({ id: "S5-03", goal: "Huge data" }) });

  it("holds the command that re-runs only that case, and the expected and happened text", () => {
    const { fixBriefMd } = buildReport([fail], known, RUN);
    expect(fixBriefMd).toContain('pnpm --filter @appuscholar/web qa:local -g "S5-01"');
    expect(fixBriefMd).toContain("the t-test sentence matches core");
    expect(fixBriefMd).toContain("Expected: 42");
    expect(fixBriefMd).toContain("Received: 41");
    expect(fixBriefMd).toContain("tools-b row 7");
    expect(fixBriefMd).toContain("Unexpected");
    expect(fixBriefMd).toContain("screens/S5-01/1-failed-check.png");
  });

  it("stands on its own: story, situation, steps as a student does them, and the code the case touches", () => {
    const { fixBriefMd } = buildReport([fail], known, RUN);
    expect(fixBriefMd).toContain("S5");
    expect(fixBriefMd).toContain("I analyse my survey");
    expect(fixBriefMd).toContain("desktop");
    expect(fixBriefMd).toContain("1. open the data");
    expect(fixBriefMd).toContain("3. insert the result");
    expect(fixBriefMd).toContain("apps/web/app/tools/stats");
    expect(fixBriefMd).toContain("packages/core/src/stats");
  });

  it("says it goes to a developer session only after OJ says so", () => {
    const { fixBriefMd } = buildReport([fail], known, RUN);
    expect(fixBriefMd).toMatch(/OJ says so/);
  });

  it("has one entry per FAIL and per FIXED?, and none for a pass or a known fault", () => {
    const { fixBriefMd } = buildReport([fail, fixed, knownFault, plain], known, RUN);
    expect(fixBriefMd).toContain("S5-01");
    expect(fixBriefMd).toContain("S5-02");
    expect(fixBriefMd).not.toContain("S5-08");
    expect(fixBriefMd).not.toContain("S5-03");
    expect(fixBriefMd).toContain("FIXED?");
    expect(fixBriefMd).toContain("F1");
    expect(fixBriefMd).toContain("An open-answer column is called names");
    expect(fixBriefMd).toContain('qa:local -g "S5-02"');
  });

  it("says plainly when there is nothing to fix", () => {
    const { fixBriefMd } = buildReport([plain, knownFault], known, RUN);
    expect(fixBriefMd).toMatch(/nothing to fix/i);
  });

  it("escapes the case id in the re-run command so that a title with brackets finds only that case", () => {
    expect(rerunCommand("S5-01")).toBe('pnpm --filter @appuscholar/web qa:local -g "S5-01"');
    expect(rerunCommand("S6-02 [F3]")).toBe('pnpm --filter @appuscholar/web qa:local -g "S6-02 \\[F3\\]"');
  });
});

describe("a pass on retry is listed apart", () => {
  const firstTry = (checks: CheckResult[], over: Partial<CaseResult> = {}, extra: Partial<FirstTry> = {}): FirstTry => ({
    status: "failed",
    result: result(checks, { meta: meta({ id: "S2-03", story: "S2", goal: "Find a paper" }), ...over }),
    ...extra
  });
  const first = firstTry([bad("unexpected", { label: "the list has 3 rows", message: "expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2", source: "wave-b1 row 10", step: "run the test", screenshot: "screens/S2-03/first-try/1-failed-check.png" })], {}, { trace: "traces/S2-03-first-try.zip" });
  const flaky = kase([ok()], { retries: 1, status: "passed", meta: meta({ id: "S2-03", story: "S2", goal: "Find a paper" }), firstTry: first });
  const clean = kase([ok()], { meta: meta({ id: "S2-01", story: "S2", goal: "Read a paper" }) });

  it("never counts it as a clean PASS, and lists it with what failed the first time", () => {
    const out = buildReport([flaky, clean], known, RUN);
    for (const text of [out.summaryMd, out.html]) {
      expect(text).toMatch(/Passed only on a second try/);
      expect(text).toContain("S2-03");
      expect(text).toContain("the list has 3 rows: expect(received).toBe(expected) / Expected: 3 / Received: 2");
    }
    const section = out.summaryMd.slice(out.summaryMd.indexOf("Passed only on a second try"));
    expect(section.slice(0, section.indexOf("Not covered"))).toContain("S2-03");
    expect(section.slice(0, section.indexOf("Not covered"))).not.toContain("S2-01");
    expect(parse(out.json).stories.find((s) => s.id === "S2")!.secondTry).toBe(1);
    const row = out.summaryMd.split("\n").find((l) => l.startsWith("| S2 "))!;
    expect(row).toMatch(/2nd try/);
  });

  it("shows the case as PASS on retry with its first try's mark, never as a plain PASS (md and html)", () => {
    const out = buildReport([flaky], known, RUN);
    expect(out.summaryMd).toContain("#### PASS on retry (first try FAIL: Unexpected) — S2-03 Find a paper");
    expect(out.summaryMd).not.toMatch(/^- PASS S2-03/m);
    expect(out.html).toContain('<span class="mark retry">PASS on retry (first try FAIL: Unexpected)</span>');
    expect(out.html).not.toContain('<span class="mark pass">PASS</span>');
    expect(parse(out.json).cases[0]!.shown).toBe("PASS on retry (first try FAIL: Unexpected)");
    expect(parse(out.json).cases[0]!.mark).toBe("PASS");
  });

  it("gives it a fix-brief entry from the first try, with the first try's failed checks, evidence and the section 13 fields", () => {
    const { fixBriefMd } = buildReport([flaky], known, RUN);
    expect(fixBriefMd).toContain("## Entry 1: S2-03 — PASS on retry (first try FAIL: Unexpected)");
    expect(fixBriefMd).toContain("passed on a retry");
    expect(fixBriefMd).toContain('qa:local -g "S2-03"');
    expect(fixBriefMd).toContain("the list has 3 rows");
    expect(fixBriefMd).toContain("Expected: 3");
    expect(fixBriefMd).toContain("wave-b1 row 10");
    expect(fixBriefMd).toContain("screens/S2-03/first-try/1-failed-check.png");
    expect(fixBriefMd).toContain("traces/S2-03-first-try.zip");
    expect(fixBriefMd).toContain("1. open the data");
    expect(fixBriefMd).not.toMatch(/nothing to fix/i);
  });

  it("lists only the first try's checks that failed the case, not its known-fault checks", () => {
    const both = firstTry([bad("unexpected", { label: "a plain failure", message: "boom" }), bad("unexpected", { label: "a known one", message: "the known message", known: "F1" })]);
    const out = buildReport([kase([ok()], { retries: 1, meta: meta({ id: "S2-04", story: "S2" }), firstTry: both })], known, RUN);
    expect(out.fixBriefMd).toContain("a plain failure");
    expect(out.fixBriefMd).not.toContain("a known one");
    expect(out.fixBriefMd).not.toContain("the known message");
    const section = out.summaryMd.slice(out.summaryMd.indexOf("Passed only on a second try"));
    expect(section.slice(0, section.indexOf("Not covered"))).not.toContain("a known one");
  });

  it("marks a first try that Playwright failed for no reason its checks give as FAIL: Error, and one that ended with no result the same", () => {
    const knownOnly = firstTry([bad("unexpected", { label: "a known one", message: "the known message", known: "F1" })], {}, { error: "Error: the teardown threw" });
    const a = buildReport([kase([ok()], { retries: 1, meta: meta({ id: "S2-05", story: "S2" }), firstTry: knownOnly })], known, RUN);
    expect(a.summaryMd).toContain("PASS on retry (first try FAIL: Error)");
    expect(a.fixBriefMd).toContain("none of its checks says why");
    expect(a.fixBriefMd).toContain("Error: the teardown threw");
    expect(a.fixBriefMd).not.toContain("the known message");
    const crashed: FirstTry = { status: "timedOut", error: "Test timeout of 600000ms exceeded." };
    const b = buildReport([kase([ok()], { retries: 1, meta: meta({ id: "S2-06", story: "S2" }), firstTry: crashed })], known, RUN);
    expect(b.summaryMd).toContain("PASS on retry (first try FAIL: Error)");
    expect(b.fixBriefMd).toContain("Entry 1: S2-06");
    expect(b.fixBriefMd).toContain("Test timeout of 600000ms exceeded.");
  });

  it("flags a retry in the column of the mark the case ended with, never under PASS for a KNOWN FAULT", () => {
    const kf = kase([bad("unexpected", { known: "F1" })], { retries: 1, meta: meta({ id: "S2-07", story: "S2" }) });
    const out = buildReport([kf, clean], known, RUN);
    const s2 = parse(out.json).stories.find((s) => s.id === "S2")! as unknown as { secondTryByMark: Record<string, number> };
    expect(s2.secondTryByMark["KNOWN FAULT"]).toBe(1);
    expect(s2.secondTryByMark["PASS"]).toBe(0);
    const row = out.summaryMd.split("\n").find((l) => l.startsWith("| S2 "))!;
    const cells = row.split("|").map((c) => c.trim());
    // | story | cases | PASS | UI | Error | Unexpected | Slow | KNOWN FAULT | ...
    expect(cells[3]).toBe("1");
    expect(cells[8]).toBe("1 (1 on a 2nd try)");
    expect(out.html).toContain("<td>1 (1 on a 2nd try)</td>");
  });

  it("says nothing of retries when none was needed", () => {
    const out = buildReport([clean], known, RUN);
    expect(out.summaryMd).toMatch(/Passed only on a second try[\s\S]*none/i);
  });
});

describe("the redact list", () => {
  const key = "gsk_live_9f8e7d6c5b4a3210";
  const odd = 'sk-a&b<"c>';
  const leaky = kase(
    [
      bad("unexpected", { message: `the request carried ${key} and was refused`, source: `row 3 (${odd})` }),
      ok({ label: `calls https://api.example.test/v1?key=${key}&mode=1` })
    ],
    {
      status: "failed",
      keys: [key],
      stoppedAt: { step: "run the test", url: `http://localhost:3010/tools?token=${key}`, screenshot: "", reason: `blocked: ${encodeURIComponent(odd)}` },
      meta: meta({ goal: `survey with ${key} in the title` })
    }
  );
  const notes = { redact: [key, odd, ""] };

  it("replaces the key everywhere: in a message and a URL, in all four outputs", () => {
    const out = buildReport([leaky], known, RUN, notes);
    for (const [name, text] of Object.entries(out)) {
      expect(text, name).not.toContain(key);
      expect(text, name).toContain("[redacted]");
    }
  });

  it("replaces a string that has characters html and json would write differently", () => {
    const out = buildReport([leaky], known, RUN, notes);
    for (const [name, text] of Object.entries(out)) {
      expect(text, name).not.toContain(odd);
      expect(text, name).not.toContain("a&amp;b&lt;&quot;c&gt;");
      expect(text, name).not.toContain(encodeURIComponent(odd));
    }
    expect(out.json).not.toContain(JSON.stringify(odd).slice(1, -1));
  });

  it("keeps the json valid, and does not touch the text when the list is empty (an empty string redacts nothing)", () => {
    const out = buildReport([leaky], known, RUN, { redact: [""] });
    expect(() => JSON.parse(out.json)).not.toThrow();
    expect(out.summaryMd).toContain(key);
    expect(out.summaryMd).not.toContain("[redacted]");
    expect(() => JSON.parse(buildReport([leaky], known, RUN, notes).json)).not.toThrow();
  });

  it("redacts the run-level lines too", () => {
    const out = buildReport([], known, RUN, { redact: [key], runErrors: [`a request carried ${key}`] });
    for (const [name, text] of Object.entries(out)) expect(text, name).not.toContain(key);
  });

  it("does not write the cases' AI keys into results.json", () => {
    const out = buildReport([kase([ok()], { keys: ["gsk_qa_ok_abcd1234"] })], known, RUN);
    expect(out.json).not.toContain("gsk_qa_ok_abcd1234");
  });
});

describe("what was not checked", () => {
  const partial = kase(
    [ok(), nothing({ label: "form: every control at least 44 px each way", message: "the page has no controls to measure" })],
    { meta: meta({ id: "S3-02", story: "S3", goal: "Plan the study" }) }
  );
  const stopped = kase(
    [
      { kind: "step", label: 'step "press Run" did not complete', ok: false, fail: "error", message: "no button" },
      { kind: "step", label: "NOT CHECKED (stopped at step 2): read the answer", ok: null, message: '"read the answer" was not reached: no button', step: "read the answer" }
    ],
    { status: "failed", stoppedAt: { step: "press Run", url: "http://localhost:3010/", screenshot: "", reason: "no button" }, meta: meta({ id: "S3-03", story: "S3", goal: "Budget" }) }
  );

  it("lists every NOT CHECKED check under Not covered, with the case and the reason", () => {
    const out = buildReport([partial, stopped], known, RUN);
    for (const text of [out.summaryMd, out.html]) {
      const from = text.indexOf("Not covered");
      expect(from).toBeGreaterThan(-1);
      const section = text.slice(from);
      expect(section).toContain("S3-02");
      expect(section).toContain("form: every control at least 44 px each way");
      expect(section).toContain("the page has no controls to measure");
      expect(section).toContain("S3-03");
      expect(section).toContain("NOT CHECKED (stopped at step 2): read the answer");
    }
    expect(parse(out.json).notChecked).toHaveLength(2);
  });

  it("does not let a PASS hide a NOT CHECKED: the case says so", () => {
    const md = buildReport([partial], known, RUN).summaryMd;
    const line = md.split("\n").find((l) => l.includes("S3-02") && l.includes("PASS"))!;
    expect(line).toMatch(/1 check.*NOT CHECKED/);
  });

  it("says when a PASS measured nothing at all", () => {
    const empty = kase([nothing()], { meta: meta({ id: "S3-04", story: "S3", goal: "Empty" }) });
    const none = kase([], { meta: meta({ id: "S3-05", story: "S3", goal: "No checks" }) });
    const md = buildReport([empty, none], known, RUN).summaryMd;
    for (const id of ["S3-04", "S3-05"]) expect(md.split("\n").find((l) => l.includes(id) && l.includes("PASS")), id).toMatch(/no check measured anything/);
    const second = buildReport([kase([], { retries: 1, meta: meta({ id: "S3-06", story: "S3" }) })], known, RUN);
    expect(second.summaryMd).toContain("No check measured anything.");
    expect(second.html).toContain("No check measured anything.");
  });

  it("states the fixed non-goals of the layer", () => {
    const md = buildReport([partial], known, RUN).summaryMd;
    expect(md).toMatch(/right and wrong value of every field/i);
    expect(md).toMatch(/wording|prose/i);
    expect(md).toMatch(/real live site/i);
  });
});

describe("harness selftests, blocked and skipped cases, information", () => {
  const selftest = kase([bad("unexpected")], { selfTest: true, meta: meta({ id: "SELF-01", story: "S0", goal: "Check the fixture" }) });
  const selftest2 = kase([ok()], { selfTest: true, meta: meta({ id: "SELF-02", story: "S0", goal: "Check the fixture" }) });
  const selftestSkipped = kase([], { selfTest: true, status: "skipped", meta: meta({ id: "SELF-03", story: "S0", goal: "Check the fixture" }) });

  it("leaves the selftests out of the marks and the summary, and gives them one line", () => {
    const out = buildReport([selftest, selftest2, selftestSkipped], known, RUN);
    const r = parse(out.json);
    expect(r.stories.find((s) => s.id === "S0")).toMatchObject({ cases: 0, run: false });
    expect(r.cases).toEqual([]);
    expect(out.fixBriefMd).toMatch(/nothing to fix/i);
    expect(out.summaryMd).toMatch(/Harness selftests.*3 ran.*2 passed.*1 skipped/);
    expect(out.summaryMd).not.toContain("SELF-01");
    expect(r.harnessSelftests).toEqual({ ran: 3, passed: 2, failed: 0, skipped: 1 });
  });

  it("a harness selftest that failed is a run-level problem", () => {
    const broken = kase([ok()], { selfTest: true, status: "failed", meta: meta({ id: "SELF-09", story: "S0" }) });
    const out = buildReport([broken], known, RUN);
    expect(out.summaryMd).toContain("SELF-09");
    expect(out.summaryMd).toMatch(/harness selftest/i);
    expect(parse(out.json).harnessSelftests.failed).toBe(1);
  });

  it("shows a blocked case as BLOCKED, with the reason and the page it stopped on", () => {
    const blocked = kase([ok()], {
      status: "skipped",
      blocked: "stopped at the sign-in page: signed-in checks are the hand walk's",
      stoppedAt: { step: "open the site", url: "https://example.test/signin", screenshot: "screens/L-01/1.png", reason: "stopped at the sign-in page: signed-in checks are the hand walk's" },
      meta: meta({ story: "L", id: "L-01", goal: "The live site" })
    });
    const out = buildReport([blocked], known, RUN);
    expect(parse(out.json).cases[0]!.mark).toBe("BLOCKED");
    expect(out.summaryMd).toContain("BLOCKED");
    expect(out.summaryMd).toContain("stopped at the sign-in page");
    expect(out.summaryMd).toContain("https://example.test/signin");
    expect(out.fixBriefMd).toMatch(/nothing to fix/i);
  });

  it("shows a case that Playwright skipped without a block as NOT RUN", () => {
    const skipped = kase([], { status: "skipped", meta: meta({ id: "S7-09", story: "S7", goal: "Live AI" }) });
    const out = buildReport([skipped], known, RUN);
    expect(parse(out.json).cases[0]!.mark).toBe("NOT RUN");
    expect(parse(out.json).stories.find((s) => s.id === "S7")!.counts["NOT RUN"]).toBe(1);
  });

  it("lists information once: the library probes of eval, with their count over all the cases", () => {
    const a = kase([ok()], { notes: [{ kind: "csp-eval-probe", detail: "script-src refused eval from /_next/chunks/a.js:1", count: 2 }] });
    const b = kase([ok()], { meta: meta({ id: "S5-02" }), notes: [{ kind: "csp-eval-probe", detail: "script-src refused eval from /_next/chunks/a.js:1", count: 3 }] });
    const out = buildReport([a, b], known, RUN);
    const info = out.summaryMd.slice(out.summaryMd.indexOf("For information"));
    expect(info.split("script-src refused eval from /_next/chunks/a.js:1").length - 1).toBe(1);
    expect(info).toContain("5 times");
    expect(out.summaryMd).not.toMatch(/Error finding.*eval/i);
  });

  it("warns of an id that known.json lacks", () => {
    const c = kase([bad("unexpected", { known: "ZZ99" })], { missingKnown: ["ZZ99"], status: "failed" });
    const out = buildReport([c], known, RUN);
    expect(out.summaryMd).toMatch(/ZZ99[\s\S]*known\.json/);
    expect(parse(out.json).warnings.join(" ")).toContain("ZZ99");
  });

  it("marks a case FAIL: Error when Playwright failed it after its result was attached and no check says why", () => {
    const odd = kase([ok()], { status: "failed", error: "Error: fixture teardown failed: the context was closed" });
    const out = buildReport([odd], known, RUN);
    expect(parse(out.json).cases[0]!.mark).toBe("FAIL: Error");
    expect(parse(out.json).stories.find((s) => s.id === "S5")!.counts["FAIL: Error"]).toBe(1);
    for (const text of [out.summaryMd, out.html]) {
      expect(text).toContain("Playwright ended the case as failed, and none of its checks says why");
      expect(text).toContain("fixture teardown failed: the context was closed");
    }
    expect(out.fixBriefMd).toContain("Entry 1: S5-01 — FAIL: Error");
    expect(out.fixBriefMd).toContain("fixture teardown failed: the context was closed");
    expect(out.summaryMd).not.toContain("S5-01 goal PASS");
  });

  it("does not add that failure to a case that already fails by its checks", () => {
    const failing = kase([bad("ui")], { status: "failed", error: "the teardown threw: 1 check failed" });
    const out = buildReport([failing], known, RUN);
    expect(out.summaryMd).not.toContain("none of its checks says why");
    expect(parse(out.json).cases[0]!.mark).toBe("FAIL: UI");
  });

  it("writes an allowance with no reason (a host) without empty brackets", () => {
    const c = kase([ok()], { allowed: [{ kind: "host", what: "api.openalex.org", builtIn: false, count: 4 }] });
    const md = buildReport([c], known, RUN).summaryMd;
    expect(md).toContain("excused on purpose, host: api.openalex.org, 4 times.");
    expect(md).not.toContain("()");
  });

  it("says part of the full grid when a full run was narrowed with -g", () => {
    const c = kase([ok()]);
    const narrowed = buildReport([c], known, { ...RUN, kind: "full", selection: "-g S5-01" });
    expect(narrowed.summaryMd).toContain("What ran: part of the grid, selected with -g S5-01");
    expect(narrowed.html).toContain("part of the grid, selected with -g S5-01");
    expect(narrowed.fixBriefMd).toContain("part of the grid, selected with -g S5-01");
    expect(narrowed.summaryMd).not.toContain("full grid");
    expect(buildReport([c], known, { ...RUN, kind: "full" }).summaryMd).toContain("What ran: full grid");
    expect(buildReport([c], known, { ...RUN, kind: "slice", selection: "-g @slice" }).summaryMd).toContain("What ran: slice (each story's plain run and every regression), selected with -g @slice");
  });

  it("says any other narrowing is only part of the grid or of the slice: a project, a file, --last-failed, --grep-invert", () => {
    const c = kase([ok()]);
    for (const selection of ["--project=phone", "s05 -g S5-01", "--last-failed", "-gv @slow"]) {
      const md = buildReport([c], known, { ...RUN, kind: "full", selection }).summaryMd;
      expect(md).toContain(`What ran: part of the grid, selected with ${selection}`);
    }
    expect(buildReport([c], known, { ...RUN, kind: "release", selection: "--project=live-ai" }).summaryMd).toContain("part of the grid, selected with --project=live-ai");
    expect(buildReport([c], known, { ...RUN, kind: "slice", selection: "-g @slice --project=phone" }).summaryMd).toContain("What ran: part of the slice, selected with -g @slice --project=phone");
  });

  it("lists what a case excused on purpose, and the default allowances once", () => {
    const c = kase([ok()], {
      allowed: [
        { kind: "response", what: "GET /me/vault answering 404", reason: "an account with no vault yet", builtIn: true, count: 2 },
        { kind: "console", what: "/Failed to load/", reason: "the dictionary is down on purpose", builtIn: false, count: 1 }
      ]
    });
    const out = buildReport([c], known, RUN);
    expect(out.summaryMd).toContain("the dictionary is down on purpose");
    expect(out.summaryMd).toContain("GET /me/vault answering 404");
    expect(out.html).toContain("the dictionary is down on purpose");
  });
});

describe("run-level problems", () => {
  it("shows a non-test key that reached the provider path as an Error of the run", () => {
    const out = buildReport([kase([ok()])], known, RUN, { runErrors: ["a non-test key reached the provider path (2 requests)"] });
    for (const text of [out.summaryMd, out.html]) expect(text).toContain("a non-test key reached the provider path (2 requests)");
    expect(out.summaryMd).toMatch(/Run-level errors/);
    expect(out.fixBriefMd).toContain("a non-test key reached the provider path (2 requests)");
    expect(parse(out.json).runErrors).toEqual(["a non-test key reached the provider path (2 requests)"]);
  });

  it("lists a test that ended with no case result: a failed one as an error, a skipped one as not covered", () => {
    const out = buildReport([], known, RUN, {
      unreported: [
        { title: "stories/s05.qa.ts › S5-09 broken before it began", status: "failed", error: "browserType.launch: failed" },
        { title: "live/ai.qa.ts › L-02 live AI", status: "skipped" },
        { title: "selftest/provider.qa.ts › provider: the api's AI route", status: "passed" }
      ]
    });
    const md = out.summaryMd;
    expect(md).toMatch(/Run-level errors[\s\S]*S5-09 broken before it began[\s\S]*browserType\.launch: failed/);
    expect(md.slice(md.indexOf("Not covered"))).toContain("L-02 live AI");
    // A plain Playwright test that passed is not an error; it is a test whose checks the marks do not hold.
    expect(md.slice(md.indexOf("Not covered"))).toMatch(/passed but reported no case[\s\S]*provider: the api's AI route/);
    expect(md.slice(0, md.indexOf("Not covered"))).not.toContain("provider: the api's AI route");
    expect(out.fixBriefMd).toContain("S5-09 broken before it began");
    expect(out.fixBriefMd).not.toContain("provider: the api's AI route");
  });

  it("has none of the sections when the run was clean", () => {
    const md = buildReport([kase([ok()])], known, RUN).summaryMd;
    expect(md).not.toMatch(/Run-level errors/);
  });
});

describe("html", () => {
  it("is one page that does not run text from a check as markup", () => {
    const evil = kase([bad("unexpected", { message: '<script>alert("x")</script> & <img src=x onerror=alert(1)>', label: "<b>bold</b>" })], { status: "failed" });
    const { html } = buildReport([evil], known, RUN);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows each case's screenshots as a strip, with the checkpoint names", () => {
    const c = kase([ok()], { screenshots: [{ name: "home screen", path: "screens/S5-01/1-home.png" }, { name: "the result", path: "screens/S5-01/2-result.png" }] });
    const { html } = buildReport([c], known, RUN);
    expect(html).toContain('src="screens/S5-01/1-home.png"');
    expect(html).toContain("home screen");
    expect(html).toContain('src="screens/S5-01/2-result.png"');
    expect(html).toMatch(/Screens/);
  });

  it("links the replay of a failed case", () => {
    const c = kase([bad("error")], { status: "failed", trace: "traces/S5-01.zip" });
    const { html, fixBriefMd } = buildReport([c], known, RUN);
    expect(html).toContain("traces/S5-01.zip");
    expect(fixBriefMd).toContain("traces/S5-01.zip");
  });
});

describe("situationWords", () => {
  it("says each field in words", () => {
    expect(situationWords({ vault: "forgotten", network: "slow", screen: "desktop", lang: "en", data: "huge", ai: "slow" })).toBe(
      "vault forgotten on this computer, slow network, desktop, English, huge data, AI slow"
    );
    expect(situationWords({ vault: "open", network: "fine", data: "realistic", ai: "answers", screen: "phone", lang: "hi" })).toBe("vault open, network fine, phone (375 px), Hindi, realistic data, AI answering");
    expect(situationWords({ vault: "off", data: "empty", ai: "live" })).toBe("no vault, empty data, live AI");
  });

  it("says so when the case states no situation", () => {
    expect(situationWords({})).toBe("situation not stated");
  });
});

describe("a case waiting for OJ's decision", () => {
  const awaiting = kase(
    [
      bad("unexpected", { kind: "conceptual", label: "the statement says where the requests go", message: "Expected: server\nReceived: browser", known: "O4", source: "wave-b1 row 12", step: "insert the result" }),
      ok({ kind: "conceptual", label: "the statement counts the Explain request", known: "O4" }),
      nothing({ label: "never measured", known: "O4" })
    ],
    { meta: meta({ id: "S9-03", story: "S9", goal: "AI-use statement" }) }
  );

  it("lists each awaiting check with its id, owner, label, whether it held and what happened", () => {
    const out = buildReport([awaiting], known, RUN);
    for (const text of [out.summaryMd, out.html]) {
      expect(text).toContain("O4");
      expect(text).toContain("OJ");
      expect(text).toContain("The AI-use statement says the browser sends the requests");
      expect(text).toContain("the statement says where the requests go");
      expect(text).toContain("the statement counts the Explain request");
      expect(text).toContain("Received: browser");
      expect(text).toContain("wave-b1 row 12");
    }
    expect(out.summaryMd).toContain("not as expected");
    expect(out.summaryMd).toContain("as expected");
    expect(out.summaryMd).toMatch(/#### AWAITING DECISION — S9-03/);
    expect(out.summaryMd).not.toMatch(/- PASS S9-03/);
    expect(parse(out.json).cases[0]!.mark).toBe("AWAITING DECISION");
    expect((parse(out.json).cases[0] as unknown as { awaiting: unknown[] }).awaiting).toHaveLength(2);
  });

  it("does not list the check that measured nothing as a decision, and is not in the fix brief", () => {
    const out = buildReport([awaiting], known, RUN);
    expect(out.summaryMd.split("**Waiting for a decision").length - 1).toBe(2);
    expect(out.fixBriefMd).not.toContain("S9-03");
  });
});

describe("a fault marked fixed that has come back", () => {
  it("shows its id as the fault id in the fix brief, not none yet", () => {
    const back = kase([bad("unexpected", { known: "F2", label: "after the network returns the pill stays unlocked", message: "the pill said locked" })], { status: "failed", meta: meta({ id: "S10-04", story: "S10", goal: "The pill" }) });
    const { fixBriefMd } = buildReport([back], known, RUN);
    expect(fixBriefMd).toMatch(/Fault id: F2 \(marked fixed in known\.json: this is a regression/);
    expect(fixBriefMd).not.toContain("Fault id: none yet");
    expect(fixBriefMd).toContain("F2: The vault shows locked after the network returns (marked fixed: it has come back)");
  });

  it("still says none yet for a fault nobody has an id for", () => {
    const { fixBriefMd } = buildReport([kase([bad("ui")], { status: "failed" })], known, RUN);
    expect(fixBriefMd).toContain("Fault id: none yet");
  });
});

describe("the fix brief says where its evidence is", () => {
  it("says paths are relative to qa-report, and names the CI artifacts", () => {
    const { fixBriefMd, html } = buildReport([kase([bad("ui")], { status: "failed" })], known, RUN);
    expect(fixBriefMd).toMatch(/relative to the qa-report folder/);
    expect(fixBriefMd).toContain("qa-report-slice");
    expect(fixBriefMd).toContain("qa-report-full");
    expect(html).toContain("qa-report-slice");
  });

  it("says it even when there is nothing to fix", () => {
    expect(buildReport([kase([ok()])], known, RUN).fixBriefMd).toContain("qa-report-full");
  });
});

describe("the fake provider's log, as the report states it", () => {
  const c = kase([ok()]);

  it("says how many requests were read, and that none carried a stray key", () => {
    const out = buildReport([c], known, RUN, { providerLog: { entries: 24, strays: 0 } });
    for (const text of [out.summaryMd, out.html]) expect(text).toContain("Fake provider log: 24 requests read; none carried a key that is not a test key.");
    expect(parse(out.json).providerLog).toEqual({ entries: 24, strays: 0 });
  });

  it("says not checked when there was no log, so a merged report does not read as clean", () => {
    const out = buildReport([c], known, RUN, { providerLog: { entries: 0, strays: 0 } });
    for (const text of [out.summaryMd, out.html]) expect(text).toContain("Fake provider log: not checked: no provider log here (0 requests read).");
    expect(out.summaryMd).not.toContain("none carried a key");
  });

  it("says when the log could not be read, and counts the strays when there are some", () => {
    expect(buildReport([c], known, RUN, { providerLog: { entries: 0, strays: 0, unreadable: true } }).summaryMd).toContain("Fake provider log: not checked: the log could not be read.");
    expect(buildReport([c], known, RUN, { providerLog: { entries: 5, strays: 2 } }).summaryMd).toContain("5 requests read; 2 carried a key that is not a test key (see Run-level errors).");
  });

  it("says nothing when the caller did not read a log", () => {
    expect(buildReport([c], known, RUN).summaryMd).not.toContain("Fake provider log");
  });
});

describe("the Harness row and the story labels", () => {
  const harness = (id: string, over: Partial<ReportCase> = {}) => kase([ok()], { meta: meta({ id, story: "S0", goal: `harness ${id}` }), ...over });

  it("puts the harness's own real checks in a Harness row of their own, not under S0", () => {
    const real = kase([ok()], { meta: meta({ id: "S0-01", story: "S0", goal: "The whole journey" }) });
    const out = buildReport([real, harness("SELF-HARNESS"), harness("SELF-STUDENT-DOC"), harness("SELF-SERVICES"), harness("SELF-LAYOUT-1")], known, RUN);
    const r = parse(out.json);
    expect(r.stories.map((s) => s.id).slice(-2)).toEqual(["L", "Harness"]);
    expect(r.stories.find((s) => s.id === "S0")).toMatchObject({ cases: 1, run: true });
    expect(r.stories.find((s) => s.id === "Harness")).toMatchObject({ cases: 4, run: true });
    expect(out.summaryMd.split("\n").find((l) => l.startsWith("| S0 "))).toMatch(/\| 1 \| 1 \|/);
    const row = out.summaryMd.split("\n").find((l) => l.startsWith("| Harness "))!;
    expect(row).toContain("| 4 |");
    expect(out.summaryMd).toMatch(/### Harness\. The QA harness's own checks/);
    const s0 = out.summaryMd.slice(out.summaryMd.indexOf("### S0."), out.summaryMd.indexOf("### Harness."));
    expect(s0).toContain("S0-01");
    expect(s0).not.toContain("SELF-HARNESS");
    expect(out.html).toContain('id="story-Harness"');
  });

  it("has no Harness row when there is no harness case, and a failing harness case is a FAIL there", () => {
    const none = parse(buildReport([kase([ok()])], known, RUN).json);
    expect(none.stories.map((s) => s.id)).not.toContain("Harness");
    const failing = buildReport([kase([bad("error")], { status: "failed", meta: meta({ id: "SELF-HARNESS", story: "S0" }) })], known, RUN);
    expect(parse(failing.json).stories.find((s) => s.id === "Harness")!.counts["FAIL: Error"]).toBe(1);
    expect(parse(failing.json).stories.find((s) => s.id === "S0")!.counts["FAIL: Error"]).toBe(0);
    expect(failing.fixBriefMd).toContain("SELF-HARNESS");
  });

  it("shows each story's goal beside its id in the summary table, in markdown and html", () => {
    const out = buildReport([kase([ok()])], known, RUN);
    const row = out.summaryMd.split("\n").find((l) => l.startsWith("| S5 "))!;
    expect(row.startsWith("| S5 — I analyse my survey and report the result in my thesis. |")).toBe(true);
    expect(out.summaryMd.split("\n").find((l) => l.startsWith("| S4 "))!.startsWith("| S4 — I list my participants and keep their names out of my data. |")).toBe(true);
    expect(out.html).toContain('<a href="#story-S5">S5</a> — I analyse my survey and report the result in my thesis.');
    expect(out.html).not.toContain("<th>Goal</th>");
  });
});
