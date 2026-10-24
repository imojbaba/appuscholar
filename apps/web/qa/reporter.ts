// The QA layer's Playwright reporter: reads the `qa-result` each case attached, copies the screenshots and failed-case traces beside the report, and writes
//   qa-report/index.html    the report with a screenshot strip for every case
//   qa-report/summary.md    the same in markdown, for the job's summary page
//   qa-report/fix-brief.md  the failures written for a developer session (only after OJ says so, spec section 13)
//   qa-report/results.json  the data
// Run by the config (`reporter: [..., ["./reporter.ts"]]`) and by `playwright merge-reports --reporter ./qa/reporter.ts` over the shards' blob reports; it reads only
// what Playwright hands every reporter (the attachments), so both give the same report. Everything it writes is built by report/build.ts (pure, tested).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import JSZip from "jszip";
import { buildReport, type FirstTry, type ProviderLogInfo, type ReportCase, type RunInfo, type Unreported } from "./report/build";
import { loadKnown } from "./support/known";
import { readProviderLog } from "./support/providerLog";
import { secretForms } from "./support/secrets";
import type { CaseResult } from "./support/qa";

export type QaReporterOptions = {
  /** Where the report goes. By default `QA_REPORT_DIR`, else `qa-report` in the folder the run was started from (apps/web). */
  outputDir?: string;
  /** The fake provider's log (a test gives its own). By default the run's QA_PROVIDER_LOG. */
  providerLog?: string;
  /** The command line of the run, to say what narrowed it: `-g`, `--project`, a file ... (Playwright keeps these out of the config it hands a reporter). By default process.argv. */
  argv?: string[];
};

/** The tag of the fixture's mechanics tests (selftest/fixture.qa.ts): tests that need the teardown to throw or to pin a mark, so they cannot set `qa.selfTest`. */
const MECHANICS_TAG = "@mechanics";
/** The key the fake provider writes for a key that is not a `gsk_qa_<mode>_<random>` test key (provider-shim/core.mjs). */
const NOT_A_QA_KEY = "<not a QA key>";
/** Entries of a trace that are pictures or fonts: not read for a secret. */
const BINARY = /\.(png|jpe?g|gif|webp|woff2?|ttf|otf|ico)$/i;

const slug = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";

/** Whether any file of the zip (a Playwright trace) holds one of the secrets, in any of the forms the outputs redact. Pictures and fonts are not read. */
export async function zipHoldsSecret(zip: Buffer, secrets: string[]): Promise<boolean> {
  const forms = secretForms(secrets);
  if (forms.length === 0) return false;
  const archive = await JSZip.loadAsync(zip);
  for (const entry of Object.values(archive.files)) {
    if (entry.dir || BINARY.test(entry.name)) continue;
    const text = await entry.async("string");
    if (forms.some((f) => text.includes(f))) return true;
  }
  return false;
}

export default class QaReporter implements Reporter {
  private suite: Suite | undefined;

