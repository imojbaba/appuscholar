"use client";
import { DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { runInstall, useInstallState } from "@/lib/help/install/register";

/**
 * The Help dialog's install control (v1 index.html 11742-11750). The button appears only once the browser has offered the install; until then (and
 * in browsers that never offer it) a line points at the browser menu, v1's toast sentence as inline copy. An installed app shows neither.
 */
export function InstallButton() {
  const t = useT();
  const { offer, installed } = useInstallState();
  if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) return null;
  if (installed) return null;
  if (offer) {
    return (
      <Button variant="ghost" data-testid="install-app" onClick={() => void runInstall()}>
        <DownloadSimple size={16} aria-hidden />{t("wc_install_btn")}
      </Button>
    );
  }
  return <p className="m-0 text-[13px] text-muted-foreground" data-testid="install-hint">{t("wc_install_menu")}</p>;
}
