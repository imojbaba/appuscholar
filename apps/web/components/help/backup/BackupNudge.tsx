"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { TERMS_SINCE, needsTerms } from "@/lib/terms";
import { isPopout } from "@/lib/popout/mode";
import { NUDGE_DELAY_MS, OLD_DAYS, daysSince, nudgeDue, type NudgeKind } from "@/lib/help/backup/nudge";
import { nudgeVisit, patchNudgeVisit, subscribeNudgeVisit } from "@/lib/help/backup/nudgeVisit";
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
 * The backup reminder (v1 backupNudgeCheck 4454-4471, markup 686). Four seconds after the account is known it reads the projects' draft word
 * counts (GET /projects?include=work; no document is opened) and, if the student has written 150 or more words and has no backup on this device
 * (or one a week old), shows a strip under the header with Back up now and Later. It stays until one of them is pressed. It is in the page, not over
 * it, so it covers no control: the page moves down once when it appears. It is decided once for each student in a page load (nudgeVisit), however
 * many shells mount, and a strip that is showing keeps showing across them. It waits to appear while the terms are open, while any
 * dialog is open (the welcome-back recap is one) and while offline (the export needs the connection); in a pop-out it never runs. Later hides it
 * for three days, for this student on this device. Announced politely, from a status region that is always there.
 */
export function BackupNudge({ shell }: { shell: ProjectValue }) {
  const t = useT();
  const { me, settings } = useSettings();
  const { exportWork, exporting } = useAccount();
  const online = useOnline();
  const who = me?.id ?? null;
  const visit = useSyncExternalStore(subscribeNudgeVisit, () => nudgeVisit(who), () => nudgeVisit(null));
  const { words, shown } = visit;
  const [dialogOpen, setDialogOpen] = useState(false);
  /** What the device's stamps say is due now (the reminder's kind and, for "old", the days), or null. */
  const [due, setDue] = useState<{ kind: NudgeKind; days: number } | null>(() => (who && words !== null ? dueNow(who, words) : null));

  // The check: once for this student in this page load, 4 seconds after a shell has mounted with the account known. What it finds is kept in
  // nudgeVisit even if the shell has gone by then.
  useEffect(() => {
    if (!who || isPopout() || nudgeVisit(who).checked) return;
    const check = async () => {
      patchNudgeVisit(who, { checked: true });
      const now = Date.now(), last = lastBackup(who);
      // Cannot be due (snoozed, or backed up within the week): no request.
      if (snoozedUntil(who) > now || (last > 0 && daysSince(last, now) < OLD_DAYS)) return;
      try {
        const list = await apiFetch<Array<{ draftWords?: number }>>("/projects?include=work");
        patchNudgeVisit(who, { words: list.reduce((n, p) => n + (Number.isFinite(p.draftWords) ? Number(p.draftWords) : 0), 0) });
      } catch {
        // No reminder this time; the next shell may try again.
        patchNudgeVisit(who, { checked: false });
      }
    };
    const id = setTimeout(() => { void check(); }, NUDGE_DELAY_MS);
    return () => clearTimeout(id);
  }, [who]);

  // Once the words are known: whether a dialog is open (Radix mounts each one straight under the body), and what the device's stamps say is due.
  // Read again whenever a dialog opens or closes, so a backup made meanwhile (Help's Export all my work) or a snooze ends the reminder.
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

  const blocked = needsTerms(me, TERMS_SINCE) || shell.dialog !== null || dialogOpen || !online;
  // The waits are for appearing: a strip that is already on screen is not taken away when a dialog opens over the page.
  const visible = !!who && !!due && (shown || !blocked);
  useEffect(() => {
    if (visible && who && !shown) patchNudgeVisit(who, { shown: true });
  }, [visible, who, shown]);

  const backUpNow = async () => {
    await exportWork();
    setDue(who && words !== null ? dueNow(who, words) : null);
  };
  const later = () => {
    if (!who) return;
    snoozeNudge(who, Date.now());
    setDue(words !== null ? dueNow(who, words) : null);
  };
  const text = !due ? "" : due.kind === "new" ? t("wc_bk_nudge_new", { w: words ?? 0 }) : t("wc_bk_nudge_old", { n: due.days });
  return (
    <div role="status" aria-live="polite">
      {visible && due && (
        <section aria-label={t("wc_bk_nudge_label")} data-testid="backup-nudge" data-kind={due.kind}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-gold-wash px-4 py-2.5 text-[13px] leading-snug text-ink min-[701px]:px-[var(--s7)]">
          <p className="m-0 min-w-0 flex-1 basis-[24rem]" data-testid="backup-nudge-text">{text}</p>
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" className="max-[700px]:min-h-11" disabled={exporting} data-testid="backup-nudge-now" onClick={() => { void backUpNow(); }}>{t("backup_now")}</Button>
            <Button type="button" variant="ghost" size="sm" className="max-[700px]:min-h-11" data-testid="backup-nudge-later" onClick={later}>{t("backup_later")}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
