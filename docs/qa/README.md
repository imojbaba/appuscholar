# The QA layer

A robot student that finishes real pieces of work in the built app, then checks that the **outcome** is right: the data, how it looks, and whether it makes sense. It comes after the developer's unit tests and does not repeat them. The design is in `docs/superpowers/specs/2026-10-24-qa-layer-design.md`; this page is how to run it and how to read what it says.

## Run it on a Mac

One command does everything: it starts a throwaway database, builds the app the way production builds it, runs the cases and stops the database.

```
pnpm --filter @appuscholar/web qa:local
```

Add Playwright's arguments after it:

| What | Command |
| --- | --- |
| The quick slice: each story's plain run and every regression | `pnpm --filter @appuscholar/web qa:local -g @slice` |
| One case | `pnpm --filter @appuscholar/web qa:local -g "S5-01"` |
| The layer's own checks of itself (no app needed for most) | `pnpm --filter @appuscholar/web qa:local -g @selftest` |
| Phone cases only | `pnpm --filter @appuscholar/web qa:local --project=phone` |

Good to know:

- It uses its own ports (web 3010, API 8798, database 5443), so it never touches a server another checkout is running. If one of those ports is taken, the run **refuses to start** and says which, because a server left over from another run would answer in place of the new build and the run would test old code. Stop what holds the port (`lsof -nP -iTCP:<port> -sTCP:LISTEN`), or choose other ports with `QA_API_PORT`, `QA_WEB_PORT` and `QA_PG_PORT`.
- The first run on a machine needs the browser: `pnpm --filter @appuscholar/web exec playwright install chromium`.
- `QA_WORKERS` sets how many cases run at once (default 2).
- The header of the report says what ran. Anything that narrows the run (`-g`, `--project`, a file name, `--last-failed`, `--grep-invert`) makes it "part of the grid, selected with ...", never "full grid".
- A selftest of the fixture that must fail on purpose, or pin a mark, and so cannot set `qa.selfTest`, carries the tag `@mechanics`; the report leaves it out of the marks.
- Only test values are used: generated passphrases, `@qa.test` addresses, keys that look like `gsk_qa_<mode>_<random>`. The AI provider is faked behind our own API; nothing leaves the machine except what a case announces.

## On CI

`.github/workflows/qa.yml` runs the layer on GitHub Actions, on the same production builds and a Postgres service container:

| Job | When | What it runs | Where the report is |
| --- | --- | --- | --- |
| `qa-slice` | every pull request into `phase-3a-vault` | `qa -g @slice`: each story's plain run and every F/O regression (about 3 minutes of cases, plus the build) | the run's page (the summary) and its artifact `qa-report-slice` |
| `qa-full` and `qa-report` | every push to `phase-3a-vault` (a merge), and the **Run workflow** button | the full grid in 4 shards, joined into one report by `playwright merge-reports --reporter ./qa/reporter.ts` | the `qa-report` job's page and its artifact `qa-report-full` |

- A pull request is tested as its merge with `phase-3a-vault`, so a pull request opened before the layer merged still runs the layer's cases. The report's commit is the pull request's head.
- The slice is green on the current build because every fault the runs know about is marked in `apps/web/qa/known.json`. It turns red only on a FAIL that no known id explains, or on a known fault marked `fixed` that fails again.
- Whether the slice blocks merging (a required check) is OJ's call (spec section 16, question 2).
- The live-AI and live-site runs (plan Task 17) are not in the workflow yet. The live-AI run needs a test key with a small spending cap, saved by OJ as the repository secret `QA_LIVE_AI_KEY`; until it exists those cases are NOT RUN. The key is never written in a file, a log or the report.

## Where the report is

After a run, `apps/web/qa-report/` holds:

| File | What it is |
| --- | --- |
| `index.html` | The report. Open it in a browser. Every case has a strip of its screenshots. |
| `summary.md` | The same report as plain text (without the pictures). CI shows it on the run's page. |
| `fix-brief.md` | The failures, written so that a developer session can act on each one. See "The fix brief" below. |
| `results.json` | The data behind all of it. |
| `screens/`, `traces/` | The screenshots, and the Playwright replay of each failed case. Open a replay with `pnpm exec playwright show-trace traces/<case>.zip`. |

Playwright's own output for each case is in `apps/web/qa-results/`. Both folders are ignored by git.

If the live-AI key is set (`QA_LIVE_AI_KEY`, release runs only), its value is replaced with `[redacted]` in every file above, and a replay that holds it is not copied. The fixture takes it out of every message, console line, dialog text and page text before any of it is cut to a length (and out of the `qa-result` it attaches), so no piece of it is left behind. Set `QA_REPORT_DIR` to write the report somewhere else, and `QA_RUN_KIND` (`slice`, `full` or `release`) to say what the run was when it cannot be told from the `-g` filter.

## How to read the marks

Each case gets one mark. A failing case lists every failed check, each with its own kind of failure.

