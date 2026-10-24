"use client";
import { WifiSlash } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useOnline } from "@/lib/help/install/online";

/** v1's offline bar (index.html 1949, 11729-11731): fixed at the foot of the screen while the browser has no connection. The sentence is true for v2: the page on screen stays, but saving, AI, paper search and new pages need a connection (D-C-80, D-C-81). */
export function OfflineBar() {
  const t = useT();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" data-testid="offline-bar" className="fixed bottom-4 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-start gap-2 rounded-2xl bg-purple-900 px-4 py-2 text-[13px] text-white shadow-lg">
      <WifiSlash size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
      <span>{t("wc_offline_bar")}</span>
    </div>
  );
}
