"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { citKey, oaRetractions, pace, rcCheckOneV2, rcFillPatch, retrNormDoi, retrValidDoi } from "@appuscholar/core";
import type { CitationEntry, RcCheck } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { RefCheckCache, RetractionCache, StoredEntry } from "@/lib/blobs/kinds";
import { toast } from "@/components/ui/toast";
import type { Library } from "./useLibrary";

/*
 * The library's two network checks, v1's page code around core's lookups:
 * - the retraction check, citRetractionRefresh 7579-7600 (OpenAlex's is_retracted through core's oaRetractions, a week's cache per DOI in the
 *   project's `retraction_cache` blob, v1's appu_retraction_cache), with the summary and the card warning of citRender 7826-7833, 7856;
 * - the source reality check, rcRun 7772-7790 (Crossref through core's rcCheckOneV2, v1's rcCheckOne plus the empty author, volume, issue and pages, with a 200 ms pause after each lookup, cached per citKey in
 *   the `refcheck_cache` blob, v1's appu_refcheck), with the summary 7842-7846 and rcLine 7792-7797.
 * The Citations tab (wave B Task 23) reads both caches as one word per source: `sourceStatus`, from the stored Crossref answer as it stands now (`rcCurrent`) and the retraction answer.
 * "Needs your attention" (Task 24, lib/attention) reads the same two caches as the list of what is wrong, and a check's result goes there, not to a toast: the finished checks say
 * nothing (the rows and the attention items change), and a check that could not reach its service keeps v1's error toast.
 */

/** v1 7564: RETRACT_TTL, a week. */
export const RETRACT_TTL = 7 * 24 * 3600 * 1000;

type T = (key: string, vars?: Record<string, string | number>) => string;
type Save<C> = (fn: (prev: C | null) => C) => void;

export type RetractionStatus = {
  /** Per library entry: the cached answer for its DOI, or null (no valid DOI, or not checked yet). */
  status: Array<RetractionCache[string] | null>;
  /** retr_summary_fmt's {c} (checked), {r} (flagged) and {n} (sources without a valid DOI). */
  checked: number;
  flagged: number;
  noDoi: number;
};

/** citRender 7826-7833. */
export function retractionStatus(lib: CitationEntry[], cache: RetractionCache | null): RetractionStatus {
  const c = cache ?? {};
  const status = lib.map((d) => { const k = retrNormDoi(d.doi as string); return retrValidDoi(k) ? (c[k] || null) : null; });
  const withDoi = lib.filter((d) => retrValidDoi(retrNormDoi(d.doi as string))).length;
  return { status, checked: status.filter(Boolean).length, flagged: status.filter((s) => s && s.r).length, noDoi: lib.length - withDoi };
}

/** retrCacheSet 7567-7570: one DOI's answer, stored without a lookup (Research's "+ Citation library" already knows it, 8478), as an update of the cache. */
export function retrCacheSet(save: Save<RetractionCache>, doi: string, flag: boolean, now: number): void {
  const d = retrNormDoi(doi); if (!retrValidDoi(d)) return;
  save((prev) => ({ ...(prev ?? {}), [d]: { r: !!flag, t: now } }));
}

export type RetractionDeps = {
  lib: CitationEntry[];
  cache: RetractionCache | null;
  fetch: typeof fetch;
  /** The OpenAlex key (the credential `openalex`, useOpenAlexKey), when the student saved one. */
  oaKey?: string;
  now(): number;
  save: Save<RetractionCache>;
  toast(msg: string): void;
  t: T;
  /** Asked once there is something to look up and store (ruling R16 for a cache that does not open); false stops the check. */
  mayWrite?: () => boolean;
};

let retrBusy = false;
let rcBusy = false;
/** For tests: as a reload leaves them. */
export function resetCheckBusy(): void { retrBusy = false; rcBusy = false; }

