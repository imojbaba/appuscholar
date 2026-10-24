"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Copy, EnvelopeSimple, Trash } from "@phosphor-icons/react";
import { useLang, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { isProvider, keyStore } from "@/lib/ai/keys";
import { useKeysIfProvided } from "@/lib/ai/useKeys";
import { APP_VERSION } from "@/lib/version";
import { clearErrors, readErrors, subscribeErrors } from "@/lib/help/report/errorRing";
import { openMail } from "@/lib/help/report/mail";
import { buildMailto, repBody, repFacts, toolFromPath } from "@/lib/help/report/repFacts";
import { clearUsage, parseUsage, subscribeUsage, usageSnapshot, usageText } from "@/lib/help/report/usage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NO_ERRORS: readonly never[] = [];

/** What the app knows about this device, read when the dialog draws. */
function deviceFacts(): { ua: string; screen: string; online: boolean } {
  const s = typeof screen === "undefined" ? { width: 0, height: 0 } : screen;
  return { ua: navigator.userAgent || "unknown", screen: s.width + "x" + s.height + ", window " + innerWidth + "x" + innerHeight, online: navigator.onLine };
}

/**
 * "Report a problem" (v1 reportDlg, repOpen/repSend/repCopy/repClear). The app never sends anything itself (rule 12): the
 * button opens the student's own mail app with the report in the link. What goes in is shown first; it holds the app's facts and the counts
 * only if ticked, nothing from documents, sources, data or keys.
 */
export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // The description outlives a closing, as in v1 (repOpen leaves the box alone); the body below mounts with the dialog, so everything else starts fresh.
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="report-dialog">
        <ReportBody text={text} setText={setText} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ReportBody({ text, setText, close }: { text: string; setText: (s: string) => void; close: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const { settings } = useSettings();
  const keys = useKeysIfProvided();
  const tool = toolFromPath(usePathname());
  const [withUsage, setWithUsage] = useState(false);
  const [status, setStatus] = useState("");

  // The preview and what is sent come from the same read: an error that happens while the dialog is open moves both.
  const errors = useSyncExternalStore(subscribeErrors, readErrors, () => NO_ERRORS);
  const usageRaw = useSyncExternalStore(subscribeUsage, usageSnapshot, () => "");
  const usage = useMemo(() => usageText(parseUsage(usageRaw)), [usageRaw]);

  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const provider = isProvider(settings.provider) ? settings.provider : "gemini";
  const dev = deviceFacts();
  const facts = repFacts({
    build: APP_VERSION, tool, lang, ua: dev.ua, screen: dev.screen, online: dev.online, provider,
    keySaved: !!(keys?.hasKey(provider) || keyStore.getUnlocked(provider)), errors
  });
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
    openMail(m.href);
  };
  const clear = () => { clearUsage(); clearErrors(); setStatus(t("wc_rep_cleared")); };

  return (
    <>
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
        <Button variant="ghost" data-testid="report-close" onClick={close}>{t("close_btn")}</Button>
      </div>
      <p className="m-0 min-h-5 text-[13px]" role="status" aria-live="polite" data-testid="report-status">{status}</p>
      {support && <p className="m-0 text-[12.5px] text-muted-foreground">{t("wc_rep_closing")}</p>}
    </>
  );
}
