import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FullConfig, FullResult, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import JSZip from "jszip";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QaReporter, { grepOf, zipHoldsSecret } from "../../qa/reporter";
import type { CaseResult, CheckResult } from "../../qa/support/qa";

const root = mkdtempSync(path.join(tmpdir(), "qa-reporter-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const fresh = (): string => {
  const d = path.join(root, `run-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const key = "gsk_live_0a1b2c3d4e5f";

const ok = (over: Partial<CheckResult> = {}): CheckResult => ({ kind: "data", label: "the sentence is in the document", ok: true, ...over });
const bad = (over: Partial<CheckResult> = {}): CheckResult => ({ kind: "data", label: "the t-test sentence matches core", ok: false, fail: "unexpected", message: "Expected: 42\nReceived: 41", ...over });
const caseResult = (id: string, checks: CheckResult[], over: Partial<CaseResult> = {}): CaseResult => ({
  meta: { story: "S5", id, goal: `goal of ${id}`, situation: { screen: "desktop", lang: "en" }, steps: ["open", "run"] },
  checks,
  reached: ["open", "run"],
  screenshots: [],
  keys: [],
  durationMs: 2000,
  ...over
});

type Att = { name: string; contentType: string; path?: string; body?: Buffer };
const qaAttachment = (r: CaseResult): Att => ({ name: "qa-result", contentType: "application/json", body: Buffer.from(JSON.stringify(r)) });
const attempt = (o: { status?: TestResult["status"]; retry?: number; attachments?: Att[]; error?: string } = {}): TestResult =>
  ({ status: o.status ?? "passed", retry: o.retry ?? 0, attachments: o.attachments ?? [], ...(o.error ? { error: { message: o.error } } : {}) }) as unknown as TestResult;
const testCase = (title: string, results: TestResult[], o: { outcome?: ReturnType<TestCase["outcome"]>; expectedStatus?: TestCase["expectedStatus"] } = {}): TestCase =>
  ({ results, expectedStatus: o.expectedStatus ?? "passed", outcome: () => o.outcome ?? "expected", titlePath: () => ["", "desktop", "qa/stories/x.qa.ts", title] }) as unknown as TestCase;
const suiteOf = (tests: TestCase[]): Suite => ({ allTests: () => tests }) as unknown as Suite;
const config = (): FullConfig => ({ grep: /.*/ }) as unknown as FullConfig;
const done = (status: FullResult["status"] = "passed"): FullResult => ({ status, startTime: new Date("2026-10-24T09:30:00Z"), duration: 61_000 });

async function run(tests: TestCase[], o: { providerLog?: string; argv?: string[]; status?: FullResult["status"] } = {}) {
  const outputDir = fresh();
  const reporter = new QaReporter({ outputDir, providerLog: o.providerLog ?? path.join(outputDir, "no-such-log.jsonl"), argv: o.argv ?? ["node", "playwright", "test"] });
  reporter.onBegin(config(), suiteOf(tests));
  const verdict = await reporter.onEnd(done(o.status));
  const read = (f: string) => readFileSync(path.join(outputDir, f), "utf8");
  return { outputDir, verdict, read, json: () => JSON.parse(read("results.json")) as { cases: Array<{ id: string; mark: string; status: string; retries: number; trace?: string; screenshots: Array<{ path: string }> }>; harnessSelftests: { ran: number }; runErrors: string[]; run: { kind: string; sha: string; filter?: string; date: string; durationMs: number } } };
}

/** A screenshot file and the attachment Playwright keeps of it. */
function shot(dir: string, file: string): string {
  const p = path.join(dir, file);
  writeFileSync(p, PNG);
  return p;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("the reporter writes the four files", () => {
  it("writes index.html, summary.md, fix-brief.md and results.json from the cases' qa-result", async () => {
    const t = testCase("S5-01 survey", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })]);
    const r = await run([t]);
    for (const f of ["index.html", "summary.md", "fix-brief.md", "results.json"]) expect(existsSync(path.join(r.outputDir, f)), f).toBe(true);
    expect(r.json().cases.map((c) => [c.id, c.mark, c.status])).toEqual([["S5-01", "PASS", "passed"]]);
    expect(r.read("summary.md")).toContain("S5-01");
    expect(r.verdict).toBeUndefined();
  });

  it("names what ran from the run: the -g filter, the date and the duration", async () => {
    const t = testCase("S5-01 survey", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })]);
    const slice = await run([t], { argv: ["node", "playwright", "test", "-c", "qa/playwright.qa.config.ts", "-g", "@slice"] });
    expect(slice.json().run).toMatchObject({ kind: "slice", filter: "@slice", date: "2026-10-24 09:30 UTC" });
    const all = await run([t]);
    expect(all.json().run.kind).toBe("full");
    expect(all.json().run.filter).toBeUndefined();
    expect(all.json().run.durationMs).toBe(61_000);
    expect((await run([t], { argv: ["playwright", "test", "-g", "S5-01"] })).json().run).toMatchObject({ kind: "full", filter: "S5-01" });
    vi.stubEnv("QA_RUN_KIND", "release");
    expect((await run([t])).json().run.kind).toBe("release");
    vi.stubEnv("GITHUB_SHA", "feedface00");
    expect((await run([t])).json().run.sha).toBe("feedface00");
  });

  it("clears its own files from an earlier run and nothing else", async () => {
    const t = testCase("S5-01 survey", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })]);
    const outputDir = fresh();
    mkdirSync(path.join(outputDir, "screens", "OLD"), { recursive: true });
    writeFileSync(path.join(outputDir, "screens", "OLD", "1.png"), PNG);
    writeFileSync(path.join(outputDir, "mine.txt"), "keep me");
    const reporter = new QaReporter({ outputDir, providerLog: path.join(outputDir, "none.jsonl") });
    reporter.onBegin(config(), suiteOf([t]));
    await reporter.onEnd(done());
    expect(existsSync(path.join(outputDir, "screens", "OLD"))).toBe(false);
    expect(readFileSync(path.join(outputDir, "mine.txt"), "utf8")).toBe("keep me");
  });
});

describe("grepOf", () => {
  it("reads the filter from -g, --grep and --grep=", () => {
    expect(grepOf(["node", "playwright", "test", "-g", "@slice"])).toBe("@slice");
    expect(grepOf(["node", "playwright", "test", "--grep", "S5-01 survey"])).toBe("S5-01 survey");
    expect(grepOf(["node", "playwright", "test", "--grep=@selftest", "--project=phone"])).toBe("@selftest");
    expect(grepOf(["node", "playwright", "merge-reports"])).toBeUndefined();
  });
});

describe("screenshots and traces", () => {
  it("copies each screenshot beside the report and links it by a path relative to the report", async () => {
    const src = fresh();
    const checkpoint = shot(src, "checkpoint-1-home.png");
    const failed = shot(src, "failed-check-2-sentence.png");
    const stopped = shot(src, "stopped-3-run.png");
    const result = caseResult("S5-01", [bad({ screenshot: failed }), { kind: "step", label: 'step "run" did not complete', ok: false, fail: "error", message: "no button", step: "run", screenshot: stopped }], {
      screenshots: [{ name: "home", path: checkpoint }],
      stoppedAt: { step: "run", url: "http://localhost:3010/x", screenshot: stopped, reason: "no button" }
    });
    const r = await run([testCase("S5-01", [attempt({ status: "failed", attachments: [qaAttachment(result)] })], { outcome: "unexpected" })]);
    const c = r.json().cases[0]!;
    expect(c.screenshots[0]!.path).toBe("screens/S5-01/1-checkpoint-home.png");
    for (const rel of ["screens/S5-01/1-checkpoint-home.png", "screens/S5-01/2-failed-check-the-t-test-sentence-matches-core.png", "screens/S5-01/3-stopped-at-run.png"]) {
      expect(existsSync(path.join(r.outputDir, rel)), rel).toBe(true);
      expect(r.read("index.html"), rel).toContain(`src="${rel}"`);
    }
    // The stop's picture is one file, whether the check or stoppedAt refers to it.
    expect(r.read("results.json").split("screens/S5-01/3-stopped-at-run.png").length - 1).toBe(2);
    expect(r.read("index.html")).not.toContain(src);
    expect(r.read("results.json")).not.toContain(src);
  });

  it("finds a screenshot by its attachment when the file the case named is not on this machine (a merged report)", async () => {
    const src = fresh();
    const merged = shot(src, "resources-abc.png");
    const result = caseResult("S5-01", [bad({ screenshot: "/other/machine/failed-check-1-x.png" })], { screenshots: [{ name: "home", path: "/other/machine/checkpoint-1-home.png" }] });
    const attachments: Att[] = [qaAttachment(result), { name: "checkpoint: home", contentType: "image/png", path: merged }, { name: "failed check: the t-test sentence matches core", contentType: "image/png", path: merged }];
    const r = await run([testCase("S5-01", [attempt({ status: "failed", attachments })], { outcome: "unexpected" })]);
    const c = r.json().cases[0]!;
    expect(c.screenshots).toHaveLength(1);
    expect(existsSync(path.join(r.outputDir, c.screenshots[0]!.path))).toBe(true);
    expect(r.read("results.json")).not.toContain("/other/machine");
  });

  it("does not copy the pictures of the fixture's own cases, which the report leaves out", async () => {
    const src = fresh();
    const result = caseResult("SELF-01", [ok()], { selfTest: true, screenshots: [{ name: "home", path: shot(src, "checkpoint-1-home.png") }] });
    const r = await run([testCase("SELF-01", [attempt({ attachments: [qaAttachment(result)] })])]);
    expect(existsSync(path.join(r.outputDir, "screens"))).toBe(false);
  });

  it("drops a screenshot that cannot be found rather than linking nothing", async () => {
    const result = caseResult("S5-01", [ok()], { screenshots: [{ name: "home", path: "/gone/checkpoint-1-home.png" }] });
    const r = await run([testCase("S5-01", [attempt({ attachments: [qaAttachment(result)] })])]);
    expect(r.json().cases[0]!.screenshots).toEqual([]);
    expect(r.read("index.html")).not.toContain("/gone/");
  });

  it("copies the trace of a failed case, and of no other", async () => {
    const src = fresh();
    const trace = path.join(src, "trace.zip");
    writeFileSync(trace, await new JSZip().file("trace.trace", "{}").generateAsync({ type: "nodebuffer" }));
    const attachments = (id: string, r: CaseResult): Att[] => [qaAttachment(r), { name: "trace", contentType: "application/zip", path: trace }];
    const failing = testCase("S5-01", [attempt({ status: "failed", attachments: attachments("S5-01", caseResult("S5-01", [bad()])) })], { outcome: "unexpected" });
    const passing = testCase("S5-02", [attempt({ attachments: attachments("S5-02", caseResult("S5-02", [ok()])) })]);
    const r = await run([failing, passing]);
    const [a, b] = r.json().cases;
    expect(a!.trace).toBe("traces/S5-01.zip");
    expect(existsSync(path.join(r.outputDir, "traces", "S5-01.zip"))).toBe(true);
    expect(b!.trace).toBeUndefined();
    expect(r.read("index.html")).toContain("traces/S5-01.zip");
    expect(r.read("fix-brief.md")).toContain("traces/S5-01.zip");
  });
});

describe("what is left out of the marks", () => {
  it("leaves out the fixture's own cases: selfTest, the numbered ones, and the SELF- ones that are expected to fail", async () => {
    const att = (id: string, over: Partial<CaseResult> = {}) => [qaAttachment(caseResult(id, [bad()], { meta: { story: "S0", id, goal: "Check the fixture", situation: {}, steps: [] }, ...over }))];
    const tests = [
      testCase("SELF-01", [attempt({ attachments: att("SELF-01", { selfTest: true }) })]),
      testCase("SELF-19", [attempt({ attachments: att("SELF-19") })]),
      testCase("SELF-22", [attempt({ status: "failed", attachments: att("SELF-22") })], { outcome: "expected", expectedStatus: "failed" }),
      testCase("SELF-HARNESS", [attempt({ attachments: att("SELF-HARNESS") })]),
      testCase("S5-01", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })])
    ];
    const r = await run(tests);
    expect(r.json().cases.map((c) => c.id)).toEqual(["S5-01", "SELF-HARNESS"]);
    expect(r.json().harnessSelftests.ran).toBe(3);
  });

  it("counts a test that Playwright expected to fail, and did, as passed", async () => {
    const t = testCase("SELF-22", [attempt({ status: "failed", attachments: [qaAttachment(caseResult("SELF-22", [bad()]))] })], { outcome: "expected", expectedStatus: "failed" });
    const r = await run([t]);
    expect(r.read("summary.md")).toMatch(/Harness selftests.*1 ran, 1 passed/);
    expect(r.json().runErrors).toEqual([]);
  });
});

describe("retries", () => {
  it("lists a case that failed and then passed under Passed only on a second try, with what failed", async () => {
    const first = attempt({ status: "failed", attachments: [qaAttachment(caseResult("S5-01", [bad({ label: "the list has 3 rows", message: "expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2" })]))] });
    const second = attempt({ retry: 1, attachments: [qaAttachment(caseResult("S5-01", [ok()]))] });
    const r = await run([testCase("S5-01", [first, second], { outcome: "flaky" })]);
    expect(r.json().cases[0]).toMatchObject({ id: "S5-01", mark: "PASS", status: "passed", retries: 1 });
    const md = r.read("summary.md");
    const section = md.slice(md.indexOf("Passed only on a second try"), md.indexOf("Not covered"));
    expect(section).toContain("S5-01");
    expect(section).toContain("the list has 3 rows: expect(received).toBe(expected) / Expected: 3 / Received: 2");
  });

  it("says that an attempt which failed with no result failed", async () => {
    const first = attempt({ status: "timedOut", error: "Test timeout of 600000ms exceeded." });
    const second = attempt({ retry: 1, attachments: [qaAttachment(caseResult("S5-01", [ok()]))] });
    const r = await run([testCase("S5-01", [first, second], { outcome: "flaky" })]);
    expect(r.read("summary.md")).toContain("the attempt timedOut: Test timeout of 600000ms exceeded.");
  });
});

describe("a test with no case result", () => {
  it("is a run-level error when it failed, and a line under Not covered when it was skipped", async () => {
    const failed = testCase("S5-09 broke early", [attempt({ status: "failed", error: "browserType.launch: failed" })], { outcome: "unexpected" });
    const skipped = testCase("L-02 live AI", [attempt({ status: "skipped" })], { outcome: "skipped" });
    const never = testCase("L-03 never started", []);
    const plain = testCase("provider: a plain Playwright test", [attempt()]);
    const r = await run([failed, skipped, never, plain], { status: "failed" });
    const md = r.read("summary.md");
    expect(md).toMatch(/Run-level errors[\s\S]*S5-09 broke early[\s\S]*browserType\.launch: failed/);
    const covered = md.slice(md.indexOf("Not covered"));
    expect(covered).toContain("L-02 live AI");
    expect(covered).toContain("L-03 never started");
    expect(covered).toMatch(/passed but reported no case[\s\S]*provider: a plain Playwright test/);
    expect(md.slice(0, md.indexOf("Not covered"))).not.toContain("provider: a plain Playwright test");
    expect(r.read("fix-brief.md")).toContain("S5-09 broke early");
  });

  it("reports a qa-result that cannot be read as an error, not a missing case", async () => {
    const broken: Att = { name: "qa-result", contentType: "application/json", body: Buffer.from("{ not json") };
    const r = await run([testCase("S5-01", [attempt({ status: "failed", attachments: [broken] })], { outcome: "unexpected" })], { status: "failed" });
    expect(r.read("summary.md")).toMatch(/qa-result attachment could not be read/);
  });
});

describe("a non-test key in the provider log (ruling R13)", () => {
  const entry = (k: string) => JSON.stringify({ t: 1, key: k, mode: "invalid", host: "api.groq.com", kind: null, prompt: "p", outcome: "failed" }) + "\n";

  it("is a run-level error, and turns a passing run red", async () => {
    const log = path.join(fresh(), "calls.jsonl");
    writeFileSync(log, entry("gsk_qa_ok_aaaa") + entry("<not a QA key>") + entry("<not a QA key>"));
    const t = testCase("S5-01", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })]);
    const r = await run([t], { providerLog: log });
    expect(r.verdict).toEqual({ status: "failed" });
    expect(r.json().runErrors.join(" ")).toMatch(/non-test key reached the provider path/i);
    expect(r.json().runErrors.join(" ")).toContain("2 requests to api.groq.com");
    expect(r.read("summary.md")).toMatch(/Run-level errors[\s\S]*non-test key reached the provider path/i);
    expect(r.read("fix-brief.md")).toMatch(/non-test key reached the provider path/i);
  });

  it("is quiet when the log holds only test keys, or is not there", async () => {
    const log = path.join(fresh(), "calls.jsonl");
    writeFileSync(log, entry("gsk_qa_ok_aaaa"));
    const t = testCase("S5-01", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })]);
    expect((await run([t], { providerLog: log })).verdict).toBeUndefined();
    expect((await run([t])).json().runErrors).toEqual([]);
  });

  it("says when the log cannot be read", async () => {
    const log = path.join(fresh(), "calls.jsonl");
    writeFileSync(log, "{ not json\n");
    const r = await run([testCase("S5-01", [attempt({ attachments: [qaAttachment(caseResult("S5-01", [ok()]))] })])], { providerLog: log });
    expect(r.json().runErrors.join(" ")).toMatch(/log could not be read/);
  });
});

describe("the live-AI key", () => {
  it("is removed from every file the reporter writes", async () => {
    vi.stubEnv("QA_LIVE_AI_KEY", key);
    const result = caseResult("S5-01", [bad({ message: `the request carried ${key}` })], { keys: [key], stoppedAt: { step: "run", url: `http://localhost:3010/?k=${key}`, screenshot: "", reason: "x" } });
    const r = await run([testCase("S5-01", [attempt({ status: "failed", attachments: [qaAttachment(result)] })], { outcome: "unexpected" })]);
    for (const f of ["index.html", "summary.md", "fix-brief.md", "results.json"]) {
      expect(r.read(f), f).not.toContain(key);
    }
    expect(r.read("summary.md")).toContain("[redacted]");
  });

  it("is not kept in a trace that holds it: the trace is not copied", async () => {
    vi.stubEnv("QA_LIVE_AI_KEY", key);
    const src = fresh();
    const trace = path.join(src, "trace.zip");
    writeFileSync(trace, await new JSZip().file("trace.network", JSON.stringify({ headers: [{ name: "authorization", value: `Bearer ${key}` }] })).generateAsync({ type: "nodebuffer" }));
    const attachments: Att[] = [qaAttachment(caseResult("S5-01", [bad()])), { name: "trace", contentType: "application/zip", path: trace }];
    const r = await run([testCase("S5-01", [attempt({ status: "failed", attachments })], { outcome: "unexpected" })]);
    expect(r.json().cases[0]!.trace).toBeUndefined();
    expect(existsSync(path.join(r.outputDir, "traces"))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("holds the live-AI key"));
  });
});

