"use client";
import { useEffect, useState } from "react";
import { OfflineBar } from "@/components/help/install/OfflineBar";
import { startInstallWatch, startWorker } from "@/lib/help/install/register";
import { useT } from "@/lib/i18n";

/**
 * The offline bar, and the start of everything C8 runs beside the app (Task C8): the browser's install offer is kept from the first page on (Help
 * may open long after the browser made it) and the worker is registered, in a production build only. This slot is always mounted (ChromeExtras);
 * InstallSlot is not. `?nosw=1` clears the worker and says so in a line.
 */
export function OfflineSlot() {
  const t = useT();
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    startInstallWatch();
    let live = true;
    void startWorker().then((r) => { if (live && r === "cleared") setCleared(true); });
    return () => { live = false; };
  }, []);
  return (
    <>
      <OfflineBar />
      {cleared ? <div role="status" data-testid="sw-cleared" className="fixed bottom-16 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl bg-purple-900 px-4 py-2 text-[13px] text-white shadow-lg">{t("wc_install_cleared")}</div> : null}
    </>
  );
}
