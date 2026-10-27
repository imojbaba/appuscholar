"use client";
import { ErrorSlot } from "./slots/ErrorSlot";
import { NudgeSlot } from "./slots/NudgeSlot";
import { OfflineSlot } from "./slots/OfflineSlot";
import { RecapSlot } from "./slots/RecapSlot";

/** What wave C keeps running beside the app (plan 2026-10-24): the error ring, the welcome-back recap, the backup nudge and the offline bar. Each draws through its own slot file. */
export function ChromeExtras() {
  return (
    <>
      <ErrorSlot />
      <RecapSlot />
      <NudgeSlot />
      <OfflineSlot />
    </>
  );
}