| Mark | Meaning |
| --- | --- |
| **PASS** | every check met |
| **FAIL: UI** | a Visual check failed: looks or lays out wrong |
| **FAIL: Error** | something broke: a script error in the page, a failed request to our server, an unexpected reload, an error shown for an action that should have worked, a button that does nothing, a browser pop-up nobody expected, a request to a website the case did not allow, a blocked security rule (CSP) |
| **FAIL: Unexpected** | nothing broke, but a Data or Conceptual check failed: the wrong result, or a situation not handled |
| **FAIL: Slow** | it worked but took longer than its time budget |
| **KNOWN FAULT** | fails as recorded under a fault id, waiting for a fix; does not turn CI red |
| **FIXED?** | a known fault now passes; someone should close it |
| **AWAITING DECISION** | the right outcome is OJ's or Dr. Sharma's call; the case records what happens |
| **BLOCKED** | the case could not go on: an outside service is down, a sign-in wall, or an earlier step failed so that the rest of the path cannot be reached |
| **NOT RUN** | the story is not built yet (S4 before the Participants merge), or Playwright skipped the case |

CI turns red only on a FAIL. When one case has several results, the mark is the first row of this list that fits: a FAIL beats BLOCKED, BLOCKED beats KNOWN FAULT, KNOWN FAULT beats FIXED?, FIXED? beats AWAITING DECISION.

**The three kinds of check.** *Data*: did the right data come out, and does it stay (the document's text, downloaded files, the same after a reload, numbers compared with the engine's own). *Visual*: does it look right (no sideways scroll, nothing past the edge, no cut-off text, no overlapping controls, 44 px buttons on a phone, no English left on a Hindi screen, no serious accessibility finding). *Conceptual*: does it make sense and is it honest, even though nothing broke.

**A check that measured nothing is never a pass.** It is written NOT CHECKED, with the reason (a rule that found no text to read, a build that carries no commit). A case that cannot go on ends on the page that stopped it, and the steps after it are each listed as NOT CHECKED. A case that passes with some checks NOT CHECKED still says so on its line.

### The parts of the report

1. **Header:** the commit, the date, what ran (slice, full or release), and how long it took.
2. **Run-level errors** (only when there are some): problems of the whole run, such as a key that is not a test key reaching the fake provider, or a test that ended with no case result. The run is red until they are cleared.
3. **Summary by story:** one row per story, with its goal beside its id, and the number of cases at each mark. A story with no cases shows NOT RUN. The harness's own real checks (sign-in on the production build, the outside services, the student helpers, the layout rules) have a row called Harness, not a place under S0. A case that needed a retry is counted under the mark it ended with and flagged ("on a 2nd try"). The lines under the table count the layer's own selftests, which are kept out of the marks, and say how many requests of the fake provider's log were read (0 reads "not checked: no provider log here", as in a merged report).
4. **Cases by story:** the story's goal in the student's words, then each case: its situation in words, its mark, and for every failed check what was expected, what happened, the kind of failure, where the expectation comes from, the step and the screenshot. A case that stopped names the page it stopped on and the steps it could not reach.
5. **Screens:** the screenshot strip of each case, for a person to glance at. The checks cannot judge how a screen reads.
6. **Passed only on a second try:** every case that failed first and passed on its retry, with what failed the first time. It is never shown as a clean PASS: it reads "PASS on retry (first try FAIL: Unexpected)", and the first try's failed checks, screenshots and replay are kept.
7. **Not covered:** what this run did not check: what the layer never checks (field-by-field values, the engines' numbers, prose, the real live site), stories not run, cases that did not run, and every NOT CHECKED check. A green report never reads as more than it is.
8. **For information:** things that are not failures: the library probes of `eval` that the security policy refuses, the answers every case expects, and anything a case excused on purpose with its reason.

## The fix brief

`fix-brief.md` has one entry per FAIL and per FIXED?, and one for each case that failed its first try and passed on a retry (a fault that comes and goes reaches the brief too). A case that Playwright failed after its checks had ended is a FAIL: Error. Each entry stands on its own so that a fresh developer session can act on it: the case, story and situation; the steps to reproduce as a student does them; what was expected and where that comes from; what happened and the kind of failure; the evidence; the command that re-runs only that case; and the code the case touches.

Screenshot and replay paths in the brief are relative to the `qa-report/` folder; on CI that folder is the run's artifact (`qa-report-slice` for a pull request, `qa-report-full` for a full run).

**Nothing in it goes to a developer session until OJ says so.** OJ reads the report and the brief, and may choose which entries go and in what order. A developer session then fixes the fault in its own pull request, adds the unit test that pins it, re-runs the case with the command in the entry, and moves the fault in `apps/web/qa/known.json` to fixed. The QA branch never changes product code.

## Known faults and decisions

`apps/web/qa/known.json` lists the faults and decisions the layer knows about (the F and O ids of the 2026-10-23 walk, and the Q ids that runs add). A check names one with `known: "<id>"`:

- `known`: the check fails as recorded and the case is a KNOWN FAULT. CI stays green. If the check passes, the case is FIXED? until someone closes the fault.
- `awaiting`: the right outcome is OJ's or Dr. Sharma's call; the case is AWAITING DECISION whether the check passes or fails.
- `fixed`: it was fixed. A check that still names it and fails is a regression and turns CI red.

A check that names an id missing from `known.json` fails the case, and the report warns of the id. Each fault found by a run gets a Q id in `docs/qa/faults.md`.
