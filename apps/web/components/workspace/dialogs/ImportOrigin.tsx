"use client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "../WorkspaceContext";

/** v1 `impAsk`: "Whose writing is this?", asked once for the whole batch of files being imported. */
export function ImportOrigin() {
  const t = useT();
  const { dialog, importNames, runImport, closeDialog } = useWorkspace();
  return (
    <Dialog open={dialog === "importOrigin"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-md" data-testid="import-origin">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("imp_h")}</DialogTitle>
          <DialogDescription>{t("imp_note")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm" data-testid="import-origin-files">{t("imp_files", { n: String(importNames.length), names: importNames.join(", ") })}</p>
        <DialogFooter>
          <Button variant="primary" data-testid="import-origin-own" onClick={() => { void runImport("draft"); }}>{t("imp_own")}</Button>
          <Button variant="ghost" data-testid="import-origin-source" onClick={() => { void runImport("source"); }}>{t("imp_src")}</Button>
          <Button variant="ghost" data-testid="import-origin-cancel" onClick={closeDialog}>{t("imp_cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
