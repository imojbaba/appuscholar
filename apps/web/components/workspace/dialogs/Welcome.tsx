"use client";
import { useT, tHtml } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "../WorkspaceContext";

/** v1 `welcomeDlg`: the four-step tour. Either button (or closing it) marks it seen; it can be replayed from Help. */
export function Welcome() {
  const t = useT();
  const { update } = useSettings();
  const { dialog, closeDialog, openSettings } = useWorkspace();
  const done = () => { void update({ seenWelcome: true }); };
  return (
    <Dialog open={dialog === "welcome"} onOpenChange={(o) => { if (!o) { done(); closeDialog(); } }}>
      <DialogContent className="max-w-lg" aria-describedby={undefined} data-testid="welcome-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("welcome_h2")}</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm leading-[1.7]">{t("welcome_intro")}</p>
        <ol className="m-0 ml-5 list-decimal text-sm leading-[1.7]">
          {[1, 2, 3, 4].map((n) => <li key={n}>{tHtml(t("welcome_step" + n))}</li>)}
        </ol>
        <p className="m-0 rounded-md border border-line bg-soft p-3 text-[13px]">{t("welcome_warn")}</p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" data-testid="welcome-setup" onClick={() => { done(); openSettings(); }}>{t("welcome_setup_btn")}</Button>
          <Button variant="ghost" data-testid="welcome-later" onClick={() => { done(); closeDialog(); }}>{t("welcome_later_btn")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
