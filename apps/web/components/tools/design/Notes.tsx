"use client";
import { useT } from "@/lib/i18n";
import type { NoteState } from "@/lib/tools/design/useDesign";

/**
 * The sentences a Design and ethics page shows while its saved work cannot be read or saved as usual (the stage-2 panels' rule): locked (the vault is
 * not open, so nothing is written), unreadable on this device (nothing was changed; the first save asks), a read that failed (nothing is known of the saved work), or a save that did not go through (what was entered is kept).
 * Each is a plain status line, never a toast.
 */
export function Notes({ locked, broken, readFailed, saveFailed, loading }: NoteState) {
  const t = useT();
  return (
    <>
      {loading && <p className="note" role="status" data-testid="design-loading">{t("blob_loading")}</p>}
      {locked && <p className="note" role="status" data-testid="design-locked">{t("design_locked")}</p>}
      {broken && <p className="note" role="status" data-testid="design-broken">{t("design_broken")}</p>}
      {readFailed && <p className="note" role="status" data-testid="design-read-failed">{t("design_read_failed")}</p>}
      {saveFailed && <p className="note" role="status" data-testid="design-error">{t("design_error")}</p>}
    </>
  );
}
