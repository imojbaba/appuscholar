"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CheckBackupDialog } from "./CheckBackupDialog";
import { LockedBackupDialog } from "./LockedBackupDialog";

/** The backup actions in Help: the locked backup and "check a backup file" (Task C6). Task C7 adds its own restore file beside this one. */
export function BackupMenu() {
  const t = useT();
  const [dialog, setDialog] = useState<"lock" | "check" | null>(null);
  return (
    <>
      <Button variant="ghost" size="sm" data-testid="help-locked-backup" onClick={() => setDialog("lock")}>{t("wc_bk_locked_btn")}</Button>
      <Button variant="ghost" size="sm" data-testid="help-check-backup" onClick={() => setDialog("check")}>{t("wc_bk_check_btn")}</Button>
      {/* Mounted only while open: a closed dialog holds no passphrase and reads no vault. */}
      {dialog === "lock" && <LockedBackupDialog open onClose={() => setDialog(null)} />}
      {dialog === "check" && <CheckBackupDialog open onClose={() => setDialog(null)} />}
    </>
  );
}
