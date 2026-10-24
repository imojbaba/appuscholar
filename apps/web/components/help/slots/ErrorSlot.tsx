"use client";
import { useEffect } from "react";
import { installErrorRing } from "@/lib/help/report/errorRing";

/** Wave C slot (plan 2026-10-24), Task C4: keeps the last five errors of this page in memory for the problem report. Draws nothing. */
export function ErrorSlot(): null {
  useEffect(() => installErrorRing(), []);
  return null;
}
