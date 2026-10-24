"use client";
import { useEffect, useState } from "react";
import { OfflineBar } from "@/components/help/install/OfflineBar";
import { startInstallWatch, startWorker } from "@/lib/help/install/register";
import { useT } from "@/lib/i18n";

/** How long the line "Offline copy switched off and cleared" stays: this slot lives for the whole visit, so the line would otherwise outlast what it reports. */
const CLEARED_LINE_MS = 6000;

/**
 * The offline bar, and the start of everything C8 runs beside the app (Task C8): the browser's install offer is kept from the first page on (Help
 * may open long after the browser made it) and the worker is registered, in a production build only. This slot is always mounted (ChromeExtras);
 * InstallSlot is not. `?nosw=1` clears the worker and says so in a line that goes by itself after a few seconds, in a status region that stays mounted.
 */
export function OfflineSlot() {
  const t = useT();
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    startInstallWatch();
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void startWorker().then((r) => {
      if (!live || r !== "cleared") return;
      setCleared(true);
      timer = setTimeout(() => setCleared(false), CLEARED_LINE_MS);
    });
    return () => { live = false; clearTimeout(timer); };
  }, []);
  return (
    <>
      <OfflineBar />
      <div role="status" data-testid="sw-region" className="pointer-events-none fixed bottom-32 left-1/2 z-50 max-w-[92vw] -translate-x-1/2">
        {cleared ? <div data-testid="sw-cleared" className="rounded-2xl bg-purple-900 px-4 py-2 text-[13px] text-white shadow-lg">{t("wc_install_cleared")}</div> : null}
      </div>
    </>
  );
}
