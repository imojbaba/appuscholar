// The run report and the fix brief (spec sections 7, 12 and 13), built from the cases' results. Pure: strings in, strings out, no file and no clock.
// The Playwright reporter (qa/reporter.ts) reads the results and writes what this returns. Everything here is in plain words, for OJ first.
import { failsCase, findKnown, type KnownEntry } from "../support/known";
import type { CaseResult, CheckResult, FailKind, Situation, StoryId } from "../support/qa";

export type Mark = "PASS" | "FAIL: UI" | "FAIL: Error" | "FAIL: Unexpected" | "FAIL: Slow" | "KNOWN FAULT" | "FIXED?" | "AWAITING DECISION" | "BLOCKED" | "NOT RUN";

/** The marks in the order the summary shows them. */
export const MARKS: readonly Mark[] = ["PASS", "FAIL: UI", "FAIL: Error", "FAIL: Unexpected", "FAIL: Slow", "KNOWN FAULT", "FIXED?", "AWAITING DECISION", "BLOCKED", "NOT RUN"];

/** Every story, in the student's words (spec section 5; L is the live checks of section 10). A story with no cases is NOT RUN in the report. */
export const STORIES: ReadonlyArray<{ id: StoryId; goal: string }> = [
  { id: "S0", goal: "I take one project from idea to export." },
  { id: "S1", goal: "I start: account, key, vault, my idea checked, my project made." },
  { id: "S2", goal: "I find, read and cite the literature." },
  { id: "S3", goal: "I plan my study and get the ethics paperwork ready." },
  { id: "S4", goal: "I list my participants and keep their names out of my data." },
  { id: "S5", goal: "I analyse my survey and report the result in my thesis." },
  { id: "S6", goal: "I code my interviews and export the coded passages." },
  { id: "S7", goal: "I write in my own voice and clean up my writing." },
  { id: "S8", goal: "I check my draft before I submit." },
  { id: "S9", goal: "I take my work out." },
  { id: "S10", goal: "I keep my work private and safe." },
  { id: "S11", goal: "I keep two projects apart." },
  { id: "L", goal: "The live site, the live AI and the live services answer as they should (the live site is checked from outside, up to the sign-in page)." }
];

/** The harness's own real checks (SELF-HARNESS, SELF-STUDENT*, SELF-SERVICES, SELF-LAYOUT-*) are not a student's story: they have a row of their own (ruling R23). */
export const HARNESS = { id: "Harness", goal: "The QA harness's own checks of the build: sign-in, the outside services, the student helpers and the layout rules. Not a student's story." } as const;
type StoryKey = StoryId | typeof HARNESS.id;
const storyOfCase = (c: CaseResult): StoryKey => (c.meta.id.startsWith("SELF-") ? HARNESS.id : c.meta.story);

/** What an earlier attempt of a case left: its `qa-result` and trace, or the error when it ended with no result. */
export type FirstTry = { status: string; result?: CaseResult; trace?: string; error?: string };
/** A case as the reporter hands it over: its result, how many retries it used, how Playwright ended it, and what the reporter added from the attempts and the files. */
export type ReportCase = CaseResult & {
  retries: number;
  status: "passed" | "failed" | "skipped";
  /** The Playwright trace of a failed case, as a path the report can link. */
  trace?: string;
  /** Playwright's own error for the case, when it ended as failed: how a case is failed that its checks do not explain. */
  error?: string;
  /** The first attempt that failed, for a case that passed only on a retry (ruling R22). */
  firstTry?: FirstTry;
};
/** `selection`: what narrowed the run (`-g ...`, `--project=...`, a file), as written on the command line. */
export type RunInfo = { sha: string; date: string; kind: "slice" | "full" | "release"; durationMs: number; selection?: string };
/** A test that ended with no case result: it failed before `qa.begin`, was skipped before it, or is a plain Playwright test that passed without reporting a case. */
export type Unreported = { title: string; status: "failed" | "skipped" | "passed"; error?: string };
/** What the fake provider's log held: how many requests were read (0: no log here), how many carried a key that is not a test key, and whether it could be read at all. */
export type ProviderLogInfo = { entries: number; strays: number; unreadable?: boolean };
export type ReportOptions = { redact?: string[]; runErrors?: string[]; unreported?: Unreported[]; providerLog?: ProviderLogInfo };
export type Built = { summaryMd: string; fixBriefMd: string; html: string; json: string };

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Marks

const SEVERITY: readonly FailKind[] = ["error", "unexpected", "ui", "slow"];
const FAIL_MARK: Record<FailKind, Mark> = { error: "FAIL: Error", unexpected: "FAIL: Unexpected", ui: "FAIL: UI", slow: "FAIL: Slow" };
const FAIL_WORD: Record<FailKind, string> = { error: "Error", unexpected: "Unexpected", ui: "UI", slow: "Slow" };
/** The kind of failure of a failed check that does not say (the fixture always does): by what the check is. */
const DEFAULT_FAIL: Record<CheckResult["kind"], FailKind> = { data: "unexpected", conceptual: "unexpected", visual: "ui", time: "slow", watcher: "error", step: "error" };
const failOf = (c: CheckResult): FailKind => c.fail ?? DEFAULT_FAIL[c.kind];

/**
 * The case's mark, by the first row that fits (spec section 7):
 *  1. a failed check that no fault explains (no known id, an id known.json lacks, or a fault marked fixed: it has come back) is FAIL, of the most severe kind: Error, Unexpected, UI, Slow;
 *  2. a blocked case is BLOCKED;
 *  3. a failed check on a known fault is KNOWN FAULT;
 *  4. a passed check on a known fault is FIXED? (someone should close it);
 *  5. a check measured against a decision still awaited is AWAITING DECISION (a check that measured nothing records nothing to decide);
 *  6. otherwise PASS.
 * The story is never read: a story with no cases is NOT RUN in the report, and a case is marked by its checks.
 */
