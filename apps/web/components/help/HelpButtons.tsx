"use client";
import { BackupSlot } from "./slots/BackupSlot";
import { GuideSlot } from "./slots/GuideSlot";
import { InstallSlot } from "./slots/InstallSlot";
import { ReportSlot } from "./slots/ReportSlot";

/** The wave C buttons in the Help dialog (plan 2026-10-24): each feature owns its slot file, so no two tasks edit this one. */
export function HelpButtons() {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="help-wave-c">
      <GuideSlot />
      <ReportSlot />
      <BackupSlot />
      <InstallSlot />
    </div>
  );
}