/** citRetractionRefresh(force) 7579-7600: quiet (no toast) unless forced; only DOIs never checked or older than a week, unless forced. */
export async function retractionRefresh(force: boolean, deps: RetractionDeps): Promise<void> {
  if (retrBusy) return;
  const dois = Array.from(new Set(deps.lib.map((d) => retrNormDoi(d.doi as string)).filter(retrValidDoi)));
  if (!dois.length) { if (force) deps.toast(deps.t("retr_nodoi")); return; }
  const cache = deps.cache ?? {}, now = deps.now();
  const stale = dois.filter((d) => force || !cache[d] || now - cache[d].t > RETRACT_TTL);
  if (!stale.length) return;
  if (deps.mayWrite && !deps.mayWrite()) return;
  retrBusy = true;
  try {
    await oaRetractions(deps.fetch, stale, deps.oaKey, (batch) => {
      const add: RetractionCache = {};
      for (const [d, r] of Object.entries(batch)) add[d] = { r: !!r, t: now };
      deps.save((prev) => ({ ...(prev ?? {}), ...add }));
    });
  } catch { if (force) deps.toast(deps.t("retr_failed")); }
  finally { retrBusy = false; }
}

/**
 * A stored Crossref answer as it reads now (wave A LATER T11): a field the source has been given since the check no longer counts as missing. The check says "no author" (`m` holds
 * { k: "author" } together with "author" in `miss`) when the entry had none; once the entry has an author that line goes, and so does any other field in `miss` the entry now has. What
 * is left is the same answer, or a match when nothing is left. An author difference the check found with an author saved (no "author" in `miss`) stays, and so does an answer that is
 * not a difference. A difference the student kept (Task 24's "Keep 1988": the field's kind is in the entry's `ack`) is left out as well, for good. The answer itself is returned when
 * nothing changes.
 */
export function rcCurrent(d: StoredEntry, c: RcCheck | undefined): RcCheck | undefined {
  if (!c || c.s !== "diff") return c;
  const has = (k: keyof CitationEntry) => !!String(d[k] ?? "").trim();
  const kept = d.ack ?? [];
  const was = c.miss ?? [];
  const miss = was.filter((k) => !has(k));
  const m = (c.m ?? []).filter((x) => !kept.includes(x.k) && !(x.k === "author" && was.includes("author") && has("author")));
  if (miss.length === was.length && m.length === (c.m ?? []).length) return c;
  const { miss: _miss, m: _m, ...rest } = c;
  return { ...rest, s: m.length || miss.length ? "diff" : "ok", m, ...(miss.length ? { miss } : {}) };
}

/** What a source's row says about it: Crossref's answer and OpenAlex's retraction answer in one word. */
export type SourceStatus = "checked" | "fix" | "year" | "retracted" | "unchecked";

/**
 * The Citations tab's status for one source. Retracted wins over everything Crossref says. No answer, or one that is an error, is "unchecked"; Crossref not knowing the source, a
 * title or author that differs, or a field Crossref has and the source lacks is "fix"; a year that differs and nothing else is "year" (a reprint is often the cause, so it is not called a fix);
 * a match is "checked". Judged on rcCurrent, so a field filled since the check is not held against the source.
 */
export function sourceStatus(d: CitationEntry, check: RcCheck | undefined, retr: RetractionCache[string] | null): SourceStatus {
  if (retr && retr.r) return "retracted";
  const c = rcCurrent(d, check);
  if (!c || c.s === "err") return "unchecked";
  if (c.s === "nf") return "fix";
  if (c.s === "ok") return "checked";
  const m = c.m ?? [];
  if (c.miss && c.miss.length) return "fix";
  if (!m.length) return "checked";
  return m.every((x) => x.k === "year") ? "year" : "fix";
}

export type RcDeps = {
  lib: CitationEntry[];
  cache: RefCheckCache | null;
  fetch: typeof fetch;
  save: Save<RefCheckCache>;
  toast(msg: string): void;
  t: T;
  /** The pause after each lookup (core's pace, 200 ms). */
  pace?: () => Promise<void>;
};

