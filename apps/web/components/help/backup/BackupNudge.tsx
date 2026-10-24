"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { TERMS_SINCE, needsTerms } from "@/lib/terms";
import { isPopout } from "@/lib/popout/mode";
import { NUDGE_DELAY_MS, NUDGE_SHOW_MS, OLD_DAYS, daysSince, nudgeDue, type NudgeKind } from "@/lib/help/backup/nudge";
import { lastBackup, snoozeNudge, snoozedUntil } from "@/lib/help/backup/stamp";
import type { ProjectValue } from "@/components/frame/ProjectContext";
import { useAccount } from "@/components/workspace/dialogs/Help";
import { Button } from "@/components/ui/button";

/** Radix's dialogs carry these roles (the recap, Help, a sign-out question, the vault's passphrase ask). */
const OPEN_DIALOG = "[role=dialog], [role=alertdialog], dialog[open]";

/** What this device's stamps say is due now: the reminder's kind and, for "old", the days since the last backup. */
function dueNow(who: string, words: number): { kind: NudgeKind; days: number } | null {
  const now = Date.now(), last = lastBackup(who);
  const kind = nudgeDue({ words, lastBackup: last, snoozedUntil: snoozedUntil(who), now });
  return kind ? { kind, days: daysSince(last, now) } : null;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/**
 * The backup reminder (v1 backupNudgeCheck 4454-4471, markup 686): four seconds after the account is known it reads the projects' draft word
 * counts (GET /projects?include=work; no document is opened) and, if the student has written 150 or more words and has no backup on this device
 * (or one a week old), shows a small panel at the bottom left with Back up now and Later. It is a note, not a dialog: it takes no focus and
 * covers nothing but its own corner, and for only twelve seconds (a pointer over it or focus in it holds it open; it is back at the next load if
 * there is still no backup). It waits while the terms or the tour are open, while any dialog is open (the welcome-back recap is one), in a pop-out
 * and while offline (the export needs the connection). Later hides it for three days, for this student on this device.
 */
export function BackupNudge({ shell }: { shell: ProjectValue }) {
  const t = useT();
  const { me, settings } = useSettings();
  const { exportWork, exporting } = useAccount();
  const online = useOnline();
  const who = me?.id ?? null;
  /** The draft words the check found, once it has run and found the reminder worth deciding on. */
  const [words, setWords] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /** What the device's stamps say is due now (the reminder's kind and, for "old", the days), or null. */
  const [due, setDue] = useState<{ kind: NudgeKind; days: number } | null>(null);
  const box = useRef<HTMLElement>(null);
  /** Its time on screen has run out for this page load. */
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!who || isPopout()) return;
    let cancelled = false;
    const check = async () => {
      const now = Date.now(), last = lastBackup(who);
      // Cannot be due (snoozed, or backed up within the week): no request.
      if (snoozedUntil(who) > now || (last > 0 && daysSince(last, now) < OLD_DAYS)) return;
      try {
        const list = await apiFetch<Array<{ draftWords?: number }>>("/projects?include=work");
        if (!cancelled) setWords(list.reduce((n, p) => n + (Number.isFinite(p.draftWords) ? Number(p.draftWords) : 0), 0));
      } catch { /* no reminder this time */ }
    };
    const id = setTimeout(() => { void check(); }, NUDGE_DELAY_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [who]);

  // Once the words are known: whether a dialog is open (Radix mounts each one straight under the body), and what the device's stamps say is due.
  // Read again whenever a dialog opens or closes, so a backup made meanwhile (Help's Export all my work) or a snooze ends the reminder before
  // it can come back.
  useEffect(() => {
    if (!who || words === null) return;
    const sync = () => {
      setDialogOpen(!!document.querySelector(OPEN_DIALOG));
      setDue((was) => {
        const now = dueNow(who, words);
        return was?.kind === now?.kind && was?.days === now?.days ? was : now;
      });
    };
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(document.body, { childList: true });
    return () => watch.disconnect();
  }, [who, words, shell.dialog]);

  const blocked = needsTerms(me, TERMS_SINCE) || !settings.seenWelcome || shell.dialog !== null || dialogOpen || !online;
  const visible = !!due && !blocked && !!who && !away;
  // Each time it comes on screen it has its twelve seconds; a pointer over it or focus in it when they are up gives it twelve more.
  useEffect(() => {
    if (!visible) return;
    let id: ReturnType<typeof setTimeout>;
    const arm = () => {
      id = setTimeout(() => {
        const el = box.current;
        if (el && (el.matches(":hover") || el.contains(document.activeElement))) arm(); else setAway(true);
      }, NUDGE_SHOW_MS);
    };
    arm();
    return () => clearTimeout(id);
  }, [visible]);
  if (!due || !visible || !who) return null;

  const backUpNow = async () => {
    await exportWork();
    setDue(words === null ? null : dueNow(who, words));
  };
  const later = () => {
    snoozeNudge(who, Date.now());
    setDue(words === null ? null : dueNow(who, words));
  };
  const text = due.kind === "new" ? t("wc_bk_nudge_new", { w: words ?? 0 }) : t("wc_bk_nudge_old", { n: due.days });
  return (
    <section ref={box} aria-label={t("wc_bk_nudge_label")} data-testid="backup-nudge" data-kind={due.kind}
      className="fixed bottom-[72px] left-4 right-4 z-40 max-w-[360px] max-[700px]:bottom-4 rounded-xl border border-line border-l-4 border-l-gold bg-card px-3.5 py-3 text-[13px] leading-snug text-ink shadow-float">
      <p className="m-0" data-testid="backup-nudge-text">{text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" disabled={exporting} data-testid="backup-nudge-now" onClick={() => { void backUpNow(); }}>{t("backup_now")}</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="backup-nudge-later" onClick={later}>{t("backup_later")}</Button>
      </div>
    </section>
  );
}
