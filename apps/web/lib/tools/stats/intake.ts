import { listTableScan, pdScanV2, statsParseText, statsSplitLine, type ColumnNames, type ParsedCol, type ParsedData, type PdFound } from "@appuscholar/core";
import type { ParticipantList } from "@/lib/blobs/kinds/participants";
import { scanSetup } from "./pdList";

/*
 * The Statistics lab's data intake, around core's statsParseText (which stays v1's, untouched). Three things v1's page code did not do, or did
 * not say: which rows the parser dropped (register row D-W2-2 allowed a count "only with a register row of its own": D-S2-60), the semicolon
 * file that v1 reads as one column (F17; D-S2-61), and the name a file seeds (v1 statsUpload 9407). The personal-data scan is core's pdScanV2: v1's pdScan, except that a column
 * only the shape of its values calls names is not flagged when a value has more than four words (open answers are not names: fault F1; D-S2-120).
 */

/** The longest list of line numbers kept; the count is always exact. */
const LINES_KEPT = 1000;
const LINE_BREAK = /\r\n|\r|\n/;

/** The rows statsParseText dropped: how many, and the first LINES_KEPT of them as line numbers (1 is the first line) of `text`. */
export type Skipped = { count: number; lines: number[] };
export const NO_SKIPPED: Skipped = { count: 0, lines: [] };

/**
 * statsParseText keeps the rows whose field count is the header's and tells nobody about the rest. The count is the input lines that hold
 * something, less the header, less the rows kept; only when it is not zero are the lines split a second time to find which ones, with the
 * same delimiter statsParseText chose (a tab when the first line holds one, else a comma).
 */
export function skippedLines(text: string, data: ParsedData): Skipped {
  const all = text.split(LINE_BREAK);
  let filled = 0;
  for (const l of all) if (l.trim().length) filled++;
  const count = filled - 1 - data.rows.length;
  if (count <= 0) return NO_SKIPPED;
  const lines: number[] = [];
  let first = true;
  let delim = ",";
  for (let i = 0; i < all.length && lines.length < LINES_KEPT; i++) {
    const l = all[i]!;
    if (!l.trim().length) continue;
    if (first) { first = false; delim = l.includes("\t") ? "\t" : ","; continue; }
    if (statsSplitLine(l, delim).length !== data.headers.length) lines.push(i + 1);
  }
  return { count, lines };
}

/**
 * Whether the table came out as a single column while its first line holds a semicolon: the shape of a semicolon-separated file (Excel in a
 * locale that writes a decimal comma saves these). A table that already has two columns is left as v1 reads it.
 */
export function looksSemicolon(text: string, data: ParsedData | null): boolean {
  if (!data || data.headers.length !== 1) return false;
  const first = text.split(LINE_BREAK).find((l) => l.trim().length);
  return first !== undefined && first.includes(";");
}

/**
 * The same table with a tab between the values instead of a semicolon, which statsParseText reads. The split honours double quotes as
 * statsSplitLine does (a semicolon inside quotes stays in its cell); a tab inside a cell becomes a space so it cannot split the cell; lines
 * that hold only white space are dropped, as statsParseText drops them.
 */
export function semicolonsToTabs(text: string): string {
  const out: string[] = [];
  const cell = (c: string) => { const s = c.replace(/\t/g, " "); return s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s; };
  for (const l of text.split(LINE_BREAK)) {
    if (!l.trim().length) continue;
    // A line with no quote splits on every semicolon (what statsSplitLine does then, at a tenth of the cost on a big file); a line with one goes through statsSplitLine.
    // statsParseText reads quotes, so a cell that holds one is quoted again (a doubled quote inside), or its quote would open a quoted run.
    const cells = l.includes('"') ? statsSplitLine(l, ";") : l.split(";").map((c) => c.trim());
    out.push(cells.map(cell).join("\t"));
  }
  return out.join("\n");
}

/** v1 statsUpload (9407): the file's name without its extension, at most 60 characters, seeds the dataset name. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").slice(0, 60);
}

/*
 * Big tables without a frozen page. statsParseText and pdScan are one synchronous call each (core's, not edited): on 20,000 rows by 3 columns
 * they take about 100 to 150 ms and 150 to 300 ms, and a wide table takes several times that. These two run the same core functions on slices
 * and give the event loop back between slices, so the page keeps painting; the results are equal to the whole-table calls (statsIntake test
 * iterates core's intake and pdscan corpora with one-line slices). A table that fits in one slice never yields, so a small paste is immediate.
 */

