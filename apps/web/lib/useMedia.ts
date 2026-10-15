"use client";
import { useSyncExternalStore } from "react";

/** DESIGN-SYSTEM.md section 6: at most 700px is the phone; 701 to 1099 is two columns; 1100 and up is three. Keep in step with the media queries in globals.css. */
export const PHONE_QUERY = "(max-width: 700px)";
export const MID_QUERY = "(min-width: 701px) and (max-width: 1099px)";

/** Live `matchMedia`. False on the server and during hydration, then the real answer. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
