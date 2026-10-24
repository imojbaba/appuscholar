import { stripVTControlCharacters } from "node:util";
import { test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type { ShimLogEntry } from "../provider-shim/core.mjs";
import { failsCase, loadKnown, matchKnown, missingKnownIds, type KnownEntry } from "./known";
import { readProviderLog } from "./providerLog";
import { RULE_LABEL, Watcher, type Allow, type DialogType, type WatcherRule } from "./watcher";

export type StoryId = "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "S11" | "L";

/** The situation a case is tried in (spec section 6). */
export type Situation = {
  vault?: "off" | "open" | "locked" | "forgotten";
  network?: "fine" | "drop" | "slow";
  screen?: "desktop" | "phone";
  lang?: "en" | "hi";
  data?: "realistic" | "empty" | "huge" | "messy";
  ai?: "answers" | "fails" | "slow" | "live";
};

/** What a case is: `steps` are the names `qa.step` accepts; `code` is the folders the fix brief names. */
export type CaseMeta = { story: StoryId; id: string; goal: string; situation: Situation; steps: string[]; code?: string[] };

export type CheckKind = "data" | "visual" | "conceptual";
export type FailKind = "ui" | "error" | "unexpected" | "slow";

/**
 * One result inside a case. `kind` is the kind of the check; "watcher" is a finding nobody looked for (and a step that did not complete), "time" a `timed`.
 * `ok: null` is NOT CHECKED: it measured nothing, and says why in `message`. `known` is the id the check names, which may be one known.json lacks (see CaseResult.missingKnown).
 */
export type CheckResult = {
  kind: CheckKind | "watcher" | "time";
  label: string;
  ok: boolean | null;
  fail?: FailKind;
  message?: string;
  source?: string;
  known?: string;
  step?: string;
  screenshot?: string;
};

/**
 * Everything the report needs of one case. The steps not reached are `meta.steps` without `reached`. The screenshots are files in the test's output folder.
 * `missingKnown`: ids that checks name and known.json lacks (they count as no id; the reporter warns). `selfTest`: a case of the fixture's own tests, whose failures are on purpose.
 */
export type CaseResult = {
  meta: CaseMeta;
  checks: CheckResult[];
  reached: string[];
  stoppedAt?: { step: string; url: string; screenshot: string; reason: string };
  blocked?: string;
  screenshots: Array<{ name: string; path: string }>;
  keys: string[];
  durationMs: number;
  missingKnown?: string[];
  selfTest?: boolean;
};

type CheckOptions = { source?: string; known?: string };

export interface Qa {
  /** Announces the case. Call it first, once. */
  begin(meta: CaseMeta): void;
  /**
   * A named part of the path, one of `meta.steps`. When `fn` throws, the case ends here: `stoppedAt` holds the step, the page, a screenshot and the error, the steps after it
   * are not reached, and the error goes on up (the test fails). A failed `check` inside a step does not end it.
   */
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /**
   * One expected outcome. `fn` asserts (Playwright `expect` inside it); a failure is recorded with the kind's failure (data and conceptual: Unexpected, visual: UI), a screenshot
   * and the message, and the case carries on. Returns whether it held. `fn` can call `notChecked(reason)` when it measured nothing: recorded as NOT CHECKED, and false is returned.
   * `source` is the sheet row or rule the expectation comes from; `known` the id in known.json of a fault this check is waiting on.
   */
  check(kind: CheckKind, label: string, fn: () => Promise<void>, o?: CheckOptions): Promise<boolean>;
  /** Runs `fn` and records how long it took against `budgetMs` (budgets.ts). Over the budget is `FAIL: Slow`. What `fn` returns, or throws, goes on to the caller. */
  timed<T>(label: string, budgetMs: number, fn: () => Promise<T>, o?: CheckOptions): Promise<T>;
  /** A full-page screenshot of the screen as it stands, attached and listed. The layout, accessibility and Hindi rules join it in Task 5. */
  checkpoint(name: string, o?: { layout?: boolean; axe?: boolean; exempt?: string[] }): Promise<void>;
  /** What this case expects the watcher to see, from now on: hosts it may reach, console errors it may print, statuses (4xx or 5xx) it may be answered with. */
  allow(o: Allow): void;
  /** The next dialog of this type is expected, and is accepted or dismissed. A dialog not announced is an Error. */
  expectDialog(type: DialogType, accept: boolean): void;
  /** The AI key whose provider log belongs to this case (`newStudent` calls it). */
  useKey(key: string): void;
  /** The case cannot go on (an outside service is down, a wall in the way). It ends on the page that stopped it, as a skipped test: BLOCKED, not a failure. */
  blocked(reason: string): never;
  /** Selftests set it: no throw at the end when checks failed. */
  selfTest: boolean;
  result(): CaseResult;
}

/** What `check` and `timed` take when they measured nothing. */
export class NotChecked extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NotChecked";
  }
}

