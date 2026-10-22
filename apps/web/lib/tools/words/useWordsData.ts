"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANK_MAX, bankAdd, bankRemove, gramSpellStd, gramStatAdd, type BankEntry, type DictAi, type DictEntry, type GramStats, type SpellStd } from "@appuscholar/core";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { WordsPrefs } from "@/lib/blobs/kinds/words";

/*
 * Words and grammar's two blobs in one place (v1's appu_wordbank, appu_spell and appu_gram_stats in localStorage, ruling R8). `words_bank` is a guarded kind (R16):
 * when it does not open the panel says so and asks before it writes over it (`guard`). `words_prefs` {spell, gram_stats} is not (a setting never asks). While the
 * vault is locked or the blobs are still being read nothing is written (`ready`), so a word is never put on a list that has not been read.
 * The dictionary cache is not here: it stays in memory (lib/tools/words/dict.ts).
 */

export type WordsData = {
  hasProject: boolean;
  loading: boolean;
  locked: boolean;
  broken: boolean;
  /** A project is open, both blobs are read and the vault is open. */
  ready: boolean;
  bank: BankEntry[];
  spell: SpellStd;
  stats: GramStats;
  /** Runs `run` now, or asks first (`asking`) when the word bank does not open. */
  guard(run: () => void): void;
  asking: boolean;
  approve(): void;
  decline(): void;
  /** v1 bankAdd: "added", "full" (added, and the oldest of the 500 fell off), or "dup" (the word is already there). */
  addWord(cur: DictEntry, ai: DictAi | null, date: string): "added" | "full" | "dup";
  removeWord(w: string): void;
  setSpell(std: SpellStd): void;
  /** v1 gramStat: one more for every rule that found something. */
  countPatterns(items: Array<{ src: string; id: string }>): void;
};

export function useWordsData(projectId: string | null): WordsData {
  const bankB = useProjectBlob("words_bank", projectId);
  const prefsB = useProjectBlob("words_prefs", projectId);
  const hasProject = projectId !== null;
  const loading = hasProject && (bankB.loading || prefsB.loading);
  const locked = hasProject && (bankB.locked || prefsB.locked);
  const broken = !!(bankB.broken || prefsB.broken);
  const ready = hasProject && !loading && !locked;
  const bank = useMemo(() => bankB.value ?? [], [bankB.value]) as BankEntry[];
  const prefs: WordsPrefs = useMemo(() => prefsB.value ?? {}, [prefsB.value]);
  const spell = gramSpellStd(prefs.spell);
  const stats = useMemo<GramStats>(() => prefs.gram_stats ?? {}, [prefs.gram_stats]);

  // The bank as the last add or remove has made it, ahead of the render that shows it (two quick saves never read the same list).
  const mirror = useRef<BankEntry[]>(bank);
  useEffect(() => { mirror.current = bank; }, [bank]);

  const bankBroken = !!bankB.broken;
  const [pending, setPending] = useState<(() => void) | null>(null);
  const guard = useCallback((run: () => void) => { if (bankBroken) setPending(() => run); else run(); }, [bankBroken]);
  const approve = useCallback(() => { const run = pending; setPending(null); run?.(); }, [pending]);
  const decline = useCallback(() => setPending(null), []);

  const { set: setBank } = bankB;
  const { set: setPrefs } = prefsB;
  const addWord = useCallback((cur: DictEntry, ai: DictAi | null, date: string): "added" | "full" | "dup" => {
    const next = bankAdd(mirror.current, cur, ai, date);
    if (!next) return "dup";
    const full = mirror.current.length >= BANK_MAX;
    mirror.current = next;
    setBank((prev) => bankAdd((prev ?? []) as BankEntry[], cur, ai, date) ?? (prev ?? []));
    return full ? "full" : "added";
  }, [setBank]);
  const removeWord = useCallback((w: string) => {
    mirror.current = bankRemove(mirror.current, w);
    setBank((prev) => bankRemove((prev ?? []) as BankEntry[], w));
  }, [setBank]);
  const setSpell = useCallback((std: SpellStd) => setPrefs((p) => ({ ...(p ?? {}), spell: std })), [setPrefs]);
  const countPatterns = useCallback((items: Array<{ src: string; id: string }>) => {
    if (!ready || !items.some((i) => i.src === "rule")) return;
    setPrefs((p) => ({ ...(p ?? {}), gram_stats: gramStatAdd(p?.gram_stats ?? {}, items) }));
  }, [setPrefs, ready]);

  return { hasProject, loading, locked, broken, ready, bank, spell, stats, guard, asking: pending !== null, approve, decline, addWord, removeWord, setSpell, countPatterns };
}