/** rcRun(force) 7772-7790. The button forces it (936): every entry is looked up again; unforced, an entry with a stored answer other than an error is skipped. */
export async function rcRun(force: boolean, deps: RcDeps): Promise<void> {
  if (rcBusy) return;
  const l = deps.lib;
  if (!l.length) { if (force) deps.toast(deps.t("rc_empty")); return; }
  rcBusy = true; deps.toast(deps.t("rc_busy"));
  const cache: RefCheckCache = { ...(deps.cache ?? {}) }, done: RefCheckCache = {};
  let net = false, errs = 0;
  const wait = deps.pace ?? (() => pace(200));
  try {
    for (let i = 0; i < l.length; i++) {
      const k = citKey(l[i]!);
      if (!force && cache[k] && cache[k].s !== "err") continue;
      const res = await rcCheckOneV2(deps.fetch, l[i]!);
      if (res.s === "err") errs++; else net = true;
      cache[k] = done[k] = res;
      await wait();
    }
    deps.save((prev) => ({ ...(prev ?? {}), ...done }));
    // The result is in the rows and in "Needs your attention" (Task 24); only a check that reached nothing says so here, as v1 does.
    if (errs && !net) deps.toast(deps.t("rc_fail"));
  } finally { rcBusy = false; }
}

/** The field names the Fill question uses, in the order Crossref's `miss` lists them. */
const MISS_LABEL: Record<NonNullable<RcCheck["miss"]>[number], string> = { author: "rc_fld_author", volume: "cite_vol_label", issue: "cite_issue_label", pages: "cite_pages_label" };
/** rc_fill_confirm's {list}: one line per field the fill would write, "Author: Schaefer, Ellen M.; Gonzalez, ...". */
export function rcFillList(patch: Partial<CitationEntry>, t: T): string {
  return (["author", "volume", "issue", "pages"] as const).filter((k) => patch[k]).map((k) => t(MISS_LABEL[k]) + ": " + patch[k]).join("\n");
}

export type CiteChecks = {
  retraction: RetractionStatus;
  rc: RefCheckCache;
  /**
   * The two caches as the attention list reads them (Task 24): null while they are not known, so an unread cache is never taken for an empty one (everything would read "not checked").
   * Loading, locked, failed to read, or stored but not openable here is null; a project with no cache stored yet is `{}`.
   */
  refcheckCache: RefCheckCache | null;
  retractionCache: RetractionCache | null;
  /** The Crossref cache cannot be written here (the pop-out): the line says what is missing and offers no Fill. */
  rcReadOnly: boolean;
  /**
   * Fix wave A (W27, W28): "Fill from Crossref" for one source. Asks (window.confirm) with each field and its value, then writes only the fields that are empty
   * (the library's fillEmpty), moves the source's cached answer to its new key as a match, and says so. Cancel changes nothing. True when the fields were written (Task 24: the
   * fix that fills several sources one by one stops at the first that is not).
   */
  fillFromCrossref(d: CitationEntry): boolean;
  /** Either cache is still being read (the attention list waits for both: an unread cache is not an empty one). */
  loading: boolean;
  /**
   * An update of the Crossref cache (Task 24's merge moves and drops answers with the entries), saved now: true once nothing is left unsent. An update that returns what it was given
   * writes nothing; nothing is written where the cache is read-only (false).
   */
  updateRefcheck(fn: (prev: RefCheckCache) => RefCheckCache): Promise<boolean>;
  refreshRetractions(force: boolean): Promise<void>;
  runRefCheck(force: boolean): Promise<void>;
};

/**
 * The two caches of the open project and their checks. The quiet retraction refresh runs once the Cite tab is open and the library and the cache
 * are read (v1 2636: showTool('cite') calls citRetractionRefresh(false)). A cache that does not open is replaced only once the student says so
 * (ruling R16): the quiet refresh leaves it alone, a forced check asks first. `refresh: false` (the home and the Reading list, which only read the caches and fix what they find) does not
 * start the quiet refresh.
 */
