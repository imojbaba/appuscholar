"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { ackField, attentionItems, fixLabel, itemsForPaper, type AttentionItem } from "@/lib/attention";
import type { CiteChecks } from "@/lib/cite/checks";
import type { Library } from "@/lib/cite/useLibrary";
import { libraryKnown } from "@/lib/papers/keep";
import { mergeDuplicate } from "@/lib/papers/merge";
import { useVault } from "@/lib/vault/useVault";

/** What a fix came to: it did what it says, the student said no (or there was nothing to do), or it did not work. */
export type AttentionFixResult = "done" | "cancelled" | "failed";

export type Attention = {
  /** The list, or null while it cannot be known: the sources or the check answers are still being read, or the sources are locked or do not open. */
  items: AttentionItem[] | null;
  /** The items a paper's own row shows. */
  forPaper(pid: string): AttentionItem[];
  /** The id of the item whose fix is running, and the id of the one whose last fix did not work. */
  busy: string | null;
  failed: string | null;
  /** Whether the item's button works here: it has one, and what it writes can be written (a window that cannot write the Crossref answers fills and checks nothing). */
  canFix(item: AttentionItem): boolean;
  fix(item: AttentionItem, pid?: string): Promise<AttentionFixResult>;
};

/**
 * "Needs your attention" (wave B Task 24; register row D-S2-130) for one window: the list (lib/attention) over the library and the two check caches, and the fixes of its items.
 * Whoever shows the list makes the library and the checks (so the Citations tab keeps its one pair) and hands them in.
 * - crossref: today's "Use Crossref details" (checks.fillFromCrossref: asks first, writes only the empty fields, moves the answer to the entry's new key). For an item about several
 *   papers, one by one, each asked in turn; a "no" stops the rest.
 * - keep-mine: the field's kind goes into the entry's `ack`, and the difference is hidden for good (rcCurrent leaves it out of the answer, so the status reads Checked again).
 * - merge: lib/papers/merge. `onMerged` is told afterwards, since the notes and the reading list changed under whoever shows them.
 * - check: the Crossref check, for what has no answer yet.
 * A failed request keeps v1's error toast (checks); the finished checks say nothing but the list.
 */
export function useAttention(library: Library, checks: CiteChecks, opts: { onMerged?(): void } = {}): Attention {
  const t = useT();
  const vault = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const live = useRef({ library, checks, vault, onMerged: opts.onMerged });
  useEffect(() => { live.current = { library, checks, vault, onMerged: opts.onMerged }; });
  const working = useRef(false);

  const known = libraryKnown(library) && !checks.loading;
  const items = useMemo(
    () => (known ? attentionItems({ lib: library.lib, refcheck: checks.refcheckCache, retraction: checks.retractionCache, notes: null, t }) : null),
    [known, library.lib, checks.refcheckCache, checks.retractionCache, t]
  );
  const forPaper = useCallback((pid: string) => itemsForPaper(items ?? [], pid), [items]);

  const canFix = useCallback((item: AttentionItem) => {
    if (!fixLabel(item, t)) return false;
    const writesChecks = item.fix === "crossref" || item.fix === "check" || item.fix === "merge";
    return library.ready && !(writesChecks && checks.rcReadOnly);
  }, [t, library.ready, checks.rcReadOnly]);

  const fix = useCallback(async (item: AttentionItem, pid?: string): Promise<AttentionFixResult> => {
    if (working.current) return "cancelled";
    working.current = true;
    setBusy(item.id);
    setFailed(null);
    let result: AttentionFixResult = "failed";
    try {
      const c = live.current;
      const entry = (p: string) => c.library.lib.find((e) => e.pid === p);
      if (item.fix === "crossref") {
        // Each paper in turn, asked as the single fix asks; the student's "no" ends the run.
        let any = false;
        for (const p of pid ? [pid] : item.pids) {
          const e = entry(p);
          if (!e || !c.checks.fillFromCrossref(e)) break;
          any = true;
        }
        result = any ? "done" : "cancelled";
      } else if (item.fix === "keep-mine") {
        const at = item.pids[0], field = String(item.vars.field ?? "");
        result = at && field && c.library.update((prev) => ackField(prev, at, field)) && (await c.library.flush()) ? "done" : "failed";
      } else if (item.fix === "merge") {
        const [keep, drop] = item.pids;
        const projectId = c.library.projectId;
        if (keep && drop && projectId) {
          const r = await mergeDuplicate(keep, drop, { projectId, vault: () => live.current.vault, library: c.library, updateRefcheck: c.checks.updateRefcheck });
          result = r === "done" ? "done" : "failed";
          if (result === "done") live.current.onMerged?.();
        }
      } else if (item.fix === "check") {
        await c.checks.runRefCheck(false);
        result = "done";
      }
    } catch {
      result = "failed";
    } finally {
      working.current = false;
      setBusy(null);
    }
    if (result === "failed") setFailed(item.id);
    return result;
  }, []);

  return { items, forPaper, busy, failed, canFix, fix };
}
