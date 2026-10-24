import { stripVTControlCharacters } from "node:util";
import { test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { FAILURE_MODES, type ShimLogEntry } from "../provider-shim/core.mjs";
import { failsCase, loadKnown, matchKnown, missingKnownIds, type KnownEntry } from "./known";
import { LAYOUT_LABEL, measureLayout, planChecks, readScreen, type LayoutRule, type RulePlan } from "./layout";
import { readProviderLog } from "./providerLog";
import { redactLiveKey } from "./secrets";
import { RULE_LABEL, Watcher, type Allow, type Allowance, type DialogType, type Note, type WatcherRule } from "./watcher";

export type { Allow, Allowance, Note };

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
 * One result inside a case. `kind` is the kind of the check; "watcher" is a finding nobody looked for, "time" a `timed`, and "step" is about the path itself:
 * a step that did not complete (a failure, `fail: "error"`), and each step a stopped case did not reach (NOT CHECKED).
 * `ok: null` is NOT CHECKED: it measured nothing, and says why in `message`. `known` is the id the check names, which may be one known.json lacks (see CaseResult.missingKnown).
 */
export type CheckResult = {
  kind: CheckKind | "watcher" | "time" | "step";
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
 * Everything the report needs of one case. The screenshots are files in the test's output folder.
 * `missingKnown`: ids that checks name and known.json lacks (they count as no id; the reporter warns).
 * `allowed`: what the case excused, with the reason and the number of times (every allowance the case made, and the built-in ones that excused something).
 * `notes`: what the watcher saw and did not count as an Error (a library's refusal of eval), with counts.
 * `selfTest`: a case of the fixture's own mechanics tests (`qa.selfTest = true`), whose failures are on purpose.
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
  allowed?: Allowance[];
  notes?: Note[];
  selfTest?: boolean;
};

type CheckOptions = { source?: string; known?: string };

export interface Qa {
  /** Announces the case. Call it first, once. */
  begin(meta: CaseMeta): void;
  /**
   * A named part of the path, one of `meta.steps`. When `fn` throws, the case ends here: `stoppedAt` holds the step, the page, a screenshot and the error, the steps after it
   * are not reached (each is a NOT CHECKED in the result), and the error goes on up (the test fails). A failed `check` inside a step does not end it.
   * `page`: the page the step acts on, for the screenshot and the address of a stop. By default the fixture's page, or the page of the step it is inside; a step after a
   * step on another page does not inherit that page, so give `page` on every step of a second browser.
   */
  step<T>(name: string, fn: () => Promise<T>, o?: { page?: Page }): Promise<T>;
  /**
   * One expected outcome. `fn` asserts with Playwright's `expect` (the hard one: a soft failure also fails the Playwright test, even for a check that names a known fault, so it
   * is not supported inside a check); a failure is recorded with the kind's failure (data and conceptual: Unexpected, visual: UI),
   * a screenshot of `page` (the step's page by default) and the message, and the case carries on. Returns whether it held. `fn` can call `notChecked(reason)` when it measured
   * nothing: recorded as NOT CHECKED, and false is returned. `source` is the sheet row or rule the expectation comes from; `known` the id in known.json of a fault this check is waiting on.
   */
  check(kind: CheckKind, label: string, fn: () => Promise<void>, o?: CheckOptions & { page?: Page }): Promise<boolean>;
  /** Runs `fn` and records how long it took against `budgetMs` (budgets.ts). Over the budget is `FAIL: Slow`. What `fn` returns, or throws, goes on to the caller. */
  timed<T>(label: string, budgetMs: number, fn: () => Promise<T>, o?: CheckOptions): Promise<T>;
  /**
   * A checkpoint: a full-page screenshot of the screen (of `page`, the step's page by default) as it stands, attached and listed, and the Visual rules of spec section 8 measured
   * on it (layout.ts), each recorded as one visual check labelled "<name>: <what the rule demands>": no sideways page scroll, nothing past the window's edge, no text cut off,
   * no two controls on top of each other, and (on a phone) every control at least 44 px each way, (in Hindi) no English on the screen, and the axe scan (serious and critical).
   * A rule that found something fails as UI, unless a known fault fits it (known.json `match`); a rule that looked at nothing is NOT CHECKED with the reason.
   * The page tells which rules apply: it is in Hindi when `<html lang>` says so, and a phone when it has a coarse pointer on a narrow window (the `phone` project). A rule that
   * does not apply is not recorded. A case that declares Hindi (`situation.lang`) on a page that says otherwise has its Hindi rule NOT CHECKED, not skipped.
   * `layout: false` leaves out the six layout rules, `axe: false` the scan (the huge-data screens, where it would take long). `exempt`: test ids of boxes that hold the student's own
   * words (a library list, a transcript), which the Hindi rule does not read; so is the editor, and the project's name and question (STUDENT_TEXT_IDS in layout.ts).
   */
  checkpoint(name: string, o?: { layout?: boolean; axe?: boolean; exempt?: string[]; page?: Page }): Promise<void>;
  /**
   * What this case expects the watcher to see, from now on: hosts it may reach; console errors it may print, each with a pattern and a reason; answers it expects from a
   * server, each with method, path, status and a reason. Nothing is allowed by a bare status. The result lists every allowance with its reason and how often it excused something.
   */
  allow(o: Allow): void;
  /** The next dialog of this type is expected, and is accepted or dismissed. A dialog not announced is an Error; one announced that never comes is NOT CHECKED. */
  expectDialog(type: DialogType, accept: boolean): void;
  /** The next load of the page (by default the page of the step it is called in, else the fixture's) is expected: a click that really navigates. An announced load that never comes is NOT CHECKED. */
  expectLoad(o?: { page?: Page }): void;
  /**
   * Watches a browser context the case made (`browser.newContext()`), or the context of a page, and every page it has and opens: page errors, console, answers, hosts, dialogs, CSP
   * and unexplained loads, as for the fixture's own page. Call it before the context opens its pages. The fixture's own context is watched from the start.
   */
  watch(target: Page | BrowserContext): Promise<void>;
  /** The AI key whose provider log belongs to this case (`newStudent` calls it). */
  useKey(key: string): void;
  /** The case cannot go on (an outside service is down, a wall in the way). It ends on the page that stopped it, as a skipped test: BLOCKED, not a failure. */
  blocked(reason: string): never;
  /** Set by the fixture's own mechanics tests only: no throw at the end when checks failed, and the result is marked as such. */
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

/** Cuts `s` to `n` characters. The live-AI key is taken out first (secrets.ts): cut first and a prefix of it would stay in the text. Every cut of a message goes through here. */
const clip = (s: string, n: number) => {
  const t = redactLiveKey(s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
/** An error as text for the report: the message without the colours Playwright puts in it. */
const plain = (message: string, n: number): string => clip(stripVTControlCharacters(message).trim(), n);
const errorText = (e: unknown, n: number): string => plain(e instanceof Error ? e.message : String(e), n);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "shot";
const FAIL_OF: Record<CheckKind, FailKind> = { data: "unexpected", visual: "ui", conceptual: "unexpected" };

export class QaCase implements Qa {
  selfTest = false;
  private meta: CaseMeta | undefined;
  private readonly checks: CheckResult[] = [];
  private readonly reached: string[] = [];
  /** The steps being run, the innermost last, and the page each acts on. */
  private readonly active: Array<{ name: string; page: Page }> = [];
  /** The page of the step that ran last, for a stop that no step caught. */
  private lastPage: Page | undefined;
  private readonly shots: Array<{ name: string; path: string }> = [];
  private readonly keys = new Set<string>();
  /** The indexes in testInfo.errors that belong to a check (a soft expectation that failed inside it), which are not a stop. */
  private readonly accounted = new Set<number>();
  private stopped: CaseResult["stoppedAt"];
  private blockedReason: string | undefined;
  private shotCount = 0;
  private readonly startedAt = Date.now();
  private readonly watcher: Watcher;

  private constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
    private readonly known: KnownEntry[],
    private readonly readLog: () => ShimLogEntry[]
  ) {
    this.watcher = new Watcher({ step: () => this.active.at(-1)?.name });
  }

  /** The case's `qa`: known.json loaded (a malformed file stops every case, not hides a fault) and the watcher listening on the fixture's context. */
  static async start(o: { page: Page; context: BrowserContext; testInfo: TestInfo; readLog?: () => ShimLogEntry[] }): Promise<QaCase> {
    const qa = new QaCase(o.page, o.testInfo, loadKnown(), o.readLog ?? (() => readProviderLog()));
    await qa.watcher.watch(o.context);
    return qa;
  }

  begin(meta: CaseMeta): void {
    if (this.meta) throw new Error(`QA: qa.begin() was called twice; a case begins once (${this.meta.id}, then ${meta.id}).`);
    this.meta = meta;
  }

  async step<T>(name: string, fn: () => Promise<T>, o: { page?: Page } = {}): Promise<T> {
    const meta = this.needMeta("step");
    if (!meta.steps.includes(name)) throw new Error(`QA: step ${JSON.stringify(name)} of ${meta.id} was not announced in meta.steps (${meta.steps.map((s) => JSON.stringify(s)).join(", ")}).`);
    if (!this.reached.includes(name)) this.reached.push(name);
    const page = o.page ?? this.declaredPage();
    this.active.push({ name, page });
    try {
      return await test.step(name, fn);
    } catch (e) {
      // The first step to see the error is the one that stopped the case (steps can nest); a blocked case is not a failure.
      if (!this.stopped) await this.recordStop(name, this.blockedReason ?? errorText(e, 600), this.blockedReason === undefined, page);
      throw e;
    } finally {
      this.active.pop();
      this.lastPage = page;
    }
  }

  async check(kind: CheckKind, label: string, fn: () => Promise<void>, o: CheckOptions & { page?: Page } = {}): Promise<boolean> {
    this.needMeta("check");
    const base = { kind, label, ...this.tags(o) };
    const errorsBefore = this.testInfo.errors.length;
    let failure: string | undefined;
    let measuredNothing: string | undefined;
    try {
      await fn();
    } catch (e) {
      if (this.blockedReason !== undefined) throw e; // qa.blocked() inside the check: the case ends, this is not a failed check
      if (e instanceof NotChecked) measuredNothing = e.message;
      else failure = errorText(e, 2000);
    }
    // expect.soft does not throw: it records the failure on the test. Those errors belong to this check, however it ended. They fail it, and are not a stop that no step caught.
    const soft: string[] = [];
    for (let i = errorsBefore; i < this.testInfo.errors.length; i++) {
      this.accounted.add(i);
      soft.push(plain(this.testInfo.errors[i]!.message ?? "an expectation failed", 2000));
    }
    failure ??= soft.length ? clip(soft.join("\n\n"), 2000) : undefined;
    if (failure === undefined && measuredNothing !== undefined) {
      this.checks.push({ ...base, ok: null, message: measuredNothing });
      return false;
    }
    if (failure === undefined) {
      this.checks.push({ ...base, ok: true });
      return true;
    }
    const screenshot = await this.shoot(o.page ?? this.currentPage(), "failed-check", label, `failed check: ${label}`, { fullPage: false, strict: false });
    this.checks.push({ ...base, ok: false, fail: FAIL_OF[kind], message: failure, ...(screenshot ? { screenshot } : {}) });
    return false;
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

  async checkpoint(name: string, o?: { layout?: boolean; axe?: boolean; exempt?: string[]; page?: Page }): Promise<void> {
    const meta = this.needMeta("checkpoint");
    const page = o?.page ?? this.currentPage();
    const plans: RulePlan[] = [];
    if (o?.layout !== false || o?.axe !== false) {
      const screen = await readScreen(page);
      const rules: LayoutRule[] = [];
      if (o?.layout !== false) {
        rules.push("sideways-scroll", "off-edge", "cut-off", "overlap");
        if (screen.phone) rules.push("small-target");
        if (screen.lang === "hi") rules.push("english-in-hindi");
      }
      if (o?.axe !== false) rules.push("axe");
      // Measured before the screenshot: it waits for what is moving to stop, so the picture is of the screen the rules saw.
      const measure = await measureLayout(page, { phone: screen.phone, lang: screen.lang, exempt: o?.exempt, rules });
      plans.push(...planChecks(measure, { name, rules, known: this.known }));
      if (o?.layout !== false && (meta.situation.screen === "phone" || this.testInfo.project.use.isMobile === true) && !screen.phone) {
        // The case runs on a phone and the page does not read as one: touch targets measured on it would be a desktop's. Say that none were, rather than skip them.
        plans.push({
          rule: "small-target",
          label: `${name}: ${LAYOUT_LABEL["small-target"]}`,
          outcome: { notChecked: `the case runs on a phone, but the page does not read as one (coarse pointer: ${screen.coarse}, window ${screen.width} px wide), so touch targets were not measured` }
        });
      }
      if (o?.layout !== false && meta.situation.lang === "hi" && screen.lang !== "hi") {
        // The case is in Hindi and the page is not: the language did not switch (or was switched back). Reading English as English would pass; say that nothing was read.
        plans.push({
          rule: "english-in-hindi",
          label: `${name}: ${LAYOUT_LABEL["english-in-hindi"]}`,
          outcome: { notChecked: `the case is in Hindi, but the page says lang="${screen.htmlLang}", so its words were not read as Hindi` }
        });
      }
    }
    const path = await this.shoot(page, "checkpoint", name, `checkpoint: ${name}`, { fullPage: true, strict: true });
    if (path) this.shots.push({ name, path });
    for (const plan of plans) {
      const source = plan.rule === "axe" ? "spec section 8: the axe scan" : "spec section 8: layout rules";
      if ("error" in plan.outcome) {
        // The check of the screen itself broke: an Error finding (not a UI one), and the case is red.
        const screenshot = await this.shoot(page, "failed-check", plan.label, `failed check: ${plan.label}`, { fullPage: false, strict: false });
        this.checks.push({ kind: "visual", label: plan.label, ok: false, fail: "error", message: plain(plan.outcome.error, 2000), source, ...this.tags({}), ...(screenshot ? { screenshot } : {}) });
        continue;
      }
      await this.check(
        "visual",
        plan.label,
        async () => {
          if ("notChecked" in plan.outcome) notChecked(plan.outcome.notChecked);
          if ("fail" in plan.outcome) throw new Error(plan.outcome.fail);
        },
        { source, page, ...(plan.known ? { known: plan.known } : {}) }
      );
    }
  }

  allow(o: Allow): void {
    this.watcher.allow(o);
  }

  expectDialog(type: DialogType, accept: boolean): void {
    this.watcher.expectDialog(type, accept);
  }

  expectLoad(o: { page?: Page } = {}): void {
    this.watcher.expectLoad(o.page ?? this.declaredPage());
  }

  async watch(target: Page | BrowserContext): Promise<void> {
    await this.watcher.watch(target);
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
    const checks = [...this.checks, ...this.watcherChecks(), ...this.providerChecks(), ...this.unmetChecks(), ...this.unreachedChecks(meta)];
    const missingKnown = missingKnownIds(checks, this.known);
    const allowed = this.watcher.allowances();
    const notes = this.watcher.notes();
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
      ...(allowed.length ? { allowed } : {}),
      ...(notes.length ? { notes } : {}),
      ...(this.selfTest ? { selfTest: true } : {})
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
    // The attachment is what the report, the blob report and the output folder keep: the live-AI key is not in it, whatever it was found in.
    await this.testInfo.attach("qa-result", { body: redactLiveKey(JSON.stringify(result, null, 2)), contentType: "application/json" });
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

  /**
   * The page a step or an announcement acts on when the case does not say: the page of the step it is inside, else the fixture's. A step that follows a step on another
   * page does not inherit that page.
   */
  private declaredPage(): Page {
    return this.active.at(-1)?.page ?? this.page;
  }

  /** The page a check, a checkpoint or a stop is about: the innermost step's, or else the page of the step that ran last, or the fixture's. */
  private currentPage(): Page {
    return this.active.at(-1)?.page ?? this.lastPage ?? this.page;
  }

  private tags(o: CheckOptions): Pick<CheckResult, "source" | "known" | "step"> {
    const step = this.active.at(-1)?.name;
    return { ...(o.source ? { source: o.source } : {}), ...(o.known ? { known: o.known } : {}), ...(step ? { step } : {}) };
  }

  /** The case ends here: the page it stopped on, as the student would see it, and why. A failure (not a block) is also recorded as a failed step, so that the marks follow from the checks. */
  private async recordStop(step: string, reason: string, failure: boolean, page: Page): Promise<void> {
    const screenshot = await this.shoot(page, "stopped", step, `stopped at: ${step}`, { fullPage: false, strict: false });
    this.stopped = { step, url: page.url(), screenshot: screenshot ?? "", reason };
    if (failure) {
      this.checks.push({ kind: "step", label: `step "${step}" did not complete`, ok: false, fail: "error", message: reason, step, ...(screenshot ? { screenshot } : {}) });
    }
  }

  /** An error thrown outside every step, a timeout, or `blocked()` outside a step: the case still says where it ended (a case never stops silently). */
  private async noteStopNobodyCaught(): Promise<void> {
    if (this.stopped) return;
    // A timeout leaves the step it interrupted running: that one is the step. Otherwise the case was between steps, and the last one it reached is named.
    const inStep = this.active.at(-1)?.name;
    const where = inStep ?? this.reached.at(-1) ?? "(before the first step)";
    const between = inStep ? "" : this.reached.length ? ` (between steps, after "${where}")` : " (before the first step)";
    const page = this.currentPage();
    if (this.blockedReason !== undefined) return void (await this.recordStop(where, this.blockedReason, false, page));
    if (this.testInfo.status === "timedOut") return void (await this.recordStop(where, `the test timed out after ${this.testInfo.timeout.toLocaleString("en-US")} ms${between}`, true, page));
    // The errors of soft expectations inside checks are the checks' own.
    const error = this.testInfo.errors.find((_, i) => !this.accounted.has(i));
    if (error) await this.recordStop(where, plain(error.message ?? error.value ?? "an error", 600) + between, true, page);
  }

  /** The screenshot's file, attached to the test; undefined when the page could not be captured (closed, crashed) and the caller can do without. */
  private async shoot(page: Page, prefix: string, name: string, attachAs: string, o: { fullPage: boolean; strict: boolean }): Promise<string | undefined> {
    const file = this.testInfo.outputPath(`${prefix}-${++this.shotCount}-${slug(name)}.png`);
    try {
      await page.screenshot({ path: file, fullPage: o.fullPage, timeout: 15_000 });
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

  /** What the case announced (a dialog, a load) and did not get: nothing was looked at, so it is NOT CHECKED. */
  private unmetChecks(): CheckResult[] {
    return this.watcher.unmet().map((u) => ({ kind: "watcher" as const, label: u.label, ok: null, message: u.message }));
  }

  /** When the case stopped, each step it did not reach is a NOT CHECKED (the case declares its steps, not its checks, so the step is the unit). */
  private unreachedChecks(meta: CaseMeta): CheckResult[] {
    const stop = this.stopped;
    if (!stop) return [];
    const at = meta.steps.indexOf(stop.step);
    const when = at >= 0 ? `stopped at step ${at + 1}` : "stopped before the first step";
    return meta.steps
      .filter((s) => !this.reached.includes(s))
      .map((s) => ({ kind: "step" as const, label: `NOT CHECKED (${when}): ${s}`, ok: null, message: `"${s}" was not reached: ${clip(stop.reason, 200)}`, step: s }));
  }

  /**
   * The fake provider's log for this case's keys. A request it could not answer (no recorded reply: `unknown`), one for a provider it does not fake (`refused`: the QA key was
   * kept from a real host), and one it failed under a mode that does not fail on purpose (a mode that does not exist, or a request it could not take) mean the case or the
   * fixtures are wrong, not that the app is. The key itself is never written into a finding.
   */
  private providerChecks(): CheckResult[] {
    if (this.keys.size === 0) return [];
    const out: CheckResult[] = [];
    for (const e of this.readLog()) {
      if (!this.keys.has(e.key)) continue;
      const asked = `“${redactLiveKey(e.prompt).slice(0, 120)}”`;
      if (e.outcome === "unknown") out.push(this.finding("provider", `${e.host} had no recorded reply for the prompt ${asked}`));
      else if (e.outcome === "refused") out.push(this.finding("provider", `${e.host} is not faked, so the request was refused and the key went nowhere; the prompt was ${asked}`));
      else if (e.outcome === "failed" && !FAILURE_MODES.has(e.mode)) {
        out.push(this.finding("provider", `${e.host} failed a request under the key mode "${e.mode}", which does not fail on purpose (a mode that does not exist, or a request the fake provider could not take); the prompt was ${asked}`));
      }
    }
    return out;
  }
}
