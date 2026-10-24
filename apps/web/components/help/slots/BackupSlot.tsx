"use client";
import { BackupMenu } from "@/components/help/backup/BackupMenu";

/** Wave C slot (plan 2026-10-24): the backup feature's buttons in Help. C6 draws the locked backup and the check; C7 adds one line for its restore. */
export function BackupSlot() {
  return <BackupMenu />;
}
