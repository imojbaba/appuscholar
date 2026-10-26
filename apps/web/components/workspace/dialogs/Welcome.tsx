"use client";
import { useEffect, useState } from "react";
import { useT, tHtml } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "@/components/frame/ProjectContext";

/**
 * How long the welcome ignores activations after it opens. It opens in the same frame the terms close, with its primary button where
 * Continue was, so a second click or an Enter meant for the terms arrived here (O11, Phase 3A walk: the key window opened and "Later"
 * was never seen; a click outside dismissed the tour and marked it seen). Longer than the open animation (200 ms) and a double-click.
 */
export const WELCOME_GUARD_MS = 800;

/** v1 `welcomeDlg`, retold for v2: what the first session holds, and the AI key as a choice now or later. Either button (or closing it) marks it seen; it can be replayed from Help. */
export function Welcome() {
  const t = useT();
  const { update } = useSettings();
  const { dialog, closeDialog, openSettings } = useProject();
  const open = dialog === "welcome";
  // Disarmed as it opens: no button takes focus, and buttons, clicks outside, Escape and the close cross do nothing until armed.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setArmed(true), WELCOME_GUARD_MS);
    // Disarmed again for the next opening (Help replays the tour).
    return () => { clearTimeout(id); setArmed(false); };
  }, [open]);
  const done = () => { void update({ seenWelcome: true }); };
  const guard = (e: Event) => { if (!armed) e.preventDefault(); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && armed) { done(); closeDialog(); } }}>
      <DialogContent className="max-w-lg" aria-describedby={undefined} data-testid="welcome-dialog"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus(); }}
        onPointerDownOutside={guard} onInteractOutside={guard} onEscapeKeyDown={guard}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("welcome_h2")}</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm leading-[1.7]">{t("welcome_intro")}</p>
        {/* What the first session really is, in its order (v1's four steps, welcome_step1-4, named a ⚙ button the v2 header does not have and began with
            writing, not the question). */}
        <h3 className="m-0 text-sm font-semibold">{t("welcome_next_h")}</h3>
        <ol className="m-0 ml-5 list-decimal text-sm leading-[1.7]" data-testid="welcome-next">
          {[1, 2, 3].map((n) => <li key={n}>{t("welcome_next" + n)}</li>)}
        </ol>
        <p className="m-0 text-sm leading-[1.7]" data-testid="welcome-key-note">{tHtml(t("welcome_key_note"))}</p>
        <p className="m-0 rounded-md border border-line bg-soft p-3 text-[13px]">{t("welcome_warn")}</p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" disabled={!armed} data-testid="welcome-setup" onClick={() => { done(); openSettings(); }}>{t("welcome_setup_btn")}</Button>
          <Button variant="ghost" disabled={!armed} data-testid="welcome-later" onClick={() => { done(); closeDialog(); }}>{t("welcome_later_btn")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
