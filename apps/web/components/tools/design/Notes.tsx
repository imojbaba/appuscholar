"use client";
import { useT } from "@/lib/i18n";

/**
 * The sentences a Design and ethics page shows while its saved work cannot be read or saved as usual (the stage-2 panels' rule): locked (the vault is
 * not open, so nothing is written), unreadable on this device (nothing was changed; the first save asks), or a save that did not go through.
 * Each is a plain status line, never a toast.
 */
export function Notes({ locked, broken, error, loading = false }: { locked: boolean; broken: boolean; error?: boolean; loading?: boolean }) {
  const t = useT();
  return (
    <>
      {loading && <p className="note" role="status" data-testid="design-loading">{t("blob_loading")}</p>}
      {locked && <p className="note" role="status" data-testid="design-locked">{t("design_locked")}</p>}
      {broken && <p className="note" role="status" data-testid="design-broken">{t("design_broken")}</p>}
      {error && !locked && <p className="note" role="status" data-testid="design-error">{t("design_error")}</p>}
    </>
  );
}
