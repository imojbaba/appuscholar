/**
 * The time budgets every case is held to (spec section 8, "Time budgets (Slow)"). They are the spec's calls, adjustable here and nowhere else.
 * `qa.timed(label, budgetMs, fn)` measures against one of these; a case that goes over is `FAIL: Slow`.
 */
/** A sign of progress within this long of any press that takes longer. */
export const PROGRESS_MS = 1000;
/** An ordinary action finished within this long, on test data. */
export const ACTION_MS = 10_000;
/** Huge data (20,000 rows, a 50,000-word check) finished within this long. */
export const HUGE_MS = 30_000;
/** While huge data runs, typing in the page still answers: no main-thread freeze longer than this. */
export const FREEZE_MS = 1000;