/** Ends a check as NOT CHECKED (ok: null) with the reason it measured nothing: a rule that found no text to read, a build that carries no commit. Never a pass. */
export function notChecked(reason: string): never {
  throw new NotChecked(reason);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** An error as text for the report: the message without the colours Playwright puts in it. */
const errorText = (e: unknown, n: number): string => clip(stripVTControlCharacters(e instanceof Error ? e.message : String(e)).trim(), n);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "shot";
const FAIL_OF: Record<CheckKind, FailKind> = { data: "unexpected", visual: "ui", conceptual: "unexpected" };

export class QaCase implements Qa {
  selfTest = false;
  private meta: CaseMeta | undefined;
  private readonly checks: CheckResult[] = [];
  private readonly reached: string[] = [];
  /** The steps being run, the innermost last. */
  private readonly active: string[] = [];
  private readonly shots: Array<{ name: string; path: string }> = [];
  private readonly keys = new Set<string>();
  private stopped: CaseResult["stoppedAt"];
  private blockedReason: string | undefined;
  private shotCount = 0;
  private readonly startedAt = Date.now();
  private readonly watcher: Watcher;

  private constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
    private readonly known: KnownEntry[],
    private readonly readLog: () => ShimLogEntry[],
    context: BrowserContext
  ) {
    this.watcher = new Watcher({ context, page, step: () => this.active.at(-1) });
  }

  /** The case's `qa`: known.json loaded (a malformed file stops every case, not hides a fault) and the watcher listening. */
  static async start(o: { page: Page; context: BrowserContext; testInfo: TestInfo; readLog?: () => ShimLogEntry[] }): Promise<QaCase> {
    const qa = new QaCase(o.page, o.testInfo, loadKnown(), o.readLog ?? (() => readProviderLog()), o.context);
    await qa.watcher.start();
    return qa;
  }

  begin(meta: CaseMeta): void {
    if (this.meta) throw new Error(`QA: qa.begin() was called twice; a case begins once (${this.meta.id}, then ${meta.id}).`);
    this.meta = meta;
  }

  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const meta = this.needMeta("step");
    if (!meta.steps.includes(name)) throw new Error(`QA: step ${JSON.stringify(name)} of ${meta.id} was not announced in meta.steps (${meta.steps.map((s) => JSON.stringify(s)).join(", ")}).`);
    if (!this.reached.includes(name)) this.reached.push(name);
    this.active.push(name);
    try {
      return await test.step(name, fn);
    } catch (e) {
      // The first step to see the error is the one that stopped the case (steps can nest); a blocked case is not a failure.
      if (!this.stopped) await this.recordStop(name, this.blockedReason ?? errorText(e, 600), this.blockedReason === undefined);
      throw e;
    } finally {
      this.active.pop();
    }
  }

  async check(kind: CheckKind, label: string, fn: () => Promise<void>, o: CheckOptions = {}): Promise<boolean> {
    this.needMeta("check");
    const base = { kind, label, ...this.tags(o) };
    try {
      await fn();
      this.checks.push({ ...base, ok: true });
      return true;
    } catch (e) {
      if (this.blockedReason !== undefined) throw e; // qa.blocked() inside the check: the case ends, this is not a failed check
      if (e instanceof NotChecked) {
        this.checks.push({ ...base, ok: null, message: e.message });
        return false;
      }
      const screenshot = await this.shoot("failed-check", label, `failed check: ${label}`, { fullPage: false, strict: false });
      this.checks.push({ ...base, ok: false, fail: FAIL_OF[kind], message: errorText(e, 2000), ...(screenshot ? { screenshot } : {}) });
      return false;
    }
  }

  async timed<T>(label: string, budgetMs: number, fn: () => Promise<T>, o: CheckOptions = {}): Promise<T> {
    this.needMeta("timed");
    const base = { kind: "time" as const, label, ...this.tags(o) };
    const started = performance.now();
    let value: T;
    try {
      value = await fn();
    } catch (e) {
      // Nothing was measured: it is not a pass, and not a slow one. The error goes on.
      if (this.blockedReason === undefined) this.checks.push({ ...base, ok: null, message: `not measured: ${errorText(e, 300)}` });
      throw e;
    }
    const ms = Math.round(performance.now() - started);
    const within = ms <= budgetMs;
    const message = `took ${ms.toLocaleString("en-US")} ms; the budget is ${budgetMs.toLocaleString("en-US")} ms`;
    this.checks.push({ ...base, ok: within, ...(within ? {} : { fail: "slow" as const }), message });
    return value;
  }

  async checkpoint(name: string, _o?: { layout?: boolean; axe?: boolean; exempt?: string[] }): Promise<void> {
    void _o; // Task 5 measures the layout, accessibility and Hindi rules here; for now a checkpoint is its screenshot
    this.needMeta("checkpoint");
    const path = await this.shoot("checkpoint", name, `checkpoint: ${name}`, { fullPage: true, strict: true });
    if (path) this.shots.push({ name, path });
  }

  allow(o: Allow): void {
    this.watcher.allow(o);
  }

  expectDialog(type: DialogType, accept: boolean): void {
    this.watcher.expectDialog(type, accept);
  }

  useKey(key: string): void {
    this.keys.add(key);
  }

  blocked(reason: string): never {
    this.needMeta("blocked");
    this.blockedReason ??= reason;
    // Ends the test where it stands, as skipped: the nearest step (or finish) records the page.
    this.testInfo.skip(true, reason);
    throw new Error("QA: the test did not end at qa.blocked()");
  }

  result(): CaseResult {
    const meta = this.needMeta("result");
    const checks = [...this.checks, ...this.watcherChecks(), ...this.providerChecks()];
    const missingKnown = missingKnownIds(checks, this.known);
    return {
      meta,
      checks,
      reached: [...this.reached],
      ...(this.stopped ? { stoppedAt: { ...this.stopped } } : {}),
      ...(this.blockedReason !== undefined ? { blocked: this.blockedReason } : {}),
      screenshots: this.shots.map((s) => ({ ...s })),
      keys: [...this.keys],
      durationMs: Date.now() - this.startedAt,
      ...(missingKnown.length ? { missingKnown } : {}),
      ...(this.selfTest || this.testInfo.tags.includes("@selftest") ? { selfTest: true } : {})
    };
  }

  /**
   * The end of the case, run by the fixture after the test: notes where an error or a timeout that no step caught ended the case, attaches `qa-result`, and turns the
   * failed checks (no known id, an id known.json lacks, or a fixed one) into a thrown error so that Playwright marks the case failed and CI goes red.
   */
  async finish(): Promise<void> {
    if (!this.meta) {
      // A test that failed or was skipped before it began has no case to report; any other test must say what it is.
      if (this.testInfo.status === "skipped" || this.testInfo.errors.length > 0) return;
      throw new Error("QA: this test never called qa.begin(meta), so there is no case to report. Every test that imports test from qa/support/test.ts begins its case first.");
    }
    await this.noteStopNobodyCaught();
    const result = this.result();
    await this.testInfo.attach("qa-result", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    if (this.selfTest) return;
    const failing = result.checks.filter((c) => failsCase(c, this.known));
    if (failing.length === 0) return;
    const lines = failing.map((c) => `  - [${c.kind}${c.fail ? `, ${c.fail}` : ""}] ${c.label}${this.knownNote(c)}: ${clip((c.message ?? "").split("\n")[0]!, 200)}`);
    throw new Error(`QA ${result.meta.id}: ${failing.length} check${failing.length === 1 ? "" : "s"} failed.\n${lines.join("\n")}`);
  }

  /** Why a check that names a known id still fails the case. */
  private knownNote(c: CheckResult): string {
    if (!c.known) return "";
    return this.known.find((k) => k.id === c.known)?.status === "fixed" ? ` (${c.known} was fixed: it has come back)` : ` (${c.known} is not in known.json)`;
  }

  private needMeta(what: string): CaseMeta {
    if (!this.meta) throw new Error(`QA: qa.begin(meta) must be called before qa.${what}().`);
    return this.meta;
  }

  private tags(o: CheckOptions): Pick<CheckResult, "source" | "known" | "step"> {
    const step = this.active.at(-1);
    return { ...(o.source ? { source: o.source } : {}), ...(o.known ? { known: o.known } : {}), ...(step ? { step } : {}) };
  }

  /** The case ends here: the page it stopped on, as the student would see it, and why. A failure (not a block) is also recorded as an Error finding, so that the marks follow from the checks. */
  private async recordStop(step: string, reason: string, failure: boolean): Promise<void> {
    const screenshot = await this.shoot("stopped", step, `stopped at: ${step}`, { fullPage: false, strict: false });
    this.stopped = { step, url: this.page.url(), screenshot: screenshot ?? "", reason };
    if (failure) {
      this.checks.push({ kind: "watcher", label: `step "${step}" did not complete`, ok: false, fail: "error", message: reason, step, ...(screenshot ? { screenshot } : {}) });
    }
  }

  /** An error thrown outside every step, a timeout, or `blocked()` outside a step: the case still says where it ended (a case never stops silently). */
  private async noteStopNobodyCaught(): Promise<void> {
    if (this.stopped) return;
    // A timeout leaves the step it interrupted running: that one is the step. Otherwise the case was between steps, and the last one it reached is named.
    const inStep = this.active.at(-1);
    const where = inStep ?? this.reached.at(-1) ?? "(before the first step)";
    const between = inStep ? "" : this.reached.length ? ` (between steps, after "${where}")` : " (before the first step)";
    if (this.blockedReason !== undefined) return void (await this.recordStop(where, this.blockedReason, false));
    if (this.testInfo.status === "timedOut") return void (await this.recordStop(where, `the test timed out after ${this.testInfo.timeout.toLocaleString("en-US")} ms${between}`, true));
    const error = this.testInfo.errors[0];
    if (error) await this.recordStop(where, errorText(error.message ?? error.value ?? "an error", 600) + between, true);
  }

  /** The screenshot's file, attached to the test; undefined when the page could not be captured (closed, crashed) and the caller can do without. */
  private async shoot(prefix: string, name: string, attachAs: string, o: { fullPage: boolean; strict: boolean }): Promise<string | undefined> {
    const file = this.testInfo.outputPath(`${prefix}-${++this.shotCount}-${slug(name)}.png`);
    try {
      await this.page.screenshot({ path: file, fullPage: o.fullPage, timeout: 15_000 });
    } catch (e) {
      if (o.strict) throw e;
      return undefined;
    }
    await this.testInfo.attach(attachAs, { path: file, contentType: "image/png" });
    return file;
  }

  private finding(rule: WatcherRule, message: string, step?: string): CheckResult {
    const known = matchKnown({ rule, text: message }, this.known);
    return { kind: "watcher", label: RULE_LABEL[rule], ok: false, fail: "error", message, ...(known ? { known: known.id } : {}), ...(step ? { step } : {}) };
  }

  private watcherChecks(): CheckResult[] {
    return this.watcher.findings().map((f) => this.finding(f.rule, f.message, f.step));
  }

  /**
   * The fake provider's log for this case's keys. A request it could not answer (no recorded reply: `unknown`), one for a provider it does not fake (`refused`: the QA key was
   * kept from a real host) and one it could not take (`failed` with mode `invalid`, a key that is not a test key) mean the case or the fixtures are wrong, not that the app is.
   */
  private providerChecks(): CheckResult[] {
    if (this.keys.size === 0) return [];
    const out: CheckResult[] = [];
    for (const e of this.readLog()) {
      if (!this.keys.has(e.key)) continue;
      const asked = `“${e.prompt.slice(0, 120)}”`;
      if (e.outcome === "unknown") out.push(this.finding("provider", `${e.host} had no recorded reply for the prompt ${asked}`));
      else if (e.outcome === "refused") out.push(this.finding("provider", `${e.host} is not faked, so the request was refused and the key went nowhere; the prompt was ${asked}`));
      else if (e.outcome === "failed" && e.mode === "invalid") out.push(this.finding("provider", `${e.host} was reached with a key that is not a QA test key; the prompt was ${asked}`));
    }
    return out;
  }
}
