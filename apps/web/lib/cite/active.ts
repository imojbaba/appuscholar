"use client";
import { useEffect, useSyncExternalStore } from "react";

/*
 * The library entry the caret chip points at (v1 citActiveIdx 7673, citMarkActive 7697-7702), shared by the chip under the document and the Citations
 * tab (wave B Task 23; v1's library card is its source row): the row at `index` is lit (-1: none); `jump` asks the tab to bring it to the middle
 * (the chip's click, citJumpToCaret 7714-7719) rather than only into view (the cursor moving while the tab is on screen). By index, as v1, so a source
 * saved twice lights only the row the caret matched first.
 */
export type CiteActive = { index: number; jump: boolean; seq: number };

let active: CiteActive = { index: -1, jump: false, seq: 0 };
let shown = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const read = () => active;

/** citMarkActive(i, jump): lights card `index` (-1 puts the light out). */
export function setCiteActive(index: number, jump = false): void {
  active = { index, jump, seq: active.seq + 1 };
  for (const l of listeners) l();
}
export function getCiteActive(): CiteActive { return active; }
export function useCiteActive(): CiteActive { return useSyncExternalStore(subscribe, read, read); }

/** citPanelVisible 7696: the Citations tab's list is on screen (v1: the Citation Manager's library, mounted in the dock). */
export function citePanelShown(): boolean { return shown > 0; }
/** The library marks itself on screen while it is mounted. */
export function useCitePanelShown(): void {
  useEffect(() => { shown++; return () => { shown--; }; }, []);
}

/** As a reload leaves it (tests). */
export function resetCiteActive(): void { active = { index: -1, jump: false, seq: 0 }; shown = 0; for (const l of listeners) l(); }