export function useCiteChecks(library: Library, opts: { oaKey?: string; refresh?: boolean } = {}): CiteChecks {
  const t = useT();
  const retr = useProjectBlob("retraction_cache", library.projectId);
  const rcBlob = useProjectBlob("refcheck_cache", library.projectId);
  const { lib } = library;
  const retraction = useMemo(() => retractionStatus(lib, retr.value), [lib, retr.value]);
  const rc = useMemo(() => rcBlob.value ?? {}, [rcBlob.value]);
  const f: typeof fetch = useCallback((input, init) => fetch(input, init), []);
  const live = useRef({ lib, retr, rcBlob, oaKey: opts.oaKey });
  useEffect(() => { live.current = { lib, retr, rcBlob, oaKey: opts.oaKey }; });
  const mayWrite = useCallback((broken: boolean | undefined) => !broken || window.confirm(t("vault_check_broken_confirm")), [t]);

  const refreshRetractions = useCallback(async (force: boolean) => {
    const c = live.current;
    // Over a cache that does not open, the quiet refresh writes nothing and a forced check asks, once there is something to store.
    const ask = c.retr.broken ? () => force && mayWrite(true) : undefined;
    await retractionRefresh(force, { lib: c.lib, cache: c.retr.value, fetch: f, oaKey: c.oaKey, now: () => Date.now(), save: c.retr.set, toast, t, mayWrite: ask });
  }, [f, mayWrite, t]);
  const runRefCheck = useCallback(async (force: boolean) => {
    const c = live.current;
    if (c.rcBlob.broken && c.lib.length && !mayWrite(true)) return;
    await rcRun(force, { lib: c.lib, cache: c.rcBlob.value, fetch: f, save: c.rcBlob.set, toast, t });
  }, [f, mayWrite, t]);

  const { fillEmpty } = library;
  const fillFromCrossref = useCallback((d: CitationEntry): boolean => {
    const old = citKey(d), c = live.current.rcBlob.value?.[old];
    const patch = c ? rcFillPatch(d, c) : null;
    if (!c || !patch) return false;
    if (!window.confirm(t("rc_fill_confirm", { list: rcFillList(patch, t) }))) return false;
    // False when no stored source has the key the answer is under (another window changed it since this row was drawn): nothing is written and nothing moves (wave A LATER T11).
    if (!fillEmpty((e) => citKey(e) === old, patch)) return false;
    const filled = { ...d, ...patch };
    const next = citKey(filled);
    // The answer moves with the source (its key holds the surname): what the fill settles leaves it (rcCurrent), any other difference stays.
    const moved = rcCurrent(filled, c) ?? c;
    live.current.rcBlob.set((prev) => { const n = { ...(prev ?? {}) }; delete n[old]; n[next] = moved; return n; });
    toast(t("rc_filled"));
    return true;
  }, [fillEmpty, t]);
  const updateRefcheck = useCallback(async (fn: (prev: RefCheckCache) => RefCheckCache): Promise<boolean> => {
    const b = live.current.rcBlob;
    if (b.readOnly) return false;
    const prev = b.value ?? {};
    if (fn(prev) === prev) return true;
    b.set((p) => fn(p ?? {}));
    return b.flush();
  }, []);

  const ready = !library.loading && !library.locked && !retr.loading && !retr.locked && library.projectId !== null;
  /** The project the quiet refresh last ran for: a project switch with the tab open refreshes for the new one. */
  const ranFor = useRef<string | null>(null);
  const refresh = opts.refresh !== false;
  useEffect(() => {
    if (!refresh || !ready || ranFor.current === library.projectId) return;
    ranFor.current = library.projectId;
    void refreshRetractions(false);
  }, [refresh, ready, library.projectId, refreshRetractions]);

  const rcKnown = !rcBlob.loading && !rcBlob.locked && !rcBlob.error && !rcBlob.broken;
  const retrKnown = !retr.loading && !retr.locked && !retr.error && !retr.broken;
  const refcheckCache = useMemo(() => (rcKnown ? rcBlob.value ?? {} : null), [rcKnown, rcBlob.value]);
  const retractionCache = useMemo(() => (retrKnown ? retr.value ?? {} : null), [retrKnown, retr.value]);
  return { retraction, rc, refcheckCache, retractionCache, loading: retr.loading || rcBlob.loading, rcReadOnly: rcBlob.readOnly === true, fillFromCrossref, updateRefcheck, refreshRetractions, runRefCheck };
}