describe("zipHoldsSecret", () => {
  const zip = (files: Record<string, string | Buffer>) => {
    const z = new JSZip();
    for (const [name, body] of Object.entries(files)) z.file(name, body);
    return z.generateAsync({ type: "nodebuffer" });
  };

  it("finds the secret in a text entry, in any of its forms", async () => {
    expect(await zipHoldsSecret(await zip({ "trace.trace": `{"a":"${key}"}` }), [key])).toBe(true);
    expect(await zipHoldsSecret(await zip({ "trace.network": `url=${encodeURIComponent("sk-a&b")}` }), ["sk-a&b"])).toBe(true);
    expect(await zipHoldsSecret(await zip({ "resources/x.json": JSON.stringify({ v: 'sk-"q' }) }), ['sk-"q'])).toBe(true);
  });

  it("does not read pictures, and says no when the secret is not there or there is none", async () => {
    expect(await zipHoldsSecret(await zip({ "resources/a.png": key }), [key])).toBe(false);
    expect(await zipHoldsSecret(await zip({ "trace.trace": "{}" }), [key])).toBe(false);
    expect(await zipHoldsSecret(await zip({ "trace.trace": key }), [])).toBe(false);
    expect(await zipHoldsSecret(await zip({ "trace.trace": key }), [""])).toBe(false);
  });
});

describe("a report that cannot be written", () => {
  it("fails the run and says why", async () => {
    const taken = path.join(fresh(), "a-file");
    writeFileSync(taken, "x");
    const reporter = new QaReporter({ outputDir: path.join(taken, "qa-report"), providerLog: path.join(taken, "none") });
    reporter.onBegin(config(), suiteOf([]));
    expect(await reporter.onEnd(done())).toEqual({ status: "failed" });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("could not be written"));
  });
});
