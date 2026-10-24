"use client";
import { BackupMenu } from "@/components/help/backup/BackupMenu";
import { RestoreBackup } from "@/components/help/backup/RestoreBackup";

/** Wave C slot (plan 2026-10-24): the backup feature's buttons in Help. C6 draws the locked backup and the check; C7 adds its restore. */
export function BackupSlot() {
  return <><BackupMenu /><RestoreBackup /></>;
}
