"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { citKey, oaRetractions, pace, rcCheckOne, retrNormDoi, retrValidDoi } from "@appuscholar/core";
import type { CitationEntry, RcCheck } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { RefCheckCache, RetractionCache } from "@/lib/blobs/kinds";
import { toast } from "@/components/ui/toast";
import type { Library } from "./useLibrary";

/*
 * The library's two network checks, v1's page code around core's lookups:
 * - the retraction check, citRetractionRefresh 7579-7600 (OpenAlex's is_retracted through core's oaRetractions, a week's cache per DOI in the
 *   project's `retraction_cache` blob, v1's appu_retraction_cache), with the summary and the card warning of citRender 7826-7833, 7856;
 * - the source reality check, rcRun 7772-7790 (Crossref through core's rcCheckOne, with a 200 ms pause after each lookup, cached per citKey in
 *   the `refcheck_cache` blob, v1's appu_refcheck), with the summary 7842-7846 and rcLine 7792-7797.
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

export type RetractionDeps = {
  lib: CitationEntry[];
  cache: RetractionCache | null;
  fetch: typeof fetch;
  /** The OpenAlex key (Task 9's credentials provider `openalex`); none until then. */
  oaKey?: string;
  now(): number;
  save: Save<RetractionCache>;
  toast(msg: string): void;
  t: T;
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
  retrBusy = true;
  try {
    await oaRetractions(deps.fetch, stale, deps.oaKey, (batch) => {
      const add: RetractionCache = {};
      for (const [d, r] of Object.entries(batch)) add[d] = { r: !!r, t: now };
      deps.save((prev) => ({ ...(prev ?? {}), ...add }));
    });
    if (force) deps.toast(deps.t("retr_done"));
  } catch { if (force) deps.toast(deps.t("retr_failed")); }
  finally { retrBusy = false; }
}

export type RcSummary = { n: number; o: number; d: number; f: number };
/** citRender 7842-7846: the entries with a stored answer other than an error; null when there is none (the line is empty). */
export function rcSummary(lib: CitationEntry[], cache: RefCheckCache | null): RcSummary | null {
  const c = cache ?? {};
  const rs = lib.map((d) => c[citKey(d)]).filter((x): x is RcCheck => !!x && x.s !== "err");
  return rs.length ? { n: rs.length, o: rs.filter((x) => x.s === "ok").length, d: rs.filter((x) => x.s === "diff").length, f: rs.filter((x) => x.s === "nf").length } : null;
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
      const res = await rcCheckOne(deps.fetch, l[i]!);
      if (res.s === "err") errs++; else net = true;
      cache[k] = done[k] = res;
      await wait();
    }
    deps.save((prev) => ({ ...(prev ?? {}), ...done }));
    deps.toast(errs && !net ? deps.t("rc_fail") : deps.t("rc_done"));
  } finally { rcBusy = false; }
}

export type CiteChecks = {
  retraction: RetractionStatus;
  rc: RefCheckCache;
  rcSum: RcSummary | null;
  refreshRetractions(force: boolean): Promise<void>;
  runRefCheck(force: boolean): Promise<void>;
};

/**
 * The two caches of the open project and their checks. The quiet retraction refresh runs once the Cite tab is open and the library and the cache
 * are read (v1 2636: showTool('cite') calls citRetractionRefresh(false)). A cache that does not open is replaced only once the student says so
 * (ruling R16): the quiet refresh leaves it alone, a forced check asks first.
 */
export function useCiteChecks(library: Library, opts: { oaKey?: string } = {}): CiteChecks {
  const t = useT();
  const retr = useProjectBlob("retraction_cache", library.projectId);
  const rcBlob = useProjectBlob("refcheck_cache", library.projectId);
  const { lib } = library;
  const retraction = useMemo(() => retractionStatus(lib, retr.value), [lib, retr.value]);
  const rc = useMemo(() => rcBlob.value ?? {}, [rcBlob.value]);
  const rcSum = useMemo(() => rcSummary(lib, rcBlob.value), [lib, rcBlob.value]);
  const f: typeof fetch = useCallback((input, init) => fetch(input, init), []);
  const live = useRef({ lib, retr, rcBlob, oaKey: opts.oaKey });
  useEffect(() => { live.current = { lib, retr, rcBlob, oaKey: opts.oaKey }; });
  const mayWrite = useCallback((broken: boolean | undefined) => !broken || window.confirm(t("vault_check_broken_confirm")), [t]);

  const refreshRetractions = useCallback(async (force: boolean) => {
    const c = live.current;
    if (c.retr.broken && (!force || !mayWrite(true))) return;
    await retractionRefresh(force, { lib: c.lib, cache: c.retr.value, fetch: f, oaKey: c.oaKey, now: () => Date.now(), save: c.retr.set, toast, t });
  }, [f, mayWrite, t]);
  const runRefCheck = useCallback(async (force: boolean) => {
    const c = live.current;
    if (c.rcBlob.broken && c.lib.length && !mayWrite(true)) return;
    await rcRun(force, { lib: c.lib, cache: c.rcBlob.value, fetch: f, save: c.rcBlob.set, toast, t });
  }, [f, mayWrite, t]);

  const ready = !library.loading && !library.locked && !retr.loading && !retr.locked && library.projectId !== null;
  const ran = useRef(false);
  useEffect(() => {
    if (!ready || ran.current) return;
    ran.current = true;
    void refreshRetractions(false);
  }, [ready, refreshRetractions]);

  return { retraction, rc, rcSum, refreshRetractions, runRefCheck };
}
