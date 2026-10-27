"use client";
import { useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { readVaultStatus, subscribeVaultStatus } from "@/lib/vault/statusStore";
import { Button } from "@/components/ui/button";
import { openVaultSetup } from "@/components/workspace/dialogs/VaultSetup";

const KEY = (uid: string) => "appu_lock_offered_" + uid;
function answered(uid: string): boolean {
  try { return localStorage.getItem(KEY(uid)) === "1"; } catch { return false; }
}
function markAnswered(uid: string): void {
  try { localStorage.setItem(KEY(uid), "1"); } catch { /* storage blocked: the note may come back on the next visit */ }
}

/**
 * The offer to lock the work (first-run build spec, OJ 2026-10-27: "offer this once, the first time participant data is saved"). Drawn at the top of a tool's panel
 * once `saved` says participant data is stored there (Coding: a code on the interviews; Statistics: a data table recorded), while no passphrase is set. It stays
 * until it is answered, once per account on this computer: Lock my work runs the vault setup (whose migration then locks what was saved before); Not now puts
 * it away for good. A note in the panel, not a window: it never stops the student mid-task.
 */
export function LockOfferNote({ saved }: { saved: boolean }) {
  const t = useT();
  const uid = useSettings().me?.id ?? null;
  const status = useSyncExternalStore(subscribeVaultStatus, readVaultStatus, () => "loading" as const);
  const [done, setDone] = useState(false);
  if (!saved || !uid || status !== "off" || done || answered(uid)) return null;
  const answer = (lock: boolean) => {
    markAnswered(uid);
    setDone(true);
    if (lock) void openVaultSetup();
  };
  return (
    <section className="lock-offer" role="status" aria-labelledby="lockOfferH" data-testid="lock-offer">
      <h4 id="lockOfferH">{t("lock_offer_h")}</h4>
      <p>{t("lock_offer")}</p>
      <p className="lock-offer-later">{t("lock_offer_later")}</p>
      <div className="lock-offer-acts">
        <Button type="button" variant="primary" size="sm" data-testid="lock-offer-go" onClick={() => answer(true)}>{t("lock_offer_btn")}</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="lock-offer-not-now" onClick={() => answer(false)}>{t("lock_offer_not_now")}</Button>
      </div>
    </section>
  );
}