export type SliceOpts = {
  /** Lines (or columns) handled before the clock is looked at. */
  slice?: number;
  /** Milliseconds worked before the event loop gets control. */
  budgetMs?: number;
  /** Gives the event loop control (a macrotask by default). */
  yieldNow?: () => Promise<void>;
  /** Called once, just before the first yield: the table is big enough to take a moment. */
  onSlow?: () => void;
  /** Return true to stop (a newer parse began). */
  cancelled?: () => boolean;
};
const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));

/** A stopwatch that says when the budget is spent, and gives control back (once calling `onSlow`). */
function pacer(o: SliceOpts) {
  const budget = o.budgetMs ?? 30;
  let t0 = performance.now();
  let told = false;
  return async (): Promise<boolean> => {
    if (performance.now() - t0 < budget) return !!o.cancelled?.();
    if (!told) { told = true; o.onSlow?.(); }
    await (o.yieldNow ?? macrotask)();
    t0 = performance.now();
    return !!o.cancelled?.();
  };
}

/**
 * statsParseText over slices of lines, each slice parsed under the header line (so the delimiter and the field count are the whole table's),
 * the rows joined, and each column's type and n derived from the slices' own: a column is numeric when it has a value and every slice's values
 * are numeric (a slice with no values says nothing). Null when there is nothing to parse, or when `cancelled()` turned true.
 */
export async function parseSliced(text: string, o: SliceOpts = {}): Promise<ParsedData | null> {
  const lines = text.split(LINE_BREAK).filter((l) => l.trim().length);
  if (!lines.length) return null;
  const head = lines[0]!;
  const headers = statsParseText(head)!.headers;
  const filled = new Array<number>(headers.length).fill(0);
  const numeric = new Array<boolean>(headers.length).fill(true);
  const rows: string[][] = [];
  const step = o.slice ?? 250;
  const turn = pacer(o);
  for (let i = 1; i < lines.length || i === 1; i += step) {
    const d = statsParseText(head + "\n" + lines.slice(i, i + step).join("\n"))!;
    for (const r of d.rows) rows.push(r);
    d.cols.forEach((c, j) => { filled[j]! += c.n; if (c.n > 0 && c.type !== "numeric") numeric[j] = false; });
    if (i + step < lines.length && await turn()) return null;
  }
  const cols = headers.map((h, j): ParsedCol => ({ name: h || ("Col" + (j + 1)), index: j, type: filled[j]! > 0 && numeric[j] ? "numeric" : "categorical", n: filled[j]! }));
  return { headers, rows, cols };
}

/**
 * pdScanV2 one column at a time (it reads each column on its own), so the event loop gets control between columns. Each column is scanned as a
 * one-column table and its index and name put back. Null when `cancelled()` turned true.
 */
export async function scanSliced(data: ParsedData, o: SliceOpts = {}): Promise<{ found: PdFound[]; freeText: string[] } | null> {
  const found: PdFound[] = [];
  const freeText: string[] = [];
  const turn = pacer(o);
  for (let i = 0; i < data.headers.length; i++) {
    const name = data.headers[i]! || ("Col" + (i + 1));
    const one = pdScanV2({ headers: [data.headers[i]!], rows: data.rows.map((r) => [r[i]!]), cols: [data.cols[i]!] });
    for (const f of one.found) found.push({ ...f, index: i, name });
    if (one.freeText.length) freeText.push(name);
    if (i + 1 < data.headers.length && await turn()) return null;
  }
  return { found, freeText };
}

/**
 * What the participant list says about each column (core's listTableScan), one column at a time like scanSliced, so the event loop gets control between columns: the cells that
 * are people on the list, the names that are not, the rows of people who withdrew, the names inside answers. `found` is pdScanV2's: the columns it calls names are the ones the scan treats as
 * name columns. The same as the whole-table call (the columns do not read each other). Null when `cancelled()` turned true.
 */
export async function scanNamesSliced(data: ParsedData, found: PdFound[], list: ParticipantList, o: SliceOpts = {}): Promise<ColumnNames[] | null> {
  const { m, opts } = scanSetup(found, list);
  const named = new Set(opts.nameColumns);
  const out: ColumnNames[] = [];
  const turn = pacer(o);
  for (let i = 0; i < data.headers.length; i++) {
    const one: ParsedData = { headers: [data.headers[i]!], rows: data.rows.map((r) => [r[i] ?? ""]), cols: [data.cols[i]!] };
    const [col] = listTableScan(one, m, { ...opts, nameColumns: named.has(i) ? [0] : [] });
    if (col) out.push({ ...col, index: i });
    if (i + 1 < data.headers.length && await turn()) return null;
  }
  return out;
}
