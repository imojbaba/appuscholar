"use client";
import { RecapHost } from "@/components/help/recap/RecapHost";
import { useProject, type ProjectValue } from "@/components/frame/ProjectContext";

/** The shell's project value, or null where there is no shell (the chrome mounted alone, as a test does): the recap then draws nothing. */
function useShell(): ProjectValue | null {
  try { return useProject(); } catch { return null; }
}

/** Wave C slot (plan 2026-10-24, Task C5): the welcome-back recap after a gap. It runs beside the project shell and draws a dialog only when it is due. */
export function RecapSlot() {
  const shell = useShell();
  return shell ? <RecapHost shell={shell} /> : null;
}
