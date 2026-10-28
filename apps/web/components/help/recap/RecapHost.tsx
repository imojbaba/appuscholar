"use client";
import { useEffect, useRef, useState } from "react";
import type { ProjectValue } from "@/components/frame/ProjectContext";
import { RecapDialog } from "@/components/help/recap/RecapDialog";
import { useSettings } from "@/lib/settings";
import { TERMS_SINCE, needsTerms } from "@/lib/terms";
import { isPopout } from "@/lib/popout/mode";
import { useVault } from "@/lib/vault/useVault";
import { buildRecapApi } from "@/lib/help/recap/api";
import { recapFacts, type RecapFacts } from "@/lib/help/recap/facts";
import { readGapDays, recapOff, shouldRecap } from "@/lib/help/recap/gap";
import { RECAP_DELAY_MS, checkedThisLoad, lastVisitAtLoad, markChecked, pageLoadedAt, stampNow, touchActive } from "@/lib/help/recap/visit";

/** v1 asked `dialog[open]`; v2's dialogs are Radix ones with these roles. */
const OPEN_DIALOG = "[role=dialog], [role=alertdialog], dialog[open]";

/**
 * Runs the welcome-back recap beside the shell (v1 recapCheck 3739-3750): 2.5 s after the project has loaded, if the last visit is five days or
 * more back (the account's own record, read once at load), it shows the recap, unless something else is asking for the student's attention.
 * It stamps the visit when the check runs and on activity (at most once a minute), never in a pop-out. For no one signed in it does nothing.
 */
export function RecapHost({ shell }: { shell: ProjectValue }) {
  const { me, settings } = useSettings();
  const vault = useVault();
  const uid = me?.id ?? null;
  const [shown, setShown] = useState<{ uid: string; facts: RecapFacts } | null>(null);
  // What the timer reads when it fires: the newest of everything, not what the render that set it saw.
  const live = useRef({ shell, me, settings, vault });
  useEffect(() => { live.current = { shell, me, settings, vault }; });

  // The last visit is read before anything can stamp it, and activity keeps it fresh for the next load.
  useEffect(() => {
    if (!uid || isPopout()) return;
    lastVisitAtLoad(uid);
    const touch = () => { touchActive(uid, Date.now()); };
    window.addEventListener("keydown", touch, true);
    window.addEventListener("pointerdown", touch, true);
    return () => { window.removeEventListener("keydown", touch, true); window.removeEventListener("pointerdown", touch, true); };
  }, [uid]);

  // Ready: the account is known, a project has loaded (not first run, not the list) and the vault has said what it is, so a title or a document
  // is never taken for locked only because the vault has not answered yet.
  const ready = uid !== null && shell.projectId !== null && vault.status !== "loading";
  useEffect(() => {
    if (!ready || !uid || isPopout() || checkedThisLoad(uid)) return;
    let cancelled = false;

    /** Something else has the student's attention: the terms, a dialog of the shell or any other open one. */
    const busy = () => {
      const l = live.current;
      return needsTerms(l.me, TERMS_SINCE) || l.shell.dialog !== null || l.shell.projectId === null || !!document.querySelector(OPEN_DIALOG);
    };

    const check = async () => {
      const popout = isPopout(), off = recapOff(uid), now = Date.now();
      const last = lastVisitAtLoad(uid);
      const go = shouldRecap({ lastActive: last, now, gap: readGapDays(uid), off, popout });
      markChecked(uid, true);
      // v1 stamps before it tests the gap, and not at all when switched off or in a pop-out.
      if (!popout && !off) stampNow(uid, now);
      if (!go || busy()) return;
      const l = live.current;
      const api = await buildRecapApi({ uid, since: last, now, loadedAt: pageLoadedAt(), aiLogOff: l.settings.aiLogOff === true, vault: l.vault, shell: l.shell });
      const facts = await recapFacts(api);
      // Gone while it read: the next shell of this page load offers it again. A dialog that opened meanwhile is not covered.
      if (cancelled) { markChecked(uid, false); return; }
      if (busy()) return;
      setShown({ uid, facts });
    };

    const id = setTimeout(() => { void check(); }, RECAP_DELAY_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [ready, uid]);

  return shown && <RecapDialog uid={shown.uid} facts={shown.facts} onClose={() => setShown(null)} />;
}