export function markOf(r: CaseResult, known: KnownEntry[]): Mark {
  const failing = r.checks.filter((c) => failsCase(c, known));
  if (failing.length) {
    const kinds = new Set(failing.map(failOf));
    return FAIL_MARK[SEVERITY.find((k) => kinds.has(k))!];
  }
  if (r.blocked !== undefined) return "BLOCKED";
  const status = (c: CheckResult) => (c.known ? findKnown(c.known, known)?.status : undefined);
  if (r.checks.some((c) => c.ok === false && status(c) === "known")) return "KNOWN FAULT";
  if (r.checks.some((c) => c.ok === true && status(c) === "known")) return "FIXED?";
  if (r.checks.some((c) => c.ok !== null && status(c) === "awaiting")) return "AWAITING DECISION";
  return "PASS";
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Words

const VAULT: Record<NonNullable<Situation["vault"]>, string> = { off: "no vault", open: "vault open", locked: "vault locked", forgotten: "vault forgotten on this computer" };
const NETWORK: Record<NonNullable<Situation["network"]>, string> = { fine: "network fine", drop: "network drops and comes back", slow: "slow network" };
const SCREEN: Record<NonNullable<Situation["screen"]>, string> = { desktop: "desktop", phone: "phone (375 px)" };
const LANG: Record<NonNullable<Situation["lang"]>, string> = { en: "English", hi: "Hindi" };
const DATA: Record<NonNullable<Situation["data"]>, string> = { realistic: "realistic data", empty: "empty data", huge: "huge data", messy: "messy data" };
const AI: Record<NonNullable<Situation["ai"]>, string> = { answers: "AI answering", fails: "AI failing", slow: "AI slow", live: "live AI" };

/** The situation a case is tried in, in words. */
export function situationWords(s: Situation): string {
  const parts = [s.vault && VAULT[s.vault], s.network && NETWORK[s.network], s.screen && SCREEN[s.screen], s.lang && LANG[s.lang], s.data && DATA[s.data], s.ai && AI[s.ai]].filter(Boolean);
  return parts.length ? parts.join(", ") : "situation not stated";
}

/** The command that runs only this case. The id is a pattern to `-g`, so the characters a pattern reads are escaped (a title like "S6-02 [F3]"). */
export function rerunCommand(caseId: string): string {
  return `pnpm --filter @appuscholar/web qa:local -g "${caseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`;
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
const seconds = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : duration(ms));

const KIND_WORD: Record<CheckResult["kind"], string> = {
  data: "Data check",
  visual: "Visual check",
  conceptual: "Conceptual check",
  watcher: "found by the watcher",
  time: "time budget",
  step: "a step of the path"
};

/** What a check expected, as a sentence: the check's own label for a check, and for the rest what the label says went wrong, turned round. */
function expectedOf(c: CheckResult): string {
  if (c.kind === "watcher") return `no ${c.label}`;
  if (c.kind === "time") return `${c.label}, within its time budget`;
  if (c.kind === "step") return "the step completes";
  return c.label;
}

/** The first lines of a failure message that say something, as one line: "expect(received).toBe(expected) / Expected: 3 / Received: 2". Applied after redaction. */
function gist(s: string): string {
  const text = s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
  return text.length > 300 ? text.slice(0, 299) + "…" : text;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The facts of each case, worked out once for the markdown and the html

type CheckFacts = {
  title: string;
  kind: string;
  fail: string;
  step?: string;
  source?: string;
  fault?: string;
  /** The id a regression names: a check that failed against a fault marked fixed. */
  regression?: string;
  expected: string;
  happened: string;
  screenshot?: string;
  failsCase: boolean;
};
/** A check measured against a decision still awaited: OJ decides from this. */
type AwaitingFacts = { id: string; owner?: string; title: string; label: string; met: boolean; message?: string; source?: string; step?: string };
type CaseFacts = {
  c: ReportCase;
  id: string;
  story: StoryKey;
  goal: string;
  mark: Mark;
  /** The mark as shown: a case that passed only on a retry never reads as a plain PASS. */
  shown: string;
  situation: string;
  tookText: string;
  secondTry: boolean;
  /** For a case that passed only on a retry: its first try, as a case of its own (ruling R22). */
  first?: CaseFacts;
  failed: CheckFacts[];
  awaiting: AwaitingFacts[];
  /** Passed checks on a known fault: the fault may be fixed. */
  nowPassing: Array<{ id: string; title: string; label: string; source?: string }>;
  stop?: { step: string; position: string; url: string; reason: string; screenshot?: string };
  notReached: string[];
  notChecked: CheckResult[];
  /** How many checks passed: a PASS with none measured nothing. */
  measured: number;
};

function faultText(id: string, known: KnownEntry[]): string {
  const e = findKnown(id, known);
  if (!e) return `${id} (not in known.json, so it explains nothing)`;
  if (e.status === "fixed") return `${e.id}: ${e.title} (marked fixed: it has come back)`;
  return `${e.id} (${e.status === "awaiting" ? `awaiting ${e.owner ?? "a decision"}` : "known, waiting for a fix"}): ${e.title}`;
}

function checkFacts(k: CheckResult, known: KnownEntry[]): CheckFacts {
  const entry = k.known ? findKnown(k.known, known) : undefined;
  return {
    title: k.label,
    kind: KIND_WORD[k.kind],
    fail: FAIL_WORD[failOf(k)],
    ...(k.step ? { step: k.step } : {}),
    ...(k.source ? { source: k.source } : {}),
    ...(k.known ? { fault: faultText(k.known, known) } : {}),
    ...(entry?.status === "fixed" && k.ok === false ? { regression: entry.id } : {}),
    expected: expectedOf(k),
    happened: k.message ?? "(no message)",
    ...(k.screenshot ? { screenshot: k.screenshot } : {}),
    failsCase: failsCase(k, known)
  };
}

/** An earlier attempt as a case of its own: it failed, so its mark is worked out as for any failed case. */
function firstTryCase(c: ReportCase): ReportCase {
  const ft = c.firstTry!;
  const result: CaseResult = ft.result ?? { meta: c.meta, checks: [], reached: [], screenshots: [], keys: [], durationMs: 0 };
  return { ...result, retries: 0, status: "failed", ...(ft.trace ? { trace: ft.trace } : {}), error: ft.error ?? `the try ended ${ft.status}` };
}

function factsOf(c: ReportCase, known: KnownEntry[], isFirstTry = false): CaseFacts {
  // A case Playwright skipped without a block never started its path: it was not run.
  const base = markOf(c, known);
  let mark: Mark = c.status === "skipped" && c.blocked === undefined && base === "PASS" ? "NOT RUN" : base;
  const failed: CheckFacts[] = [];
  const awaiting: AwaitingFacts[] = [];
  for (const k of c.checks) {
    const entry = k.known ? findKnown(k.known, known) : undefined;
    if (entry?.status === "awaiting" && k.ok !== null) {
      awaiting.push({ id: entry.id, ...(entry.owner ? { owner: entry.owner } : {}), title: entry.title, label: k.label, met: k.ok === true, ...(k.message ? { message: k.message } : {}), ...(k.source ? { source: k.source } : {}), ...(k.step ? { step: k.step } : {}) });
    } else if (k.ok === false) {
      failed.push(checkFacts(k, known));
    }
  }
  // Playwright failed the case and its checks do not say why (an error after the result was attached, in a teardown): that is an Error, not a pass.
  if (c.status === "failed" && !mark.startsWith("FAIL")) {
    mark = "FAIL: Error";
    failed.push({
      title: "Playwright ended the case as failed, and none of its checks says why",
      kind: "an error outside the checks",
      fail: "Error",
      expected: "the case ends without an error",
      happened: c.error ?? "(Playwright gave no message)",
      failsCase: true
    });
  }
  const nowPassing = c.checks
    .filter((k) => k.ok === true && k.known && findKnown(k.known, known)?.status === "known")
    .map((k) => ({ id: k.known!, title: findKnown(k.known!, known)!.title, label: k.label, ...(k.source ? { source: k.source } : {}) }));
  const at = c.stoppedAt ? c.meta.steps.indexOf(c.stoppedAt.step) : -1;
  const stop = c.stoppedAt && {
    step: c.stoppedAt.step,
    position: at >= 0 ? `step ${at + 1} of ${c.meta.steps.length}` : "outside the declared steps",
    url: c.stoppedAt.url,
    reason: c.stoppedAt.reason,
    ...(c.stoppedAt.screenshot ? { screenshot: c.stoppedAt.screenshot } : {})
  };
  const notChecked = c.checks.filter((k) => k.ok === null);
  const secondTry = !isFirstTry && c.retries > 0 && c.status === "passed";
  const first = secondTry && c.firstTry ? factsOf(firstTryCase(c), known, true) : undefined;
  return {
    c,
    id: c.meta.id,
    story: storyOfCase(c),
    goal: c.meta.goal,
    mark,
    shown: secondTry ? `${mark} on retry${first ? ` (first try ${first.mark})` : ""}` : mark,
    situation: situationWords(c.meta.situation),
    tookText: seconds(c.durationMs),
    secondTry,
    ...(first ? { first } : {}),
    failed,
    awaiting,
    nowPassing,
    ...(stop ? { stop } : {}),
    notReached: notChecked.filter((k) => k.kind === "step").map((k) => k.step ?? k.label),
    notChecked,
    measured: c.checks.filter((k) => k.ok === true).length
  };
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

/** What a case that passed only on a retry lost on its first try, one line each. */
function firstTryLines(f: CaseFacts): string[] {
  const failing = (f.first?.failed ?? []).filter((k) => k.failsCase);
  return failing.length ? failing.map((k) => `${oneLine(k.title)}: ${gist(k.happened)}`) : ["(no failed check was recorded)"];
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The whole report, as data

type StoryRow = { id: StoryKey; goal: string; cases: CaseFacts[]; counts: Record<Mark, number>; secondTryByMark: Record<Mark, number>; secondTry: number };
type Fact = {
  run: RunInfo;
  cases: CaseFacts[];
  stories: StoryRow[];
  selftests: { ran: number; passed: number; failed: number; skipped: number };
  providerLog?: ProviderLogInfo;
  runErrors: string[];
  warnings: string[];
  notRunStories: Array<{ id: StoryKey; goal: string }>;
  skippedUnreported: string[];
  /** Plain Playwright tests that passed without reporting a case: their checks are not in the marks. */
  passedUnreported: string[];
  /** Every fault and decision a case met, with the case. */
  faultsMet: Array<{ case: string; text: string }>;
  information: { evalProbes: Array<{ detail: string; count: number; cases: number }>; defaultExcused: Array<{ what: string; reason: string; count: number }>; excused: Array<{ case: string; kind: string; what: string; reason: string; count: number }> };
};

const emptyCounts = (): Record<Mark, number> => Object.fromEntries(MARKS.map((m) => [m, 0])) as Record<Mark, number>;

function storyRow(id: StoryKey, goal: string, mine: CaseFacts[]): StoryRow {
  const counts = emptyCounts();
  const secondTryByMark = emptyCounts();
  for (const c of mine) {
    counts[c.mark]++;
    if (c.secondTry) secondTryByMark[c.mark]++;
  }
  return { id, goal, cases: mine, counts, secondTryByMark, secondTry: mine.filter((c) => c.secondTry).length };
}

function gather(all: ReportCase[], known: KnownEntry[], run: RunInfo, o: ReportOptions): Fact {
  const real = all.filter((c) => !c.selfTest);
  const selfs = all.filter((c) => c.selfTest);
  const cases = real.map((c) => factsOf(c, known)).sort(byId);
  const stories: StoryRow[] = STORIES.map((s) => storyRow(s.id, s.goal, cases.filter((c) => c.story === s.id)));
  // The harness's own checks get a row when there are some; a story the list does not know (a typo in a case) is still shown, not dropped.
  const harness = cases.filter((c) => c.story === HARNESS.id);
  if (harness.length) stories.push(storyRow(HARNESS.id, HARNESS.goal, harness));
  for (const id of new Set(cases.map((c) => c.story))) {
    if (!stories.some((s) => s.id === id)) stories.push(storyRow(id, "(a story the report does not know)", cases.filter((c) => c.story === id)));
  }

  const selftests = {
    ran: selfs.length,
    passed: selfs.filter((c) => c.status === "passed").length,
    failed: selfs.filter((c) => c.status === "failed").length,
    skipped: selfs.filter((c) => c.status === "skipped").length
  };
  const runErrors = [...(o.runErrors ?? [])];
  for (const c of selfs) if (c.status === "failed") runErrors.push(`Harness selftest ${c.meta.id} failed: the QA layer's own checks are not trustworthy until it passes.`);
  for (const u of o.unreported ?? []) if (u.status === "failed") runErrors.push(`A test ended with no case result: ${u.title}${u.error ? ` (${gist(u.error)})` : ""}.`);

  const warnings: string[] = [];
  for (const c of real) for (const id of c.missingKnown ?? []) warnings.push(`${c.meta.id} names the fault id ${id}, which known.json lacks: it counts as no id, and the check fails the case.`);

  const faultsMet = cases.flatMap((f) => [
    ...f.failed.filter((k) => k.fault).map((k) => ({ case: f.id, text: k.fault! })),
    ...f.awaiting.map((a) => ({ case: f.id, text: `${a.id} (awaiting ${a.owner ?? "a decision"}): ${a.title}` }))
  ]);

  const probes = new Map<string, { count: number; cases: Set<string> }>();
  const defaults = new Map<string, { what: string; reason: string; count: number }>();
  const excused: Fact["information"]["excused"] = [];
  for (const c of real) {
    for (const n of c.notes ?? []) {
      const p = probes.get(n.detail) ?? { count: 0, cases: new Set<string>() };
      p.count += n.count;
      p.cases.add(c.meta.id);
      probes.set(n.detail, p);
    }
    for (const a of c.allowed ?? []) {
      if (a.builtIn) {
        const key = `${a.what}\u0000${a.reason ?? ""}`;
        const d = defaults.get(key) ?? { what: a.what, reason: a.reason ?? "", count: 0 };
        d.count += a.count;
        defaults.set(key, d);
      } else {
        excused.push({ case: c.meta.id, kind: a.kind, what: a.what, reason: a.reason ?? "", count: a.count });
      }
    }
  }

  return {
    run,
    cases,
    stories,
    selftests,
    ...(o.providerLog ? { providerLog: o.providerLog } : {}),
    runErrors,
    warnings,
    notRunStories: stories.filter((s) => s.cases.length === 0).map((s) => ({ id: s.id, goal: s.goal })),
    skippedUnreported: (o.unreported ?? []).filter((u) => u.status === "skipped").map((u) => u.title),
    passedUnreported: (o.unreported ?? []).filter((u) => u.status === "passed").map((u) => u.title),
    faultsMet,
    information: {
      evalProbes: [...probes].map(([detail, p]) => ({ detail, count: p.count, cases: p.cases.size })),
      defaultExcused: [...defaults.values()],
      excused: excused.sort((a, b) => a.case.localeCompare(b.case, "en", { numeric: true }))
    }
  };
}

/** The sentences of spec section 2 (non-goals) the report prints in full, every run, so that a green report never reads as more than it is. */
const NOT_COVERED_FIXED =
  "This layer does not re-test every right and wrong value of every field (the unit tests do that). It does not re-check the engines' numbers (the goldens own them; each result is spot-checked against core). " +
  "It does not judge prose: how screens look to a person, the wording, the quality of the Hindi, or the AI's writing; those stay with the hand walk, and the screenshots are here for a glance. " +
  "It does not sign in on the real live site, and it does not replace the browser journeys in apps/web/e2e.";

const FIX_BRIEF_RULE =
  "This brief is for OJ first. Nothing in it goes to a developer session until OJ says so, and OJ may pick which entries go and in what order. " +
  "A developer session fixes a fault in its own pull request, adds the unit test that pins it, re-runs the case with the command in the entry, and moves the fault in known.json (and docs/qa/faults.md) to fixed. " +
  "The QA branch never changes product code.";

/** Where the evidence an entry names can be opened. */
const EVIDENCE_WHERE =
  "Paths to screenshots and replays are relative to the qa-report folder (apps/web/qa-report/ on a Mac). On CI that folder is the run's artifact: qa-report-slice for a pull request, qa-report-full for a full run.";

const KIND_BLURB: Record<RunInfo["kind"], string> = {
  slice: "slice (each story's plain run and every regression)",
  full: "full grid",
  release: "release run (the full grid, with live AI and live services)"
};
/** What ran, in words. The slice is itself `-g @slice`; any other narrowing (a -g, a project, a file, --last-failed ...) makes it only part of the grid. */
function whatRan(run: RunInfo): string {
  if (!run.selection) return KIND_BLURB[run.kind];
  if (run.kind === "slice" && run.selection === "-g @slice") return `${KIND_BLURB.slice}, selected with ${run.selection}`;
  return `${run.kind === "slice" ? "part of the slice" : "part of the grid"}, selected with ${run.selection}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Markdown

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
/** An allowance's reason, as " (reason)", or nothing when none was given (a host has none). */
const why = (reason: string) => (reason ? ` (${oneLine(reason)})` : "");
const cell = (s: string | number) => String(s).replace(/\|/g, "\\|");

/** The line that says how much of the fake provider's log was read, so that a report with no log (a merged one) does not read as more than it is. */
function providerLogLine(p: ProviderLogInfo | undefined): string | undefined {
  if (!p) return undefined;
  if (p.unreadable) return "Fake provider log: not checked: the log could not be read.";
  if (p.entries === 0) return "Fake provider log: not checked: no provider log here (0 requests read). A merged report cannot see the shards' logs.";
  return `Fake provider log: ${p.entries} request${p.entries === 1 ? "" : "s"} read; ${p.strays === 0 ? "none carried a key that is not a test key" : `${p.strays} carried a key that is not a test key (see Run-level errors)`}.`;
}

/** A fenced block that cannot be closed by what is inside it. */
function fence(text: string): string[] {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const bar = "`".repeat(longest + 1);
  return [bar + "text", text.replace(/\s+$/, ""), bar];
}

function checkMd(k: CheckFacts, n: number, of: number): string[] {
  const out = [`**Failed check ${n} of ${of}: ${oneLine(k.title)}**`, ""];
  out.push(`- Kind of failure: ${k.fail} (${k.kind})${k.failsCase ? "" : ", recorded against a fault"}`);
  out.push(`- Expected: ${oneLine(k.expected)}`);
  if (k.source) out.push(`- Where the expectation comes from: ${oneLine(k.source)}`);
  if (k.step) out.push(`- Step: ${oneLine(k.step)}`);
  if (k.fault) out.push(`- Fault: ${oneLine(k.fault)}`);
  if (k.screenshot) out.push(`- Screenshot: \`${k.screenshot}\``);
  out.push("- What happened:", "", ...fence(k.happened), "");
  return out;
}

function awaitingMd(a: AwaitingFacts): string[] {
  const out = [`**Waiting for a decision${a.owner ? ` from ${a.owner}` : ""}: ${a.id}, ${oneLine(a.title)}**`, ""];
  out.push(`- Check: ${oneLine(a.label)}`, `- Result: ${a.met ? "as expected" : "not as expected"} (the case records it and CI stays green until someone decides)`);
  if (a.source) out.push(`- Where the expectation comes from: ${oneLine(a.source)}`);
  if (a.step) out.push(`- Step: ${oneLine(a.step)}`);
  if (a.message) out.push("- What happened:", "", ...fence(a.message));
  out.push("");
  return out;
}

/** What a failed or stopped try shows: where it stopped, what it did not reach, each failed check, and its replay. */
function bodyMd(f: CaseFacts): string[] {
  const out: string[] = [];
  if (f.stop) {
    out.push(`Stopped at ${f.stop.position}, "${oneLine(f.stop.step)}", on the page ${f.stop.url || "(unknown)"}: ${oneLine(f.stop.reason)}`);
    out.push(f.stop.screenshot ? `Screenshot of that page: \`${f.stop.screenshot}\`` : "No screenshot of that page (it could not be captured).", "");
  }
  if (f.notReached.length) out.push(`Not reached: ${f.notReached.map(oneLine).join("; ")}`, "");
  f.failed.forEach((k, i) => out.push(...checkMd(k, i + 1, f.failed.length)));
  if (f.c.trace) out.push(`Replay: \`${f.c.trace}\` (open with \`pnpm exec playwright show-trace ${f.c.trace}\`).`, "");
  return out;
}

function caseMd(f: CaseFacts): string[] {
  const c = f.c;
  // A clean pass is one line. Everything else is written out.
  const plain = f.mark === "PASS" && f.failed.length === 0 && f.awaiting.length === 0 && !f.stop && !f.secondTry;
  if (plain) {
    const nc = f.notChecked.length;
    const caveats = [
      f.measured === 0 ? "no check measured anything" : "",
      nc ? `${nc} check${nc === 1 ? "" : "s"} NOT CHECKED (listed at the end of this report)` : ""
    ].filter(Boolean);
    return [`- PASS ${f.id} ${oneLine(f.goal)} (${f.situation})${caveats.length ? ` — ${caveats.join("; ")}` : ""}`];
  }
  const out = [`#### ${f.shown} — ${f.id} ${oneLine(f.goal)}`, "", `Situation: ${f.situation}. Took ${f.tookText}${c.retries ? `; tried ${c.retries + 1} times` : ""}.`, ""];
  if (f.secondTry) {
    out.push("Needed a second try to pass: it is not a clean pass.", "");
    if (f.first) out.push(`The first try ended ${f.first.mark}:`, "", ...bodyMd(f.first));
    else out.push("The first try left nothing the report can show.", "");
  }
  if (f.mark === "PASS" && f.measured === 0) out.push("No check measured anything.", "");
  if (c.blocked !== undefined) out.push(`Blocked: ${oneLine(c.blocked)}`, "");
  out.push(...bodyMd(f));
  for (const a of f.awaiting) out.push(...awaitingMd(a));
  for (const p of f.nowPassing) out.push(`Passing now: ${p.label}, which waited on ${p.id} (${oneLine(p.title)}). Someone should close it.`, "");
  if (f.notChecked.length) out.push(`${f.notChecked.length} check${f.notChecked.length === 1 ? "" : "s"} NOT CHECKED (listed at the end of this report).`, "");
  return out;
}

/** The first column of the summary: the story's id and its goal, side by side. */
const storyLabel = (s: { id: string; goal: string }) => `${s.id} — ${s.goal}`;

function summaryMarkdown(d: Fact): string {
  const L: string[] = [];
  const { run } = d;
  L.push("# Appuscholar QA run report", "");
  L.push(`- Commit: ${run.sha}`, `- Date: ${run.date}`, `- What ran: ${whatRan(run)}`, `- Took: ${duration(run.durationMs)}`, "");

  if (d.runErrors.length) {
    L.push("## Run-level errors", "", "These are not about one case. The run is red until they are cleared.", "");
    for (const e of d.runErrors) L.push(`- ${oneLine(e)}`);
    L.push("");
  }
  if (d.warnings.length) {
    L.push("## Warnings", "");
    for (const w of d.warnings) L.push(`- ${oneLine(w)}`);
    L.push("");
  }

  L.push("## Summary by story", "");
  L.push(`| Story | Cases | ${MARKS.join(" | ")} |`, `| --- | ---: | ${MARKS.map(() => "---:").join(" | ")} |`);
  for (const s of d.stories) {
    const cells = MARKS.map((m) => {
      if (m === "NOT RUN" && s.cases.length === 0) return "NOT RUN (whole story)";
      const n = s.counts[m];
      if (n === 0) return "-";
      // A retry is flagged in the column of the mark the case ended with, and in no other.
      return s.secondTryByMark[m] ? `${n} (${s.secondTryByMark[m]} on a 2nd try)` : String(n);
    });
    L.push(`| ${cell(storyLabel(s))} | ${s.cases.length} | ${cells.map(cell).join(" | ")} |`);
  }
  const t = d.selftests;
  L.push("", `Harness selftests (the fixture's own checks, left out of the marks above): ${t.ran} ran, ${t.passed} passed${t.failed ? `, ${t.failed} failed` : ""}${t.skipped ? `, ${t.skipped} skipped` : ""}.`);
  const log = providerLogLine(d.providerLog);
  if (log) L.push("", log);
  L.push("");

  L.push("## Cases by story", "");
  for (const s of d.stories) {
    if (s.cases.length === 0) continue;
    L.push(`### ${s.id}. ${s.goal}`, "");
    let inList = false;
    for (const c of s.cases) {
      const lines = caseMd(c);
      const bullet = lines.length === 1;
      // A bullet is a clean pass; a run of them is one list, and a heading after it starts on a fresh line.
      if (inList && !bullet) L.push("");
      L.push(...lines);
      inList = bullet;
    }
    L.push("");
  }

  L.push("## Screens", "", "Every checkpoint's screenshot is in `index.html`, one strip per case. A person should glance at them: the checks cannot judge how a screen reads.", "");

  L.push("## Passed only on a second try", "");
  const flaky = d.cases.filter((c) => c.secondTry);
  if (flaky.length === 0) L.push("None: every passing case passed on its first try.", "");
  else {
    L.push("A case that passes only on a retry is not clean. Each is listed with what failed the first time.", "");
    for (const c of flaky) {
      L.push(`- ${c.id} ${oneLine(c.goal)} (${c.shown}, tried ${c.c.retries + 1} times)`);
      for (const e of firstTryLines(c)) L.push(`  - first try failed: ${e}`);
    }
    L.push("");
  }

  L.push("## Not covered", "", NOT_COVERED_FIXED, "");
  if (d.notRunStories.length) {
    L.push("Stories not run:", "");
    for (const s of d.notRunStories) L.push(`- ${s.id}: ${s.goal} NOT RUN (no case of this story ran${s.id === "S4" ? "; it is written when the Participants work is merged" : ""}).`);
    L.push("");
  }
  const notRunCases = d.cases.filter((c) => c.mark === "NOT RUN");
  if (notRunCases.length || d.skippedUnreported.length) {
    L.push("Cases that did not run:", "");
    for (const c of notRunCases) L.push(`- ${c.id} ${oneLine(c.goal)}: NOT RUN (Playwright skipped it).`);
    for (const t2 of d.skippedUnreported) L.push(`- ${oneLine(t2)}: skipped before it began.`);
    L.push("");
  }
  if (d.passedUnreported.length) {
    L.push("Tests that passed but reported no case (plain Playwright tests: what they check is not in the marks above):", "");
    for (const t2 of d.passedUnreported) L.push(`- ${oneLine(t2)}`);
    L.push("");
  }
  const notChecked = d.cases.flatMap((c) => c.notChecked.map((k) => ({ id: c.id, label: k.label, why: k.message ?? "(no reason given)" })));
  L.push("Checks that measured nothing (NOT CHECKED, never a pass):", "");
  if (notChecked.length === 0) L.push("- None.");
  for (const n of notChecked) L.push(`- ${n.id}: ${oneLine(n.label)} — ${oneLine(n.why)}`);
  L.push("");

  if (d.faultsMet.length) {
    L.push("## Faults and decisions this run met", "");
    for (const k of d.faultsMet) L.push(`- ${k.case}: ${oneLine(k.text)}`);
    L.push("");
  }

  const info = d.information;
  if (info.evalProbes.length || info.defaultExcused.length || info.excused.length) {
    L.push("## For information", "", "These are not failures.", "");
    for (const p of info.evalProbes) {
      L.push(`- A library in the page tried \`eval\` and the security policy refused it (${p.detail}): ${p.count} times in ${p.cases} case${p.cases === 1 ? "" : "s"}. The production build drops \`'unsafe-eval'\` on purpose; code that really needed it would break a check.`);
    }
    for (const a of info.defaultExcused) L.push(`- Expected in every case: ${oneLine(a.what)}${why(a.reason)}, ${a.count} time${a.count === 1 ? "" : "s"}.`);
    for (const a of info.excused) L.push(`- ${a.case} excused on purpose, ${a.kind}: ${oneLine(a.what)}${why(a.reason)}, ${a.count} time${a.count === 1 ? "" : "s"}.`);
    L.push("");
  }
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The fix brief

function stepsMd(f: CaseFacts, meta: CaseResult["meta"]): string[] {
  const failedAt = new Set(f.failed.filter((k) => k.failsCase && k.step).map((k) => k.step!));
  return meta.steps.map((s, i) => {
    const marks: string[] = [];
    if (f.stop?.step === s) marks.push(`the case stopped here: ${oneLine(f.stop.reason)}`);
    else if (failedAt.has(s)) marks.push("a check failed here");
    if (f.notReached.includes(s)) marks.push("not reached");
    return `${i + 1}. ${oneLine(s)}${marks.length ? `  <- ${marks.join("; ")}` : ""}`;
  });
}

type EntryKind = "fail" | "fixed" | "retry";
type Entry = { kind: EntryKind; f: CaseFacts };

/** One entry of the fix brief. A retry entry is written from the first try, which is where the failure is. */
function briefEntry({ kind, f }: Entry, n: number, story: string): string[] {
  const src = kind === "retry" ? f.first! : f;
  const out = [`## Entry ${n}: ${f.id} — ${kind === "fixed" ? "FIXED?" : kind === "retry" ? f.shown : f.mark}`, ""];
  out.push(`- Case: ${f.id} ${oneLine(f.goal)}`, `- Story: ${f.story}. ${story}`, `- Situation: ${f.situation}`);
  out.push(`- Re-run only this case: \`${rerunCommand(f.id)}\``);
  out.push(`- Code the case touches: ${f.c.meta.code?.length ? f.c.meta.code.map((p) => `\`${p}\``).join(", ") : "the case does not name one"}`);
  out.push("");
  if (kind === "fixed") {
    out.push("A known fault now passes. Someone should close it: check the fix is in the code, set the fault to fixed in `apps/web/qa/known.json` (and `docs/qa/faults.md`), and run the case again.", "");
    for (const p of f.nowPassing) out.push(`- ${p.id}: ${oneLine(p.title)}`, `  - Check that passes: ${oneLine(p.label)}${p.source ? ` (${oneLine(p.source)})` : ""}`);
    out.push("");
    return out;
  }
  if (kind === "retry") {
    out.push(
      `This case failed its first try and passed on a retry (tried ${f.c.retries + 1} times). That is not a clean pass: either the product fails now and then, or the case is flaky. What follows is the first try. Run the case several times (add \`--repeat-each=10\` to the command) to see how often it fails.`,
      ""
    );
  }
  const regressions = [...new Set(src.failed.filter((k) => k.failsCase && k.regression).map((k) => k.regression!))];
  out.push(
    regressions.length
      ? `Fault id: ${regressions.join(", ")} (marked fixed in known.json: this is a regression, the fault has come back).`
      : "Fault id: none yet (it gets a Q-id in `docs/qa/faults.md` when OJ decides it is a fault to fix).",
    ""
  );
  out.push("How to reproduce, as a student does it:", "", ...stepsMd(src, f.c.meta), "");
  if (src.stop) out.push(`The case stopped at ${src.stop.position} on ${src.stop.url || "(unknown page)"}.`, ...(src.stop.screenshot ? [`Screenshot of that page: \`${src.stop.screenshot}\``] : []), "");
  const failing = src.failed.filter((k) => k.failsCase);
  failing.forEach((k, i) => {
    out.push(`### Failure ${i + 1} of ${failing.length}: ${oneLine(k.title)}`, "");
    out.push(`- What was expected: ${oneLine(k.expected)}`, `- Where that comes from: ${k.source ? oneLine(k.source) : "the case does not name a source"}`);
    out.push(`- Kind of failure: ${k.fail} (${k.kind})`);
    if (k.step) out.push(`- Step: ${oneLine(k.step)}`);
    if (k.fault) out.push(`- Fault: ${oneLine(k.fault)}`);
    out.push(`- Evidence: ${[k.screenshot && `screenshot \`${k.screenshot}\``, src.c.trace && `replay \`${src.c.trace}\``, "the message below"].filter(Boolean).join("; ")}`);
    out.push("- What happened:", "", ...fence(k.happened), "");
  });
  return out;
}

function briefEntries(d: Fact): Entry[] {
  const entries: Entry[] = [];
  for (const f of d.cases) {
    if (f.mark.startsWith("FAIL")) entries.push({ kind: "fail", f });
    if (f.mark === "FIXED?") entries.push({ kind: "fixed", f });
    if (f.secondTry && f.first?.mark.startsWith("FAIL")) entries.push({ kind: "retry", f });
  }
  return entries;
}

function fixBriefMarkdown(d: Fact): string {
  const L = ["# Fix brief", "", `Run: ${d.run.sha}, ${d.run.date}, ${whatRan(d.run)}.`, "", FIX_BRIEF_RULE, "", EVIDENCE_WHERE, ""];
  const storyGoal = (id: StoryKey) => d.stories.find((s) => s.id === id)?.goal ?? "";
  const entries = briefEntries(d);
  const problems = [...d.runErrors];
  if (entries.length === 0 && problems.length === 0) {
    L.push("There is nothing to fix: this run has no FAIL, no FIXED? and no case that passed only on a retry after failing.", "");
    return L.join("\n").trimEnd() + "\n";
  }
  if (problems.length) {
    L.push("## Run-level problems (not tied to one case)", "");
    for (const p of problems) L.push(`- ${oneLine(p)}`);
    L.push("");
  }
  if (entries.length === 0) L.push("No case has a FAIL, a FIXED? or a failed first try, so there is no case entry.", "");
  entries.forEach((e, i) => L.push(...briefEntry(e, i + 1, storyGoal(e.f.story))));
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Html

/** Html text and double-quoted attribute values (every attribute here is double-quoted, so the apostrophe stays as it is). */
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MARK_CLASS: Record<Mark, string> = {
  PASS: "pass",
  "FAIL: UI": "fail",
  "FAIL: Error": "fail",
  "FAIL: Unexpected": "fail",
  "FAIL: Slow": "fail",
  "KNOWN FAULT": "known",
  "FIXED?": "fixed",
  "AWAITING DECISION": "awaiting",
  BLOCKED: "blocked",
  "NOT RUN": "notrun"
};
/** A mark as a pill. A case that passed only on a retry is amber, never the green of a clean PASS. */
const pill = (m: Mark, text: string = m, retry = false) => `<span class="mark ${retry ? "retry" : MARK_CLASS[m]}">${esc(text)}</span>`;
const casePill = (f: CaseFacts) => pill(f.mark, f.shown, f.secondTry);
const imageLink = (path: string, label: string) => `<a href="${esc(path)}"><img src="${esc(path)}" alt="${esc(label)}" loading="lazy"></a>`;

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1d1b;--mute:#615f58;--line:#d9d6cc;--card:#fff;--pass:#1e6b3a;--fail:#a1262b;--known:#8a5a00;--fixed:#0d5c8a;--awaiting:#5b3a8c;--blocked:#555;--notrun:#777;--retry:#9a5b00}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mute:#a9a69c;--line:#3a3935;--card:#1f1f1c;--pass:#6fcf8f;--fail:#ff8a8e;--known:#f0b85a;--fixed:#6cc0f0;--awaiting:#c1a2f2;--blocked:#bbb;--notrun:#999;--retry:#f0b85a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.25rem;margin:1.6em 0 .5em;border-bottom:1px solid var(--line);padding-bottom:.2em}h3{font-size:1.05rem;margin:1em 0 .2em}h4{font-size:1rem;margin:.2em 0}h5{font-size:.95rem;margin:.2em 0}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid var(--line);padding:4px 6px;text-align:right;vertical-align:top}th:first-child,td:first-child{text-align:left}
.scroll{overflow-x:auto}.mark{display:inline-block;font-weight:700;font-size:.8rem;padding:1px 8px;border:2px solid currentColor;border-radius:4px}
.pass{color:var(--pass)}.fail{color:var(--fail)}.known{color:var(--known)}.fixed{color:var(--fixed)}.awaiting{color:var(--awaiting)}.blocked{color:var(--blocked)}.notrun{color:var(--notrun)}.retry{color:var(--retry)}
.case{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:10px 0}.case.clean{padding:4px 12px}.meta,.mute{color:var(--mute)}
.check{border-left:3px solid var(--fail);padding-left:10px;margin:10px 0}.check.decision{border-left-color:var(--awaiting)}.check.first{border-left-color:var(--retry)}pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);padding:6px;border-radius:4px;margin:4px 0;font-size:.85rem}
dl{margin:4px 0;display:grid;grid-template-columns:max-content 1fr;gap:2px 10px}dt{color:var(--mute)}dd{margin:0}
.strip{display:flex;gap:10px;overflow-x:auto;padding:4px 0}.strip figure{margin:0;flex:0 0 auto;max-width:220px}.strip img{max-height:200px;max-width:220px;border:1px solid var(--line);border-radius:4px;display:block}.strip figcaption{font-size:.8rem;color:var(--mute)}
.errors{border:2px solid var(--fail);border-radius:6px;padding:4px 12px;background:var(--card)}code{font-size:.85em}
`;

function checkHtml(k: CheckFacts, n: number, of: number): string {
  const rows: Array<[string, string]> = [
    ["Kind of failure", `${k.fail} (${k.kind})${k.failsCase ? "" : ", recorded against a fault"}`],
    ["Expected", k.expected]
  ];
  if (k.source) rows.push(["Where the expectation comes from", k.source]);
  if (k.step) rows.push(["Step", k.step]);
  if (k.fault) rows.push(["Fault", k.fault]);
  const dl = rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("");
  const shot = k.screenshot ? `<p>${imageLink(k.screenshot, `screenshot of the failed check: ${k.title}`)}<br><code>${esc(k.screenshot)}</code></p>` : "";
  return `<div class="check"><h5>Failed check ${n} of ${of}: ${esc(k.title)}</h5><dl>${dl}</dl><p class="mute">What happened:</p><pre>${esc(k.happened)}</pre>${shot}</div>`;
}

function awaitingHtml(a: AwaitingFacts): string {
  const rows: Array<[string, string]> = [
    ["Check", a.label],
    ["Result", `${a.met ? "as expected" : "not as expected"} (the case records it and CI stays green until someone decides)`]
  ];
  if (a.source) rows.push(["Where the expectation comes from", a.source]);
  if (a.step) rows.push(["Step", a.step]);
  const dl = rows.map(([x, y]) => `<dt>${esc(x)}</dt><dd>${esc(y)}</dd>`).join("");
  return `<div class="check decision"><h5>Waiting for a decision${a.owner ? ` from ${esc(a.owner)}` : ""}: ${esc(a.id)}, ${esc(a.title)}</h5><dl>${dl}</dl>${a.message ? `<p class="mute">What happened:</p><pre>${esc(a.message)}</pre>` : ""}</div>`;
}

function bodyHtml(f: CaseFacts): string[] {
  const b: string[] = [];
  if (f.stop) {
    b.push(`<p><strong>Stopped at ${esc(f.stop.position)}, “${esc(f.stop.step)}”,</strong> on the page <code>${esc(f.stop.url || "(unknown)")}</code>: ${esc(f.stop.reason)}</p>`);
    b.push(f.stop.screenshot ? `<p>${imageLink(f.stop.screenshot, `the page where the case stopped: ${f.stop.step}`)}<br><code>${esc(f.stop.screenshot)}</code></p>` : `<p class="mute">No screenshot of that page (it could not be captured).</p>`);
  }
  if (f.notReached.length) b.push(`<p><strong>Not reached:</strong> ${f.notReached.map(esc).join("; ")}</p>`);
  f.failed.forEach((k, i) => b.push(checkHtml(k, i + 1, f.failed.length)));
  if (f.c.trace) b.push(`<p><a href="${esc(f.c.trace)}">Replay (Playwright trace)</a>: <code>${esc(f.c.trace)}</code>, open with <code>pnpm exec playwright show-trace ${esc(f.c.trace)}</code>.</p>`);
  return b;
}

function caseHtml(f: CaseFacts): string {
  const c = f.c;
  const clean = f.mark === "PASS" && f.failed.length === 0 && f.awaiting.length === 0 && !f.stop && !f.secondTry;
  const b: string[] = [];
  b.push(`<h4>${casePill(f)} ${esc(f.id)} ${esc(f.goal)}</h4>`);
  b.push(`<p class="meta">Situation: ${esc(f.situation)}. Took ${esc(f.tookText)}${c.retries ? `; tried ${c.retries + 1} times` : ""}.</p>`);
  if (f.secondTry) {
    b.push(`<p><strong>Needed a second try to pass: it is not a clean pass.</strong></p>`);
    if (f.first) b.push(`<div class="check first"><p><strong>The first try ended ${esc(f.first.mark)}:</strong></p>${bodyHtml(f.first).join("")}</div>`);
    else b.push(`<p class="mute">The first try left nothing the report can show.</p>`);
  }
  if (f.mark === "PASS" && f.measured === 0) b.push(`<p><strong>No check measured anything.</strong></p>`);
  if (c.blocked !== undefined) b.push(`<p><strong>Blocked:</strong> ${esc(c.blocked)}</p>`);
  b.push(...bodyHtml(f));
  for (const a of f.awaiting) b.push(awaitingHtml(a));
  for (const p of f.nowPassing) b.push(`<p>Passing now: ${esc(p.label)}, which waited on ${esc(p.id)} (${esc(p.title)}). Someone should close it.</p>`);
  if (f.notChecked.length) b.push(`<p class="mute">${f.notChecked.length} check${f.notChecked.length === 1 ? "" : "s"} NOT CHECKED (listed at the end of this report).</p>`);
  return `<article class="case${clean ? " clean" : ""}" id="case-${esc(f.id)}">${b.join("")}</article>`;
}

function htmlPage(d: Fact): string {
  const run = d.run;
  const B: string[] = [];
  B.push(`<h1>Appuscholar QA run report</h1>`);
  B.push(`<dl><dt>Commit</dt><dd>${esc(run.sha)}</dd><dt>Date</dt><dd>${esc(run.date)}</dd><dt>What ran</dt><dd>${esc(whatRan(run))}</dd><dt>Took</dt><dd>${esc(duration(run.durationMs))}</dd></dl>`);
  if (d.runErrors.length) B.push(`<div class="errors"><h2>Run-level errors</h2><p>These are not about one case. The run is red until they are cleared.</p><ul>${d.runErrors.map((e) => `<li>${esc(oneLine(e))}</li>`).join("")}</ul></div>`);
  if (d.warnings.length) B.push(`<h2>Warnings</h2><ul>${d.warnings.map((e) => `<li>${esc(oneLine(e))}</li>`).join("")}</ul>`);

  B.push(`<h2>Summary by story</h2><div class="scroll"><table><thead><tr><th>Story</th><th>Cases</th>${MARKS.map((m) => `<th>${esc(m)}</th>`).join("")}</tr></thead><tbody>`);
  for (const s of d.stories) {
    const cells = MARKS.map((m) => {
      if (m === "NOT RUN" && s.cases.length === 0) return `<td>${pill("NOT RUN")} whole story</td>`;
      const n = s.counts[m];
      if (n === 0) return `<td class="mute">-</td>`;
      return `<td>${n}${s.secondTryByMark[m] ? ` (${s.secondTryByMark[m]} on a 2nd try)` : ""}</td>`;
    });
    B.push(`<tr><td><a href="#story-${esc(s.id)}">${esc(s.id)}</a> — ${esc(s.goal)}</td><td>${s.cases.length}</td>${cells.join("")}</tr>`);
  }
  B.push(`</tbody></table></div>`);
  const t = d.selftests;
  B.push(`<p class="mute">Harness selftests (the fixture's own checks, left out of the marks above): ${t.ran} ran, ${t.passed} passed${t.failed ? `, ${t.failed} failed` : ""}${t.skipped ? `, ${t.skipped} skipped` : ""}.</p>`);
  const log = providerLogLine(d.providerLog);
  if (log) B.push(`<p class="mute">${esc(log)}</p>`);

  B.push(`<h2>Cases by story</h2>`);
  for (const s of d.stories) {
    if (s.cases.length === 0) continue;
    B.push(`<section id="story-${esc(s.id)}"><h3>${esc(s.id)}. ${esc(s.goal)}</h3>${s.cases.map(caseHtml).join("")}</section>`);
  }

  B.push(`<h2>Screens</h2><p class="mute">Every checkpoint's screenshot, one strip per case. A person should glance at them: the checks cannot judge how a screen reads.</p>`);
  const withShots = d.cases.filter((c) => c.c.screenshots.length || c.stop?.screenshot);
  if (withShots.length === 0) B.push(`<p class="mute">No screenshots were taken.</p>`);
  for (const f of withShots) {
    const figs = f.c.screenshots.map((s) => `<figure>${imageLink(s.path, s.name)}<figcaption>${esc(s.name)}</figcaption></figure>`);
    if (f.stop?.screenshot) figs.push(`<figure>${imageLink(f.stop.screenshot, `stopped at ${f.stop.step}`)}<figcaption>stopped at: ${esc(f.stop.step)}</figcaption></figure>`);
    B.push(`<h3>${esc(f.id)} ${esc(f.goal)} ${casePill(f)}</h3><div class="strip">${figs.join("")}</div>`);
  }

  B.push(`<h2>Passed only on a second try</h2>`);
  const flaky = d.cases.filter((c) => c.secondTry);
  if (flaky.length === 0) B.push(`<p>None: every passing case passed on its first try.</p>`);
  else {
    B.push(`<p>A case that passes only on a retry is not clean. Each is listed with what failed the first time.</p><ul>`);
    for (const c of flaky) B.push(`<li>${esc(c.id)} ${esc(c.goal)} (${esc(c.shown)}, tried ${c.c.retries + 1} times)<ul>${firstTryLines(c).map((e) => `<li>first try failed: ${esc(e)}</li>`).join("")}</ul></li>`);
    B.push(`</ul>`);
  }

  B.push(`<h2>Not covered</h2><p>${esc(NOT_COVERED_FIXED)}</p>`);
  if (d.notRunStories.length) B.push(`<p>Stories not run:</p><ul>${d.notRunStories.map((s) => `<li>${esc(s.id)}: ${esc(s.goal)} ${pill("NOT RUN")} (no case of this story ran${s.id === "S4" ? "; it is written when the Participants work is merged" : ""})</li>`).join("")}</ul>`);
  const notRunCases = d.cases.filter((c) => c.mark === "NOT RUN");
  if (notRunCases.length || d.skippedUnreported.length) {
    B.push(`<p>Cases that did not run:</p><ul>${notRunCases.map((c) => `<li>${esc(c.id)} ${esc(c.goal)}: NOT RUN (Playwright skipped it)</li>`).join("")}${d.skippedUnreported.map((x) => `<li>${esc(oneLine(x))}: skipped before it began</li>`).join("")}</ul>`);
  }
  if (d.passedUnreported.length) B.push(`<p>Tests that passed but reported no case (plain Playwright tests: what they check is not in the marks above):</p><ul>${d.passedUnreported.map((x) => `<li>${esc(oneLine(x))}</li>`).join("")}</ul>`);
  const notChecked = d.cases.flatMap((c) => c.notChecked.map((k) => ({ id: c.id, label: k.label, why: k.message ?? "(no reason given)" })));
  B.push(`<p>Checks that measured nothing (NOT CHECKED, never a pass):</p>`);
  B.push(notChecked.length ? `<ul>${notChecked.map((n) => `<li>${esc(n.id)}: ${esc(oneLine(n.label))} — ${esc(oneLine(n.why))}</li>`).join("")}</ul>` : `<ul><li>None.</li></ul>`);

  if (d.faultsMet.length) B.push(`<h2>Faults and decisions this run met</h2><ul>${d.faultsMet.map((k) => `<li>${esc(k.case)}: ${esc(oneLine(k.text))}</li>`).join("")}</ul>`);

  const info = d.information;
  if (info.evalProbes.length || info.defaultExcused.length || info.excused.length) {
    B.push(`<h2>For information</h2><p>These are not failures.</p><ul>`);
    for (const p of info.evalProbes) B.push(`<li>A library in the page tried <code>eval</code> and the security policy refused it (${esc(p.detail)}): ${p.count} times in ${p.cases} case${p.cases === 1 ? "" : "s"}. The production build drops <code>'unsafe-eval'</code> on purpose; code that really needed it would break a check.</li>`);
    for (const a of info.defaultExcused) B.push(`<li>Expected in every case: ${esc(oneLine(a.what))}${esc(why(a.reason))}, ${a.count} time${a.count === 1 ? "" : "s"}.</li>`);
    for (const a of info.excused) B.push(`<li>${esc(a.case)} excused on purpose, ${esc(a.kind)}: ${esc(oneLine(a.what))}${esc(why(a.reason))}, ${a.count} time${a.count === 1 ? "" : "s"}.</li>`);
    B.push(`</ul>`);
  }
  B.push(`<h2>Fix brief</h2><p>The failures above, written for a developer session, are in <code>fix-brief.md</code>. ${esc(FIX_BRIEF_RULE)} ${esc(EVIDENCE_WHERE)}</p>`);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Appuscholar QA run report</title><style>${CSS}</style></head><body><main>${B.join("\n")}</main></body></html>\n`;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Json, redaction, and the entry point

function jsonOf(d: Fact): string {
  const out = {
    run: d.run,
    stories: d.stories.map((s) => ({ id: s.id, goal: s.goal, cases: s.cases.length, run: s.cases.length > 0, counts: s.counts, secondTry: s.secondTry, secondTryByMark: s.secondTryByMark })),
    cases: d.cases.map((f) => ({
      id: f.id,
      story: f.story,
      goal: f.goal,
      situation: f.situation,
      mark: f.mark,
      shown: f.shown,
      status: f.c.status,
      retries: f.c.retries,
      durationMs: f.c.durationMs,
      checks: f.c.checks,
      reached: f.c.reached,
      steps: f.c.meta.steps,
      ...(f.c.stoppedAt ? { stoppedAt: f.c.stoppedAt } : {}),
      ...(f.c.blocked !== undefined ? { blocked: f.c.blocked } : {}),
      screenshots: f.c.screenshots,
      ...(f.c.trace ? { trace: f.c.trace } : {}),
      ...(f.first ? { firstTry: { mark: f.first.mark, failed: f.first.failed.filter((k) => k.failsCase), ...(f.first.stop ? { stop: f.first.stop } : {}), ...(f.first.c.trace ? { trace: f.first.c.trace } : {}) } } : {}),
      ...(f.awaiting.length ? { awaiting: f.awaiting } : {}),
      ...(f.c.notes?.length ? { notes: f.c.notes } : {}),
      ...(f.c.allowed?.length ? { allowed: f.c.allowed } : {}),
      ...(f.c.missingKnown?.length ? { missingKnown: f.c.missingKnown } : {})
    })),
    notChecked: d.cases.flatMap((c) => c.notChecked.map((k) => ({ case: c.id, label: k.label, reason: k.message ?? "" }))),
    secondTry: d.cases.filter((c) => c.secondTry).map((c) => c.id),
    harnessSelftests: d.selftests,
    ...(d.providerLog ? { providerLog: d.providerLog } : {}),
    runErrors: d.runErrors,
    warnings: d.warnings,
    notRunStories: d.notRunStories.map((s) => s.id),
    information: d.information
  };
  return JSON.stringify(out, null, 2) + "\n";
}

/** Each secret as it can appear in the outputs: as written, in a URL, inside a JSON string, and in html. Longest first, so a longer form is not left half done. */
export function secretForms(secrets: string[]): string[] {
  const forms = new Set<string>();
  for (const s of secrets) {
    if (!s) continue;
    for (const f of [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1), esc(s)]) if (f) forms.add(f);
  }
  return [...forms].sort((a, b) => b.length - a.length);
}
const REDACTED = "[redacted]";
const redactText = (s: string, forms: string[]): string => forms.reduce((t, f) => t.split(f).join(REDACTED), s);
function redactDeep<T>(v: T, forms: string[]): T {
  if (typeof v === "string") return redactText(v, forms) as T;
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, forms)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x, forms)])) as T;
  return v;
}

/**
 * The run report (spec section 12) and the fix brief (section 13) from the cases' results.
 * `summaryMd` is the report in markdown (the job summary), `html` the same with the screenshot strips, `fixBriefMd` the failures written for a developer session, `json` the data.
 * `o.redact`: strings to remove from every output (the live-AI key), written `[redacted]`. They are removed from everything handed in before any of it is cut short, renamed or
 * written, and again from each output. `o.runErrors`: problems of the whole run; `o.unreported`: tests that ended with no case result; `o.providerLog`: what the fake provider's log held.
 */
export function buildReport(cases: ReportCase[], known: KnownEntry[], run: RunInfo, o: ReportOptions = {}): Built {
  const forms = secretForms(o.redact ?? []);
  const safeCases = redactDeep(cases, forms);
  const safeKnown = redactDeep(known, forms);
  const safeRun = redactDeep(run, forms);
  const safeOptions = redactDeep({ runErrors: o.runErrors, unreported: o.unreported, providerLog: o.providerLog }, forms);
  const data = gather(safeCases, safeKnown, safeRun, safeOptions);
  const finish = (s: string) => redactText(s, forms);
  return {
    summaryMd: finish(summaryMarkdown(data)),
    fixBriefMd: finish(fixBriefMarkdown(data)),
    html: finish(htmlPage(data)),
    json: finish(jsonOf(data))
  };
}
