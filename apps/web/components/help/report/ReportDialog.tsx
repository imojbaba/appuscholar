"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Copy, EnvelopeSimple, Trash } from "@phosphor-icons/react";
import { useLang, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { isProvider, keyStore } from "@/lib/ai/keys";
import { useKeysIfProvided } from "@/lib/ai/useKeys";
import { APP_VERSION } from "@/lib/version";
import { readErrors, clearErrors } from "@/lib/help/report/errorRing";
import { buildMailto, repBody, repFacts, toolFromPath } from "@/lib/help/report/repFacts";
import { bumpUsage, clearUsage, readUsage, usageText } from "@/lib/help/report/usage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** What the app knows about this device, read when the dialog draws. */
function deviceFacts(): { ua: string; screen: string; online: boolean } {
  const s = typeof screen === "undefined" ? { width: 0, height: 0 } : screen;
  return { ua: navigator.userAgent || "unknown", screen: s.width + "x" + s.height + ", window " + innerWidth + "x" + innerHeight, online: navigator.onLine };
}

/**
 * "Report a problem" (v1 reportDlg 1290-1306, repOpen/repSend/repCopy/repClear 11386-11430). The app never sends anything itself (rule 12): the
 * button opens the student's own mail app with the report in the link. What goes in is shown first; it holds the app's facts and the counts
 * only if ticked, nothing from documents, sources, data or keys.
 */
export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const { lang } = useLang();
  const { settings } = useSettings();
  const keys = useKeysIfProvided();
  const pathname = usePathname();
  const tool = toolFromPath(pathname);
  const [text, setText] = useState("");
  const [withUsage, setWithUsage] = useState(false);
  const [status, setStatus] = useState("");
  // Bumped when the counts change, so the preview reads them again.
  const [rev, setRev] = useState(0);

  // Opening the dialog counts the tool that is open behind it; the box starts unticked and the status line empty, as in v1's repOpen.
  useEffect(() => {
    if (!open) return;
    bumpUsage(tool);
    setWithUsage(false);
    setStatus("");
    setRev((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open]);

  void rev;
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const provider = isProvider(settings.provider) ? settings.provider : "gemini";
  const dev = open ? deviceFacts() : { ua: "", screen: "", online: true };
  const facts = repFacts({
    build: APP_VERSION, tool, lang, ua: dev.ua, screen: dev.screen, online: dev.online, provider,
    keySaved: !!(keys?.hasKey(provider) || keyStore.getUnlocked(provider)), errors: readErrors()
  });
  const usage = usageText(readUsage());
  const added = facts + (withUsage ? "\n" + usage : "");
  const body = () => repBody(text, facts, withUsage ? usage : null);

  const copy = async (quiet = false) => {
    try {
      await navigator.clipboard.writeText(body());
      if (!quiet) setStatus(t("wc_rep_copied"));
    } catch { setStatus(t("wc_rep_copy_fail")); }
  };
  const send = () => {
    const m = buildMailto("Appuscholar problem report (" + APP_VERSION + ")", body(), support ?? "");
    if (m.copied) { setStatus(t("wc_rep_long")); void copy(true); }
    window.location.href = m.href;
  };
  const clear = () => { clearUsage(); clearErrors(); setRev((n) => n + 1); setStatus(t("wc_rep_cleared")); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("wc_rep_h2")}</DialogTitle>
          <DialogDescription>{t("wc_rep_desc")}</DialogDescription>
        </DialogHeader>
        <textarea className="input" rows={4} data-testid="report-text" aria-label={t("wc_rep_describe_label")} placeholder={t("wc_rep_ph")} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="grid gap-1 text-[13px]">
          <p className="m-0"><b>{t("wc_rep_added_h")}</b> {t("wc_rep_added")}</p>
          <pre className="m-0 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-soft p-2 text-xs" data-testid="report-facts">{added}</pre>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" data-testid="report-usage" checked={withUsage} onChange={(e) => setWithUsage(e.target.checked)} />
          {t("wc_rep_usage_tick")}
        </label>
        <div className="grid gap-1 text-[13px]">
          <p className="m-0"><b>{t("wc_rep_local_h")}</b> {t("wc_rep_local")}</p>
          <pre className="m-0 whitespace-pre-wrap text-xs" data-testid="report-local">{usage}</pre>
        </div>
        {!support && <p className="m-0 text-sm text-muted-foreground">{t("help_contact_unset")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {support && <Button variant="primary" data-testid="report-mail" onClick={send}><EnvelopeSimple aria-hidden="true" />{t("wc_rep_mail")}</Button>}
          <Button variant="ghost" data-testid="report-copy" onClick={() => { void copy(); }}><Copy aria-hidden="true" />{t("wc_rep_copy")}</Button>
          <Button variant="ghost" data-testid="report-clear" onClick={clear}><Trash aria-hidden="true" />{t("wc_rep_clear")}</Button>
          <Button variant="ghost" data-testid="report-close" onClick={() => onOpenChange(false)}>{t("close_btn")}</Button>
        </div>
        <p className="m-0 min-h-5 text-[13px]" role="status" aria-live="polite" data-testid="report-status">{status}</p>
        {support && <p className="m-0 text-[12.5px] text-muted-foreground">{t("wc_rep_closing")}</p>}
      </DialogContent>
    </Dialog>
  );
}
