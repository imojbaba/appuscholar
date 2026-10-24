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
import { buildReport, isFixtureMechanics, secretForms, type ReportCase, type RunInfo, type Unreported } from "./report/build";
import { loadKnown } from "./support/known";
import { readProviderLog } from "./support/providerLog";
import type { CaseResult } from "./support/qa";

export type QaReporterOptions = {
  /** Where the report goes. By default `QA_REPORT_DIR`, else `qa-report` in the folder the run was started from (apps/web). */
  outputDir?: string;
  /** The fake provider's log (a test gives its own). By default the run's QA_PROVIDER_LOG. */
  providerLog?: string;
  /** The command line of the run, to read the `-g` filter from (Playwright keeps it out of the config it hands a reporter). By default process.argv. */
  argv?: string[];
};

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
        const error = parsed instanceof Error ? parsed.message : final.error?.message;
        unreported.push({ title, status, ...(error ? { error: stripVTControlCharacters(error) } : {}) });
        continue;
      }
      const n = (usedIds.get(parsed.meta.id) ?? 0) + 1;
      usedIds.set(parsed.meta.id, n);
      const dir = n === 1 ? slug(parsed.meta.id) : `${slug(parsed.meta.id)}-${n}`;
      if (parsed.selfTest !== true && isFixtureMechanics(parsed.meta.id, test.expectedStatus === "failed")) parsed.selfTest = true;
      const trace = parsed.selfTest ? undefined : await copyTrace(final, status, path.join(out, "traces"), `${dir}.zip`, redact);
      const earlier = test.results.slice(0, -1).flatMap((r) => failuresOf(r));
      cases.push({
        // The fixture's own cases are left out of the report, so their pictures are not copied.
        ...(parsed.selfTest ? parsed : copyScreens(parsed, final, out, dir)),
        retries: final.retry,
        status,
        ...(earlier.length ? { earlierFailures: earlier } : {}),
        ...(trace ? { trace: `traces/${dir}.zip` } : {})
      });
    }

    const runErrors = this.providerErrors();
    const { summaryMd, fixBriefMd, html, json } = buildReport(cases, known, this.runInfo(result), { redact, runErrors, unreported });
    writeFileSync(path.join(out, "summary.md"), summaryMd);
    writeFileSync(path.join(out, "fix-brief.md"), fixBriefMd);
    writeFileSync(path.join(out, "index.html"), html);
    writeFileSync(path.join(out, "results.json"), json);
    console.log(`QA report: ${path.join(out, "index.html")}`);
    return { runErrors };
  }

  /** Spec ruling R13: any request the fake provider took with a key that is not a test key is an Error of the run. */
  private providerErrors(): string[] {
    try {
      const strays = readProviderLog(this.options.providerLog).filter((e) => e.key === NOT_A_QA_KEY);
      if (strays.length === 0) return [];
      const hosts = [...new Set(strays.map((e) => e.host))].join(", ");
      return [`A non-test key reached the provider path: ${strays.length} request${strays.length === 1 ? "" : "s"} to ${hosts} carried a key that is not a gsk_qa_ test key. The key itself is never written down.`];
    } catch (e) {
      return [`The fake provider's log could not be read, so a non-test key reaching the provider path would not be seen: ${e instanceof Error ? e.message : String(e)}`];
    }
  }

  private runInfo(result: FullResult): RunInfo {
    const filter = grepOf(this.options.argv ?? process.argv);
    const asked = process.env.QA_RUN_KIND;
    const kind: RunInfo["kind"] = asked === "slice" || asked === "full" || asked === "release" ? asked : filter?.includes("@slice") ? "slice" : "full";
    return {
      sha: process.env.GITHUB_SHA || gitSha() || "unknown",
      date: `${result.startTime.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      kind,
      durationMs: Math.round(result.duration),
      ...(filter ? { filter } : {})
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

/** What failed on an attempt, one line per failed check: for a case that passed only on a retry. */
function failuresOf(r: TestResult): string[] {
  const parsed = readResult(r);
  if (parsed && !(parsed instanceof Error)) {
    const lines = parsed.checks.filter((c) => c.ok === false).map((c) => `${c.label}: ${gist(c.message ?? "")}`);
    if (lines.length) return lines;
  }
  return r.status === "passed" || r.status === "skipped" ? [] : [`the attempt ${r.status}${r.error?.message ? `: ${gist(r.error.message)}` : ""}`];
}

/** The first lines of a failure message that say something, as one line: "expect(received).toBe(expected) / Expected: 3 / Received: 2". */
function gist(s: string): string {
  const lines = stripVTControlCharacters(s).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const text = lines.join(" / ");
  return text.length > 300 ? text.slice(0, 299) + "…" : text;
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
  const bring = (orig: string | undefined, attachName: string): string | undefined => {
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
      const name = `${++count}-${slug(attachName)}.png`;
      copyFileSync(from, path.join(dest, name));
      rel = `screens/${dir}/${name}`;
    }
    done.set(orig, rel);
    return rel;
  };
  const screenshots = c.screenshots.flatMap((s) => {
    const p = bring(s.path, `checkpoint: ${s.name}`);
    return p ? [{ name: s.name, path: p }] : [];
  });
  const checks = c.checks.map((k) => {
    if (!k.screenshot) return k;
    const { screenshot: _drop, ...rest } = k;
    const p = bring(k.screenshot, k.kind === "step" && k.ok === false ? `stopped at: ${k.step ?? ""}` : `failed check: ${k.label}`);
    return p ? { ...rest, screenshot: p } : rest;
  });
  let stoppedAt = c.stoppedAt;
  if (stoppedAt) {
    const p = bring(stoppedAt.screenshot, `stopped at: ${stoppedAt.step}`);
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
