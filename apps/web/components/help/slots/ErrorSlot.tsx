"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { installErrorRing, keepErrorsFor } from "@/lib/help/report/errorRing";
import { toolFromPath } from "@/lib/help/report/repFacts";
import { bumpUsage } from "@/lib/help/report/usage";
import { useSession } from "@/lib/session";

/**
 * Wave C slot (plan 2026-10-24), Task C4: keeps the last five errors of this page in memory for the problem report, and counts each tool the
 * student opens (v1 usageBump). The project's layout keeps this mounted while the student moves between places and tabs, so the address is
 * watched here: a count is one opening of a place or tab, named as the report names it, never with the project's id. Draws nothing.
 */
export function ErrorSlot(): null {
  const pathname = usePathname();
  const { email } = useSession();
  // The address last counted: React's development double run of an effect, or a render with the same address, is not a second opening.
  const counted = useRef<string | null>(null);
  useEffect(() => installErrorRing(), []);
  useEffect(() => { keepErrorsFor(email); }, [email]);
  useEffect(() => {
    if (counted.current === pathname) return;
    counted.current = pathname;
    const tool = toolFromPath(pathname);
    if (tool !== "none") bumpUsage(tool);
  }, [pathname]);
  return null;
}