  constructor(private readonly options: QaReporterOptions = {}) {}

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult["status"] } | void> {
    try {
      const { runErrors } = await this.write(result);
      // A key that is not a test key reached the provider path: the run is red, even if every case passed.
      if (runErrors.length && result.status === "passed") return { status: "failed" };
    } catch (e) {
      // A run whose report could not be written must not look fine.
      console.error(`QA report: could not be written: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      return { status: "failed" };
    }
  }

  private async write(result: FullResult): Promise<{ runErrors: string[] }> {
    const known = loadKnown();
    const out = path.resolve(this.options.outputDir ?? process.env.QA_REPORT_DIR ?? "qa-report");
    // Only what this reporter writes is removed, so a mistyped QA_REPORT_DIR cannot clear a folder of other things.
    for (const name of ["index.html", "summary.md", "fix-brief.md", "results.json", "screens", "traces"]) rmSync(path.join(out, name), { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const redact = [process.env.QA_LIVE_AI_KEY].filter((k): k is string => Boolean(k));

    const cases: ReportCase[] = [];
    const unreported: Unreported[] = [];
    const usedIds = new Map<string, number>();
    for (const test of this.suite?.allTests() ?? []) {
      const final = test.results.at(-1);
      const status = outcomeStatus(test);
      const title = test.titlePath().filter(Boolean).join(" › ");
      if (!final) {
        unreported.push({ title, status: "skipped" });
        continue;
      }
      const parsed = readResult(final);
      if (parsed === undefined || parsed instanceof Error) {
        const error = parsed instanceof Error ? parsed.message : errorText(final);
        unreported.push({ title, status, ...(error ? { error } : {}) });
        continue;
      }
      const n = (usedIds.get(parsed.meta.id) ?? 0) + 1;
      usedIds.set(parsed.meta.id, n);
      const dir = n === 1 ? slug(parsed.meta.id) : `${slug(parsed.meta.id)}-${n}`;
      // The fixture's own mechanics tests (they fail on purpose, and cannot set `selfTest` because the teardown must throw) say so with the tag @mechanics; a SELF- test that
      // Playwright expects to fail (`test.fail()`) is one too.
      if (parsed.selfTest !== true && (test.tags.includes(MECHANICS_TAG) || (test.expectedStatus === "failed" && parsed.meta.id.startsWith("SELF-")))) parsed.selfTest = true;
      if (parsed.selfTest) {
        // Left out of the report's marks, so nothing of theirs is copied.
        cases.push({ ...parsed, retries: final.retry, status });
        continue;
      }
      const traces = path.join(out, "traces");
      const trace = await copyTrace(final, status, traces, `${dir}.zip`, redact);
      const error = status === "failed" ? errorText(final) : "";
      // A case that failed a try and passed on a retry keeps its first try (ruling R22): its failed checks, pictures and replay.
      const failedTry = status === "passed" && final.retry > 0 ? test.results.slice(0, -1).find((r) => r.status !== "passed" && r.status !== "skipped") : undefined;
      let firstTry: FirstTry | undefined;
      if (failedTry) {
        const earlier = readResult(failedTry);
        const firstTrace = await copyTrace(failedTry, "failed", traces, `${dir}-first-try.zip`, redact);
        firstTry = {
          status: failedTry.status,
          ...(earlier && !(earlier instanceof Error) ? { result: copyScreens(earlier, failedTry, out, `${dir}/first-try`) } : {}),
          ...(earlier instanceof Error ? { error: earlier.message } : errorText(failedTry) ? { error: errorText(failedTry) } : {}),
          ...(firstTrace ? { trace: `traces/${dir}-first-try.zip` } : {})
        };
      }
      cases.push({
        ...copyScreens(parsed, final, out, dir),
        retries: final.retry,
        status,
        ...(error ? { error } : {}),
        ...(firstTry ? { firstTry } : {}),
        ...(trace ? { trace: `traces/${dir}.zip` } : {})
      });
    }

    const provider = this.providerCheck();
    const { summaryMd, fixBriefMd, html, json } = buildReport(cases, known, this.runInfo(result), { redact, runErrors: provider.errors, unreported, providerLog: provider.info });
    writeFileSync(path.join(out, "summary.md"), summaryMd);
    writeFileSync(path.join(out, "fix-brief.md"), fixBriefMd);
    writeFileSync(path.join(out, "index.html"), html);
    writeFileSync(path.join(out, "results.json"), json);
    console.log(`QA report: ${path.join(out, "index.html")}`);
    return { runErrors: provider.errors };
  }

  /**
   * Spec ruling R13: any request the fake provider took with a key that is not a test key is an Error of the run. Also says how much of the log was read (none: no log here, as in a
   * merged report), so that a clean line is never read as more than it is.
   */
  private providerCheck(): { errors: string[]; info: ProviderLogInfo } {
    try {
      const entries = readProviderLog(this.options.providerLog);
      const strays = entries.filter((e) => e.key === NOT_A_QA_KEY);
      const info = { entries: entries.length, strays: strays.length };
      if (strays.length === 0) return { errors: [], info };
      const hosts = [...new Set(strays.map((e) => e.host))].join(", ");
      return { errors: [`A non-test key reached the provider path: ${strays.length} request${strays.length === 1 ? "" : "s"} to ${hosts} carried a key that is not a gsk_qa_ test key. The key itself is never written down.`], info };
    } catch (e) {
      return {
        errors: [`The fake provider's log could not be read, so a non-test key reaching the provider path would not be seen: ${e instanceof Error ? e.message : String(e)}`],
        info: { entries: 0, strays: 0, unreadable: true }
      };
    }
  }

  private runInfo(result: FullResult): RunInfo {
    const argv = this.options.argv ?? process.argv;
    const selection = selectionOf(argv);
    const asked = process.env.QA_RUN_KIND;
    const kind: RunInfo["kind"] = asked === "slice" || asked === "full" || asked === "release" ? asked : grepOf(argv)?.includes("@slice") ? "slice" : "full";
    return {
      sha: process.env.GITHUB_SHA || gitSha() || "unknown",
      date: `${result.startTime.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      kind,
      durationMs: Math.round(result.duration),
      ...(selection ? { selection } : {})
    };
  }
}

/** The `-g` / `--grep` of the command line, which selects the cases the run was asked for. */
export function grepOf(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-g" || a === "--grep") return argv[i + 1];
    if (a.startsWith("--grep=")) return a.slice("--grep=".length);
  }
  return undefined;
}

/** Options of `playwright test` that take a value and do not choose which tests run (`playwright test --help`, 1.64): skipped, with their value. */
const OPTIONS_WITH_A_VALUE = new Set([
  "-c",
  "--config",
  "-j",
  "--workers",
  "--retries",
  "--timeout",
  "--reporter",
  "--add-reporter",
  "--output",
  "--global-timeout",
  "--max-failures",
  "--trace",
  "--repeat-each",
  "--tsconfig",
  "--browser",
  "--ui-host",
  "--ui-port",
  "--update-source-method",
  "--last-failed-file",
  "--run-agents"
]);
/** Options whose value is optional (`[mode]`, `[seed]`, `[ref]`): the next word is the value only when it does not start with a dash, as the command line reads it. */
const OPTIONAL_VALUE = new Set(["-u", "--update-snapshots", "--debug", "--shuffle", "--only-changed"]);
/** Options that choose which tests run, with a value (`--project` takes a list of names). */
const SELECTING_WITH_A_VALUE = new Set(["-g", "--grep", "-G", "--grep-invert", "--project", "--shard", "--test-list", "--test-list-invert"]);
/** Options that choose which tests run, without a value or with an optional one. */
const SELECTING = new Set(["--last-failed", "--only-changed"]);

/**
 * What narrowed a `playwright test` run, as it was typed: `-g`, `-G` / `--grep-invert`, `--project`, `--shard`, `--test-list`, `--last-failed`, `--only-changed` and file arguments.
 * Options that only set how the run goes are left out, and so is the value they take, so that a selecting option after them is not swallowed (`--pass-with-no-tests -g x`,
 * `-u -g x`). undefined when nothing narrowed the run, and for any other command (`merge-reports`: its argument is a folder).
 */
export function selectionOf(argv: string[]): string | undefined {
  const at = argv.indexOf("test");
  if (at < 0) return undefined;
  const parts: string[] = [];
  for (let i = at + 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("-")) {
      parts.push(a); // a file filter
      continue;
    }
    const eq = a.indexOf("=");
    const name = eq < 0 ? a : a.slice(0, eq);
    const next = argv[i + 1];
    const optionalValue = OPTIONAL_VALUE.has(name) && eq < 0 && next !== undefined && !next.startsWith("-") ? next : undefined;
    if (SELECTING_WITH_A_VALUE.has(name)) {
      if (eq >= 0) parts.push(a);
      else {
        const values = [next ?? ""];
        // --project takes a list: the words after it that are not options are projects.
        if (name === "--project") while (argv[i + 1 + values.length] !== undefined && !argv[i + 1 + values.length]!.startsWith("-")) values.push(argv[i + 1 + values.length]!);
        parts.push([a, ...values].join(" ").trim());
        i += values.length;
      }
    } else if (SELECTING.has(name)) {
      parts.push(optionalValue ? `${a} ${optionalValue}` : a);
      if (optionalValue) i++;
    } else if (OPTIONAL_VALUE.has(name)) {
      if (optionalValue) i++;
    } else if (OPTIONS_WITH_A_VALUE.has(name) && eq < 0) i++;
    // any other option has no value (--headed, -x, --list, --pass-with-no-tests, --ui ...)
  }
  return parts.length ? parts.join(" ") : undefined;
}

function gitSha(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** How Playwright ended the test, as the report counts it: an expected failure (`test.fail()`) and a pass on a retry are passes. */
function outcomeStatus(test: TestCase): ReportCase["status"] {
  const o = test.outcome();
  return o === "unexpected" ? "failed" : o === "skipped" ? "skipped" : "passed";
}

/** The case result an attempt attached; undefined when it attached none, an Error when the attachment could not be read. */
function readResult(r: TestResult): CaseResult | Error | undefined {
  const a = r.attachments.find((x) => x.name === "qa-result");
  if (!a) return undefined;
  try {
    const text = a.body ? a.body.toString("utf8") : a.path ? readFileSync(a.path, "utf8") : undefined;
    if (text === undefined) return new Error("the qa-result attachment has neither a body nor a file");
    return JSON.parse(text) as CaseResult;
  } catch (e) {
    return new Error(`the qa-result attachment could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Playwright's own error for an attempt, as text without colours: how a case is failed that its checks do not explain. It is NOT cut here: the report removes the secrets from
 * it first and cuts it after (build.ts), so that a key that straddles a cut cannot leave a prefix behind.
 */
function errorText(r: TestResult): string {
  const text = (r.errors ?? [])
    .map((e) => e.message ?? "")
    .filter(Boolean)
    .join("\n\n");
  return stripVTControlCharacters(text || r.error?.message || "");
}

/**
 * Copies the screenshots a case refers to into `screens/<case>/` and rewrites the paths to be relative to the report. The path the case recorded is used when the file is still
 * there; in a merged report (shards from other machines) it is not, and the attachment of the same name stands in for it, in the order the case took them.
 */
function copyScreens(c: CaseResult, r: TestResult, out: string, dir: string): CaseResult {
  const dest = path.join(out, "screens", dir);
  const attachments = r.attachments.filter((a) => a.contentType === "image/png" && a.path && existsSync(a.path));
  const taken = new Set<unknown>();
  const done = new Map<string, string | undefined>();
  let count = 0;
  // Files are named by number and kind only: a label is the student's or the case's words and may hold a key, and names are not redacted.
  const bring = (orig: string | undefined, attachName: string, kind: "checkpoint" | "failed-check" | "stopped"): string | undefined => {
    if (!orig) return undefined;
    if (done.has(orig)) return done.get(orig);
    let from = existsSync(orig) ? orig : undefined;
    if (!from) {
      const a = attachments.find((x) => x.name === attachName && !taken.has(x));
      if (a) {
        taken.add(a);
        from = a.path;
      }
    }
    let rel: string | undefined;
    if (from) {
      mkdirSync(dest, { recursive: true });
      const name = `${++count}-${kind}.png`;
      copyFileSync(from, path.join(dest, name));
      rel = `screens/${dir}/${name}`;
    }
    done.set(orig, rel);
    return rel;
  };
  const screenshots = c.screenshots.flatMap((s) => {
    const p = bring(s.path, `checkpoint: ${s.name}`, "checkpoint");
    return p ? [{ name: s.name, path: p }] : [];
  });
  const checks = c.checks.map((k) => {
    if (!k.screenshot) return k;
    const { screenshot: _drop, ...rest } = k;
    const stop = k.kind === "step" && k.ok === false;
    const p = bring(k.screenshot, stop ? `stopped at: ${k.step ?? ""}` : `failed check: ${k.label}`, stop ? "stopped" : "failed-check");
    return p ? { ...rest, screenshot: p } : rest;
  });
  let stoppedAt = c.stoppedAt;
  if (stoppedAt) {
    const p = bring(stoppedAt.screenshot, `stopped at: ${stoppedAt.step}`, "stopped");
    stoppedAt = { ...stoppedAt, screenshot: p ?? "" };
  }
  return { ...c, screenshots, checks, ...(stoppedAt ? { stoppedAt } : {}) };
}

/** Copies the trace of a failed case, unless it holds the live-AI key (the replay records request bodies); returns whether it was copied. */
async function copyTrace(r: TestResult, status: ReportCase["status"], dir: string, name: string, secrets: string[]): Promise<boolean> {
  if (status !== "failed") return false;
  const trace = r.attachments.find((a) => a.name === "trace" && a.path && existsSync(a.path));
  if (!trace?.path) return false;
  if (secrets.length && (await zipHoldsSecret(readFileSync(trace.path), secrets))) {
    console.warn(`QA report: the trace ${name} holds the live-AI key, so it was not copied into the report (live-AI cases run with traces off).`);
    return false;
  }
  mkdirSync(dir, { recursive: true });
  copyFileSync(trace.path, path.join(dir, name));
  return true;
}
